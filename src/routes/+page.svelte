<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { moveItemToTarget } from "$lib/services/reorder";
  import ServiceEditorDialog, {
    type ServiceEditorInput,
    type ServiceEditorService,
  } from "$lib/components/workspace/service-editor-dialog.svelte";
  import TodosPanel from "$lib/components/workspace/todos-panel.svelte";
  import ResourceUsageStrip from "$lib/components/workspace/resource-usage-strip.svelte";
  import WorkspaceDisabledState from "$lib/components/workspace/workspace-disabled-state.svelte";
  import WorkspaceEmptyState from "$lib/components/workspace/workspace-empty-state.svelte";
  import WorkspaceSidebar from "$lib/components/workspace/workspace-sidebar.svelte";
  import {
    DEFAULT_APP_SETTINGS,
    APP_SETTINGS_STORAGE_KEY,
    readAppSettings,
  } from "$lib/services/app-settings";
  import {
    closeServiceWebview,
    createWebviewCommandQueue,
    deleteServiceWebview,
    hideAllWebviews,
    openServiceWebview,
    preloadBackgroundServices,
    preloadServiceWebview,
    reloadServiceWebview,
    setRightPanelWidth,
  } from "$lib/services/webview-commands";
  import {
    countTrayRelevantUnreadServices,
    type NotificationPrefs,
  } from "$lib/services/notification-prefs";
  import {
    parseResourceUsagePayload,
    type ResourceUsageSnapshot,
  } from "$lib/services/resource-usage";
  import {
    applySaveServiceResult,
    cleanupPageListeners,
    saveServiceState,
    toggleServiceDisabled,
    WORKSPACE_ACTIVE_ID_KEY,
    type PageService,
  } from "$lib/services/workspace-state";
  import {
    WORKSPACES_STATE_KEY,
    createDefaultWorkspaceGroupsState,
    createWorkspaceGroup,
    deleteWorkspaceGroup,
    getWorkspace,
    getWorkspaceServices,
    normalizeWorkspaceGroupsState,
    readWorkspaceGroupsStartupState,
    serializeWorkspaceGroupsState,
    setCurrentWorkspaceId,
    setWorkspaceDisabled as setWorkspaceGroupDisabled,
    setWorkspaceActiveService,
    renameWorkspaceGroup,
    updateWorkspaceGroupIcon,
    updateWorkspaceServices,
    type WorkspaceGroupsState,
  } from "$lib/services/workspace-groups";
  import type { WorkspaceIconKey } from "$lib/services/workspace-icons";
  import {
    TODO_NOTES_STORAGE_KEY,
    addTodoItem,
    createTodoItem,
    createTodoNote,
    deleteTodoItem,
    deleteTodoNote,
    insertTodoItemsAfter,
    readTodoNotes,
    reorderTodoItems,
    reorderTodoNotes,
    serializeTodoNotes,
    toggleTodoCompletedCollapsed,
    toggleTodoItemCompleted,
    toggleTodoNoteCollapsed,
    updateTodoItemText,
    updateTodoNoteTitle,
    type TodoNote,
  } from "$lib/services/todos";
  import { onMount } from "svelte";

  /** Debounced write after the last workspace change (ms). */
  const WORKSPACE_SAVE_DEBOUNCE_MS = 1200;
  /** Background preloads: start after launch, cap count, delay between each (reduces main-process churn). */
  const PRELOAD_START_MS = 2000;
  const PRELOAD_GAP_MS = 1000;
  const MAX_BACKGROUND_PRELOADS = 3;
  const TODOS_PANEL_WIDTH = 360;

  type Service = PageService;
  let toastMessage = $state("");
  let toastTimeout = $state<ReturnType<typeof setTimeout> | null>(null);
  let workspaceState = $state<WorkspaceGroupsState>(createDefaultWorkspaceGroupsState());
  let badges = $state<Record<string, number | undefined>>({});
  let isInitialized = $state(false);
  let spellCheckEnabled = $state(DEFAULT_APP_SETTINGS.spellCheckEnabled);
  let resourceUsageMonitoringEnabled = $state(
    DEFAULT_APP_SETTINGS.resourceUsageMonitoringEnabled,
  );
  let todoNotes = $state<TodoNote[]>([]);
  let isTodosPanelOpen = $state(false);

  let isAddModalOpen = $state(false);
  let isWorkspaceSwitcherOpen = $state(false);
  let isDnd = $state(false);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let todoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  const webviewCommands = createWebviewCommandQueue();

  function writeWorkspaceToLocalStorage() {
    localStorage.setItem(WORKSPACES_STATE_KEY, serializeWorkspaceGroupsState(workspaceState));
  }

  function flushWorkspaceToStorage() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    writeWorkspaceToLocalStorage();
  }

  function scheduleSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      saveTimer = null;
      writeWorkspaceToLocalStorage();
    }, WORKSPACE_SAVE_DEBOUNCE_MS);
  }

  function writeTodosToLocalStorage() {
    localStorage.setItem(TODO_NOTES_STORAGE_KEY, serializeTodoNotes(todoNotes));
  }

  function flushTodosToStorage() {
    if (todoSaveTimer) {
      clearTimeout(todoSaveTimer);
      todoSaveTimer = null;
    }
    writeTodosToLocalStorage();
  }

  function scheduleTodoSave() {
    if (todoSaveTimer) {
      clearTimeout(todoSaveTimer);
    }
    todoSaveTimer = setTimeout(() => {
      todoSaveTimer = null;
      writeTodosToLocalStorage();
    }, WORKSPACE_SAVE_DEBOUNCE_MS);
  }

  // --- BULLETPROOF DRAG STATE (Tracking IDs instead of Indexes) ---
  let draggedId = $state<string | null>(null);
  let dragOverId = $state<string | null>(null);
  let pointerDragId = $state<string | null>(null);
  let pointerStartX = 0;
  let pointerStartY = 0;
  let isPointerDragging = $state(false);
  let dragRafPending = false;

  let currentWorkspace = $derived(getWorkspace(workspaceState));
  let services = $derived(getWorkspaceServices(workspaceState));
  let activeId = $derived(currentWorkspace?.activeServiceId ?? "");
  let isCurrentWorkspaceDisabled = $derived(currentWorkspace?.disabled === true);
  let displayServices = $derived(
    services.map((service) => ({
      ...service,
      disabled: isCurrentWorkspaceDisabled || service.disabled,
      badge: badges[service.id],
    })),
  );
  let resourceUsageSnapshots = $state<Record<string, ResourceUsageSnapshot | undefined>>({});
  let activeService = $derived.by(() => {
    const service = activeId ? workspaceState.servicesById[activeId] : undefined;

    if (!service) {
      return undefined;
    }

    return {
      ...service,
      disabled: isCurrentWorkspaceDisabled || service.disabled,
    };
  });
  let activeResourceUsageSnapshot = $derived(
    activeId ? resourceUsageSnapshots[activeId] : undefined,
  );
  let hasUnreadNotifications = $derived(
    !isDnd && countTrayRelevantUnreadServices(displayServices) > 0,
  );
  let editingService = $state<ServiceEditorService | null>(null);
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

    const startupState = readWorkspaceGroupsStartupState(
      localStorage.getItem(WORKSPACES_STATE_KEY),
      localStorage.getItem("ferx-workspace-services"),
      localStorage.getItem(WORKSPACE_ACTIVE_ID_KEY),
    );
    const settings = readAppSettings(localStorage.getItem(APP_SETTINGS_STORAGE_KEY));
    spellCheckEnabled = settings.spellCheckEnabled;
    resourceUsageMonitoringEnabled = settings.resourceUsageMonitoringEnabled;
    workspaceState = startupState.state;
    todoNotes = readTodoNotes(localStorage.getItem(TODO_NOTES_STORAGE_KEY));

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const openParam = params.get("open");
      if (
        openParam &&
        !currentWorkspace?.disabled &&
        services.some((s) => s.id === openParam && !s.disabled)
      ) {
        workspaceState = setWorkspaceActiveService(
          workspaceState,
          workspaceState.currentWorkspaceId,
          openParam,
        );
      }
      if (openParam) {
        params.delete("open");
        const next = params.toString();
        const path = window.location.pathname + (next ? `?${next}` : "");
        window.history.replaceState(null, "", path);
      }
    }

    if (startupState.toastMessage) {
      showToast(startupState.toastMessage);
    }

    let preloadTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let preloadCancelled = false;
    if (services.length > 0 && !currentWorkspace?.disabled) {
      preloadTimeoutId = setTimeout(async () => {
        if (preloadCancelled) {
          return;
        }
        await preloadBackgroundServices({
          services,
          activeId,
          spellCheckEnabled,
          maxPreloads: MAX_BACKGROUND_PRELOADS,
          gapMs: PRELOAD_GAP_MS,
          shouldCancel: () => preloadCancelled,
        });
      }, PRELOAD_START_MS);
    }

    const flushOnExit = () => {
      flushWorkspaceToStorage();
      flushTodosToStorage();
    };
    window.addEventListener("beforeunload", flushOnExit);
    window.addEventListener("pagehide", flushOnExit);
    const onVisibilityForFlush = () => {
      if (document.visibilityState === "hidden") {
        flushOnExit();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityForFlush);

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

    const unlistenResourceUsagePromise = listen("resource-usage-update", (event) => {
      const [targetId, payload = ""] = (event.payload as string).split(/:(.*)/s);
      if (!targetId || !services.some((service) => service.id === targetId)) {
        return;
      }

      const snapshot = parseResourceUsagePayload(targetId, payload);
      if (!snapshot) {
        return;
      }

      resourceUsageSnapshots = {
        ...resourceUsageSnapshots,
        [targetId]: snapshot,
      };
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
      preloadCancelled = true;
      if (preloadTimeoutId !== null) {
        clearTimeout(preloadTimeoutId);
      }
      window.removeEventListener("beforeunload", flushOnExit);
      window.removeEventListener("pagehide", flushOnExit);
      document.removeEventListener("visibilitychange", onVisibilityForFlush);
      flushOnExit();
      void setRightPanelWidth(0);
      cleanupPageListeners({
        unlistenToastPromise,
        unlistenMenuPromise: unlistenPromise,
        unlistenBadgePromise,
        unlistenShortcutPromise,
        toastTimeout,
      });
      void unlistenResourceUsagePromise.then((unlisten) => unlisten());
    };
  });

  $effect(() => {
    if (isInitialized) {
      void workspaceState;
      scheduleSave();
    }
  });

  $effect(() => {
    if (isInitialized) {
      void todoNotes;
      scheduleTodoSave();
    }
  });

  $effect(() => {
    if (
      isAddModalOpen ||
      isWorkspaceSwitcherOpen ||
      isCurrentWorkspaceDisabled ||
      (activeService && activeService.disabled)
    ) {
      webviewCommands.run(hideAllWebviews);
    } else if (activeService && !activeService.disabled) {
      webviewCommands.run(() =>
        openServiceWebview(
          activeService,
          spellCheckEnabled,
          resourceUsageMonitoringEnabled,
        ),
      );
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey) {
      const key = parseInt(e.key);
      if (!isNaN(key) && key >= 1 && key <= 9) {
        const index = key - 1;
        if (index < workspaceState.workspaces.length) {
          e.preventDefault();
          switchWorkspace(workspaceState.workspaces[index].id);
        }
      }
    }

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

    const next = targetId && targetId !== draggedId ? targetId : null;
    if (next === dragOverId) {
      return;
    }
    dragOverId = next;
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
      const reorderedServices = moveItemToTarget(services, draggedId, dragOverId);
      workspaceState = updateWorkspaceServices(
        workspaceState,
        workspaceState.currentWorkspaceId,
        reorderedServices.map((service) => service.id),
        activeId,
      );
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
    workspaceState = setWorkspaceActiveService(
      workspaceState,
      workspaceState.currentWorkspaceId,
      id,
    );
  }

  function switchWorkspace(id: string) {
    workspaceState = setCurrentWorkspaceId(workspaceState, id);
  }

  function setWorkspaceSwitcherOpen(open: boolean) {
    isWorkspaceSwitcherOpen = open;
  }

  function reloadService(id: string) {
    void reloadServiceWebview(id);
  }

  function toggleDisable(id: string) {
    const nextState = toggleServiceDisabled(services, activeId, id);

    applyCurrentWorkspaceServices(nextState.services, nextState.activeId);

    if (nextState.deleteWebview) {
      void deleteServiceWebview(nextState.deleteWebview);
    }
  }

  function updateServiceNotificationPrefs(
    id: string,
    updater: (prefs: NotificationPrefs) => NotificationPrefs,
  ) {
    const service = workspaceState.servicesById[id];
    if (!service) {
      return;
    }

    workspaceState = normalizeWorkspaceGroupsState({
      ...workspaceState,
      servicesById: {
        ...workspaceState.servicesById,
        [id]: {
          ...service,
          notificationPrefs: updater(service.notificationPrefs),
        },
      },
    });
  }

  function deleteService(id: string) {
    const serviceToDelete = services.find((s) => s.id === id);

    if (!serviceToDelete) {
      return;
    }

    const { [id]: _removedService, ...nextServicesById } = workspaceState.servicesById;
    workspaceState = normalizeWorkspaceGroupsState({
      ...workspaceState,
      servicesById: nextServicesById,
      workspaces: workspaceState.workspaces.map((workspace) => ({
        ...workspace,
        serviceIds: workspace.serviceIds.filter((serviceId) => serviceId !== id),
        activeServiceId: workspace.activeServiceId === id ? "" : workspace.activeServiceId,
      })),
    });
    if (id in badges) {
      const { [id]: _removedBadge, ...remainingBadges } = badges;
      badges = remainingBadges;
    }
    void deleteServiceWebview(serviceToDelete);
  }

  function applyCurrentWorkspaceServices(nextServices: Service[], nextActiveId: string) {
    const nextServicesById = {
      ...workspaceState.servicesById,
    };

    for (const service of nextServices) {
      nextServicesById[service.id] = service;
    }

    workspaceState = updateWorkspaceServices(
      {
        ...workspaceState,
        servicesById: nextServicesById,
      },
      workspaceState.currentWorkspaceId,
      nextServices.map((service) => service.id),
      nextActiveId,
    );
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

  function createWorkspace(input: { name: string; icon: WorkspaceIconKey }) {
    const id = `workspace-${crypto.randomUUID().slice(0, 8)}`;
    workspaceState = setCurrentWorkspaceId(
      createWorkspaceGroup(workspaceState, {
        id,
        name: input.name,
        serviceIds: [],
        activeServiceId: "",
        color: pickWorkspaceColor(workspaceState.workspaces.length),
        icon: input.icon,
      }),
      id,
    );
  }

  function updateWorkspaceIcon(input: { workspaceId: string; icon: WorkspaceIconKey }) {
    workspaceState = updateWorkspaceGroupIcon(
      workspaceState,
      input.workspaceId,
      input.icon,
    );
  }

  function renameWorkspace(input: { workspaceId: string; name: string }) {
    workspaceState = renameWorkspaceGroup(workspaceState, input.workspaceId, input.name);
  }

  function setWorkspaceDisabled(input: { workspaceId: string; disabled: boolean }) {
    const workspaceServices = getWorkspaceServices(workspaceState, input.workspaceId);
    workspaceState = setWorkspaceGroupDisabled(
      workspaceState,
      input.workspaceId,
      input.disabled,
    );

    if (!input.disabled) {
      return;
    }

    for (const service of workspaceServices) {
      void closeServiceWebview(service.id);
    }

    if (input.workspaceId === workspaceState.currentWorkspaceId) {
      void hideAllWebviews();
    }
  }

  function deleteWorkspace(workspaceId: string) {
    const deletedWorkspaceServices = getWorkspaceServices(workspaceState, workspaceId);
    const nextState = deleteWorkspaceGroup(workspaceState, workspaceId);
    workspaceState = nextState;

    for (const service of deletedWorkspaceServices) {
      const stillReferenced = nextState.workspaces.some((workspace) =>
        workspace.serviceIds.includes(service.id),
      );

      if (!stillReferenced) {
        void closeServiceWebview(service.id);
      }
    }
  }

  function pickWorkspaceColor(index: number) {
    const colors = ["#3B82F6", "#22C55E", "#F59E0B", "#A855F7", "#EF4444", "#14B8A6"];
    return colors[index % colors.length];
  }

  function createTodoId() {
    return crypto.randomUUID().slice(0, 8);
  }

  function setTodosPanelOpen(open: boolean) {
    isTodosPanelOpen = open;
    void setRightPanelWidth(open ? TODOS_PANEL_WIDTH : 0);
  }

  function addTodoNote() {
    todoNotes = [createTodoNote(createTodoId), ...todoNotes];
  }

  function addTodoListItem(noteId: string, afterItemId?: string, text = "") {
    const item = createTodoItem(createTodoId, text);
    todoNotes = afterItemId
      ? insertTodoItemsAfter(todoNotes, noteId, afterItemId, [item])
      : addTodoItem(todoNotes, noteId, item);
    return item.id;
  }

  function addTodoListItemsAfter(noteId: string, afterItemId: string, texts: string[]) {
    const items = texts.map((text) => createTodoItem(createTodoId, text));
    todoNotes = insertTodoItemsAfter(todoNotes, noteId, afterItemId, items);
    return items.map((item) => item.id);
  }

  function saveService(input: ServiceEditorInput) {
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
        applyCurrentWorkspaceServices(next.services, next.activeId);
        isAddModalOpen = next.isAddModalOpen;
        if (!next.isAddModalOpen) {
          editingService = null;
        }
      },
      deleteWebview: deleteServiceWebview,
      loadService: async (service) =>
        preloadServiceWebview(service, spellCheckEnabled),
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
    workspaces={workspaceState.workspaces}
    currentWorkspaceId={workspaceState.currentWorkspaceId}
    bind:isWorkspaceSwitcherOpen
    {draggedId}
    {dragOverId}
    {isDnd}
    {isTodosPanelOpen}
    onPointerDown={handlePointerDown}
    onSelectService={switchService}
    onSelectWorkspace={switchWorkspace}
    onCreateWorkspace={createWorkspace}
    onUpdateWorkspaceIcon={updateWorkspaceIcon}
    onRenameWorkspace={renameWorkspace}
    onSetWorkspaceDisabled={setWorkspaceDisabled}
    onDeleteWorkspace={deleteWorkspace}
    onWorkspaceSwitcherOpenChange={setWorkspaceSwitcherOpen}
    onToggleDnd={() => (isDnd = !isDnd)}
    onOpenAddModal={openAddModal}
    onToggleTodosPanel={() => setTodosPanelOpen(!isTodosPanelOpen)}
  />

  <ServiceEditorDialog
    bind:open={isAddModalOpen}
    {editingService}
    onSave={saveService}
  />

  <main
    class="flex-1 flex min-w-0 flex-col relative z-0 bg-background/50"
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

    {#if resourceUsageMonitoringEnabled && activeService && !activeService.disabled}
      <ResourceUsageStrip
        serviceId={activeService.id}
        serviceName={activeService.name}
        snapshot={activeResourceUsageSnapshot}
      />
    {/if}

    <div class="flex min-h-0 flex-1 items-center justify-center">
      {#if isCurrentWorkspaceDisabled && currentWorkspace}
        <WorkspaceDisabledState
          serviceName={currentWorkspace.name}
          onEnable={() =>
            setWorkspaceDisabled({
              workspaceId: currentWorkspace.id,
              disabled: false,
            })}
        />
      {:else if !activeService}
        <WorkspaceEmptyState onOpenAddModal={openAddModal} />
      {:else if activeService.disabled}
        <WorkspaceDisabledState
          serviceName={activeService.name}
          onEnable={() => toggleDisable(activeService.id)}
        />
      {/if}
    </div>
  </main>

  {#if isTodosPanelOpen}
    <TodosPanel
      notes={todoNotes}
      width={TODOS_PANEL_WIDTH}
      {spellCheckEnabled}
      onClose={() => setTodosPanelOpen(false)}
      onAddNote={addTodoNote}
      onDeleteNote={(noteId) => {
        todoNotes = deleteTodoNote(todoNotes, noteId);
      }}
      onUpdateNoteTitle={(noteId, title) => {
        todoNotes = updateTodoNoteTitle(todoNotes, noteId, title);
      }}
      onAddItem={addTodoListItem}
      onAddItemsAfter={addTodoListItemsAfter}
      onDeleteItem={(noteId, itemId) => {
        todoNotes = deleteTodoItem(todoNotes, noteId, itemId);
      }}
      onUpdateItemText={(noteId, itemId, text) => {
        todoNotes = updateTodoItemText(todoNotes, noteId, itemId, text);
      }}
      onToggleItemCompleted={(noteId, itemId, completed) => {
        todoNotes = toggleTodoItemCompleted(todoNotes, noteId, itemId, completed);
      }}
      onToggleCompletedCollapsed={(noteId) => {
        todoNotes = toggleTodoCompletedCollapsed(todoNotes, noteId);
      }}
      onToggleNoteCollapsed={(noteId) => {
        todoNotes = toggleTodoNoteCollapsed(todoNotes, noteId);
      }}
      onReorderNotes={(draggedId, targetId) => {
        todoNotes = reorderTodoNotes(todoNotes, draggedId, targetId);
      }}
      onReorderItems={(noteId, draggedId, targetId) => {
        todoNotes = reorderTodoItems(todoNotes, noteId, draggedId, targetId);
      }}
    />
  {/if}
</div>
