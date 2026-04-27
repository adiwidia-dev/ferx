<script lang="ts">
  import { Popover } from "bits-ui";
  import BikeIcon from "@lucide/svelte/icons/bike";
  import BookOpenIcon from "@lucide/svelte/icons/book-open";
  import BriefcaseIcon from "@lucide/svelte/icons/briefcase";
  import Building2Icon from "@lucide/svelte/icons/building-2";
  import CameraIcon from "@lucide/svelte/icons/camera";
  import CheckIcon from "@lucide/svelte/icons/check";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import CodeIcon from "@lucide/svelte/icons/code";
  import CoffeeIcon from "@lucide/svelte/icons/coffee";
  import FolderIcon from "@lucide/svelte/icons/folder";
  import Gamepad2Icon from "@lucide/svelte/icons/gamepad-2";
  import GlobeIcon from "@lucide/svelte/icons/globe";
  import GraduationCapIcon from "@lucide/svelte/icons/graduation-cap";
  import HeartIcon from "@lucide/svelte/icons/heart";
  import HouseIcon from "@lucide/svelte/icons/house";
  import LaptopIcon from "@lucide/svelte/icons/laptop";
  import MailIcon from "@lucide/svelte/icons/mail";
  import MusicIcon from "@lucide/svelte/icons/music";
  import PaletteIcon from "@lucide/svelte/icons/palette";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import PlaneIcon from "@lucide/svelte/icons/plane";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import PowerIcon from "@lucide/svelte/icons/power";
  import PowerOffIcon from "@lucide/svelte/icons/power-off";
  import RocketIcon from "@lucide/svelte/icons/rocket";
  import ShieldIcon from "@lucide/svelte/icons/shield";
  import ShoppingBagIcon from "@lucide/svelte/icons/shopping-bag";
  import StarIcon from "@lucide/svelte/icons/star";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import UserIcon from "@lucide/svelte/icons/user";
  import WrenchIcon from "@lucide/svelte/icons/wrench";
  import XIcon from "@lucide/svelte/icons/x";
  import type { WorkspaceGroup } from "$lib/services/workspace-groups";
  import {
    DEFAULT_WORKSPACE_ICON,
    WORKSPACE_ICON_PRESETS,
    normalizeWorkspaceIcon,
    type WorkspaceIconKey,
  } from "$lib/services/workspace-icons";

  const WORKSPACE_ICON_COMPONENTS = {
    bike: BikeIcon,
    "book-open": BookOpenIcon,
    briefcase: BriefcaseIcon,
    "building-2": Building2Icon,
    camera: CameraIcon,
    code: CodeIcon,
    coffee: CoffeeIcon,
    folder: FolderIcon,
    "gamepad-2": Gamepad2Icon,
    globe: GlobeIcon,
    "graduation-cap": GraduationCapIcon,
    heart: HeartIcon,
    house: HouseIcon,
    laptop: LaptopIcon,
    mail: MailIcon,
    music: MusicIcon,
    palette: PaletteIcon,
    plane: PlaneIcon,
    rocket: RocketIcon,
    shield: ShieldIcon,
    "shopping-bag": ShoppingBagIcon,
    star: StarIcon,
    user: UserIcon,
    wrench: WrenchIcon,
  } satisfies Record<WorkspaceIconKey, unknown>;

  function getWorkspaceIconComponent(icon: string | undefined) {
    return WORKSPACE_ICON_COMPONENTS[normalizeWorkspaceIcon(icon)];
  }

  interface Props {
    open?: boolean;
    workspaces: WorkspaceGroup[];
    currentWorkspaceId: string;
    onSelectWorkspace: (id: string) => void;
    onCreateWorkspace: (input: { name: string; icon: WorkspaceIconKey }) => void;
    onUpdateWorkspaceIcon: (input: { workspaceId: string; icon: WorkspaceIconKey }) => void;
    onRenameWorkspace: (input: { workspaceId: string; name: string }) => void;
    onSetWorkspaceDisabled: (input: { workspaceId: string; disabled: boolean }) => void;
    onDeleteWorkspace: (workspaceId: string) => void;
    onOpenChange?: (open: boolean) => void;
  }

  let {
    open = $bindable(false),
    workspaces,
    currentWorkspaceId,
    onSelectWorkspace,
    onCreateWorkspace,
    onUpdateWorkspaceIcon,
    onRenameWorkspace,
    onSetWorkspaceDisabled,
    onDeleteWorkspace,
    onOpenChange,
  }: Props = $props();

  let newWorkspaceName = $state("");
  let selectedIcon = $state<WorkspaceIconKey>(DEFAULT_WORKSPACE_ICON);
  let isCreateIconPickerOpen = $state(false);
  let editingWorkspaceIconId = $state<string | null>(null);
  let editingWorkspaceNameId = $state<string | null>(null);
  let editingWorkspaceName = $state("");
  let confirmingDeleteWorkspaceId = $state<string | null>(null);
  let currentWorkspace = $derived(
    workspaces.find((workspace) => workspace.id === currentWorkspaceId) ?? workspaces[0],
  );
  let currentWorkspaceName = $derived(currentWorkspace?.name ?? "Default");
  let SelectedIcon = $derived(getWorkspaceIconComponent(selectedIcon));
  let CurrentIcon = $derived(getWorkspaceIconComponent(currentWorkspace?.icon));

  function getOpen() {
    return open;
  }

  function setOpen(nextOpen: boolean) {
    open = nextOpen;
    onOpenChange?.(nextOpen);
  }

  function selectWorkspace(id: string) {
    onSelectWorkspace(id);
    editingWorkspaceIconId = null;
    editingWorkspaceNameId = null;
    confirmingDeleteWorkspaceId = null;
    setOpen(false);
  }

  function toggleWorkspaceIconEditor(id: string) {
    editingWorkspaceNameId = null;
    confirmingDeleteWorkspaceId = null;
    editingWorkspaceIconId = editingWorkspaceIconId === id ? null : id;
  }

  function updateWorkspaceIcon(workspaceId: string, icon: WorkspaceIconKey) {
    onUpdateWorkspaceIcon({ workspaceId, icon });
    editingWorkspaceIconId = null;
  }

  function startRenameWorkspace(workspace: WorkspaceGroup) {
    editingWorkspaceIconId = null;
    confirmingDeleteWorkspaceId = null;
    editingWorkspaceNameId = workspace.id;
    editingWorkspaceName = workspace.name;
  }

  function cancelRenameWorkspace() {
    editingWorkspaceNameId = null;
    editingWorkspaceName = "";
  }

  function saveWorkspaceName(workspace: WorkspaceGroup) {
    const name = editingWorkspaceName.trim();
    if (!name) {
      return;
    }

    onRenameWorkspace({ workspaceId: workspace.id, name });
    cancelRenameWorkspace();
  }

  function setWorkspaceDisabled(workspace: WorkspaceGroup, disabled: boolean) {
    editingWorkspaceIconId = null;
    editingWorkspaceNameId = null;
    confirmingDeleteWorkspaceId = null;
    onSetWorkspaceDisabled({ workspaceId: workspace.id, disabled });
  }

  function toggleDeleteConfirmation(id: string) {
    editingWorkspaceIconId = null;
    editingWorkspaceNameId = null;
    confirmingDeleteWorkspaceId = confirmingDeleteWorkspaceId === id ? null : id;
  }

  function deleteWorkspace(id: string) {
    onDeleteWorkspace(id);
    confirmingDeleteWorkspaceId = null;
    setOpen(false);
  }

  function createWorkspace() {
    const name = newWorkspaceName.trim();
    if (!name) {
      return;
    }

    onCreateWorkspace({ name, icon: selectedIcon });
    newWorkspaceName = "";
    selectedIcon = DEFAULT_WORKSPACE_ICON;
    isCreateIconPickerOpen = false;
    setOpen(false);
  }
