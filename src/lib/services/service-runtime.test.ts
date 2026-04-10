import { describe, expect, it } from "vitest";

import {
  createDeletePayload,
  createServiceLoadPayload,
  shouldPreloadService,
} from "./service-runtime";

function createService(overrides: {
  id?: string;
  url?: string;
  storageKey?: string;
  disabled?: boolean;
  allowNotifications?: boolean;
} = {}) {
  return {
    id: overrides.id ?? "service-1",
    url: overrides.url ?? "https://example.com/app",
    storageKey: overrides.storageKey ?? "storage-service-1",
    disabled: overrides.disabled,
    notificationPrefs: {
      allowNotifications: overrides.allowNotifications ?? true,
    },
  };
}

describe("createServiceLoadPayload", () => {
  it("returns the runtime load payload for a service", () => {
    expect(
      createServiceLoadPayload(
        createService({
          id: "docs",
          url: "https://docs.example.com/",
          storageKey: "storage-docs",
          allowNotifications: false,
        }),
      ),
    ).toEqual({
      id: "docs",
      url: "https://docs.example.com/",
      storageKey: "storage-docs",
      allowNotifications: false,
    });
  });
});

describe("createDeletePayload", () => {
  it("returns the runtime delete payload for a service", () => {
    expect(
      createDeletePayload(
        createService({ id: "chat", storageKey: "storage-chat" }),
      ),
    ).toEqual({
      id: "chat",
      storageKey: "storage-chat",
    });
  });
});

describe("shouldPreloadService", () => {
  it("skips the active service", () => {
    expect(shouldPreloadService(createService({ id: "active" }), "active")).toBe(false);
  });

  it("skips disabled services", () => {
    expect(shouldPreloadService(createService({ id: "disabled", disabled: true }), "other")).toBe(
      false,
    );
  });

  it("preloads enabled inactive services", () => {
    expect(shouldPreloadService(createService({ id: "docs" }), "active")).toBe(true);
  });
});
