export interface ResourceUsageSnapshot {
  serviceId: string;
  sampledAt: number;
  cpuEstimatePercent: number | null;
  memoryEstimateBytes: number | null;
  networkInMbps: number | null;
  networkOutMbps: number | null;
}

export function emptyResourceUsageSnapshot(serviceId: string): ResourceUsageSnapshot {
  return {
    serviceId,
    sampledAt: Date.now(),
    cpuEstimatePercent: null,
    memoryEstimateBytes: null,
    networkInMbps: null,
    networkOutMbps: null,
  };
}

export function parseResourceUsagePayload(
  serviceId: string,
  payload: string,
): ResourceUsageSnapshot | null {
  try {
    const parsed = JSON.parse(payload) as Partial<ResourceUsageSnapshot>;

    return {
      serviceId,
      sampledAt: typeof parsed.sampledAt === "number" ? parsed.sampledAt : Date.now(),
      cpuEstimatePercent: finiteOrNull(parsed.cpuEstimatePercent),
      memoryEstimateBytes: finiteOrNull(parsed.memoryEstimateBytes),
      networkInMbps: finiteOrNull(parsed.networkInMbps),
      networkOutMbps: finiteOrNull(parsed.networkOutMbps),
    };
  } catch {
    return null;
  }
}

export function formatPercentEstimate(value: number | null): string {
  if (value === null) return "N/A";
  return `${Math.max(0, Math.round(value))}%`;
}

export function formatNetworkMbps(value: number | null): string {
  if (value === null) return "N/A";
  if (value < 0.05) return "0 Mbps";
  if (value < 10) return `${value.toFixed(1)} Mbps`;
  return `${Math.round(value)} Mbps`;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
