// @vitest-environment jsdom
import { flushSync, mount, unmount } from "svelte";
import { describe, expect, it } from "vitest";

import ResourceUsageStrip from "./resource-usage-strip.svelte";

describe("ResourceUsageStrip", () => {
  it("keeps secondary metrics responsive in constrained layouts", () => {
    const component = mount(ResourceUsageStrip, {
      target: document.body,
      props: {
        serviceId: "chat",
        serviceName: "Team Chat",
        snapshot: {
          serviceId: "chat",
          sampledAt: 1,
          cpuEstimatePercent: 12,
          memoryEstimateBytes: null,
          networkInMbps: 1.2,
          networkOutMbps: 0.4,
        },
      },
    });

    flushSync();

    const strip = document.querySelector('[data-testid="resource-usage-strip"]');
    expect(strip?.className).toContain("flex-wrap");
    expect(document.querySelector('[data-testid="resource-usage-network-in"]')?.className).toContain(
      "hidden",
    );
    expect(document.querySelector('[data-testid="resource-usage-network-out"]')?.className).toContain(
      "hidden",
    );

    unmount(component);
  });
});
