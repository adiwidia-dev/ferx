<script lang="ts">
  import DownloadIcon from "@lucide/svelte/icons/download";
  import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
  import UploadIcon from "@lucide/svelte/icons/upload";
  import HardDriveIcon from "@lucide/svelte/icons/hard-drive";
  import { Button } from "$lib/components/ui/button";

  interface Props {
    configStatus: string;
    exportError: string;
    importError: string;
    importInput?: HTMLInputElement | null;
    onRequestExportConfiguration: () => void;
    onRequestImportConfiguration: () => void;
    onImportFileChange: (event: Event) => void;
  }

  let {
    configStatus,
    exportError,
    importError,
    importInput = $bindable(null),
    onRequestExportConfiguration,
    onRequestImportConfiguration,
    onImportFileChange,
  }: Props = $props();
</script>

<section id="configuration" class="scroll-mt-8 rounded-lg border bg-card text-card-foreground shadow-sm">
  <div class="border-b px-5 py-4">
    <div class="flex items-center gap-3">
      <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <HardDriveIcon class="size-4" />
      </div>
      <div>
        <h2 class="text-sm font-semibold text-foreground">Configuration</h2>
        <p class="mt-0.5 text-xs text-muted-foreground">Back up or replace service metadata.</p>
      </div>
    </div>
  </div>

  <div class="px-5 py-4">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0">
        <p class="text-sm font-semibold text-foreground">Import / Export Configuration</p>
        <p class="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
          Back up service names, URLs, and app settings as plain JSON.
        </p>
        <div class="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
          <ShieldCheckIcon class="mt-0.5 size-4 shrink-0" />
          <p>The export is not encrypted and does not include passwords or login sessions.</p>
        </div>
        {#if configStatus}
          <p class="mt-3 text-xs font-medium text-emerald-600">{configStatus}</p>
        {/if}
        {#if exportError || importError}
          <p class="mt-3 text-xs font-medium text-red-500">{exportError || importError}</p>
        {/if}
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <Button
          variant="outline"
          class="h-9 rounded-lg px-3 text-xs"
          data-testid="export-config-button"
          onclick={onRequestExportConfiguration}
        >
          <DownloadIcon class="size-3.5" />
          Export
        </Button>
        <Button
          variant="outline"
          class="h-9 rounded-lg px-3 text-xs"
          data-testid="import-config-button"
          onclick={onRequestImportConfiguration}
        >
          <UploadIcon class="size-3.5" />
          Import
        </Button>
        <input
          bind:this={importInput}
          data-testid="import-config-input"
          type="file"
          accept=".json,application/json"
          class="hidden"
          onchange={onImportFileChange}
        />
      </div>
    </div>
  </div>
</section>
