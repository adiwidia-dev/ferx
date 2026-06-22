<script lang="ts">
  import BellIcon from "@lucide/svelte/icons/bell";
  import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
  import ListChecksIcon from "@lucide/svelte/icons/list-checks";
  import SearchIcon from "@lucide/svelte/icons/search";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import { Button } from "$lib/components/ui/button";
  import type {
    ServiceManagementRow,
    ServiceManagementWorkspaceFilter,
  } from "$lib/services/service-management";
  import type { WorkspaceGroup } from "$lib/services/workspace-groups";

  interface Props {
    rows: ServiceManagementRow[];
    totalCount: number;
    workspaces: WorkspaceGroup[];
    workspaceFilter: ServiceManagementWorkspaceFilter;
    searchQuery: string;
    pendingDeleteRow: ServiceManagementRow | null;
    onWorkspaceFilterChange: (workspaceId: ServiceManagementWorkspaceFilter) => void;
    onSearchQueryChange: (query: string) => void;
    onOpenService: (serviceId: string) => void;
    onToggleEnabled: (serviceId: string) => void;
    onToggleBadge: (serviceId: string) => void;
    onToggleTray: (serviceId: string) => void;
    onToggleSound: (serviceId: string) => void;
    onToggleNativeNotifications: (serviceId: string) => void;
    onToggleHibernation: (serviceId: string, enabled: boolean) => void;
    onRequestDelete: (serviceId: string) => void;
    onCancelDelete: () => void;
    onConfirmDelete: () => void;
  }

  let {
    rows,
    totalCount,
    workspaces,
    workspaceFilter,
    searchQuery,
    pendingDeleteRow,
    onWorkspaceFilterChange,
    onSearchQueryChange,
    onOpenService,
    onToggleEnabled,
    onToggleBadge,
    onToggleTray,
    onToggleSound,
    onToggleNativeNotifications,
    onToggleHibernation,
    onRequestDelete,
    onCancelDelete,
    onConfirmDelete,
  }: Props = $props();

  const toggleClass = "peer sr-only";
  const toggleTrackClass =
    "h-5 w-9 rounded-full bg-muted transition-colors peer-checked:bg-blue-500";
  const toggleThumbClass =
    "pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-background shadow-sm transition-transform peer-checked:translate-x-4";

  function onWorkspaceSelect(event: Event) {
    onWorkspaceFilterChange((event.currentTarget as HTMLSelectElement).value);
  }
</script>

