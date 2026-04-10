<script lang="ts" module>
  import {
    DEFAULT_NOTIFICATION_PREFS as DEFAULT_PAGE_NOTIFICATION_PREFS,
  } from "$lib/services/notification-prefs";
  import { createStorageKey as createPageStorageKey } from "$lib/services/storage-key";
  import {
    normalizeServiceUrl as normalizePageServiceUrl,
    readStoredServices as readPageStoredServices,
  } from "$lib/services/service-config";

  export interface PageService {
    id: string;
    name: string;
    url: string;
    storageKey: string;
    notificationPrefs: import("$lib/services/notification-prefs").NotificationPrefs;
    disabled?: boolean;
    badge?: number;
  }

  export function readStartupState(saved: string | null): {
    services: PageService[];
    activeId: string;
    toastMessage: string;
  } {
    const { services, recoveredFromCorruption } = readPageStoredServices(saved);
    const startupServices = services as PageService[];
    const firstEnabled = startupServices.find((service) => !service.disabled);

    return {
      services: startupServices,
      activeId: firstEnabled?.id ?? "",
      toastMessage: recoveredFromCorruption ? "Saved services were reset." : "",
    };
  }

  export function saveServiceState({
    services,
    activeId,
    editingServiceId,
    newServiceName,
    newServiceUrl,
    createServiceId,
  }: {
    services: PageService[];
    activeId: string;
    editingServiceId: string | null;
    newServiceName: string;
    newServiceUrl: string;
    createServiceId: () => string;
  }): {
    services: PageService[];
    activeId: string;
    toastMessage: string;
    shouldCloseModal: boolean;
    loadService?: PageService;
    deleteWebview?: { id: string; storageKey: string };
  } {
    if (!newServiceName || !newServiceUrl) {
      return {
        services,
        activeId,
        toastMessage: "",
        shouldCloseModal: false,
      };
    }

    const normalized = normalizePageServiceUrl(newServiceUrl);

    if (!normalized.ok) {
      return {
        services,
        activeId,
        toastMessage: normalized.message,
        shouldCloseModal: false,
      };
    }

    if (editingServiceId) {
      const existingService = services.find((service) => service.id === editingServiceId);

      if (!existingService) {
        return {
          services,
          activeId,
          toastMessage: "",
          shouldCloseModal: false,
        };
      }

      const updatedService = {
        ...existingService,
        name: newServiceName,
        url: normalized.url,
      };
      const existingNormalized = normalizePageServiceUrl(existingService.url);
      const effectiveUrlChanged =
        !existingNormalized.ok || existingNormalized.url !== normalized.url;

      return {
        services: services.map((service) =>
          service.id === editingServiceId ? updatedService : service,
        ),
        activeId,
        toastMessage: "",
        shouldCloseModal: true,
        deleteWebview:
          effectiveUrlChanged
            ? {
                id: existingService.id,
                storageKey: existingService.storageKey,
              }
            : undefined,
      };
    }

    const newService: PageService = {
      id: createServiceId(),
      name: newServiceName,
      url: normalized.url,
      storageKey: createPageStorageKey(),
      notificationPrefs: { ...DEFAULT_PAGE_NOTIFICATION_PREFS },
    };

    return {
      services: [...services, newService],
      activeId: newService.id,
      toastMessage: "",
      shouldCloseModal: true,
      loadService: newService,
    };
  }

  export async function applySaveServiceResult({
    nextState,
    editingServiceId,
    currentActiveId,
    showToast,
    setState,
    deleteWebview,
    loadService,
  }: {
    nextState: ReturnType<typeof saveServiceState>;
    editingServiceId: string | null;
    currentActiveId: string;
    showToast: (message: string) => void;
    setState: (state: {
      services: PageService[];
      activeId: string;
      isAddModalOpen: boolean;
    }) => void;
    deleteWebview: (payload: { id: string; storageKey: string }) => Promise<unknown>;
    loadService: (service: PageService) => Promise<unknown>;
  }) {
    if (nextState.toastMessage) {
      showToast(nextState.toastMessage);
    }

    if (!nextState.shouldCloseModal) {
      return;
    }

    const shouldRecreateActiveEditedService =
      !!editingServiceId &&
      !!nextState.deleteWebview &&
      currentActiveId === nextState.deleteWebview.id;
    const editedService = editingServiceId
      ? nextState.services.find((service) => service.id === editingServiceId)
      : undefined;

    if (shouldRecreateActiveEditedService && nextState.deleteWebview) {
      await deleteWebview(nextState.deleteWebview);
    }

    setState({
      services: nextState.services,
      activeId: nextState.activeId,
      isAddModalOpen: false,
    });

    if (!shouldRecreateActiveEditedService && nextState.deleteWebview) {
      await deleteWebview(nextState.deleteWebview);

      if (editedService && editedService.id !== currentActiveId) {
        await loadService(editedService);
      }
    }

    if (nextState.loadService) {
      await loadService(nextState.loadService);
    }
  }

  export function toggleServiceDisabled(
    services: PageService[],
    activeId: string,
    id: string,
  ): {
    services: PageService[];
    activeId: string;
    deleteWebview?: { id: string; storageKey: string };
  } {
    const targetService = services.find((service) => service.id === id);

    if (!targetService) {
      return { services, activeId };
    }

    const nextDisabledState = !targetService.disabled;
    const nextServices = services.map((service) =>
      service.id === id ? { ...service, disabled: nextDisabledState } : service,
    );

    if (!nextDisabledState) {
      return {
        services: nextServices,
        activeId,
      };
    }

    const nextActiveId =
      activeId === id
        ? nextServices.find((service) => service.id !== id && !service.disabled)?.id ?? ""
        : activeId;

    return {
      services: nextServices,
      activeId: nextActiveId,
      deleteWebview: {
        id: targetService.id,
        storageKey: targetService.storageKey,
      },
    };
  }

  export async function cleanupPageListeners({
    unlistenToastPromise,
    unlistenMenuPromise,
    unlistenBadgePromise,
    unlistenShortcutPromise,
    toastTimeout,
    clearTimeoutImpl = clearTimeout,
  }: {
    unlistenToastPromise: Promise<() => void>;
    unlistenMenuPromise: Promise<() => void>;
    unlistenBadgePromise: Promise<() => void>;
    unlistenShortcutPromise: Promise<() => void>;
    toastTimeout: ReturnType<typeof setTimeout> | null;
    clearTimeoutImpl?: (timeout: ReturnType<typeof setTimeout>) => void;
  }) {
    if (toastTimeout) {
      clearTimeoutImpl(toastTimeout);
    }

    const [unlistenToast, unlistenMenu, unlistenBadge, unlistenShortcut] =
      await Promise.all([
        unlistenToastPromise,
        unlistenMenuPromise,
        unlistenBadgePromise,
        unlistenShortcutPromise,
      ]);

    unlistenToast();
    unlistenMenu();
    unlistenBadge();
    unlistenShortcut();
  }
