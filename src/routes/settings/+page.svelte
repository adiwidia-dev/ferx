<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { getAppInfo } from "$lib/services/app-info";
  import {
    APP_SETTINGS_STORAGE_KEY,
    readAppSettings,
    serializeAppSettings,
  } from "$lib/services/app-settings";
  import {
    buildWorkspaceConfigExportPayload,
    serializeWorkspaceConfigExport,
    type FerxWorkspaceConfigFileV1,
  } from "$lib/services/workspace-config-export";
  import {
    parseWorkspaceConfigImport,
    writeWorkspaceConfigImportToStorage,
    type ImportedWorkspaceConfig,
  } from "$lib/services/workspace-config-import";
  import { getServiceFaviconUrl, getServiceMonogram } from "$lib/services/service-icon";
  import {
    checkForUpdate,
    downloadAndInstall,
    formatErrorMessage,
    relaunchApp,
    type UpdaterState,
  } from "$lib/services/updater";
  import { readStartupState, type PageService } from "$lib/services/workspace-state";

  const appInfo = getAppInfo();

  let services = $state<PageService[]>([]);
  let activeId = $state("");
  let isDnd = $state(false);
  let failedIcons = $state<Record<string, boolean>>({});
  let updater = $state<UpdaterState>({ status: "idle" });
  let spellCheckEnabled = $state(true);
  let initialSpellCheckEnabled = $state(true);
  let showRestartPrompt = $state(false);
  let showRestartConfirm = $state(false);
  let restartError = $state("");
  let showExportConfirm = $state(false);
  let pendingExport = $state<FerxWorkspaceConfigFileV1 | null>(null);
  let exportError = $state("");
  let importPreview = $state<ImportedWorkspaceConfig | null>(null);
  let showImportConfirm = $state(false);
  let importError = $state("");
  let configStatus = $state("");
  let importInput = $state<HTMLInputElement | null>(null);
  let spellCheckRestartRequired = $derived(spellCheckEnabled !== initialSpellCheckEnabled);

  onMount(() => {
    void invoke("hide_all_webviews");

    const startup = readStartupState(localStorage.getItem("ferx-workspace-services"));
    const settings = readAppSettings(localStorage.getItem(APP_SETTINGS_STORAGE_KEY));
    services = startup.services;
    activeId = startup.activeId;
    spellCheckEnabled = settings.spellCheckEnabled;
    initialSpellCheckEnabled = settings.spellCheckEnabled;
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

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function handleSpellCheckChange(enabled: boolean) {
    spellCheckEnabled = enabled;
    localStorage.setItem(
      APP_SETTINGS_STORAGE_KEY,
      serializeAppSettings({ spellCheckEnabled }),
    );
    showRestartPrompt = enabled !== initialSpellCheckEnabled;
    restartError = "";
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
      const startup = readStartupState(localStorage.getItem("ferx-workspace-services"));
      const settings = readAppSettings(localStorage.getItem(APP_SETTINGS_STORAGE_KEY));
      pendingExport = buildWorkspaceConfigExportPayload({
        services: startup.services,
        appSettings: settings,
        activeId: startup.activeId,
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
      scheduleWorkspaceReload();
    } catch (error) {
      importError = formatErrorMessage(error);
    }
  }

  function scheduleWorkspaceReload() {
    if (!("__TAURI_INTERNALS__" in window)) {
      return;
    }

    window.setTimeout(() => {
      try {
        window.location.replace("/");
      } catch {
        window.location.href = "/";
      }
    }, 250);
  }

  function formatServiceCount(count: number) {
    return `${count} ${count === 1 ? "service" : "services"}`;
  }

  function serviceHostname(url: string) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }
</script>

<svelte:head>
  <title>Settings | Ferx</title>
</svelte:head>

<div class="flex h-screen min-h-0 w-screen overflow-hidden bg-background text-foreground">
  <aside
    class="w-20 border-r flex flex-col items-center pt-14 pb-6 gap-4 bg-background shrink-0"
    data-tauri-drag-region
  >
    <div class="flex flex-col items-center gap-4 w-full px-2">
      {#each services as service, index (service.id)}
        <Button
          title={`${service.name} (Cmd+${index + 1})`}
          variant="ghost"
          href={service.disabled ? "/" : `/?open=${encodeURIComponent(service.id)}`}
          class="h-12 w-12 rounded-2xl p-2 transition-all relative overflow-visible
                 hover:bg-foreground/5
                 {service.disabled ? 'opacity-40 grayscale' : ''}"
          style={service.iconBgColor ? `box-shadow: inset 0 0 0 2.5px ${service.iconBgColor};` : ""}
        >
          <div
            aria-hidden="true"
            class="flex h-full w-full items-center justify-center rounded-xl bg-muted/60 text-sm font-semibold tracking-wide text-foreground/80 pointer-events-none"
          >
            {#if !failedIcons[service.id]}
              <img
                src={getServiceFaviconUrl(service.url)}
                alt={`${service.name} icon`}
                class="h-7 w-7 rounded-lg object-contain"
                loading="lazy"
                decoding="async"
                onerror={() => {
                  failedIcons = {
                    ...failedIcons,
                    [service.id]: true,
                  };
                }}
              />
            {:else}
              {getServiceMonogram(service.name)}
            {/if}
          </div>
        </Button>
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
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.7 2.8A8 8 0 0 0 2 12c0 4.4 3.6 8 8 8a8 8 0 0 0 9.2-7.3A8 8 0 0 1 10.7 2.8z" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.7 2.8A8 8 0 0 0 2 12c0 4.4 3.6 8 8 8a8 8 0 0 0 9.2-7.3A8 8 0 0 1 10.7 2.8z" />
          </svg>
        {/if}
      </Button>

      <Button
        title="Add Service"
        variant="outline"
        href="/"
        class="h-12 w-12 rounded-2xl text-2xl text-muted-foreground border-dashed border-2 hover:border-solid hover:bg-foreground/5 transition-all"
      >
        +
      </Button>

      <Button
        title="Settings"
        variant="secondary"
        size="icon-lg"
        class="h-10 w-10 rounded-full p-2 transition-all"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </Button>
    </div>
  </aside>

  <main
    class="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col bg-background/50"
  >
    {#if showRestartPrompt}
      <div
        data-testid="spell-check-restart-prompt-overlay"
        class="absolute inset-0 z-50 flex items-start justify-center bg-background/45 px-4 pt-24 backdrop-blur-sm sm:pt-32"
        role="presentation"
      >
        <div
          data-testid="spell-check-restart-prompt"
          class="w-full max-w-md rounded-2xl border bg-card p-5 text-left shadow-2xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-200"
          role="status"
        >
          <p class="text-base font-semibold text-foreground">
            Spell checking will update after restart.
          </p>
          <p class="mt-2 text-sm text-muted-foreground">
            Restart Ferx now or use the restart button in Settings later.
          </p>
          <div class="mt-5 flex justify-end gap-2">
            <Button
              variant="outline"
              class="h-9 rounded-xl px-3 text-xs"
              aria-label="Dismiss restart prompt"
              onclick={() => (showRestartPrompt = false)}
            >
              Later
            </Button>
            <Button
              class="h-9 rounded-xl px-3 text-xs"
              data-testid="prompt-restart-button"
              onclick={handleRestartFerx}
            >
              Restart Ferx
            </Button>
          </div>
        </div>
      </div>
    {/if}

    {#if showRestartConfirm}
      <div
        class="absolute inset-0 z-[60] flex items-start justify-center bg-background/45 px-4 pt-24 backdrop-blur-sm sm:pt-32"
        role="presentation"
      >
        <div
          data-testid="restart-confirm-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="restart-confirm-title"
          class="w-full max-w-md rounded-2xl border bg-card p-5 text-left shadow-2xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-200"
        >
          <p id="restart-confirm-title" class="text-base font-semibold text-foreground">
            Restart Ferx?
          </p>
          <p class="mt-2 text-sm text-muted-foreground">
            Are you sure you want to restart Ferx? The app will close and reopen.
          </p>
          {#if restartError}
            <p class="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs font-medium text-red-500">
              {restartError}
            </p>
          {/if}
          <div class="mt-5 flex justify-end gap-2">
            <Button
              variant="outline"
              class="h-9 rounded-xl px-3 text-xs"
              data-testid="cancel-restart-button"
              onclick={cancelRestartFerx}
            >
              Cancel
            </Button>
            <Button
              class="h-9 rounded-xl px-3 text-xs"
              data-testid="confirm-restart-button"
              onclick={handleRestartFerx}
            >
              Restart Ferx
            </Button>
          </div>
        </div>
      </div>
    {/if}

    {#if showExportConfirm && pendingExport}
      <div
        class="absolute inset-0 z-[60] flex items-start justify-center bg-background/45 px-4 pt-24 backdrop-blur-sm sm:pt-32"
        role="presentation"
      >
        <div
          data-testid="export-config-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-config-title"
          class="w-full max-w-md rounded-2xl border bg-card p-5 text-left shadow-2xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-200"
        >
          <p id="export-config-title" class="text-base font-semibold text-foreground">
            Export configuration?
          </p>
          <p class="mt-2 text-sm text-muted-foreground">
            Ferx will create a plain JSON file with {formatServiceCount(pendingExport.services.length)},
            service URLs, names, and app settings. It does not include passwords or login sessions.
          </p>
          <p class="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs font-medium text-amber-700">
            The file is not encrypted. Store it somewhere you trust.
          </p>
          {#if exportError}
            <p class="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs font-medium text-red-500">
              {exportError}
            </p>
          {/if}
          <div class="mt-5 flex justify-end gap-2">
            <Button
              variant="outline"
              class="h-9 rounded-xl px-3 text-xs"
              onclick={cancelExportConfiguration}
            >
              Cancel
            </Button>
            <Button
              class="h-9 rounded-xl px-3 text-xs"
              data-testid="confirm-export-config-button"
              onclick={confirmExportConfiguration}
            >
              Export
            </Button>
          </div>
        </div>
      </div>
    {/if}

    {#if showImportConfirm && importPreview}
      <div
        class="absolute inset-0 z-[60] flex items-start justify-center bg-background/45 px-4 pt-24 backdrop-blur-sm sm:pt-32"
        role="presentation"
      >
        <div
          data-testid="import-config-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-config-title"
          class="w-full max-w-md rounded-2xl border bg-card p-5 text-left shadow-2xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-200"
        >
          <p id="import-config-title" class="text-base font-semibold text-foreground">
            Import configuration?
          </p>
          <p class="mt-2 text-sm text-muted-foreground">
            This will replace the current workspace with {formatServiceCount(importPreview.services.length)}
            and update app settings.
          </p>
          <div class="mt-4 max-h-40 overflow-y-auto rounded-xl border bg-muted/20">
            {#each importPreview.services.slice(0, 8) as service (service.id)}
              <div class="flex items-center justify-between gap-3 border-b px-3 py-2 last:border-b-0">
                <p class="min-w-0 truncate text-xs font-semibold text-foreground">{service.name}</p>
                <p class="shrink-0 text-xs text-muted-foreground">{serviceHostname(service.url)}</p>
              </div>
            {/each}
            {#if importPreview.services.length > 8}
              <p class="px-3 py-2 text-xs text-muted-foreground">
                +{importPreview.services.length - 8} more
              </p>
            {/if}
          </div>
          <p class="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs font-medium text-amber-700">
            Existing sessions are not imported. Replacing configuration does not erase old session
            data from disk.
          </p>
          {#if importError}
            <p class="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs font-medium text-red-500">
              {importError}
            </p>
          {/if}
          <div class="mt-5 flex justify-end gap-2">
            <Button
              variant="outline"
              class="h-9 rounded-xl px-3 text-xs"
              onclick={cancelImportConfiguration}
            >
              Cancel
            </Button>
            <Button
              class="h-9 rounded-xl px-3 text-xs"
              data-testid="confirm-import-config-button"
              onclick={confirmImportConfiguration}
            >
              Replace
            </Button>
          </div>
        </div>
      </div>
    {/if}

    <div
      class="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-500/5 via-background to-background"
    ></div>

    <div
      class="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-4 pb-8 pt-6 sm:px-6 sm:pb-10 sm:pt-8"
    >
      <div
        class="mx-auto flex w-full max-w-md flex-col items-center text-center animate-in fade-in zoom-in-95 duration-500"
      >
      <div
        class="h-20 w-20 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 text-blue-500 rounded-[1.5rem] flex items-center justify-center mb-6 shadow-inner ring-1 ring-blue-500/20"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </div>

      <h1 class="text-3xl font-extrabold tracking-tight mb-1 text-foreground">Settings</h1>
      <p class="text-sm text-muted-foreground mb-8">Manage your application preferences</p>

      <div
        class="w-full rounded-3xl border bg-card text-card-foreground shadow-xl ring-1 ring-black/5 flex flex-col"
      >
        <div class="flex items-center justify-between px-6 py-4 border-b">
          <div class="text-left">
            <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">App Name</p>
            <p class="text-sm font-semibold mt-0.5">{appInfo.name}</p>
          </div>
          <img
            src="/app-icon.png"
            alt={appInfo.name}
            class="h-9 w-9 rounded-xl object-contain"
            decoding="async"
            fetchpriority="low"
          />
        </div>

        <div class="flex items-center justify-between px-6 py-4 border-b">
          <div class="text-left">
            <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Version</p>
            <p class="text-sm font-semibold mt-0.5">{appInfo.version}</p>
          </div>
          <span class="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">Current</span>
        </div>

        <div class="flex items-center justify-between gap-4 px-6 py-4 border-b">
          <div class="text-left">
            <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Spell Checking
            </p>
            <p class="text-sm font-semibold mt-0.5">Enable Spell Checking</p>
            {#if spellCheckRestartRequired}
              <p class="mt-1 text-xs font-medium text-amber-600">
                Restart Ferx to apply spell checking changes.
              </p>
            {/if}
            <p class="mt-1 text-xs text-muted-foreground">
              Uses the built-in spell checker for service inputs.
            </p>
          </div>

          <label class="relative inline-flex cursor-pointer items-center">
            <input
              name="spell-check-enabled"
              type="checkbox"
              class="peer sr-only"
              checked={spellCheckEnabled}
              onchange={(event) =>
                handleSpellCheckChange((event.currentTarget as HTMLInputElement).checked)}
            />
            <span
              class="h-6 w-11 rounded-full bg-muted transition-colors peer-checked:bg-blue-500"
            ></span>
            <span
              class="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background shadow-sm transition-transform peer-checked:translate-x-5"
            ></span>
          </label>
        </div>

        <div class="flex items-center justify-between gap-4 px-6 py-4 border-b">
          <div class="text-left">
            <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Restart
            </p>
            <p class="text-sm font-semibold mt-0.5">Restart Ferx</p>
            <p class="mt-1 text-xs text-muted-foreground">
              Relaunch the app to apply pending settings changes.
            </p>
            {#if restartError}
              <p class="mt-1 text-xs font-medium text-red-500">{restartError}</p>
            {/if}
          </div>

          <Button
            variant="outline"
            class="h-9 rounded-xl px-3 text-xs"
            data-testid="manual-restart-button"
            onclick={requestRestartFerx}
          >
            Restart Ferx
          </Button>
        </div>

        <div class="flex items-center justify-between gap-4 px-6 py-4 border-b">
          <div class="text-left">
            <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Backup
            </p>
            <p class="text-sm font-semibold mt-0.5">Import / Export Configuration</p>
            <p class="mt-1 text-xs text-muted-foreground">
              Back up service names, URLs, and app settings as plain JSON.
            </p>
            {#if configStatus}
              <p class="mt-1 text-xs font-medium text-emerald-600">{configStatus}</p>
            {/if}
            {#if exportError || importError}
              <p class="mt-1 text-xs font-medium text-red-500">{exportError || importError}</p>
            {/if}
          </div>

          <div class="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              class="h-9 rounded-xl px-3 text-xs"
              data-testid="export-config-button"
              onclick={requestExportConfiguration}
            >
              Export
            </Button>
            <Button
              variant="outline"
              class="h-9 rounded-xl px-3 text-xs"
              data-testid="import-config-button"
              onclick={requestImportConfiguration}
            >
              Import
            </Button>
            <input
              bind:this={importInput}
              data-testid="import-config-input"
              type="file"
              accept=".json,application/json"
              class="hidden"
              onchange={handleImportFileChange}
            />
          </div>
        </div>

        <div class="px-6 py-5">
          {#if updater.status === "idle"}
            <div class="rounded-2xl border border-border bg-muted/30 p-4 mb-4 text-left">
              <div class="flex items-start gap-3">
                <div class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-foreground/5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold text-foreground">Automatic updates</p>
                  <p class="mt-0.5 text-xs text-muted-foreground">
                    Check for a new release. Updates are verified with a signing key before they
                    are applied.
                  </p>
                </div>
              </div>
            </div>

            <Button
              class="w-full rounded-xl h-10 transition-all hover:scale-[1.01] shadow-sm"
              onclick={handleCheckForUpdates}
            >
              Check for Updates
            </Button>
          {:else if updater.status === "checking"}
            <div class="rounded-2xl border border-border bg-muted/30 p-4 mb-4 text-left">
              <p class="text-sm font-semibold text-foreground">Checking for updates…</p>
              <p class="mt-0.5 text-xs text-muted-foreground">Contacting the release server.</p>
            </div>

            <Button class="w-full rounded-xl h-10 shadow-sm" disabled>Checking…</Button>
          {:else if updater.status === "up-to-date"}
            <div class="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 mb-4 text-left">
              <p class="text-sm font-semibold text-foreground">You're up to date</p>
              <p class="mt-0.5 text-xs text-muted-foreground">
                {appInfo.name} v{appInfo.version} is the latest release.
              </p>
            </div>

            <Button
              class="w-full rounded-xl h-10 transition-all hover:scale-[1.01] shadow-sm"
              onclick={handleCheckForUpdates}
            >
              Check Again
            </Button>
          {:else if updater.status === "available"}
            <div class="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 mb-4 text-left">
              <p class="text-sm font-semibold text-foreground">
                Version {updater.version} is available
              </p>
              {#if updater.notes}
                <p class="mt-1 text-xs text-muted-foreground whitespace-pre-line">{updater.notes}</p>
              {:else}
                <p class="mt-0.5 text-xs text-muted-foreground">
                  Download and install to upgrade from v{appInfo.version}.
                </p>
              {/if}
            </div>

            <Button
              class="w-full rounded-xl h-10 transition-all hover:scale-[1.01] shadow-sm"
              onclick={handleDownloadAndInstall}
            >
              Download and Install
            </Button>
          {:else if updater.status === "downloading"}
            <div class="rounded-2xl border border-border bg-muted/30 p-4 mb-4 text-left">
              <p class="text-sm font-semibold text-foreground">Downloading v{updater.version}</p>
              <p class="mt-0.5 text-xs text-muted-foreground">
                {#if updater.total}
                  {formatBytes(updater.downloaded)} / {formatBytes(updater.total)}
                {:else}
                  {formatBytes(updater.downloaded)} downloaded
                {/if}
              </p>
              <div class="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                <div
                  class="h-full rounded-full bg-blue-500 transition-[width]"
                  style={`width: ${
                    updater.total ? Math.min(100, (updater.downloaded / updater.total) * 100) : 0
                  }%`}
                ></div>
              </div>
            </div>

            <Button class="w-full rounded-xl h-10 shadow-sm" disabled>Installing…</Button>
          {:else if updater.status === "installed"}
            <div class="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 mb-4 text-left">
              <p class="text-sm font-semibold text-foreground">
                Update v{updater.version} installed
              </p>
              <p class="mt-0.5 text-xs text-muted-foreground">
                Relaunch {appInfo.name} to start the new version.
              </p>
            </div>

            <Button
              class="w-full rounded-xl h-10 transition-all hover:scale-[1.01] shadow-sm"
              onclick={handleRelaunch}
            >
              Relaunch Now
            </Button>
          {:else if updater.status === "error"}
            <div class="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 mb-4 text-left">
              <p class="text-sm font-semibold text-foreground">Update failed</p>
              <p class="mt-0.5 text-xs text-muted-foreground break-words">{updater.message}</p>
            </div>

            <div class="flex gap-2">
              <Button
                class="flex-1 rounded-xl h-10 transition-all hover:scale-[1.01] shadow-sm"
                onclick={handleCheckForUpdates}
              >
                Try Again
              </Button>
              <Button
                variant="outline"
                class="flex-1 rounded-xl h-10"
                onclick={() => appInfo.releasesUrl && openUrl(appInfo.releasesUrl)}
              >
                View Releases
              </Button>
            </div>
          {/if}
        </div>
      </div>
    </div>
    </div>
  </main>
</div>
