<script lang="ts">
  import { Button } from "$lib/components/ui/button";

  interface Props {
    onOpenAddModal: () => void;
  }

  let { onOpenAddModal }: Props = $props();
</script>

<div
  class="flex flex-col items-center max-w-md text-center animate-in fade-in zoom-in-95 duration-500"
>
  <div
    class="h-24 w-24 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 text-blue-500 rounded-[2rem] flex items-center justify-center mb-8 shadow-inner ring-1 ring-blue-500/20"
  >
    <img
      src="/app-icon.png"
      alt="Ferx app icon"
      class="h-16 w-16 rounded-2xl object-contain"
      loading="eager"
      decoding="async"
    />
  </div>

  <h1 class="text-4xl font-extrabold tracking-tight mb-4 text-foreground">
    Welcome to <span
      class="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-indigo-500"
      >Ferx</span
    >
  </h1>
  <p class="text-lg text-muted-foreground mb-12 px-4">
    Your all-in-one messaging and productivity application.
  </p>

  <div
    class="w-full p-8 rounded-3xl border bg-card text-card-foreground shadow-xl ring-1 ring-black/5 flex flex-col items-center gap-5"
  >
    <h3 class="text-xl font-semibold text-foreground">
      Let's build your workspace
    </h3>
    <p class="text-sm text-muted-foreground">
      Start by adding your daily web applications like WhatsApp, Discord,
      or Slack.
    </p>

    <div
      class="flex items-center gap-3 my-2 text-sm font-medium bg-background px-5 py-3 rounded-2xl ring-1 ring-border shadow-sm"
    >
      <span>Click the</span>
      <span
        class="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground text-muted-foreground font-bold text-lg leading-none"
        >+</span
      >
      <span>button in the sidebar</span>
    </div>

    <div
      class="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mt-2"
    >
      OR
    </div>

    <Button
      size="lg"
      class="w-full rounded-xl text-md h-12 transition-all hover:scale-[1.02] shadow-md hover:shadow-lg"
      onclick={onOpenAddModal}
    >
      Add your first service
    </Button>
  </div>
</div>
