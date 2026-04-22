<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";

  export type WorkspaceEditorInput = {
    name: string;
    url: string;
    iconBgColor?: string;
  };

  export type WorkspaceEditorService = WorkspaceEditorInput & {
    id: string;
  };

  interface Props {
    open?: boolean;
    editingService?: WorkspaceEditorService | null;
    onSave: (payload: WorkspaceEditorInput) => void;
  }

  let {
    open = $bindable(false),
    editingService = null,
    onSave,
  }: Props = $props();

  let name = $state("");
  let url = $state("");
  let iconBgColor = $state("");
  let customHexInput = $state("");

  const PRESET_COLORS = [
    { label: "None", value: "" },
    { label: "Red", value: "#EF4444" },
    { label: "Blue", value: "#3B82F6" },
    { label: "Green", value: "#22C55E" },
    { label: "Amber", value: "#F59E0B" },
    { label: "Purple", value: "#A855F7" },
  ] as const;

  function syncForm(service: WorkspaceEditorService | null) {
    name = service?.name ?? "";
    url = service?.url ?? "";

    const color = service?.iconBgColor ?? "";
    iconBgColor = color;

    const isCustomColor = color && !PRESET_COLORS.some((preset) => preset.value === color);
    customHexInput = isCustomColor ? color : "";
  }

  $effect(() => {
    if (open) {
      syncForm(editingService);
    }
  });

  function selectPresetColor(value: string) {
    iconBgColor = value;
    customHexInput = "";
  }

  function applyCustomHex() {
    const hex = customHexInput.trim();
    if (/^#?[0-9A-Fa-f]{6}$/.test(hex)) {
      iconBgColor = hex.startsWith("#") ? hex : `#${hex}`;
    }
  }

  function save() {
    onSave({
      name,
      url,
      iconBgColor: iconBgColor || undefined,
    });
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-[425px]">
    <Dialog.Header>
      <Dialog.Title>
        {editingService ? "Edit Workspace" : "Add New Workspace"}
      </Dialog.Title>
      <Dialog.Description>
        {editingService
          ? "Update the details for this service."
          : "Enter the URL of the web application you want to add."}
      </Dialog.Description>
    </Dialog.Header>
    <div class="grid gap-4 py-4">
      <div class="grid grid-cols-4 items-center gap-4">
        <Label for="name" class="text-right">Name</Label>
        <Input
          id="name"
          placeholder="e.g. Discord"
          bind:value={name}
          class="col-span-3"
        />
      </div>
      <div class="grid grid-cols-4 items-center gap-4">
        <Label for="url" class="text-right">URL</Label>
        <Input
          id="url"
          placeholder="discord.com/app"
          bind:value={url}
          class="col-span-3"
          onkeydown={(event) => event.key === "Enter" && save()}
        />
      </div>
      <div class="flex flex-col gap-3 rounded-xl border bg-muted/30 p-3">
        <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Icon Color Ring
        </span>
        <div class="flex items-center gap-2.5">
          {#each PRESET_COLORS as preset (preset.label)}
            <button
              type="button"
              title={preset.label}
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all
                     {iconBgColor === preset.value ? 'scale-110 ring-2 ring-primary ring-offset-2' : 'opacity-80 hover:scale-110 hover:opacity-100'}"
              style="background-color: {preset.value || 'hsl(var(--muted))'};"
              onclick={() => selectPresetColor(preset.value)}
            >
              {#if !preset.value}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="5" y1="5" x2="19" y2="19" />
                </svg>
              {/if}
            </button>
          {/each}
        </div>
        <div class="flex items-center gap-2">
          <div class="relative flex flex-1 items-center">
            <span class="pointer-events-none absolute left-3 font-mono text-xs text-muted-foreground">#</span>
            <input
              type="text"
              placeholder="Custom hex, e.g. FF5733"
              bind:value={customHexInput}
              class="h-8 w-full rounded-lg border bg-background pl-7 pr-3 font-mono text-xs outline-none transition-all focus:ring-2 focus:ring-primary"
              maxlength="7"
              oninput={applyCustomHex}
              onkeydown={(event) => event.key === "Enter" && save()}
            />
          </div>
          {#if iconBgColor && !PRESET_COLORS.some((preset) => preset.value === iconBgColor)}
            <div
              class="h-8 w-8 shrink-0 rounded-full ring-2 ring-primary ring-offset-2"
              style="background-color: {iconBgColor};"
            ></div>
          {/if}
        </div>
      </div>
    </div>
    <Dialog.Footer>
      <Button
        onclick={save}
        disabled={!name || !url}
      >
        {editingService ? "Save Changes" : "Add Service"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
