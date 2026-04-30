import { beforeEach, describe, expect, it } from "vitest";

import {
  applyRuntimeBadgePayload,
  clearRuntimeBadges,
  replaceRuntimeBadges,
  runtimeBadges,
} from "$lib/services/runtime-badges.svelte";

describe("runtime badges", () => {
  beforeEach(() => {
    clearRuntimeBadges();
  });

  it("keeps badge counts in module state for route remounts", () => {
    expect(applyRuntimeBadgePayload("mail:7", [{ id: "mail" }])).toBe(true);

    expect(runtimeBadges.mail).toBe(7);
  });

  it("ignores malformed and unknown-service badge payloads", () => {
    expect(applyRuntimeBadgePayload("mail:not-a-number", [{ id: "mail" }])).toBe(false);
    expect(applyRuntimeBadgePayload("calendar:4", [{ id: "mail" }])).toBe(false);

    expect({ ...runtimeBadges }).toEqual({});
  });

  it("replaces badge state when a service is deleted", () => {
    expect(applyRuntimeBadgePayload("mail:7")).toBe(true);
    expect(applyRuntimeBadgePayload("chat:2")).toBe(true);

    replaceRuntimeBadges({ chat: 2 });

    expect({ ...runtimeBadges }).toEqual({ chat: 2 });
  });
});
