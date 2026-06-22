<script lang="ts">
  import ListTodoIcon from "@lucide/svelte/icons/list-todo";
  import { Button } from "$lib/components/ui/button";
  import WorkspaceSwitcher from "$lib/components/workspace/workspace-switcher.svelte";
  import { getServiceFaviconUrl, getServiceMonogram } from "$lib/services/service-icon";
  import type { PageService } from "$lib/services/workspace-state";
  import type { WorkspaceGroup } from "$lib/services/workspace-groups";
  import type { WorkspaceIconKey } from "$lib/services/workspace-icons";

  type SidebarService = PageService & { hibernated?: boolean };

  interface Props {
    services: SidebarService[];
    activeId: string;
    workspaces: WorkspaceGroup[];
    currentWorkspaceId: string;
    draggedId: string | null;
    dragOverId: string | null;
    isDnd: boolean;
    isTodosPanelOpen: boolean;
    isWorkspaceSwitcherOpen: boolean;
    onPointerDown: (event: PointerEvent, id: string) => void;
    onSelectService: (id: string) => void;
    onSelectWorkspace: (id: string) => void;
    onCreateWorkspace: (input: { name: string; icon: WorkspaceIconKey }) => void;
    onUpdateWorkspaceIcon: (input: { workspaceId: string; icon: WorkspaceIconKey }) => void;
    onRenameWorkspace: (input: { workspaceId: string; name: string }) => void;
    onSetWorkspaceDisabled: (input: { workspaceId: string; disabled: boolean }) => void;
    onDeleteWorkspace: (workspaceId: string) => void;
    onWorkspaceSwitcherOpenChange: (open: boolean) => void;
    onOpenServiceContextMenu: (input: { id: string; disabled: boolean; showBadge: boolean; affectTray: boolean; muteAudio: boolean; showNativeNotifications: boolean }) => void;
    onToggleDnd: () => void;
    onOpenAddModal: () => void;
    onToggleTodosPanel: () => void;
  }

  let {
    services,
    activeId,
    workspaces,
    currentWorkspaceId,
    draggedId,
    dragOverId,
    isDnd,
    isTodosPanelOpen,
    isWorkspaceSwitcherOpen = $bindable(false),
    onPointerDown,
    onSelectService,
    onSelectWorkspace,
    onCreateWorkspace,
    onUpdateWorkspaceIcon,
    onRenameWorkspace,
    onSetWorkspaceDisabled,
    onDeleteWorkspace,
    onWorkspaceSwitcherOpenChange,
    onOpenServiceContextMenu,
    onToggleDnd,
    onOpenAddModal,
    onToggleTodosPanel,
  }: Props = $props();

  let failedIcons = $state<Record<string, boolean>>({});

  function selectService(id: string) {
    isWorkspaceSwitcherOpen = false;
    onSelectService(id);
  }

  function serviceButtonTitle(service: SidebarService, index: number) {
    if (service.hibernated && !service.disabled) {
      return `${service.name} is hibernated. Click to wake.`;
    }

    return `${service.name} (Cmd+${index + 1})`;
  }

  function openServiceContextMenu(event: MouseEvent, service: SidebarService) {
    event.preventDefault();
    onOpenServiceContextMenu({
      id: service.id,
      disabled: !!service.disabled,
      showBadge: service.notificationPrefs.showBadge,
      affectTray: service.notificationPrefs.affectTray,
      muteAudio: service.notificationPrefs.muteAudio,
      showNativeNotifications: service.notificationPrefs.showNativeNotifications,
    });
  }
</script>

<aside
  class="flex h-screen w-20 shrink-0 flex-col items-center gap-4 overflow-hidden border-r bg-background pt-14 pb-4"
  data-testid="workspace-sidebar"
  data-tauri-drag-region
