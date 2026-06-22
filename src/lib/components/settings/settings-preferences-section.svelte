<script lang="ts">
  import ActivityIcon from "@lucide/svelte/icons/activity";
  import KeyboardIcon from "@lucide/svelte/icons/keyboard";
  import MonitorIcon from "@lucide/svelte/icons/monitor";
  import MoonIcon from "@lucide/svelte/icons/moon";
  import RotateCwIcon from "@lucide/svelte/icons/rotate-cw";
  import SunIcon from "@lucide/svelte/icons/sun";
  import { Button } from "$lib/components/ui/button";
  import type { ThemeMode } from "$lib/services/app-settings";

  interface Props {
    spellCheckEnabled: boolean;
    resourceUsageMonitoringEnabled: boolean;
    themeMode: ThemeMode;
    spellCheckRestartRequired: boolean;
    restartError: string;
    onSpellCheckChange: (enabled: boolean) => void;
    onResourceUsageMonitoringChange: (enabled: boolean) => void;
    onThemeModeChange: (themeMode: ThemeMode) => void;
    onRequestRestart: () => void;
  }

  const appearanceOptions: Array<{
    value: ThemeMode;
    label: string;
    icon: typeof MonitorIcon;
  }> = [
    { value: "system", label: "System", icon: MonitorIcon },
    { value: "light", label: "Light", icon: SunIcon },
    { value: "dark", label: "Dark", icon: MoonIcon },
  ];

  let {
    spellCheckEnabled,
    resourceUsageMonitoringEnabled,
    themeMode,
    spellCheckRestartRequired,
    restartError,
    onSpellCheckChange,
    onResourceUsageMonitoringChange,
    onThemeModeChange,
    onRequestRestart,
  }: Props = $props();
</script>

<section id="preferences" class="scroll-mt-8 rounded-lg border bg-card text-card-foreground shadow-sm">
  <div class="border-b px-5 py-4">
    <div class="flex items-center gap-3">
      <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <KeyboardIcon class="size-4" />
      </div>
      <div>
        <h2 class="text-sm font-semibold text-foreground">Preferences</h2>
        <p class="mt-0.5 text-xs text-muted-foreground">Input and workspace activity controls.</p>
      </div>
    </div>
  </div>

  <div class="divide-y">
    <div class="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <p class="text-sm font-semibold text-foreground">Appearance</p>
        <p class="mt-1 text-xs text-muted-foreground">
          Choose how the Ferx interface follows your system theme.
        </p>
      </div>

      <div
        class="grid w-full grid-cols-3 rounded-lg border bg-muted p-1 sm:w-auto"
        role="radiogroup"
        aria-label="Appearance"
      >
        {#each appearanceOptions as option (option.value)}
          {@const OptionIcon = option.icon}
          <button
            type="button"
            class="inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 {themeMode === option.value ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}"
            role="radio"
            aria-checked={themeMode === option.value}
            data-testid={`appearance-option-${option.value}`}
            onclick={() => onThemeModeChange(option.value)}
          >
            <OptionIcon class="size-3.5" />
            <span>{option.label}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="flex items-center justify-between gap-4 px-5 py-4">
      <div class="min-w-0">
        <p class="text-sm font-semibold text-foreground">Enable Spell Checking</p>
        <p class="mt-1 text-xs text-muted-foreground">
          Uses the built-in spell checker for service inputs.
        </p>
        {#if spellCheckRestartRequired}
          <p class="mt-2 inline-flex rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
            Restart Ferx to apply spell checking changes.
          </p>
        {/if}
      </div>

      <label class="relative inline-flex shrink-0 cursor-pointer items-center">
        <input
          name="spell-check-enabled"
          type="checkbox"
          class="peer sr-only"
          checked={spellCheckEnabled}
          onchange={(event) =>
            onSpellCheckChange((event.currentTarget as HTMLInputElement).checked)}
        />
        <span class="h-6 w-11 rounded-full bg-muted transition-colors peer-checked:bg-blue-500"></span>
        <span class="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background shadow-sm transition-transform peer-checked:translate-x-5"></span>
      </label>
    </div>

    <div class="flex items-center justify-between gap-4 px-5 py-4">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <ActivityIcon class="size-4 text-muted-foreground" />
          <p class="text-sm font-semibold text-foreground">Resource Usage Monitoring</p>
        </div>
        <p class="mt-1 text-xs text-muted-foreground">
          Shows estimated resource activity for the active service.
        </p>
      </div>

      <label class="relative inline-flex shrink-0 cursor-pointer items-center">
        <input
          name="resource-usage-monitoring-enabled"
          type="checkbox"
          class="peer sr-only"
          checked={resourceUsageMonitoringEnabled}
          onchange={(event) =>
            onResourceUsageMonitoringChange((event.currentTarget as HTMLInputElement).checked)}
        />
        <span class="h-6 w-11 rounded-full bg-muted transition-colors peer-checked:bg-blue-500"></span>
        <span class="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background shadow-sm transition-transform peer-checked:translate-x-5"></span>
      </label>
    </div>

    <div class="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <RotateCwIcon class="size-4 text-muted-foreground" />
          <p class="text-sm font-semibold text-foreground">Restart Ferx</p>
        </div>
        <p class="mt-1 text-xs text-muted-foreground">
          Relaunch the app to apply pending settings changes.
        </p>
        {#if restartError}
          <p class="mt-2 text-xs font-medium text-red-500">{restartError}</p>
        {/if}
      </div>

      <Button
        variant="outline"
        class="h-9 w-fit rounded-lg px-3 text-xs"
        data-testid="manual-restart-button"
        onclick={onRequestRestart}
      >
        Restart Ferx
      </Button>
    </div>
  </div>
</section>
