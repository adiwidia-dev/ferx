<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { goto } from "$app/navigation";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import AppWindowIcon from "@lucide/svelte/icons/app-window";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import SettingsConfigurationDialogs from "$lib/components/settings/settings-configuration-dialogs.svelte";
  import SettingsConfigurationSection from "$lib/components/settings/settings-configuration-section.svelte";
  import SettingsPreferencesSection from "$lib/components/settings/settings-preferences-section.svelte";
  import SettingsRestartDialogs from "$lib/components/settings/settings-restart-dialogs.svelte";
  import SettingsUpdatesSection from "$lib/components/settings/settings-updates-section.svelte";
  import WorkspaceSidebar from "$lib/components/workspace/workspace-sidebar.svelte";
  import { getAppInfo } from "$lib/services/app-info";
  import { dndState, toggleDndEnabled } from "$lib/services/dnd-state.svelte";
  import {
    APP_SETTINGS_STORAGE_KEY,
    serializeAppSettings,
  } from "$lib/services/app-settings";
  import {
    buildWorkspaceConfigExportPayload,
    serializeWorkspaceConfigExport,
    type FerxWorkspaceConfigFileV2,
  } from "$lib/services/workspace-config-export";
  import {
    parseWorkspaceConfigImport,
    writeWorkspaceConfigImportToStorage,
    type ImportedWorkspaceConfig,
  } from "$lib/services/workspace-config-import";
  import {
    checkForUpdate,
    downloadAndInstall,
    formatErrorMessage,
    relaunchApp,
    type UpdaterState,
  } from "$lib/services/updater";
  import {
    applyRuntimeBadgePayload,
    runtimeBadges,
  } from "$lib/services/runtime-badges.svelte";
  import {
    createDefaultWorkspaceGroupsState,
    createNewWorkspace,
    deleteWorkspaceGroup,
    getWorkspaceServices,
    renameWorkspaceGroup,
    setCurrentWorkspaceId,
    setWorkspaceDisabled as setWorkspaceGroupDisabled,
    updateWorkspaceGroupIcon,
    type WorkspaceGroupsState,
  } from "$lib/services/workspace-groups";
  import {
    commitSettingsWorkspaceState,
    getSettingsActiveServiceId,
    readSettingsPageStartupState,
    resolveSettingsServiceRoute,
    scheduleSettingsWorkspaceReload,
  } from "$lib/services/settings-page-state";
  import {
    setAllServiceWebviewsAudioMuted,
    showServiceContextMenu,
  } from "$lib/services/webview-commands";
  import type { WorkspaceIconKey } from "$lib/services/workspace-icons";

  const appInfo = getAppInfo();
  const settingsSections = [
    { href: "#general", label: "General" },
    { href: "#preferences", label: "Preferences" },
    { href: "#configuration", label: "Configuration" },
    { href: "#updates", label: "Updates" },
  ];

  let workspaceState = $state<WorkspaceGroupsState>(createDefaultWorkspaceGroupsState());
  let services = $derived(
    getWorkspaceServices(workspaceState).map((service) => ({
      ...service,
      badge: runtimeBadges[service.id],
    })),
  );
  let activeId = $derived(getSettingsActiveServiceId(workspaceState));
  let isTodosPanelOpen = $state(false);
  let isWorkspaceSwitcherOpen = $state(false);
  let updater = $state<UpdaterState>({ status: "idle" });
  let spellCheckEnabled = $state(true);
  let resourceUsageMonitoringEnabled = $state(false);
  let initialSpellCheckEnabled = $state(true);
  let showRestartPrompt = $state(false);
  let showRestartConfirm = $state(false);
  let restartError = $state("");
  let showExportConfirm = $state(false);
  let pendingExport = $state<FerxWorkspaceConfigFileV2 | null>(null);
  let exportError = $state("");
  let importPreview = $state<ImportedWorkspaceConfig | null>(null);
  let showImportConfirm = $state(false);
  let importError = $state("");
  let configStatus = $state("");
  let importInput = $state<HTMLInputElement | null>(null);
  let spellCheckRestartRequired = $derived(spellCheckEnabled !== initialSpellCheckEnabled);

  onMount(() => {
    void invoke("hide_all_webviews");

    const startup = readSettingsPageStartupState(localStorage);
    workspaceState = startup.workspaceState;
    spellCheckEnabled = startup.spellCheckEnabled;
    resourceUsageMonitoringEnabled = startup.resourceUsageMonitoringEnabled;
    initialSpellCheckEnabled = startup.initialSpellCheckEnabled;
    showRestartPrompt = false;
    showRestartConfirm = false;
    restartError = "";
    showExportConfirm = false;
    pendingExport = null;
    exportError = "";
    importPreview = null;
    showImportConfirm = false;
    importError = "";
    configStatus = "";

    const unlistenBadgePromise = listen("update-badge", (event) => {
      applyRuntimeBadgePayload(event.payload, services);
    });

    return () => {
      void unlistenBadgePromise.then((unlisten) => unlisten());
    };
  });

  async function handleCheckForUpdates() {
    updater = { status: "checking" };
    try {
      const update = await checkForUpdate();
      if (!update) {
        updater = { status: "up-to-date" };
        return;
      }
      updater = {
        status: "available",
        version: update.version,
        notes: update.body ?? null,
        update,
      };
    } catch (error) {
      updater = { status: "error", message: formatErrorMessage(error) };
    }
  }

  async function handleDownloadAndInstall() {
    if (updater.status !== "available") return;
    const { update, version } = updater;
    updater = { status: "downloading", version, downloaded: 0, total: null };
    try {
      await downloadAndInstall(update, (downloaded, total) => {
        updater = { status: "downloading", version, downloaded, total };
      });
      updater = { status: "installed", version };
    } catch (error) {
      updater = { status: "error", message: formatErrorMessage(error) };
    }
  }

  async function handleRelaunch() {
    try {
      await relaunchApp();
    } catch (error) {
      updater = { status: "error", message: formatErrorMessage(error) };
    }
  }

  function handleSpellCheckChange(enabled: boolean) {
    spellCheckEnabled = enabled;
    localStorage.setItem(
      APP_SETTINGS_STORAGE_KEY,
      serializeAppSettings({ spellCheckEnabled, resourceUsageMonitoringEnabled }),
    );
    showRestartPrompt = enabled !== initialSpellCheckEnabled;
    restartError = "";
  }

  function handleResourceUsageMonitoringChange(enabled: boolean) {
    resourceUsageMonitoringEnabled = enabled;
    localStorage.setItem(
      APP_SETTINGS_STORAGE_KEY,
      serializeAppSettings({ spellCheckEnabled, resourceUsageMonitoringEnabled }),
    );
  }

  function requestRestartFerx() {
    restartError = "";
    showRestartConfirm = true;
  }

  function cancelRestartFerx() {
    showRestartConfirm = false;
    restartError = "";
  }

  async function handleRestartFerx() {
    restartError = "";
    try {
      await relaunchApp();
    } catch (error) {
      restartError = formatErrorMessage(error);
    }
  }

  function requestExportConfiguration() {
    exportError = "";
    configStatus = "";

    try {
      const startup = readSettingsPageStartupState(localStorage);
      pendingExport = buildWorkspaceConfigExportPayload({
        workspaceState: startup.workspaceState,
        appSettings: {
          spellCheckEnabled: startup.spellCheckEnabled,
          resourceUsageMonitoringEnabled: startup.resourceUsageMonitoringEnabled,
        },
        appVersion: appInfo.version,
      });
      showExportConfirm = true;
    } catch (error) {
      exportError = formatErrorMessage(error);
    }
  }

  function cancelExportConfiguration() {
    showExportConfirm = false;
    pendingExport = null;
    exportError = "";
  }

  async function confirmExportConfiguration() {
    if (!pendingExport) return;

    try {
      const json = serializeWorkspaceConfigExport(pendingExport);
      const date = pendingExport.ferxExport.exportedAt.slice(0, 10);
      const defaultFilename = `ferx-workspace-config-${date}.json`;
      const saved = await invoke<boolean>("save_workspace_config_export", {
        contents: json,
        defaultFilename,
      });

      if (saved) {
        showExportConfirm = false;
        pendingExport = null;
        configStatus = "Configuration export saved.";
      } else {
        showExportConfirm = false;
        pendingExport = null;
        configStatus = "Configuration export canceled.";
      }
    } catch (error) {
      exportError = formatErrorMessage(error);
    }
  }

  function requestImportConfiguration() {
    importError = "";
    configStatus = "";
    importInput?.click();
  }

  async function handleImportFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";

    if (!file) return;

    try {
      const result = parseWorkspaceConfigImport(await file.text());
      if (!result.ok) {
        importError = result.message;
        importPreview = null;
        showImportConfirm = false;
        return;
      }

      importPreview = result.value;
      importError = "";
      showImportConfirm = true;
    } catch (error) {
      importError = formatErrorMessage(error);
      importPreview = null;
      showImportConfirm = false;
    }
  }

  function cancelImportConfiguration() {
    showImportConfirm = false;
    importPreview = null;
    importError = "";
  }

  async function confirmImportConfiguration() {
    if (!importPreview) return;

    importError = "";
    try {
      await invoke("close_all_service_webviews");
      writeWorkspaceConfigImportToStorage(importPreview, localStorage);
      showImportConfirm = false;
      importPreview = null;
      configStatus = "Configuration imported. Reload Ferx to apply it.";
      scheduleSettingsWorkspaceReload(window);
    } catch (error) {
      importError = formatErrorMessage(error);
    }
  }

  function commitWorkspaceState(nextState: WorkspaceGroupsState) {
    workspaceState = nextState;
    commitSettingsWorkspaceState(localStorage, nextState);
  }

  function switchWorkspace(id: string) {
    commitWorkspaceState(setCurrentWorkspaceId(workspaceState, id));
  }

  function setWorkspaceSwitcherOpen(open: boolean) {
    isWorkspaceSwitcherOpen = open;
  }

  function openRoute(path: string) {
    if (typeof window === "undefined") {
      return;
    }

    void goto(path);
  }

  function handleSelectService(id: string) {
    openRoute(resolveSettingsServiceRoute(workspaceState, id));
  }

  function handleSidebarPointerDown(_event: PointerEvent, _id: string) {}

  function createWorkspace(input: { name: string; icon: WorkspaceIconKey }) {
    commitWorkspaceState(createNewWorkspace(workspaceState, input));
  }

  function updateWorkspaceIcon(input: { workspaceId: string; icon: WorkspaceIconKey }) {
    commitWorkspaceState(
      updateWorkspaceGroupIcon(workspaceState, input.workspaceId, input.icon),
    );
  }

  function renameWorkspace(input: { workspaceId: string; name: string }) {
    commitWorkspaceState(renameWorkspaceGroup(workspaceState, input.workspaceId, input.name));
  }

  function setWorkspaceDisabled(input: { workspaceId: string; disabled: boolean }) {
    commitWorkspaceState(
      setWorkspaceGroupDisabled(workspaceState, input.workspaceId, input.disabled),
    );
  }

  function deleteWorkspace(workspaceId: string) {
    commitWorkspaceState(deleteWorkspaceGroup(workspaceState, workspaceId));
  }

  function openServiceContextMenu(input: { id: string; disabled: boolean }) {
    void showServiceContextMenu(input.id, input.disabled);
  }

  function toggleDnd() {
    const enabled = toggleDndEnabled();
    void setAllServiceWebviewsAudioMuted(enabled);
  }
