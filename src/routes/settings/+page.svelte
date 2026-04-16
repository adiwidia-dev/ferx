<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { getAppInfo } from "$lib/services/app-info";
  import { checkForUpdate, type UpdateCheckResult } from "$lib/services/update-check";
  import { readStartupState, type PageService } from "$lib/services/workspace-state";

  const appInfo = getAppInfo();

  let services = $state<PageService[]>([]);
  let activeId = $state("");
  let isDnd = $state(false);

  let updateResult = $state<UpdateCheckResult | null>(null);
  let isChecking = $state(false);

  onMount(() => {
    invoke("hide_all_webviews");

    const startup = readStartupState(localStorage.getItem("ferx-workspace-services"));
    services = startup.services;
    activeId = startup.activeId;
  });

  function getFaviconUrl(url: string) {
    try {
      const hostname = new URL(url).hostname.replace(/^(web\.|app\.)/, "");
      return `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`;
    } catch {
      return "";
    }
  }

  async function handleCheckUpdate() {
    isChecking = true;
    updateResult = null;
    updateResult = await checkForUpdate(appInfo.version);
    isChecking = false;
  }

  async function handleDownload() {
    if (updateResult?.status === "update-available" && updateResult.release.dmgDownloadUrl) {
      await openUrl(updateResult.release.dmgDownloadUrl);
    }
  }
</script>

<svelte:head>
  <title>Settings | Ferx</title>
</svelte:head>

<div class="flex h-screen w-screen overflow-hidden bg-background text-foreground">
  <aside
    class="w-20 border-r flex flex-col items-center pt-14 pb-6 gap-4 bg-background shrink-0"
    data-tauri-drag-region
  >
    <div class="flex flex-col items-center gap-4 w-full px-2">
      {#each services as service, index (service.id)}
        <Button
          title={`${service.name} (Cmd+${index + 1})`}
          variant="ghost"
          href="/"
          class="h-12 w-12 rounded-2xl p-2 transition-all relative overflow-visible
                 {service.iconBgColor ? '' : 'hover:bg-foreground/5'}
                 {service.disabled ? 'opacity-40 grayscale' : ''}"
          style={service.iconBgColor ? `background-color: ${service.iconBgColor};` : ""}
        >
          <img
            src={getFaviconUrl(service.url)}
            alt={service.name}
            class="w-full h-full object-contain pointer-events-none"
          />
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
    class="flex-1 flex items-center justify-center relative z-0 bg-background/50"
  >
    <div
      class="absolute inset-0 z-[-1] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-500/5 via-background to-background"
    ></div>

    <div
      class="flex flex-col items-center max-w-md w-full text-center animate-in fade-in zoom-in-95 duration-500"
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
          {#if updateResult?.status === "update-available"}
            <div class="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 mb-4 text-left animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div class="flex items-start gap-3">
                <div class="h-8 w-8 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold text-foreground">
                    {appInfo.name} {updateResult.release.version} is available
                  </p>
                  <p class="text-xs text-muted-foreground mt-0.5">
                    You're currently on v{appInfo.version}
                  </p>
                </div>
              </div>

              {#if updateResult.release.dmgDownloadUrl}
                <Button
                  class="w-full rounded-xl h-10 mt-4 transition-all hover:scale-[1.01] shadow-sm"
                  onclick={handleDownload}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download Update
                </Button>
              {:else}
                <Button
                  variant="outline"
                  class="w-full rounded-xl h-10 mt-4"
                  onclick={() => updateResult?.status === "update-available" && openUrl(updateResult.release.htmlUrl)}
                >
                  View Release Page
                </Button>
              {/if}
            </div>
          {:else if updateResult?.status === "up-to-date"}
            <div class="rounded-2xl border border-green-500/20 bg-green-500/5 p-4 mb-4 text-left animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div class="flex items-center gap-3">
                <div class="h-8 w-8 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-500">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <div>
                  <p class="text-sm font-semibold text-foreground">You're up to date</p>
                  <p class="text-xs text-muted-foreground mt-0.5">
                    {appInfo.name} v{appInfo.version} is the latest version
                  </p>
                </div>
              </div>
            </div>
          {:else if updateResult?.status === "error"}
            <div class="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 mb-4 text-left animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div class="flex items-center gap-3">
                <div class="h-8 w-8 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-red-500">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <div>
                  <p class="text-sm font-semibold text-foreground">Update check failed</p>
                  <p class="text-xs text-muted-foreground mt-0.5">{updateResult.message}</p>
                </div>
              </div>
            </div>
          {/if}

          <Button
            variant={updateResult ? "outline" : "default"}
            class="w-full rounded-xl h-10 transition-all {!updateResult ? 'hover:scale-[1.01] shadow-sm' : ''}"
            disabled={isChecking}
            onclick={handleCheckUpdate}
          >
            {#if isChecking}
              <svg class="animate-spin mr-2" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Checking...
            {:else if updateResult}
              Check Again
            {:else}
              Check for Updates
            {/if}
          </Button>
        </div>
      </div>
    </div>
  </main>
</div>