<section id="services" class="scroll-mt-8 rounded-lg border bg-card text-card-foreground shadow-sm">
  <div class="border-b px-5 py-4">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex min-w-0 items-center gap-3">
        <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <ListChecksIcon class="size-4" />
        </div>
        <div class="min-w-0">
          <h2 class="text-sm font-semibold text-foreground">Services</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">
            Manage service availability, unread indicators, notifications, and hibernation.
          </p>
        </div>
      </div>

      <span class="w-fit rounded-md border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
        {rows.length} of {totalCount}
      </span>
    </div>
  </div>

  <div class="border-b px-5 py-4">
    <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
      <label class="relative block">
        <span class="sr-only">Search services</span>
        <SearchIcon class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          data-testid="service-management-search"
          type="search"
          value={searchQuery}
          placeholder="Search service, URL, or workspace"
          class="h-9 w-full rounded-lg border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
          oninput={(event) => onSearchQueryChange((event.currentTarget as HTMLInputElement).value)}
        />
      </label>

      <label class="block">
        <span class="sr-only">Filter services by workspace</span>
        <select
          data-testid="service-management-workspace-filter"
          value={workspaceFilter}
          class="h-9 w-full rounded-lg border bg-background px-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
          onchange={onWorkspaceSelect}
        >
          <option value="all">All workspaces</option>
          {#each workspaces as workspace (workspace.id)}
            <option value={workspace.id}>{workspace.name}</option>
          {/each}
        </select>
      </label>
    </div>
  </div>

  <div class="overflow-x-auto">
    <table data-testid="service-management-table" class="w-full min-w-[920px] text-left">
      <thead class="border-b bg-muted/45 text-[11px] font-semibold uppercase text-muted-foreground">
        <tr>
          <th class="w-[300px] px-5 py-3">Service</th>
          <th class="w-[220px] px-3 py-3">Workspaces</th>
          <th class="px-3 py-3 text-center">Enabled</th>
          <th class="px-3 py-3 text-center">Badge</th>
          <th class="px-3 py-3 text-center">Tray</th>
          <th class="px-3 py-3 text-center">Sound</th>
          <th class="px-3 py-3 text-center">OS Notify</th>
          <th class="px-3 py-3 text-center">Hibernate</th>
          <th class="w-[92px] px-5 py-3 text-right">Actions</th>
        </tr>
      </thead>
      <tbody class="divide-y">
        {#each rows as row (row.service.id)}
          {@const service = row.service}
          <tr class="align-middle transition-colors hover:bg-muted/25">
            <td class="px-5 py-3">
              <div class="flex min-w-0 items-center gap-3">
                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-foreground">
                  {service.name.slice(0, 1).toUpperCase()}
                </div>
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-foreground">{service.name}</p>
                  <p class="mt-0.5 truncate text-xs text-muted-foreground">{row.hostname}</p>
                </div>
              </div>
            </td>

            <td class="px-3 py-3">
              <div class="flex max-w-[220px] flex-wrap gap-1.5">
                {#if row.workspaces.length > 0}
                  {#each row.workspaces as workspace (workspace.id)}
                    <span class="max-w-[160px] truncate rounded-md border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {workspace.name}
                    </span>
                  {/each}
                {:else}
                  <span class="text-xs text-muted-foreground">No workspace</span>
                {/if}
              </div>
            </td>

            <td class="px-3 py-3">
              <label class="relative mx-auto inline-flex cursor-pointer items-center" title="Toggle service availability">
                <input
                  data-testid={`service-enabled-${service.id}`}
                  type="checkbox"
                  class={toggleClass}
                  checked={!service.disabled}
                  onchange={() => onToggleEnabled(service.id)}
                />
                <span class={toggleTrackClass}></span>
                <span class={toggleThumbClass}></span>
              </label>
            </td>

            <td class="px-3 py-3">
              <label class="relative mx-auto inline-flex cursor-pointer items-center" title="Toggle sidebar unread badge">
                <input
                  data-testid={`service-badge-${service.id}`}
                  type="checkbox"
                  class={toggleClass}
                  checked={service.notificationPrefs.showBadge}
                  onchange={() => onToggleBadge(service.id)}
                />
                <span class={toggleTrackClass}></span>
                <span class={toggleThumbClass}></span>
              </label>
            </td>

            <td class="px-3 py-3">
              <label class="relative mx-auto inline-flex cursor-pointer items-center" title="Toggle tray unread contribution">
                <input
                  data-testid={`service-tray-${service.id}`}
                  type="checkbox"
                  class={toggleClass}
                  checked={service.notificationPrefs.affectTray}
                  onchange={() => onToggleTray(service.id)}
                />
                <span class={toggleTrackClass}></span>
                <span class={toggleThumbClass}></span>
              </label>
            </td>

            <td class="px-3 py-3">
              <label class="relative mx-auto inline-flex cursor-pointer items-center" title="Toggle notification sound">
                <input
                  data-testid={`service-sound-${service.id}`}
                  type="checkbox"
                  class={toggleClass}
                  checked={!service.notificationPrefs.muteAudio}
                  onchange={() => onToggleSound(service.id)}
                />
                <span class={toggleTrackClass}></span>
                <span class={toggleThumbClass}></span>
              </label>
            </td>

            <td class="px-3 py-3">
              <label class="relative mx-auto inline-flex cursor-pointer items-center" title="Toggle native OS notifications">
                <input
                  data-testid={`service-native-${service.id}`}
                  type="checkbox"
                  class={toggleClass}
                  checked={service.notificationPrefs.showNativeNotifications}
                  onchange={() => onToggleNativeNotifications(service.id)}
                />
                <span class={toggleTrackClass}></span>
                <span class={toggleThumbClass}></span>
              </label>
            </td>

            <td class="px-3 py-3">
              <label class="relative mx-auto inline-flex cursor-pointer items-center" title="Toggle inactive hibernation">
                <input
                  data-testid={`service-hibernate-${service.id}`}
                  type="checkbox"
                  class={toggleClass}
                  checked={service.hibernateWhenInactive === true}
                  onchange={(event) =>
                    onToggleHibernation(
                      service.id,
                      (event.currentTarget as HTMLInputElement).checked,
                    )}
                />
                <span class={toggleTrackClass}></span>
                <span class={toggleThumbClass}></span>
              </label>
            </td>

            <td class="px-5 py-3">
              <div class="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title={`Open ${service.name}`}
                  aria-label={`Open ${service.name}`}
                  onclick={() => onOpenService(service.id)}
                >
                  <ExternalLinkIcon class="size-4" />
                </Button>
                <Button
                  variant="destructive"
                  size="icon-sm"
                  title={`Delete ${service.name}`}
                  aria-label={`Delete ${service.name}`}
                  data-testid={`service-delete-${service.id}`}
                  onclick={() => onRequestDelete(service.id)}
                >
                  <Trash2Icon class="size-4" />
                </Button>
              </div>
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="9" class="px-5 py-10 text-center">
              <BellIcon class="mx-auto size-5 text-muted-foreground" />
              <p class="mt-2 text-sm font-medium text-foreground">No services found</p>
              <p class="mt-1 text-xs text-muted-foreground">
                Adjust the search or workspace filter.
              </p>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>

{#if pendingDeleteRow}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4"
    data-testid="service-delete-dialog"
    role="presentation"
  >
    <div
      class="w-full max-w-md rounded-lg border bg-card p-5 text-card-foreground shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="service-delete-dialog-title"
    >
      <h3 id="service-delete-dialog-title" class="text-base font-semibold text-foreground">
        Delete {pendingDeleteRow.service.name}?
      </h3>
      <p class="mt-2 text-sm leading-6 text-muted-foreground">
        This removes the service from
        {pendingDeleteRow.workspaces.length === 1 ? "this workspace" : "these workspaces"} and
        deletes its local webview data.
      </p>
      <div class="mt-3 flex flex-wrap gap-1.5">
        {#each pendingDeleteRow.workspaces as workspace (workspace.id)}
          <span class="rounded-md border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {workspace.name}
          </span>
        {/each}
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <Button variant="outline" class="h-9 rounded-lg px-3 text-xs" onclick={onCancelDelete}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          class="h-9 rounded-lg px-3 text-xs"
          data-testid="confirm-service-delete-button"
          onclick={onConfirmDelete}
        >
          Delete Service
        </Button>
      </div>
    </div>
  </div>
{/if}