</script>

<svelte:head>
  <title>Settings | Ferx</title>
</svelte:head>

<div class="flex h-screen min-h-0 w-screen overflow-hidden bg-background text-foreground">
  <WorkspaceSidebar
    services={services}
    {activeId}
    workspaces={workspaceState.workspaces}
    currentWorkspaceId={workspaceState.currentWorkspaceId}
    draggedId={null}
    dragOverId={null}
    isDnd={dndState.enabled}
    {isTodosPanelOpen}
    bind:isWorkspaceSwitcherOpen
    onPointerDown={handleSidebarPointerDown}
    onSelectService={handleSelectService}
    onSelectWorkspace={switchWorkspace}
    onCreateWorkspace={createWorkspace}
    onUpdateWorkspaceIcon={updateWorkspaceIcon}
    onRenameWorkspace={renameWorkspace}
    onSetWorkspaceDisabled={setWorkspaceDisabled}
    onDeleteWorkspace={deleteWorkspace}
    onWorkspaceSwitcherOpenChange={setWorkspaceSwitcherOpen}
    onOpenServiceContextMenu={openServiceContextMenu}
    onToggleDnd={toggleDnd}
    onOpenAddModal={() => openRoute("/")}
    onToggleTodosPanel={() => openRoute("/")}
  />

  <main
    class="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col bg-background/50"
  >
    <SettingsRestartDialogs
      {showRestartPrompt}
      {showRestartConfirm}
      {restartError}
      onDismissRestartPrompt={() => (showRestartPrompt = false)}
      onRestartFromPrompt={handleRestartFerx}
      onCancelRestart={cancelRestartFerx}
      onConfirmRestart={handleRestartFerx}
    />

    <SettingsConfigurationDialogs
      {showExportConfirm}
      {pendingExport}
      {exportError}
      {showImportConfirm}
      {importPreview}
      {importError}
      onCancelExportConfiguration={cancelExportConfiguration}
      onConfirmExportConfiguration={confirmExportConfiguration}
      onCancelImportConfiguration={cancelImportConfiguration}
      onConfirmImportConfiguration={confirmImportConfiguration}
    />

    <div
      class="relative z-10 flex min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-muted/30"
    >
      <div class="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[184px_minmax(0,1fr)] lg:gap-8 lg:py-8">
        <nav
          data-testid="settings-section-nav"
          aria-label="Settings sections"
          class="lg:sticky lg:top-8 lg:h-fit"
        >
          <div class="mb-4 flex items-center gap-3 lg:block">
            <div class="flex min-w-0 items-center gap-3 lg:mb-5">
              <img
                src="/app-icon.png"
                alt={appInfo.name}
                class="h-8 w-8 rounded-lg object-contain"
                decoding="async"
                fetchpriority="low"
              />
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-foreground">{appInfo.name}</p>
                <p class="text-xs text-muted-foreground">v{appInfo.version}</p>
              </div>
            </div>
          </div>

          <div class="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {#each settingsSections as section (section.href)}
              <a
                href={section.href}
                class="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 lg:w-full"
              >
                {section.label}
              </a>
            {/each}
          </div>
        </nav>

        <div class="min-w-0 pb-8">
          <header class="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Ferx console
              </p>
              <h1 class="mt-2 text-2xl font-extrabold tracking-normal text-foreground">
                Settings
              </h1>
              <p class="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Manage workspace preferences, configuration backups, and verified app updates.
              </p>
            </div>
            <Button
              variant="outline"
              class="h-9 w-fit rounded-lg px-3 text-xs"
              onclick={handleCheckForUpdates}
              disabled={updater.status === "checking" || updater.status === "downloading"}
            >
              <RefreshCwIcon class="size-3.5" />
              {updater.status === "checking" ? "Checking" : "Check updates"}
            </Button>
          </header>

          <div class="space-y-5">
            <section id="general" class="scroll-mt-8 rounded-lg border bg-card text-card-foreground shadow-sm">
              <div class="border-b px-5 py-4">
                <div class="flex items-center gap-3">
                  <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <AppWindowIcon class="size-4" />
                  </div>
                  <div>
                    <h2 class="text-sm font-semibold text-foreground">General</h2>
                    <p class="mt-0.5 text-xs text-muted-foreground">Application identity and installed version.</p>
                  </div>
                </div>
              </div>

              <div class="divide-y">
                <div class="flex items-center justify-between gap-4 px-5 py-4">
                  <div>
                    <p class="text-sm font-medium text-foreground">App Name</p>
                    <p class="mt-1 text-xs text-muted-foreground">Current desktop application.</p>
                  </div>
                  <p class="text-sm font-semibold text-foreground">{appInfo.name}</p>
                </div>

                <div class="flex items-center justify-between gap-4 px-5 py-4">
                  <div>
                    <p class="text-sm font-medium text-foreground">Version</p>
                    <p class="mt-1 text-xs text-muted-foreground">Installed release.</p>
                  </div>
                  <span class="rounded-md border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {appInfo.version}
                  </span>
                </div>
              </div>
            </section>

            <SettingsPreferencesSection
              {spellCheckEnabled}
              {resourceUsageMonitoringEnabled}
              {spellCheckRestartRequired}
              {restartError}
              onSpellCheckChange={handleSpellCheckChange}
              onResourceUsageMonitoringChange={handleResourceUsageMonitoringChange}
              onRequestRestart={requestRestartFerx}
            />

            <SettingsConfigurationSection
              {configStatus}
              {exportError}
              {importError}
              bind:importInput
              onRequestExportConfiguration={requestExportConfiguration}
              onRequestImportConfiguration={requestImportConfiguration}
              onImportFileChange={handleImportFileChange}
            />

            <SettingsUpdatesSection
              appName={appInfo.name}
              appVersion={appInfo.version}
              releasesUrl={appInfo.releasesUrl}
              {updater}
              onCheckForUpdates={handleCheckForUpdates}
              onDownloadAndInstall={handleDownloadAndInstall}
              onRelaunch={handleRelaunch}
              onOpenReleases={() => appInfo.releasesUrl && openUrl(appInfo.releasesUrl)}
            />
          </div>
        </div>
      </div>
    </div>
  </main>
</div>
