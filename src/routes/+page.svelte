<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { moveItemToTarget } from "$lib/services/reorder";
  import ServiceEditorDialog, {
    type WorkspaceEditorInput,
    type WorkspaceEditorService,
  } from "$lib/components/workspace/service-editor-dialog.svelte";
  import WorkspaceDisabledState from "$lib/components/workspace/workspace-disabled-state.svelte";
  import WorkspaceEmptyState from "$lib/components/workspace/workspace-empty-state.svelte";
  import WorkspaceSidebar from "$lib/components/workspace/workspace-sidebar.svelte";
  import {
    createDeletePayload,
    createServiceLoadPayload,
    shouldPreloadService,
  } from "$lib/services/service-runtime";
  import {
    countTrayRelevantUnreadServices,
    type NotificationPrefs,
  } from "$lib/services/notification-prefs";
  import {
    applySaveServiceResult,
    cleanupPageListeners,
    readStartupState,
    saveServiceState,
    serializeServicesForStorage,
    toggleServiceDisabled,
    type PageService,
  } from "$lib/services/workspace-state";
  import { onMount } from "svelte";

  type Service = PageService;
  let toastMessage = $state("");
  let toastTimeout = $state<ReturnType<typeof setTimeout> | null>(null);
  let activeId = $state("");
  let services = $state<Service[]>([]);
  let badges = $state<Record<string, number | undefined>>({});
  let isInitialized = $state(false);

  let isAddModalOpen = $state(false);
  let isDnd = $state(false);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      localStorage.setItem("ferx-workspace-services", serializeServicesForStorage(services));
    }, 500);
  }
  // --- BULLETPROOF DRAG STATE (Tracking IDs instead of Indexes) ---
  let draggedId = $state<string | null>(null);
  let dragOverId = $state<string | null>(null);
  let pointerDragId = $state<string | null>(null);
  let pointerStartX = 0;
  let pointerStartY = 0;
  let isPointerDragging = $state(false);
  let dragRafPending = false;

  let displayServices = $derived(
    services.map((service) => ({
      ...service,
      badge: badges[service.id],
    })),
  );
  let activeService = $derived(services.find((s) => s.id === activeId));
  let hasUnreadNotifications = $derived(
    !isDnd && countTrayRelevantUnreadServices(displayServices) > 0,
  );
  let editingService = $state<WorkspaceEditorService | null>(null);
  let lastTrayUnreadState: boolean | null = null;

  $effect(() => {
    if (isInitialized && hasUnreadNotifications !== lastTrayUnreadState) {
      lastTrayUnreadState = hasUnreadNotifications;
      invoke("update_tray_icon", { hasUnread: hasUnreadNotifications });
    }
  });

  function showToast(message: string) {
    toastMessage = message;

    if (toastTimeout) {
      clearTimeout(toastTimeout);
    }

    if (!message) {
      toastTimeout = null;
      return;
    }

    toastTimeout = setTimeout(() => {
      toastMessage = "";
      toastTimeout = null;
    }, 3000);
  }

  onMount(() => {
    const unlistenToastPromise = listen("show-toast", (event) => {
      showToast(event.payload as string);
    });

    const startupState = readStartupState(
      localStorage.getItem("ferx-workspace-services"),
    );
    services = startupState.services;
    activeId = startupState.activeId;

    if (startupState.toastMessage) {
      showToast(startupState.toastMessage);
    }

    if (services.length > 0) {
      const MAX_PRELOAD = 3;
      setTimeout(async () => {
        let preloaded = 0;
        for (const service of services) {
          if (preloaded >= MAX_PRELOAD) break;
          if (shouldPreloadService(service, activeId)) {
            await invoke("load_service", createServiceLoadPayload(service));
            preloaded++;
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
        }
      }, 3000);
    }

    const unlistenPromise = listen("menu-action", (event) => {
        const actionStr = event.payload as string;
        const [action, targetId] = actionStr.split(":");

      if (action === "reload") reloadService(targetId);
      if (action === "edit") {
        const s = services.find((x) => x.id === targetId);
        if (s) openEditModal(s);
      }
      if (action === "toggle") toggleDisable(targetId);
      if (action === "toggle-badge") {
        updateServiceNotificationPrefs(targetId, (prefs) => ({
          ...prefs,
          showBadge: !prefs.showBadge,
        }));
      }
      if (action === "toggle-tray") {
        updateServiceNotificationPrefs(targetId, (prefs) => ({
          ...prefs,
          affectTray: !prefs.affectTray,
        }));
      }
      if (action === "toggle-notifications") {
        updateServiceNotificationPrefs(targetId, (prefs) => ({
          ...prefs,
          allowNotifications: !prefs.allowNotifications,
        }));
        toastMessage = "Notification setting will apply after reload";
      }
      if (action === "delete") deleteService(targetId);
    });

    const unlistenBadgePromise = listen("update-badge", (event) => {
      const [targetId, countStr] = (event.payload as string).split(":");
      const count = Number.parseInt(countStr, 10);

      if (!targetId || Number.isNaN(count)) {
        return;
      }

      if (services.some((service) => service.id === targetId) && badges[targetId] !== count) {
        badges = {
          ...badges,
          [targetId]: count,
        };
      }
    });

    const unlistenShortcutPromise = listen("switch-shortcut", (event) => {
      const key = parseInt(event.payload as string);
      if (!isNaN(key) && key >= 1 && key <= 9) {
        const index = key - 1;
        if (index < services.length) {
          switchService(services[index].id);
        }
      }
    });

    isInitialized = true;

    return () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        localStorage.setItem("ferx-workspace-services", serializeServicesForStorage(services));
      }
      cleanupPageListeners({
        unlistenToastPromise,
        unlistenMenuPromise: unlistenPromise,
        unlistenBadgePromise,
        unlistenShortcutPromise,
        toastTimeout,
      });
    };
  });

  $effect(() => {
    if (isInitialized) {
      void services;
      scheduleSave();
    }
  });

  $effect(() => {
    if (isAddModalOpen || (activeService && activeService.disabled)) {
      invoke("hide_all_webviews");
    } else if (activeService && !activeService.disabled) {
      invoke("open_service", createServiceLoadPayload(activeService));
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      const key = parseInt(e.key);
      if (!isNaN(key) && key >= 1 && key <= 9) {
        const index = key - 1;
        if (index < services.length) {
          e.preventDefault();
          switchService(services[index].id);
        }
      }
    }
  }

  function updatePointerTarget(clientX: number, clientY: number) {
    const element = document.elementFromPoint(clientX, clientY);
    const target = element?.closest<HTMLElement>("[data-service-drop-target]");
    const targetId = target?.dataset.serviceDropTarget ?? null;

    dragOverId = targetId && targetId !== draggedId ? targetId : null;
  }

  function handlePointerDown(e: PointerEvent, id: string) {
    if (e.button !== 0) return;

    pointerDragId = id;
    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
    isPointerDragging = false;
  }

  function handlePointerMove(e: PointerEvent) {
    if (!pointerDragId) return;

    const movedEnough =
      Math.abs(e.clientX - pointerStartX) > 4 ||
      Math.abs(e.clientY - pointerStartY) > 4;

    if (!isPointerDragging && movedEnough) {
      draggedId = pointerDragId;
      isPointerDragging = true;
    }

    if (!isPointerDragging) {
      return;
    }

    if (dragRafPending) return;
    const cx = e.clientX;
    const cy = e.clientY;
    dragRafPending = true;
    requestAnimationFrame(() => {
      dragRafPending = false;
      updatePointerTarget(cx, cy);
    });
  }

  function handlePointerUp(e: PointerEvent) {
    if (isPointerDragging && draggedId && dragOverId) {
      services = moveItemToTarget(services, draggedId, dragOverId);
    }

    pointerDragId = null;
    pointerStartX = 0;
    pointerStartY = 0;
    isPointerDragging = false;
    resetDragState();
  }

  function resetDragState() {
    draggedId = null;
    dragOverId = null;
  }

  function switchService(id: string) {
    activeId = id;
  }

  function reloadService(id: string) {
    invoke("reload_webview", { id });
  }

  function toggleDisable(id: string) {
    const nextState = toggleServiceDisabled(services, activeId, id);

    services = nextState.services;
    activeId = nextState.activeId;

    if (nextState.deleteWebview) {
      invoke("delete_webview", nextState.deleteWebview);
    }
  }

  function updateServiceNotificationPrefs(
    id: string,
    updater: (prefs: NotificationPrefs) => NotificationPrefs,
  ) {
    services = services.map((service) =>
      service.id === id
        ? { ...service, notificationPrefs: updater(service.notificationPrefs) }
        : service,
    );
  }

  function deleteService(id: string) {
    const serviceToDelete = services.find((s) => s.id === id);

    if (!serviceToDelete) {
      return;
    }

    services = services.filter((s) => s.id !== id);
    if (id in badges) {
      const { [id]: _removedBadge, ...remainingBadges } = badges;
      badges = remainingBadges;
    }
    invoke("delete_webview", createDeletePayload(serviceToDelete));
    if (activeId === id) {
      const nextAvailable = services.find((s) => !s.disabled);
      activeId = nextAvailable ? nextAvailable.id : "";
    }
  }

  function openEditModal(service: Service) {
    editingService = {
      id: service.id,
      name: service.name,
      url: service.url,
      iconBgColor: service.iconBgColor,
    };
    setTimeout(() => {
      isAddModalOpen = true;
    }, 50);
  }

  function openAddModal() {
    editingService = null;
    setTimeout(() => {
      isAddModalOpen = true;
    }, 50);
  }

  function saveService(input: WorkspaceEditorInput) {
    const nextState = saveServiceState({
      services,
      activeId,
      editingServiceId: editingService?.id ?? null,
      newServiceName: input.name,
      newServiceUrl: input.url,
      newIconBgColor: input.iconBgColor,
      createServiceId: () => crypto.randomUUID().slice(0, 8),
    });

    void applySaveServiceResult({
      nextState,
      editingServiceId: editingService?.id ?? null,
      currentActiveId: activeId,
      showToast,
      setState: (next) => {
        services = next.services;
        activeId = next.activeId;
        isAddModalOpen = next.isAddModalOpen;
        if (!next.isAddModalOpen) {
          editingService = null;
        }
      },
      deleteWebview: async (payload) => invoke("delete_webview", payload),
      loadService: async (service) => invoke("load_service", createServiceLoadPayload(service)),
    });
  }
</script>

<svelte:window
  onkeydown={handleKeydown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointercancel={handlePointerUp}
/>

<div
  class="flex h-screen w-screen overflow-hidden bg-background text-foreground"
>
  <WorkspaceSidebar
    services={displayServices}
    {activeId}
    {draggedId}
    {dragOverId}
    {isDnd}
    onPointerDown={handlePointerDown}
    onSelectService={switchService}
    onToggleDnd={() => (isDnd = !isDnd)}
    onOpenAddModal={openAddModal}
  />

  <ServiceEditorDialog
    bind:open={isAddModalOpen}
    {editingService}
    onSave={saveService}
  />

  <main
    class="flex-1 flex items-center justify-center relative z-0 bg-background/50"
  >
    {#if toastMessage}
      <div
        class="absolute bottom-8 left-1/2 -translate-x-1/2 z-[100] px-5 py-2.5 bg-foreground text-background text-sm font-medium rounded-full shadow-2xl transition-all animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-none"
      >
        {toastMessage}
      </div>
    {/if}
    <div
      class="absolute inset-0 z-[-1] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-500/5 via-background to-background"
    ></div>

    {#if !activeService}
      <WorkspaceEmptyState onOpenAddModal={openAddModal} />
    {:else if activeService.disabled}
      <WorkspaceDisabledState
        serviceName={activeService.name}
        onEnable={() => toggleDisable(activeService.id)}
      />
    {/if}
  </main>
</div>