</script>

<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { moveItemToTarget } from "$lib/services/reorder";
  import {
    countTrayRelevantUnreadServices,
    type NotificationPrefs,
  } from "$lib/services/notification-prefs";
  import { onMount } from "svelte";

  type Service = PageService;
  let toastMessage = $state("");
  let toastTimeout = $state<ReturnType<typeof setTimeout> | null>(null);
  let activeId = $state("");
  let services = $state<Service[]>([]);
  let isInitialized = $state(false);

  let isAddModalOpen = $state(false);
  let isDnd = $state(false);
  let editingServiceId = $state<string | null>(null);
  let newServiceName = $state("");
  let newServiceUrl = $state("");

  // --- BULLETPROOF DRAG STATE (Tracking IDs instead of Indexes) ---
  let draggedId = $state<string | null>(null);
  let dragOverId = $state<string | null>(null);
  let pointerDragId = $state<string | null>(null);
  let pointerStartX = 0;
  let pointerStartY = 0;
  let isPointerDragging = $state(false);

  let activeService = $derived(services.find((s) => s.id === activeId));
  let hasUnreadNotifications = $derived(
    !isDnd && countTrayRelevantUnreadServices(services) > 0,
  );

  $effect(() => {
    if (isInitialized) {
      invoke("update_tray_icon", { has_unread: hasUnreadNotifications });
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
      // Give the main active service 1 full second to completely boot up and grab focus
      setTimeout(async () => {
        for (const s of services) {
          if (!s.disabled && s.id !== activeId) {
            // Tell Rust to load the next service off-screen
            await invoke("load_service", {
              id: s.id,
              url: s.url,
              storageKey: s.storageKey,
              allowNotifications: s.notificationPrefs.allowNotifications,
            });
            // Wait 250ms before spawning the next one to keep CPU usage buttery smooth
            await new Promise((r) => setTimeout(r, 250));
          }
        }
      }, 1000);
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

      services = services.map((s) =>
        s.id === targetId ? { ...s, badge: count } : s,
      );
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
      localStorage.setItem("ferx-workspace-services", JSON.stringify(services));
    }
  });

  $effect(() => {
    if (isAddModalOpen || (activeService && activeService.disabled)) {
      invoke("hide_all_webviews");
    } else if (activeService && !activeService.disabled) {
      invoke("open_service", {
        id: activeId,
        url: activeService.url,
        storageKey: activeService.storageKey,
        allowNotifications: activeService.notificationPrefs.allowNotifications,
      });
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

    updatePointerTarget(e.clientX, e.clientY);
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

  function getFaviconUrl(url: string) {
    try {
      let domain = new URL(url).hostname;
      domain = domain.replace(/^(web\.|app\.)/, "");
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    } catch {
      return "";
    }
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
    invoke("delete_webview", { id, storageKey: serviceToDelete.storageKey });
    if (activeId === id) {
      const nextAvailable = services.find((s) => !s.disabled);
      activeId = nextAvailable ? nextAvailable.id : "";
    }
  }

  function openEditModal(service: Service) {
    editingServiceId = service.id;
    newServiceName = service.name;
    newServiceUrl = service.url;
    setTimeout(() => {
      isAddModalOpen = true;
    }, 50);
  }

  function openAddModal() {
    editingServiceId = null;
    newServiceName = "";
    newServiceUrl = "";
    setTimeout(() => {
      isAddModalOpen = true;
    }, 50);
  }

  function saveService() {
    const nextState = saveServiceState({
      services,
      activeId,
      editingServiceId,
      newServiceName,
      newServiceUrl,
      createServiceId: () => crypto.randomUUID().slice(0, 8),
    });

    void applySaveServiceResult({
      nextState,
      editingServiceId,
      currentActiveId: activeId,
      showToast,
      setState: (next) => {
        services = next.services;
        activeId = next.activeId;
        isAddModalOpen = next.isAddModalOpen;
      },
      deleteWebview: async (payload) => invoke("delete_webview", payload),
      loadService: async (service) =>
        invoke("load_service", {
          id: service.id,
          url: service.url,
          storageKey: service.storageKey,
          allowNotifications: service.notificationPrefs.allowNotifications,
        }),
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
  class="flex h-screen w-screen overflow-hidden bg-background text-foreground antialiased"
>
  <aside
    class="w-20 border-r flex flex-col items-center pt-14 pb-6 gap-4 bg-background/50 backdrop-blur-xl shrink-0"
    data-tauri-drag-region
  >
    <div class="flex flex-col items-center gap-4 w-full px-2">
      {#each services as s, i (s.id)}
        <div
          role="listitem"
          data-service-drop-target={s.id}
          style="-webkit-app-region: no-drag;"
          class="w-full flex justify-center transition-all duration-200
                 {dragOverId === s.id ? 'scale-110 relative z-10' : ''} 
                 {draggedId === s.id ? 'opacity-40 scale-95' : ''}"
        >
          <div
            role="button"
            tabindex="-1"
            style="-webkit-app-region: no-drag;"
            onpointerdown={(e) => handlePointerDown(e, s.id)}
          >
            <Button
              title={`${s.name} (Cmd+${i + 1})`}
              variant="ghost"
              class="h-12 w-12 rounded-2xl p-2 transition-all relative overflow-visible
                     {activeId === s.id
                ? 'bg-foreground/10 ring-1 ring-border shadow-sm'
                : 'hover:bg-foreground/5'}
                     {s.disabled ? 'opacity-40 grayscale' : ''}"
              onclick={() => switchService(s.id)}
              oncontextmenu={(e) => {
                e.preventDefault();
                invoke("show_context_menu", { id: s.id, disabled: !!s.disabled });
              }}
            >
              <img
                src={getFaviconUrl(s.url)}
                alt={s.name}
                class="w-full h-full object-contain pointer-events-none"
              />

              {#if s.notificationPrefs.showBadge && s.badge && s.badge !== 0}
                <div
                  class="absolute -top-1 -right-1 flex min-w-5 h-5 px-1 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm ring-2 ring-background z-50 {isDnd
                    ? 'bg-muted-foreground'
                    : 'bg-red-500'}"
                >
                  {s.badge === -1 ? "" : s.badge > 99 ? "99+" : s.badge}
                </div>
              {/if}
            </Button>
          </div>
        </div>
      {/each}
    </div>

    <div
      class="mt-auto flex flex-col items-center gap-4 w-full pb-2"
      style="-webkit-app-region: no-drag;"
    >
      <div class="w-10 h-[1px] bg-border"></div>

      <Button
        title={isDnd ? "Turn Off Do Not Disturb" : "Turn On Do Not Disturb"}
        variant="ghost"
        class="h-10 w-10 rounded-full p-2 transition-all {isDnd
          ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
          : 'text-muted-foreground hover:bg-foreground/5'}"
        onclick={() => (isDnd = !isDnd)}
      >
        {#if isDnd}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><path
              d="M10.7 2.8A8 8 0 0 0 2 12c0 4.4 3.6 8 8 8a8 8 0 0 0 9.2-7.3A8 8 0 0 1 10.7 2.8z"
            /><line x1="2" y1="2" x2="22" y2="22" /></svg
          >
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><path
              d="M10.7 2.8A8 8 0 0 0 2 12c0 4.4 3.6 8 8 8a8 8 0 0 0 9.2-7.3A8 8 0 0 1 10.7 2.8z"
            /></svg
          >
        {/if}
      </Button>

      <Button
        title="Add Service"
        variant="outline"
        class="h-12 w-12 rounded-2xl text-2xl text-muted-foreground border-dashed border-2 hover:border-solid hover:bg-foreground/5 transition-all"
        onclick={openAddModal}
      >
        +
      </Button>
    </div>
  </aside>

  <Dialog.Root bind:open={isAddModalOpen}>
    <Dialog.Content class="sm:max-w-[425px]">
      <Dialog.Header>
        <Dialog.Title>
          {editingServiceId ? "Edit Workspace" : "Add New Workspace"}
        </Dialog.Title>
        <Dialog.Description>
          {editingServiceId
            ? "Update the details for this service."
            : "Enter the URL of the web application you want to add."}
        </Dialog.Description>
      </Dialog.Header>
      <div class="grid gap-4 py-4">
        <div class="grid grid-cols-4 items-center gap-4">
          <Label for="name" class="text-right">Name</Label>
          <Input
            id="name"
            placeholder="e.g. Discord"
            bind:value={newServiceName}
            class="col-span-3"
          />
        </div>
        <div class="grid grid-cols-4 items-center gap-4">
          <Label for="url" class="text-right">URL</Label>
          <Input
            id="url"
            placeholder="discord.com/app"
            bind:value={newServiceUrl}
            class="col-span-3"
            onkeydown={(e) => e.key === "Enter" && saveService()}
          />
        </div>
      </div>
      <Dialog.Footer>
        <Button
          onclick={saveService}
          disabled={!newServiceName || !newServiceUrl}
        >
          {editingServiceId ? "Save Changes" : "Add Service"}
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>

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
      <div
        class="flex flex-col items-center max-w-md text-center animate-in fade-in zoom-in-95 duration-500"
      >
        <div
          class="h-24 w-24 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 text-blue-500 rounded-[2rem] flex items-center justify-center mb-8 shadow-inner ring-1 ring-blue-500/20"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect width="7" height="9" x="3" y="3" rx="1" />
            <rect width="7" height="5" x="14" y="3" rx="1" />
            <rect width="7" height="9" x="14" y="12" rx="1" />
            <rect width="7" height="5" x="3" y="16" rx="1" />
          </svg>
        </div>

        <h1 class="text-4xl font-extrabold tracking-tight mb-4 text-foreground">
          Welcome to <span
            class="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-indigo-500"
            >Ferx</span
          >
        </h1>
        <p class="text-lg text-muted-foreground mb-12 px-4">
          Your all-in-one messaging and productivity application.
        </p>

        <div
          class="w-full p-8 rounded-3xl border bg-card/80 backdrop-blur-md text-card-foreground shadow-xl ring-1 ring-black/5 flex flex-col items-center gap-5"
        >
          <h3 class="text-xl font-semibold text-foreground">
            Let's build your workspace
          </h3>
          <p class="text-sm text-muted-foreground">
            Start by adding your daily web applications like WhatsApp, Discord,
            or Slack.
          </p>

          <div
            class="flex items-center gap-3 my-2 text-sm font-medium bg-background px-5 py-3 rounded-2xl ring-1 ring-border shadow-sm"
          >
            <span>Click the</span>
            <span
              class="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground text-muted-foreground font-bold text-lg leading-none"
              >+</span
            >
            <span>button in the sidebar</span>
          </div>

          <div
            class="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mt-2"
          >
            OR
          </div>

          <Button
            size="lg"
            class="w-full rounded-xl text-md h-12 transition-all hover:scale-[1.02] shadow-md hover:shadow-lg"
            onclick={openAddModal}
          >
            Add your first service
          </Button>
        </div>
      </div>
    {:else if activeService.disabled}
      <div
        class="text-center flex flex-col items-center gap-6 animate-in fade-in duration-300"
      >
        <p class="text-lg text-foreground font-medium">
          {activeService.name} is currently disabled
        </p>
        <Button
          variant="outline"
          class="px-8 rounded-xl h-11"
          onclick={() => toggleDisable(activeService.id)}
        >
          Enable {activeService.name}
        </Button>
      </div>
    {/if}
  </main>
</div>