>
  <div class="flex w-full shrink-0 flex-col items-center gap-4 px-2">
    <WorkspaceSwitcher
      bind:open={isWorkspaceSwitcherOpen}
      {workspaces}
      {currentWorkspaceId}
      onSelectWorkspace={onSelectWorkspace}
      onCreateWorkspace={onCreateWorkspace}
      onUpdateWorkspaceIcon={onUpdateWorkspaceIcon}
      onRenameWorkspace={onRenameWorkspace}
      onSetWorkspaceDisabled={onSetWorkspaceDisabled}
      onDeleteWorkspace={onDeleteWorkspace}
      onOpenChange={onWorkspaceSwitcherOpenChange}
    />

    <div class="w-10 h-[1px] bg-border"></div>
  </div>

  <div
    class="flex min-h-0 w-full flex-1 flex-col items-center gap-4 overflow-y-auto overflow-x-hidden px-2 py-1"
    data-testid="workspace-service-list"
  >
    {#each services as service, index (service.id)}
      {@const isHibernated = service.hibernated && !service.disabled}
      <div
        role="listitem"
        data-service-drop-target={service.id}
        style="-webkit-app-region: no-drag;"
        class="w-full flex justify-center transition-all duration-200
               {dragOverId === service.id ? 'scale-110 relative z-10' : ''}
               {draggedId === service.id ? 'opacity-40 scale-95' : ''}"
      >
        <div
          role="button"
          tabindex="-1"
          style="-webkit-app-region: no-drag;"
          onpointerdown={(event) => onPointerDown(event, service.id)}
          oncontextmenu={(event) => openServiceContextMenu(event, service)}
        >
          <Button
            title={serviceButtonTitle(service, index)}
            variant="ghost"
            class="h-14 w-16 rounded-2xl p-2 transition-all relative overflow-visible
                   {isHibernated ? 'bg-sky-500/10 ring-1 ring-sky-400/40 shadow-sm hover:bg-sky-500/15' : activeId === service.id ? 'bg-muted ring-1 ring-border shadow-sm' : 'hover:bg-foreground/5'}
                   {service.disabled ? 'opacity-40 grayscale' : ''}"
            style={service.iconBgColor ? `box-shadow: inset 0 0 0 2.5px ${service.iconBgColor};` : ""}
            onclick={() => selectService(service.id)}
          >
            <div
              aria-hidden="true"
              class="flex h-full w-full items-center justify-center rounded-xl text-sm font-semibold tracking-wide text-foreground/80 pointer-events-none
                     {isHibernated ? 'bg-sky-950/20 ring-1 ring-inset ring-sky-300/15' : activeId === service.id ? 'bg-background/85' : 'bg-muted/60'}"
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

            {#if service.notificationPrefs.showBadge && service.badge && service.badge !== 0}
              <div
                class="absolute -top-1 -right-1 z-50 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-background
                       {isDnd ? 'bg-muted-foreground' : 'bg-red-500'}"
              >
                {service.badge === -1 ? "" : service.badge > 99 ? "99+" : service.badge}
              </div>
            {/if}

            {#if isHibernated}
              <div
                aria-hidden="true"
                data-testid="service-hibernation-indicator"
                class="absolute -bottom-1 -right-1 z-40 h-3.5 w-3.5 rounded-full bg-sky-300 shadow-sm ring-[3px] ring-background"
              ></div>
            {/if}
          </Button>
        </div>
      </div>
    {/each}
  </div>

  <div
    class="flex w-full shrink-0 flex-col items-center gap-4 pb-2"
    data-testid="workspace-utility-controls"
    style="-webkit-app-region: no-drag;"
  >
    <div class="w-10 h-[1px] bg-border"></div>

    <Button
      title={isDnd ? "Turn Off Do Not Disturb" : "Turn On Do Not Disturb"}
      variant="ghost"
      class="h-10 w-10 rounded-full p-2 transition-all {isDnd
        ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
        : 'text-muted-foreground hover:bg-foreground/5'}"
      onclick={onToggleDnd}
    >
      {#if isDnd}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
          <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
          <path d="M18 8a6 6 0 0 0-9.33-5" />
          <line x1="2" y1="2" x2="22" y2="22" />
        </svg>
      {:else}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      {/if}
    </Button>

    <Button
      title="Add Service"
      variant="outline"
      class="h-12 w-12 rounded-2xl text-2xl text-muted-foreground border-dashed border-2 hover:border-solid hover:bg-foreground/5 transition-all"
      onclick={onOpenAddModal}
    >
      +
    </Button>

    <Button
      title="Todos"
      aria-pressed={isTodosPanelOpen}
      variant="ghost"
      size="icon-lg"
      class="h-10 w-10 rounded-full p-2 transition-all {isTodosPanelOpen
        ? 'bg-foreground/10 text-foreground ring-1 ring-border'
        : 'text-muted-foreground hover:bg-foreground/5'}"
      onclick={onToggleTodosPanel}
    >
      <ListTodoIcon />
    </Button>

    <Button
      title="Settings"
      variant="ghost"
      size="icon-lg"
      href="/settings"
      class="h-10 w-10 rounded-full p-2 transition-all text-muted-foreground hover:bg-foreground/5"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </Button>
  </div>
</aside>
