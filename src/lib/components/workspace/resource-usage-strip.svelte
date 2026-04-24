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
  class="flex h-8 shrink-0 items-center justify-center gap-3 border-b bg-background/80 px-3 text-[11px] text-muted-foreground backdrop-blur-sm"
>
  <span class="max-w-32 truncate font-semibold text-foreground/80">{serviceName}</span>
  <span>CPU est. {formatPercentEstimate(displaySnapshot.cpuEstimatePercent)}</span>
  <span>Down observed {formatNetworkMbps(displaySnapshot.networkInMbps)}</span>
  <span>Up observed {formatNetworkMbps(displaySnapshot.networkOutMbps)}</span>
</div>
