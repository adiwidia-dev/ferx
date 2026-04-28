<script lang="ts">
  import { Button } from "$lib/components/ui/button";

  interface Props {
    showRestartPrompt: boolean;
    showRestartConfirm: boolean;
    restartError: string;
    onDismissRestartPrompt: () => void;
    onRestartFromPrompt: () => void;
    onCancelRestart: () => void;
    onConfirmRestart: () => void;
  }

  let {
    showRestartPrompt,
    showRestartConfirm,
    restartError,
    onDismissRestartPrompt,
    onRestartFromPrompt,
    onCancelRestart,
    onConfirmRestart,
  }: Props = $props();
</script>

{#if showRestartPrompt}
  <div
    data-testid="spell-check-restart-prompt-overlay"
    class="absolute inset-0 z-50 flex items-start justify-center bg-background/45 px-4 pt-24 backdrop-blur-sm sm:pt-32"
    role="presentation"
  >
    <div
      data-testid="spell-check-restart-prompt"
      class="w-full max-w-md rounded-2xl border bg-card p-5 text-left shadow-2xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-200"
      role="status"
    >
      <p class="text-base font-semibold text-foreground">
        Spell checking will update after restart.
      </p>
      <p class="mt-2 text-sm text-muted-foreground">
        Restart Ferx now or use the restart button in Settings later.
      </p>
      <div class="mt-5 flex justify-end gap-2">
        <Button
          variant="outline"
          class="h-9 rounded-xl px-3 text-xs"
          aria-label="Dismiss restart prompt"
          onclick={onDismissRestartPrompt}
        >
          Later
        </Button>
        <Button
          class="h-9 rounded-xl px-3 text-xs"
          data-testid="prompt-restart-button"
          onclick={onRestartFromPrompt}
        >
          Restart Ferx
        </Button>
      </div>
    </div>
  </div>
{/if}

{#if showRestartConfirm}
  <div
    class="absolute inset-0 z-[60] flex items-start justify-center bg-background/45 px-4 pt-24 backdrop-blur-sm sm:pt-32"
    role="presentation"
  >
    <div
      data-testid="restart-confirm-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="restart-confirm-title"
      class="w-full max-w-md rounded-2xl border bg-card p-5 text-left shadow-2xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-200"
    >
      <p id="restart-confirm-title" class="text-base font-semibold text-foreground">
        Restart Ferx?
      </p>
      <p class="mt-2 text-sm text-muted-foreground">
        Are you sure you want to restart Ferx? The app will close and reopen.
      </p>
      {#if restartError}
        <p class="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs font-medium text-red-500">
          {restartError}
        </p>
      {/if}
      <div class="mt-5 flex justify-end gap-2">
        <Button
          variant="outline"
          class="h-9 rounded-xl px-3 text-xs"
          data-testid="cancel-restart-button"
          onclick={onCancelRestart}
        >
          Cancel
        </Button>
        <Button
          class="h-9 rounded-xl px-3 text-xs"
          data-testid="confirm-restart-button"
          onclick={onConfirmRestart}
        >
          Restart Ferx
        </Button>
      </div>
    </div>
  </div>
{/if}
