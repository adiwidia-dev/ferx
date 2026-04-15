<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { getAppInfo } from "$lib/services/app-info";
  import { readStartupState, type PageService } from "$lib/services/workspace-state";

  const appInfo = getAppInfo();

  let services = $state<PageService[]>([]);
  let activeId = $state("");
  let isDnd = $state(false);

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

  <main class="flex-1 flex items-center justify-center bg-background/50 px-8">
    <section class="w-full max-w-2xl rounded-3xl border bg-card p-8 shadow-xl">
      <h1 class="text-3xl font-semibold">Settings</h1>
      <p class="mt-2 text-sm text-muted-foreground">
        Update checking is not available yet.
      </p>

      <div class="mt-8 grid gap-4">
        <div class="rounded-2xl border bg-background p-4">
          <p class="text-sm text-muted-foreground">App Name</p>
          <p class="mt-1 text-lg font-medium">{appInfo.name}</p>
        </div>

        <div class="rounded-2xl border bg-background p-4">
          <p class="text-sm text-muted-foreground">App Version</p>
          <p class="mt-1 text-lg font-medium">{appInfo.version}</p>
        </div>

        <div class="pt-2">
          <Button>Check Update</Button>
        </div>
      </div>
    </section>
  </main>
</div>
