<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import {
    formatServiceCount,
    formatWorkspaceCount,
    serviceHostname,
    sharedServiceCount,
  } from "$lib/services/settings-page-state";
  import type { FerxWorkspaceConfigFileV2 } from "$lib/services/workspace-config-export";
  import type { ImportedWorkspaceConfig } from "$lib/services/workspace-config-import";

  interface Props {
    showExportConfirm: boolean;
    pendingExport: FerxWorkspaceConfigFileV2 | null;
    exportError: string;
    showImportConfirm: boolean;
    importPreview: ImportedWorkspaceConfig | null;
    importError: string;
    onCancelExportConfiguration: () => void;
    onConfirmExportConfiguration: () => void;
    onCancelImportConfiguration: () => void;
    onConfirmImportConfiguration: () => void;
  }

  let {
    showExportConfirm,
    pendingExport,
    exportError,
    showImportConfirm,
    importPreview,
    importError,
    onCancelExportConfiguration,
    onConfirmExportConfiguration,
    onCancelImportConfiguration,
    onConfirmImportConfiguration,
  }: Props = $props();
</script>

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
        Ferx will create a plain JSON file with {formatWorkspaceCount(pendingExport.workspaceState.workspaces.length)},
        {formatServiceCount(sharedServiceCount(pendingExport.workspaceState))}, service URLs,
        names, and app settings. It does not include passwords or login sessions.
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
          onclick={onCancelExportConfiguration}
        >
          Cancel
        </Button>
        <Button
          class="h-9 rounded-xl px-3 text-xs"
          data-testid="confirm-export-config-button"
          onclick={onConfirmExportConfiguration}
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
        This will replace the current configuration with {formatWorkspaceCount(importPreview.workspaceState.workspaces.length)},
        {formatServiceCount(sharedServiceCount(importPreview.workspaceState))}, and app settings.
      </p>
      <div class="mt-4 max-h-40 overflow-y-auto rounded-xl border bg-muted/20">
        {#each Object.values(importPreview.workspaceState.servicesById).slice(0, 8) as service (service.id)}
          <div class="flex items-center justify-between gap-3 border-b px-3 py-2 last:border-b-0">
            <p class="min-w-0 truncate text-xs font-semibold text-foreground">{service.name}</p>
            <p class="shrink-0 text-xs text-muted-foreground">{serviceHostname(service.url)}</p>
          </div>
        {/each}
        {#if sharedServiceCount(importPreview.workspaceState) > 8}
          <p class="px-3 py-2 text-xs text-muted-foreground">
            +{sharedServiceCount(importPreview.workspaceState) - 8} more
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
          onclick={onCancelImportConfiguration}
        >
          Cancel
        </Button>
        <Button
          class="h-9 rounded-xl px-3 text-xs"
          data-testid="confirm-import-config-button"
          onclick={onConfirmImportConfiguration}
        >
          Replace
        </Button>
      </div>
    </div>
  </div>
{/if}
