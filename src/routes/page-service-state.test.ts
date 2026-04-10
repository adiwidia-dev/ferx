import { describe, expect, it, vi } from "vitest";

import { DEFAULT_NOTIFICATION_PREFS } from "$lib/services/notification-prefs";
import {
  cleanupPageListeners,
  readStartupState,
  saveServiceState,
  toggleServiceDisabled,
  type PageService,
} from "./+page.svelte";

function createService(overrides: Partial<PageService> = {}): PageService {
  return {
    id: overrides.id ?? "service-1",
    name: overrides.name ?? "Slack",
    url: overrides.url ?? "https://slack.com/app",
    storageKey: overrides.storageKey ?? "storage-service-1",
    notificationPrefs: overrides.notificationPrefs ?? {
      ...DEFAULT_NOTIFICATION_PREFS,
    },
    disabled: overrides.disabled,
    badge: overrides.badge,
  };
}

describe("readStartupState", () => {
  it("shows a reset toast when recovering from corrupted storage", () => {
    expect(readStartupState("{")).toEqual({
      services: [],
      activeId: "",
      toastMessage: "Saved services were reset.",
    });
  });

  it("activates the first enabled stored service", () => {
    const saved = JSON.stringify([
      createService({ id: "disabled", disabled: true }),
      createService({ id: "enabled", disabled: false, storageKey: "storage-enabled" }),
    ]);

    expect(readStartupState(saved)).toMatchObject({
      activeId: "enabled",
      toastMessage: "",
    });
  });
});

describe("saveServiceState", () => {
  it("rejects invalid URLs without mutating services", () => {
    const services = [createService()];

    expect(
      saveServiceState({
        services,
        activeId: services[0].id,
        editingServiceId: null,
        newServiceName: "Broken",
        newServiceUrl: "https://exa mple.com",
        createServiceId: () => "new-service",
      }),
    ).toEqual({
      services,
      activeId: services[0].id,
      toastMessage: "Please enter a valid service URL.",
      shouldCloseModal: false,
    });
  });

  it("normalizes new service URLs and loads the new service", () => {
    const services = [createService()];

    expect(
      saveServiceState({
        services,
        activeId: services[0].id,
        editingServiceId: null,
        newServiceName: "Docs",
        newServiceUrl: " docs.example.com ",
        createServiceId: () => "docs",
      }),
    ).toEqual({
      services: [
        services[0],
        {
          id: "docs",
          name: "Docs",
          url: "https://docs.example.com/",
          storageKey: expect.any(String),
          notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
        },
      ],
      activeId: "docs",
      toastMessage: "",
      shouldCloseModal: true,
      loadService: {
        id: "docs",
        name: "Docs",
        url: "https://docs.example.com/",
        storageKey: expect.any(String),
        notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
      },
    });
  });

  it("preserves storage keys and unloads the old webview when an edited URL changes", () => {
    const services = [
      createService({
        id: "service-1",
        name: "Slack",
        url: "https://slack.com/app",
        storageKey: "storage-service-1",
      }),
    ];

    expect(
      saveServiceState({
        services,
        activeId: "service-1",
        editingServiceId: "service-1",
        newServiceName: "Slack HQ",
        newServiceUrl: "https://app.slack.com/client",
        createServiceId: () => "unused",
      }),
    ).toEqual({
      services: [
        {
          ...services[0],
          name: "Slack HQ",
          url: "https://app.slack.com/client",
        },
      ],
      activeId: "service-1",
      toastMessage: "",
      shouldCloseModal: true,
      deleteWebview: {
        id: "service-1",
        storageKey: "storage-service-1",
      },
    });
  });
});

describe("toggleServiceDisabled", () => {
  it("unloads an active service immediately and switches to the next enabled service", () => {
    const services = [
      createService({ id: "one", storageKey: "storage-one" }),
      createService({ id: "two", storageKey: "storage-two", disabled: true }),
      createService({ id: "three", storageKey: "storage-three" }),
    ];

    expect(toggleServiceDisabled(services, "one", "one")).toEqual({
      services: [
        { ...services[0], disabled: true },
        services[1],
        services[2],
      ],
      activeId: "three",
      deleteWebview: {
        id: "one",
        storageKey: "storage-one",
      },
    });
  });

  it("re-enables a service without unloading any webview", () => {
    const services = [createService({ id: "one", disabled: true })];

    expect(toggleServiceDisabled(services, "", "one")).toEqual({
      services: [{ ...services[0], disabled: false }],
      activeId: "",
    });
  });
});

describe("cleanupPageListeners", () => {
  it("unsubscribes listeners and clears the pending toast timeout", async () => {
    const clearTimeoutImpl = vi.fn();
    const unlistenToast = vi.fn();
    const unlistenMenu = vi.fn();
    const toastTimeout = Symbol("timeout") as unknown as ReturnType<typeof setTimeout>;

    await cleanupPageListeners({
      unlistenToastPromise: Promise.resolve(unlistenToast),
      unlistenMenuPromise: Promise.resolve(unlistenMenu),
      unlistenBadgePromise: Promise.resolve(() => undefined),
      unlistenShortcutPromise: Promise.resolve(() => undefined),
      toastTimeout,
      clearTimeoutImpl,
    });

    expect(clearTimeoutImpl).toHaveBeenCalledWith(toastTimeout);
    expect(unlistenToast).toHaveBeenCalledTimes(1);
    expect(unlistenMenu).toHaveBeenCalledTimes(1);
  });
});