</script>

<Popover.Root bind:open={getOpen, setOpen}>
  <Popover.Trigger
    data-testid="workspace-switcher-trigger"
    title={`Switch workspace: ${currentWorkspaceName}`}
    aria-label={`Switch workspace: ${currentWorkspaceName}`}
    class="grid min-h-11 w-14 grid-cols-[1fr_0.625rem] items-center gap-0.5 rounded-2xl border bg-background px-1.5 text-left shadow-xs transition-all hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    style="-webkit-app-region: no-drag;"
  >
    <span
      data-testid="workspace-trigger-icon"
      aria-hidden="true"
      class="flex h-8 w-8 items-center justify-center rounded-xl bg-muted text-foreground"
      style={`color: ${currentWorkspace?.color ?? "#3B82F6"};`}
    >
      <CurrentIcon class="h-4 w-4" />
    </span>
    <ChevronDownIcon class="h-3 w-3 text-muted-foreground" />
  </Popover.Trigger>
  {#if open}
    <div
      data-testid="workspace-picker-overlay"
      class="fixed inset-y-0 left-20 right-0 z-[120]"
      role="presentation"
      style="-webkit-app-region: no-drag;"
      onclick={() => setOpen(false)}
    ></div>
    <div
      data-testid="workspace-picker-panel"
      role="dialog"
      aria-modal="false"
      aria-label="Switch workspace"
      class="fixed left-1/2 top-1/2 z-[121] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-3xl border bg-popover p-4 text-popover-foreground shadow-2xl ring-1 ring-black/5"
      style="-webkit-app-region: no-drag;"
    >
      <div class="flex items-center justify-between px-1 pb-3">
        <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Switch workspace
        </p>
        <p class="text-[10px] font-medium text-muted-foreground">⌘⇧1-9</p>
      </div>

      <div class="flex max-h-72 flex-col gap-1 overflow-y-auto">
        {#each workspaces as workspace, index (workspace.id)}
          {@const WorkspaceIcon = getWorkspaceIconComponent(workspace.icon)}
          <div class="grid gap-2">
            <div
              class="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 transition-colors hover:bg-muted {workspace.id === currentWorkspaceId ? 'bg-muted' : ''} {workspace.disabled ? 'opacity-60' : ''}"
            >
              <button
                type="button"
                title={`Change ${workspace.name} icon`}
                aria-label={`Change ${workspace.name} icon`}
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background transition-colors hover:bg-primary/10"
                style={`color: ${workspace.color ?? "#3B82F6"};`}
                onclick={() => toggleWorkspaceIconEditor(workspace.id)}
              >
                <WorkspaceIcon class="h-5 w-5" />
              </button>
              {#if editingWorkspaceNameId === workspace.id}
                <div class="flex min-w-0 flex-1 items-center gap-3">
                  <input
                    type="text"
                    aria-label={`Workspace name for ${workspace.name}`}
                    bind:value={editingWorkspaceName}
                    class="h-9 min-w-0 flex-1 rounded-xl border bg-background px-3 text-base font-semibold outline-none focus:ring-2 focus:ring-ring/40"
                    onkeydown={(event) => {
                      if (event.key === "Enter") saveWorkspaceName(workspace);
                      if (event.key === "Escape") cancelRenameWorkspace();
                    }}
                  />
                  <span class="shrink-0 text-sm font-semibold text-muted-foreground">
                    {workspace.serviceIds.length}
                  </span>
                </div>
              {:else}
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onclick={() => selectWorkspace(workspace.id)}
                >
                  <span class="min-w-0 flex-1 truncate text-lg font-semibold">
                    {workspace.name}
                  </span>
                  <span class="shrink-0 text-sm font-semibold text-muted-foreground">
                    {workspace.disabled ? "Disabled" : workspace.serviceIds.length}
                  </span>
                  {#if index < 9}
                    <span class="sr-only">Shortcut Command Shift {index + 1}</span>
                  {/if}
                </button>
              {/if}
              {#if editingWorkspaceNameId === workspace.id}
                <button
                  type="button"
                  title={`Save ${workspace.name} workspace name`}
                  aria-label={`Save ${workspace.name} workspace name`}
                  class="flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                  disabled={!editingWorkspaceName.trim()}
                  onclick={() => saveWorkspaceName(workspace)}
                >
                  <CheckIcon class="h-4 w-4" />
                  Save
                </button>
                <button
                  type="button"
                  title={`Cancel renaming ${workspace.name} workspace`}
                  aria-label={`Cancel renaming ${workspace.name} workspace`}
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onclick={cancelRenameWorkspace}
                >
                  <XIcon class="h-4 w-4" />
                </button>
              {:else}
                <button
                  type="button"
                  title={`${workspace.disabled ? "Enable" : "Disable"} ${workspace.name} workspace`}
                  aria-label={`${workspace.disabled ? "Enable" : "Disable"} ${workspace.name} workspace`}
                  class="flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onclick={() => setWorkspaceDisabled(workspace, !workspace.disabled)}
                >
                  {#if workspace.disabled}
                    <PowerIcon class="h-3.5 w-3.5" />
                    Enable
                  {:else}
                    <PowerOffIcon class="h-3.5 w-3.5" />
                    Disable
                  {/if}
                </button>
                <button
                  type="button"
                  title={`Rename ${workspace.name} workspace`}
                  aria-label={`Rename ${workspace.name} workspace`}
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onclick={() => startRenameWorkspace(workspace)}
                >
                  <PencilIcon class="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title={`Delete ${workspace.name} workspace`}
                  aria-label={`Delete ${workspace.name} workspace`}
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
                  disabled={workspaces.length <= 1}
                  onclick={() => toggleDeleteConfirmation(workspace.id)}
                >
                  <Trash2Icon class="h-4 w-4" />
                </button>
              {/if}
            </div>

            {#if confirmingDeleteWorkspaceId === workspace.id}
              <div
                class="mx-1 flex items-center gap-2 rounded-2xl border bg-background p-2 text-xs text-muted-foreground"
              >
                <span class="min-w-0 flex-1 truncate px-2">
                  Delete {workspace.name}?
                </span>
                <button
                  type="button"
                  title={`Confirm delete ${workspace.name} workspace`}
                  aria-label={`Confirm delete ${workspace.name} workspace`}
                  class="h-8 rounded-xl bg-destructive px-3 font-semibold text-destructive-foreground"
                  onclick={() => deleteWorkspace(workspace.id)}
                >
                  Delete
                </button>
                <button
                  type="button"
                  title={`Cancel delete ${workspace.name} workspace`}
                  aria-label={`Cancel delete ${workspace.name} workspace`}
                  class="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                  onclick={() => (confirmingDeleteWorkspaceId = null)}
                >
                  <XIcon class="h-4 w-4" />
                </button>
              </div>
            {/if}

            {#if editingWorkspaceIconId === workspace.id}
              <div
                aria-label={`Choose icon for ${workspace.name}`}
                class="grid grid-cols-6 gap-2 px-1 pb-2"
              >
                {#each WORKSPACE_ICON_PRESETS as preset (preset.key)}
                  {@const PresetIcon = getWorkspaceIconComponent(preset.key)}
                  <button
                    type="button"
                    data-testid="workspace-edit-icon-option"
                    title={`Choose ${preset.label} icon for ${workspace.name}`}
                    aria-label={`Choose ${preset.label} icon for ${workspace.name}`}
                    aria-pressed={normalizeWorkspaceIcon(workspace.icon) === preset.key}
                    class="flex aspect-square min-h-9 items-center justify-center rounded-xl border bg-background text-muted-foreground transition-all hover:bg-muted hover:text-foreground {normalizeWorkspaceIcon(workspace.icon) === preset.key ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20' : ''}"
                    onclick={() => updateWorkspaceIcon(workspace.id, preset.key)}
                  >
                    <PresetIcon class="h-4 w-4" />
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <div class="my-4 h-px bg-border"></div>

      <div class="grid gap-3">
        <div class="grid grid-cols-[1fr_auto] gap-2">
          <input
            type="text"
            placeholder="Workspace name"
            bind:value={newWorkspaceName}
            class="h-12 min-w-0 rounded-2xl border bg-background px-4 text-base font-medium outline-none transition-all placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"
            onkeydown={(event) => event.key === "Enter" && createWorkspace()}
          />
          <button
            type="button"
            title="Choose new workspace icon"
            aria-label="Choose new workspace icon"
            aria-expanded={isCreateIconPickerOpen}
            class="flex h-12 w-12 items-center justify-center rounded-2xl border bg-background text-primary"
            onclick={() => (isCreateIconPickerOpen = !isCreateIconPickerOpen)}
          >
            <SelectedIcon class="h-5 w-5" />
          </button>
        </div>
        {#if isCreateIconPickerOpen}
          <div
            data-testid="workspace-create-icon-picker"
            aria-label="Workspace icon presets"
            class="grid grid-cols-6 gap-2"
          >
            {#each WORKSPACE_ICON_PRESETS as preset (preset.key)}
              {@const PresetIcon = getWorkspaceIconComponent(preset.key)}
              <button
                type="button"
                data-testid="workspace-icon-option"
                title={`Choose ${preset.label} icon`}
                aria-label={`Choose ${preset.label} icon`}
                aria-pressed={selectedIcon === preset.key}
                class="flex aspect-square min-h-10 items-center justify-center rounded-xl border bg-background text-muted-foreground transition-all hover:bg-muted hover:text-foreground {selectedIcon === preset.key ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20' : ''}"
                onclick={() => (selectedIcon = preset.key)}
              >
                <PresetIcon class="h-4 w-4" />
              </button>
            {/each}
          </div>
        {/if}
        <button
          type="button"
          class="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-3 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          disabled={!newWorkspaceName.trim()}
          onclick={createWorkspace}
        >
          <PlusIcon class="h-4 w-4" />
          Create workspace
        </button>
      </div>
    </div>
  {/if}
</Popover.Root>
