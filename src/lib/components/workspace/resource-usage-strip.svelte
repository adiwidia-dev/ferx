<script lang="ts">
  import {
    emptyResourceUsageSnapshot,
    formatNetworkMbps,
    formatPercentEstimate,
    type ResourceUsageSnapshot,
  } from "$lib/services/resource-usage";

  let {
    serviceId,
    serviceName,
    snapshot = null,
  }: {
    serviceId: string;
    serviceName: string;
    snapshot?: ResourceUsageSnapshot | null;
  } = $props();

  let displaySnapshot = $derived(snapshot ?? emptyResourceUsageSnapshot(serviceId));
</script>

<div
  data-testid="resource-usage-strip"
  class="flex min-h-8 shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-0.5 overflow-hidden border-b bg-background/80 px-3 py-1 text-[11px] leading-4 text-muted-foreground backdrop-blur-sm"
>
  <span class="max-w-32 truncate font-semibold text-foreground/80">{serviceName}</span>
  <span>CPU est. {formatPercentEstimate(displaySnapshot.cpuEstimatePercent)}</span>
  <span data-testid="resource-usage-network-in" class="hidden min-[520px]:inline">
    Down observed {formatNetworkMbps(displaySnapshot.networkInMbps)}
  </span>
  <span data-testid="resource-usage-network-out" class="hidden min-[620px]:inline">
    Up observed {formatNetworkMbps(displaySnapshot.networkOutMbps)}
  </span>
</div>
