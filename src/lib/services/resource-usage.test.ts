import { describe, expect, it } from "vitest";

import {
  emptyResourceUsageSnapshot,
  formatNetworkMbps,
  formatPercentEstimate,
} from "./resource-usage";

describe("resource usage formatting", () => {
  it("creates an empty snapshot for a service", () => {
    expect(emptyResourceUsageSnapshot("chat")).toMatchObject({
      serviceId: "chat",
      cpuEstimatePercent: null,
      memoryEstimateBytes: null,
      networkInMbps: null,
      networkOutMbps: null,
    });
  });

  it("formats unavailable values truthfully", () => {
    expect(formatPercentEstimate(null)).toBe("N/A");
    expect(formatNetworkMbps(null)).toBe("N/A");
  });

  it("formats estimated and observed values compactly", () => {
    expect(formatPercentEstimate(7.4)).toBe("7%");
    expect(formatNetworkMbps(1.24)).toBe("1.2 Mbps");
  });
});
