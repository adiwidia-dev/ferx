<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { getAppInfo } from "$lib/services/app-info";
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

  onMount(() => {
    void invoke("hide_all_webviews");

    const startup = readStartupState(localStorage.getItem("ferx-workspace-services"));
    services = startup.services;
    activeId = startup.activeId;
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
          />
        </div>

        <div class="flex items-center justify-between px-6 py-4 border-b">
          <div class="text-left">
            <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Version</p>
            <p class="text-sm font-semibold mt-0.5">{appInfo.version}</p>
          </div>
          <span class="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">Current</span>
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
