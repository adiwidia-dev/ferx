<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { moveItemToTarget } from "$lib/services/reorder";
  import ServiceEditorDialog, {
    type ServiceEditorInput,
  } from "$lib/components/workspace/service-editor-dialog.svelte";
  import TodosPanel from "$lib/components/workspace/todos-panel.svelte";
  import ResourceUsageStrip from "$lib/components/workspace/resource-usage-strip.svelte";
  import WorkspaceDisabledState from "$lib/components/workspace/workspace-disabled-state.svelte";
  import WorkspaceEmptyState from "$lib/components/workspace/workspace-empty-state.svelte";
  import WorkspaceSidebar from "$lib/components/workspace/workspace-sidebar.svelte";
  import { DEFAULT_APP_SETTINGS } from "$lib/services/app-settings";
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
    showServiceContextMenu,
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
    consumeOpenServiceParam,
    createDebouncedStorageWriter,
    MAX_BACKGROUND_PRELOADS,
    PRELOAD_GAP_MS,
    PRELOAD_START_MS,
    readWorkspacePageStartupState,
    registerFlushOnExit,
    scheduleCancellableTask,
    WORKSPACE_PAGE_STORAGE_KEYS,
    WORKSPACE_SAVE_DEBOUNCE_MS,
  } from "$lib/services/workspace-page-lifecycle";
  import {
    applyCurrentWorkspaceServices,
    deleteServiceFromWorkspaceState,
    deleteWorkspaceWithEffects,
    setWorkspaceDisabledWithEffects,
    toggleWorkspaceServiceDisabled,
    updateServiceNotificationPrefs as updateWorkspaceServiceNotificationPrefs,
  } from "$lib/services/workspace-actions";
  import {
    cleanupPageListeners,
    WORKSPACE_ACTIVE_ID_KEY,
    type PageService,
  } from "$lib/services/workspace-state";
  import {
    createDefaultWorkspaceGroupsState,
    createNewWorkspace,
    getWorkspace,
    getWorkspaceServices,
    serializeWorkspaceGroupsState,
    setCurrentWorkspaceId,
    setWorkspaceActiveService,
    renameWorkspaceGroup,
    updateWorkspaceServices,
    updateWorkspaceGroupIcon,
    type WorkspaceGroupsState,
  } from "$lib/services/workspace-groups";
  import { serializeTodoNotes } from "$lib/services/todos";
  import type { WorkspaceIconKey } from "$lib/services/workspace-icons";
  import { createDragDropState } from "$lib/services/drag-drop.svelte";
  import { createTodoPanelStore, TODOS_PANEL_WIDTH } from "$lib/services/todo-panel.svelte";
  import { createServiceEditorStore } from "$lib/services/service-editor.svelte";
  import { onMount } from "svelte";

  // ---------------------------------------------------------------------------
  // Core page state
  // ---------------------------------------------------------------------------

  let toastMessage = $state("");
  let toastTimeout = $state<ReturnType<typeof setTimeout> | null>(null);
  let workspaceState = $state<WorkspaceGroupsState>(createDefaultWorkspaceGroupsState());
  let badges = $state<Record<string, number | undefined>>({});
  let isInitialized = $state(false);
  let spellCheckEnabled = $state(DEFAULT_APP_SETTINGS.spellCheckEnabled);
  let resourceUsageMonitoringEnabled = $state(
    DEFAULT_APP_SETTINGS.resourceUsageMonitoringEnabled,
  );
  let isWorkspaceSwitcherOpen = $state(false);
  let isDnd = $state(false);

  const webviewCommands = createWebviewCommandQueue();

  const workspaceStorage = createDebouncedStorageWriter({
    storageKey: WORKSPACE_PAGE_STORAGE_KEYS.workspaceState,
    delayMs: WORKSPACE_SAVE_DEBOUNCE_MS,
    serialize: serializeWorkspaceGroupsState,
    getStorage: () => (typeof localStorage === "undefined" ? null : localStorage),
  });

  const todoStorage = createDebouncedStorageWriter({
    storageKey: WORKSPACE_PAGE_STORAGE_KEYS.todoNotes,
    delayMs: WORKSPACE_SAVE_DEBOUNCE_MS,
    serialize: serializeTodoNotes,
    getStorage: () => (typeof localStorage === "undefined" ? null : localStorage),
  });

  // ---------------------------------------------------------------------------
  // Composable stores
  // ---------------------------------------------------------------------------

  const dnd = createDragDropState();
  const serviceEditor = createServiceEditorStore();
  const todos = createTodoPanelStore(todoStorage, (width) =>
    webviewCommands.run(() => setRightPanelWidth(width)),
  );

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

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
    if (!service) return undefined;
    return { ...service, disabled: isCurrentWorkspaceDisabled || service.disabled };
  });
  let activeResourceUsageSnapshot = $derived(
    activeId ? resourceUsageSnapshots[activeId] : undefined,
  );
  let hasUnreadNotifications = $derived(
    !isDnd && countTrayRelevantUnreadServices(displayServices) > 0,
  );
  let lastTrayUnreadState: boolean | null = null;

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  $effect(() => {
    if (isInitialized && hasUnreadNotifications !== lastTrayUnreadState) {
      lastTrayUnreadState = hasUnreadNotifications;
      void invoke("update_tray_icon", { hasUnread: hasUnreadNotifications });
    }
  });

  $effect(() => {
    if (isInitialized) {
      void workspaceState;
      workspaceStorage.schedule(workspaceState);
    }
  });

  $effect(() => {
    if (isInitialized) {
      void todos.notes;
      todos.scheduleStorage();
    }
  });

  $effect(() => {
    if (
      serviceEditor.isOpen ||
      isWorkspaceSwitcherOpen ||
      isCurrentWorkspaceDisabled ||
      (activeService && activeService.disabled)
    ) {
      webviewCommands.run(hideAllWebviews);
    } else if (activeService && !activeService.disabled) {
      webviewCommands.run(() =>
        openServiceWebview(activeService, spellCheckEnabled, resourceUsageMonitoringEnabled),
      );
    }
  });

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  onMount(() => {
    const unlistenToastPromise = listen("show-toast", (event) => {
      showToast(event.payload as string);
    });

    const { openServiceId, nextSearch } =
      typeof window === "undefined"
        ? { openServiceId: null, nextSearch: "" }
        : consumeOpenServiceParam(window.location.search);

    const startupState = readWorkspacePageStartupState({
      savedWorkspaceState: localStorage.getItem(WORKSPACE_PAGE_STORAGE_KEYS.workspaceState),
      legacySavedServices: localStorage.getItem("ferx-workspace-services"),
      legacyActiveServiceId: localStorage.getItem(WORKSPACE_ACTIVE_ID_KEY),
      savedAppSettings: localStorage.getItem(WORKSPACE_PAGE_STORAGE_KEYS.appSettings),
      savedTodoNotes: localStorage.getItem(WORKSPACE_PAGE_STORAGE_KEYS.todoNotes),
      openServiceId,
    });

    spellCheckEnabled = startupState.spellCheckEnabled;
    resourceUsageMonitoringEnabled = startupState.resourceUsageMonitoringEnabled;
    workspaceState = startupState.workspaceState;
    todos.notes = startupState.todoNotes;

    if (typeof window !== "undefined" && openServiceId) {
      const path = window.location.pathname + (nextSearch ? `?${nextSearch}` : "");
      window.history.replaceState(null, "", path);
    }

    if (startupState.toastMessage) {
      showToast(startupState.toastMessage);
    }

    const startupWorkspace = getWorkspace(workspaceState);
    const startupServices = getWorkspaceServices(workspaceState);
    const startupActiveId = startupWorkspace?.activeServiceId ?? "";

    let cancelPreload: () => void = () => {};
    if (startupServices.length > 0 && !startupWorkspace?.disabled) {
      cancelPreload = scheduleCancellableTask({
        delayMs: PRELOAD_START_MS,
        run: (isCancelled) =>
          preloadBackgroundServices({
            services: startupServices,
            activeId: startupActiveId,
            spellCheckEnabled,
            maxPreloads: MAX_BACKGROUND_PRELOADS,
            gapMs: PRELOAD_GAP_MS,
            shouldCancel: isCancelled,
          }),
      });
    }

    const cleanupFlushOnExit = registerFlushOnExit(() => {
      workspaceStorage.flush(workspaceState);
      todos.flush();
    });

    const unlistenPromise = listen("menu-action", (event) => {
      const actionStr = event.payload as string;
      const [action, targetId] = actionStr.split(":");

      if (action === "reload") reloadService(targetId);
      if (action === "edit") {
        const s = services.find((x) => x.id === targetId);
        if (s) void openEditModal(s);
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
      if (!targetId || Number.isNaN(count)) return;
      if (services.some((service) => service.id === targetId) && badges[targetId] !== count) {
        badges = { ...badges, [targetId]: count };
      }
    });

    const unlistenResourceUsagePromise = listen("resource-usage-update", (event) => {
      const [targetId, payload = ""] = (event.payload as string).split(/:(.*)/s);
      if (!targetId || !services.some((service) => service.id === targetId)) return;
      const snapshot = parseResourceUsagePayload(targetId, payload);
      if (!snapshot) return;
      resourceUsageSnapshots = { ...resourceUsageSnapshots, [targetId]: snapshot };
    });

    const unlistenShortcutPromise = listen("switch-shortcut", (event) => {
      const key = parseInt(event.payload as string);
      if (!isNaN(key) && key >= 1 && key <= 9) {
        const index = key - 1;
        if (index < services.length) switchService(services[index].id);
      }
    });

    isInitialized = true;

    return () => {
      cancelPreload();
      cleanupFlushOnExit();
      workspaceStorage.flush(workspaceState);
      todos.flush();
      void webviewCommands.run(() => setRightPanelWidth(0));
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

  // ---------------------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------------------

  function showToast(message: string) {
    toastMessage = message;
    if (toastTimeout) clearTimeout(toastTimeout);
    if (!message) {
      toastTimeout = null;
      return;
    }
    toastTimeout = setTimeout(() => {
      toastMessage = "";
      toastTimeout = null;
    }, 3000);
  }

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Webview overlay helpers
  // ---------------------------------------------------------------------------

  async function hideActiveWebviewsForOverlay() {
    await webviewCommands.run(hideAllWebviews);
  }

  // ---------------------------------------------------------------------------
  // Service switching / workspace
  // ---------------------------------------------------------------------------

  function switchService(id: string) {
    workspaceState = setWorkspaceActiveService(workspaceState, workspaceState.currentWorkspaceId, id);
  }

  function switchWorkspace(id: string) {
    workspaceState = setCurrentWorkspaceId(workspaceState, id);
  }

  async function setWorkspaceSwitcherOpen(open: boolean) {
    if (!open) {
      isWorkspaceSwitcherOpen = false;
      return;
    }
    await hideActiveWebviewsForOverlay();
    isWorkspaceSwitcherOpen = true;
  }

  function reloadService(id: string) {
    void webviewCommands.run(() => reloadServiceWebview(id));
  }

  function toggleDisable(id: string) {
    const nextState = toggleWorkspaceServiceDisabled(workspaceState, id);
    workspaceState = nextState.state;
    if (nextState.deleteWebview) {
      void webviewCommands.run(() => deleteServiceWebview(nextState.deleteWebview!));
    }
  }

  function updateServiceNotificationPrefs(
    id: string,
    updater: (prefs: NotificationPrefs) => NotificationPrefs,
  ) {
    workspaceState = updateWorkspaceServiceNotificationPrefs(workspaceState, id, updater);
  }

  function deleteService(id: string) {
    const nextState = deleteServiceFromWorkspaceState(workspaceState, badges, id);
    workspaceState = nextState.state;
    badges = nextState.badges;
    if (nextState.deletedService) {
      void webviewCommands.run(() => deleteServiceWebview(nextState.deletedService!));
    }
  }

  async function openServiceContextMenu(input: { id: string; disabled: boolean }) {
    await showServiceContextMenu(input.id, input.disabled);
  }

  function createWorkspace(input: { name: string; icon: WorkspaceIconKey }) {
    workspaceState = createNewWorkspace(workspaceState, input);
  }

  function updateWorkspaceIcon(input: { workspaceId: string; icon: WorkspaceIconKey }) {
    workspaceState = updateWorkspaceGroupIcon(workspaceState, input.workspaceId, input.icon);
  }

  function renameWorkspace(input: { workspaceId: string; name: string }) {
    workspaceState = renameWorkspaceGroup(workspaceState, input.workspaceId, input.name);
  }

  function setWorkspaceDisabled(input: { workspaceId: string; disabled: boolean }) {
    const nextState = setWorkspaceDisabledWithEffects(workspaceState, input);
    workspaceState = nextState.state;
    for (const serviceId of nextState.closeWebviewIds) {
      void webviewCommands.run(() => closeServiceWebview(serviceId));
    }
    if (nextState.shouldHideWebviews) void webviewCommands.run(hideAllWebviews);
  }

  function deleteWorkspace(workspaceId: string) {
    const nextState = deleteWorkspaceWithEffects(workspaceState, workspaceId);
    workspaceState = nextState.state;
    for (const serviceId of nextState.closeWebviewIds) {
      void webviewCommands.run(() => closeServiceWebview(serviceId));
    }
  }

  // ---------------------------------------------------------------------------
  // Service editor
  // ---------------------------------------------------------------------------

  async function openAddModal() {
    await hideActiveWebviewsForOverlay();
    serviceEditor.open(null);
  }

  async function openEditModal(service: PageService) {
    await hideActiveWebviewsForOverlay();
    serviceEditor.openForEdit(service);
  }

  function saveService(input: ServiceEditorInput) {
    serviceEditor.save(input, {
      services,
      activeId,
      showToast,
      onWorkspaceUpdate: (next) => {
        workspaceState = applyCurrentWorkspaceServices(workspaceState, next.services, next.activeId);
      },
      deleteWebview: (payload) => webviewCommands.run(() => deleteServiceWebview(payload)),
      loadService: (service) =>
        webviewCommands.run(() => preloadServiceWebview(service, spellCheckEnabled)),
    });
  }
</script>

<svelte:window
  onkeydown={handleKeydown}
  onpointermove={(e) => dnd.handlePointerMove(e)}
  onpointerup={(e) =>
    dnd.handlePointerUp(e, (fromId, toId) => {
      const reordered = moveItemToTarget(services, fromId, toId);
      workspaceState = updateWorkspaceServices(
        workspaceState,
        workspaceState.currentWorkspaceId,
        reordered.map((s) => s.id),
        activeId,
      );
    })}
  onpointercancel={(e) => dnd.handlePointerUp(e, () => {})}
/>

<div class="flex h-screen w-screen overflow-hidden bg-background text-foreground">
  <WorkspaceSidebar
    services={displayServices}
    {activeId}
    workspaces={workspaceState.workspaces}
    currentWorkspaceId={workspaceState.currentWorkspaceId}
    bind:isWorkspaceSwitcherOpen
    draggedId={dnd.draggedId}
    dragOverId={dnd.dragOverId}
    {isDnd}
    isTodosPanelOpen={todos.isPanelOpen}
    onPointerDown={(e, id) => dnd.handlePointerDown(e, id)}
    onSelectService={switchService}
    onSelectWorkspace={switchWorkspace}
    onCreateWorkspace={createWorkspace}
    onUpdateWorkspaceIcon={updateWorkspaceIcon}
    onRenameWorkspace={renameWorkspace}
    onSetWorkspaceDisabled={setWorkspaceDisabled}
    onDeleteWorkspace={deleteWorkspace}
    onWorkspaceSwitcherOpenChange={setWorkspaceSwitcherOpen}
    onOpenServiceContextMenu={(input) => void openServiceContextMenu(input)}
    onToggleDnd={() => (isDnd = !isDnd)}
    onOpenAddModal={openAddModal}
    onToggleTodosPanel={() => todos.setOpen(!todos.isPanelOpen)}
  />

  <ServiceEditorDialog
    bind:open={serviceEditor.isOpen}
    editingService={serviceEditor.editingService}
    onSave={saveService}
  />

  <main class="flex-1 flex min-w-0 flex-col relative z-0 bg-background/50">
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
          onEnable={() => setWorkspaceDisabled({ workspaceId: currentWorkspace.id, disabled: false })}
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

  {#if todos.isPanelOpen}
    <TodosPanel
      notes={todos.notes}
      width={TODOS_PANEL_WIDTH}
      {spellCheckEnabled}
      onClose={() => todos.setOpen(false)}
      onAddNote={() => todos.addNote()}
      onDeleteNote={(noteId) => todos.deleteNote(noteId)}
      onUpdateNoteTitle={(noteId, title) => todos.updateNoteTitle(noteId, title)}
      onAddItem={(...args) => todos.addItem(...args)}
      onAddItemsAfter={(...args) => todos.addItemsAfter(...args)}
      onDeleteItem={(noteId, itemId) => todos.deleteItem(noteId, itemId)}
      onUpdateItemText={(noteId, itemId, text) => todos.updateItemText(noteId, itemId, text)}
      onToggleItemCompleted={(noteId, itemId, completed) =>
        todos.toggleItemCompleted(noteId, itemId, completed)}
      onToggleCompletedCollapsed={(noteId) => todos.toggleCompletedCollapsed(noteId)}
      onToggleNoteCollapsed={(noteId) => todos.toggleNoteCollapsed(noteId)}
      onReorderNotes={(draggedId, targetId) => todos.reorderNotes(draggedId, targetId)}
      onReorderItems={(noteId, draggedId, targetId) =>
        todos.reorderItems(noteId, draggedId, targetId)}
    />
  {/if}
</div>
