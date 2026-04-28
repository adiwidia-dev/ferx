<script lang="ts">
  import InfoIcon from "@lucide/svelte/icons/info";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import { Button } from "$lib/components/ui/button";
  import { formatBytes } from "$lib/services/settings-page-state";
  import type { UpdaterState } from "$lib/services/updater";

  interface Props {
    appName: string;
    appVersion: string;
    releasesUrl?: string | null;
    updater: UpdaterState;
    onCheckForUpdates: () => void;
    onDownloadAndInstall: () => void;
    onRelaunch: () => void;
    onOpenReleases: () => void;
  }

  let {
    appName,
    appVersion,
    releasesUrl = null,
    updater,
    onCheckForUpdates,
    onDownloadAndInstall,
    onRelaunch,
    onOpenReleases,
  }: Props = $props();
</script>

<section id="updates" class="scroll-mt-8 rounded-lg border bg-card text-card-foreground shadow-sm">
  <div class="border-b px-5 py-4">
    <div class="flex items-center gap-3">
      <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <RefreshCwIcon class="size-4" />
      </div>
      <div>
        <h2 class="text-sm font-semibold text-foreground">Updates</h2>
        <p class="mt-0.5 text-xs text-muted-foreground">Verified release checks and installation.</p>
      </div>
    </div>
  </div>

  <div class="px-5 py-4">
    {#if updater.status === "idle"}
      <div class="mb-4 flex items-start gap-3 rounded-lg border bg-muted/30 p-4 text-left">
        <InfoIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div class="min-w-0">
          <p class="text-sm font-semibold text-foreground">Automatic updates</p>
          <p class="mt-1 text-xs leading-5 text-muted-foreground">
            Check for a new release. Updates are verified with a signing key before they
            are applied.
          </p>
        </div>
      </div>

      <Button class="h-10 w-full rounded-lg shadow-sm" onclick={onCheckForUpdates}>
        Check for Updates
      </Button>
    {:else if updater.status === "checking"}
      <div class="mb-4 rounded-lg border bg-muted/30 p-4 text-left">
        <p class="text-sm font-semibold text-foreground">Checking for updates...</p>
        <p class="mt-1 text-xs text-muted-foreground">Contacting the release server.</p>
      </div>

      <Button class="h-10 w-full rounded-lg shadow-sm" disabled>Checking...</Button>
    {:else if updater.status === "up-to-date"}
      <div class="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-left">
        <p class="text-sm font-semibold text-foreground">You're up to date</p>
        <p class="mt-1 text-xs text-muted-foreground">
          {appName} v{appVersion} is the latest release.
        </p>
      </div>

      <Button class="h-10 w-full rounded-lg shadow-sm" onclick={onCheckForUpdates}>
        Check Again
      </Button>
    {:else if updater.status === "available"}
      <div class="mb-4 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 text-left">
        <p class="text-sm font-semibold text-foreground">
          Version {updater.version} is available
        </p>
        {#if updater.notes}
          <p class="mt-1 whitespace-pre-line text-xs text-muted-foreground">{updater.notes}</p>
        {:else}
          <p class="mt-1 text-xs text-muted-foreground">
            Download and install to upgrade from v{appVersion}.
          </p>
        {/if}
      </div>

      <Button class="h-10 w-full rounded-lg shadow-sm" onclick={onDownloadAndInstall}>
        Download and Install
      </Button>
    {:else if updater.status === "downloading"}
      <div class="mb-4 rounded-lg border bg-muted/30 p-4 text-left">
        <p class="text-sm font-semibold text-foreground">Downloading v{updater.version}</p>
        <p class="mt-1 text-xs text-muted-foreground">
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

      <Button class="h-10 w-full rounded-lg shadow-sm" disabled>Installing...</Button>
    {:else if updater.status === "installed"}
      <div class="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-left">
        <p class="text-sm font-semibold text-foreground">
          Update v{updater.version} installed
        </p>
        <p class="mt-1 text-xs text-muted-foreground">
          Relaunch {appName} to start the new version.
        </p>
      </div>

      <Button class="h-10 w-full rounded-lg shadow-sm" onclick={onRelaunch}>
        Relaunch Now
      </Button>
    {:else if updater.status === "error"}
      <div class="mb-4 rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-left">
        <p class="text-sm font-semibold text-foreground">Update failed</p>
        <p class="mt-1 break-words text-xs text-muted-foreground">{updater.message}</p>
      </div>

      <div class="flex gap-2">
        <Button class="h-10 flex-1 rounded-lg shadow-sm" onclick={onCheckForUpdates}>
          Try Again
        </Button>
        <Button
          variant="outline"
          class="h-10 flex-1 rounded-lg"
          onclick={onOpenReleases}
          disabled={!releasesUrl}
        >
          View Releases
        </Button>
      </div>
    {/if}
  </div>
</section>
