<script lang="ts">
  import CheckIcon from "@lucide/svelte/icons/check";
  import CircleSlashIcon from "@lucide/svelte/icons/circle-slash";
  import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
  import PaletteIcon from "@lucide/svelte/icons/palette";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { getServiceFaviconUrl, getServiceMonogram } from "$lib/services/service-icon";

  export type ServiceEditorInput = {
    name: string;
    url: string;
    iconBgColor?: string;
  };

  export type ServiceEditorService = ServiceEditorInput & {
    id: string;
  };

  interface Props {
    open?: boolean;
    editingService?: ServiceEditorService | null;
    onSave: (payload: ServiceEditorInput) => void;
  }

  let {
    open = $bindable(false),
    editingService = null,
    onSave,
  }: Props = $props();

  const PRESET_COLORS = [
    { label: "None", value: "" },
    { label: "Red", value: "#EF4444" },
    { label: "Blue", value: "#3B82F6" },
    { label: "Green", value: "#22C55E" },
    { label: "Amber", value: "#F59E0B" },
    { label: "Purple", value: "#A855F7" },
  ] as const;

  let name = $state("");
  let url = $state("");
  let iconBgColor = $state("");
  let customHexInput = $state("");
  let previewIconFailed = $state(false);

  let canSave = $derived(name.trim().length > 0 && url.trim().length > 0);
  let dialogTitle = $derived(editingService ? "Edit Service" : "Add New Service");
  let dialogDescription = $derived(
    editingService
      ? "Update the service name, URL, and sidebar icon ring."
      : "Add a web app to the current workspace sidebar.",
  );
  let previewName = $derived(name.trim() || "Service");
  let previewUrl = $derived(url.trim());
  let customColorActive = $derived(
    !!iconBgColor && !PRESET_COLORS.some((preset) => preset.value === iconBgColor),
  );

  function syncForm(service: ServiceEditorService | null) {
    name = service?.name ?? "";
    url = service?.url ?? "";
    previewIconFailed = false;

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
    if (!canSave) return;

    onSave({
      name: name.trim(),
      url: url.trim(),
      iconBgColor: iconBgColor || undefined,
    });
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="gap-0 overflow-hidden p-0 sm:max-w-[31rem]">
    <Dialog.Header>
      <div class="px-6 pb-4 pt-6 pr-14">
        <div class="min-w-0">
          <Dialog.Title>{dialogTitle}</Dialog.Title>
          <Dialog.Description class="mt-1.5 max-w-sm">{dialogDescription}</Dialog.Description>
        </div>
      </div>
    </Dialog.Header>

    <div class="grid gap-5 px-6 pb-5">
      <div class="flex items-center justify-between gap-4 rounded-lg border bg-muted/20 px-3 py-2.5">
        <div class="min-w-0">
          <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Sidebar preview
          </p>
          <p class="mt-1 truncate text-sm font-semibold text-foreground">{previewName}</p>
          <p class="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <ExternalLinkIcon class="size-3.5 shrink-0" />
            <span class="truncate">{previewUrl || "Service URL"}</span>
          </p>
        </div>
        <div
          class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-background text-sm font-semibold tracking-wide text-foreground/80 shadow-sm"
          style={iconBgColor ? `box-shadow: inset 0 0 0 2.5px ${iconBgColor};` : ""}
        >
          {#if previewUrl && !previewIconFailed}
            <img
              src={getServiceFaviconUrl(previewUrl)}
              alt={`${previewName} icon preview`}
              class="h-7 w-7 rounded-lg object-contain"
              loading="lazy"
              decoding="async"
              onerror={() => (previewIconFailed = true)}
            />
          {:else}
            {getServiceMonogram(previewName)}
          {/if}
        </div>
      </div>

      <div class="grid gap-4 rounded-lg border px-4 py-4">
        <div class="grid gap-2">
          <Label for="name">Service name</Label>
          <Input id="name" placeholder="e.g. Discord" bind:value={name} autocomplete="off" />
        </div>

        <div class="grid gap-2">
          <Label for="url">Service URL</Label>
          <Input
            id="url"
            placeholder="discord.com/app"
            bind:value={url}
            inputmode="url"
            autocomplete="url"
            oninput={() => (previewIconFailed = false)}
            onkeydown={(event) => event.key === "Enter" && save()}
          />
        </div>

        <div class="grid gap-3 border-t pt-4">
          <div>
            <div class="flex items-center gap-2">
              <PaletteIcon class="size-4 text-muted-foreground" />
              <Label>Icon ring</Label>
            </div>
            <p class="mt-1 text-xs text-muted-foreground">
              Optional color cue around the service icon.
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            {#each PRESET_COLORS as preset (preset.label)}
              <button
                type="button"
                title={preset.label}
                aria-label={`${preset.label} icon ring`}
                aria-pressed={iconBgColor === preset.value}
                class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all
                       {iconBgColor === preset.value ? 'scale-105 ring-2 ring-primary ring-offset-2' : 'opacity-80 hover:scale-105 hover:opacity-100'}"
                style="background-color: {preset.value || 'hsl(var(--muted))'};"
                onclick={() => selectPresetColor(preset.value)}
              >
                {#if preset.value}
                  {#if iconBgColor === preset.value}
                    <CheckIcon class="size-3.5 text-white" />
                  {/if}
                {:else}
                  <CircleSlashIcon class="size-3.5 text-muted-foreground" />
                {/if}
              </button>
            {/each}
          </div>

          <div class="flex items-center gap-2">
            <div class="relative flex flex-1 items-center">
              <span class="pointer-events-none absolute left-3 font-mono text-xs text-muted-foreground">#</span>
              <input
                type="text"
                aria-label="Custom icon ring hex color"
                placeholder="Custom hex, e.g. FF5733"
                bind:value={customHexInput}
                class="h-9 w-full rounded-md border bg-background pl-7 pr-3 font-mono text-sm outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                maxlength="7"
                oninput={applyCustomHex}
                onkeydown={(event) => event.key === "Enter" && save()}
              />
            </div>
            {#if customColorActive}
              <div
                title="Custom icon ring preview"
                class="h-9 w-9 shrink-0 rounded-full border ring-2 ring-primary ring-offset-2"
                style="background-color: {iconBgColor};"
              ></div>
            {/if}
          </div>
        </div>
      </div>
    </div>

    <Dialog.Footer class="border-t px-6 py-4">
      <Button class="min-w-28" onclick={save} disabled={!canSave}>
        {editingService ? "Save Changes" : "Add Service"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
