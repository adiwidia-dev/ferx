<script lang="ts">
  import { Button } from "$lib/components/ui/button";

  interface Props {
    serviceName: string;
    onEnable: () => void;
  }

  let { serviceName, onEnable }: Props = $props();
</script>

<div
  class="text-center flex flex-col items-center gap-6 animate-in fade-in duration-300"
>
  <p class="text-lg text-foreground font-medium">
    {serviceName} is currently disabled
  </p>
  <Button
    variant="outline"
    class="px-8 rounded-xl h-11"
    onclick={onEnable}
  >
    Enable {serviceName}
  </Button>
</div>
