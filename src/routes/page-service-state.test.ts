import { describe, expect, it, vi } from "vitest";

import { DEFAULT_NOTIFICATION_PREFS } from "$lib/services/notification-prefs";
import {
  applySaveServiceResult,
  cleanupPageListeners,
  readStartupState,
  saveServiceState,
  serializeServicesForStorage,
  toggleServiceDisabled,
  type PageService,
} from "$lib/services/workspace-state";

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

  it("repairs malformed stored storage keys before startup selection", () => {
    const randomUUID = vi.spyOn(crypto, "randomUUID");
    randomUUID.mockReturnValue("88888888-8888-8888-8888-888888888888");

    const saved = JSON.stringify([
      createService({
        id: "broken",
        disabled: false,
        storageKey: "storage/broken",
      }),
    ]);

    expect(readStartupState(saved)).toEqual({
      services: [
        {
          ...createService({
            id: "broken",
            disabled: false,
            storageKey: "storage/broken",
          }),
          storageKey: "storage-88888888",
          badge: undefined,
        },
      ],
      activeId: "broken",
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

  it("does not unload when a legacy stored URL normalizes to the same effective URL", () => {
    const services = [
      createService({
        id: "service-1",
        name: "Docs",
        url: "https://docs.example.com",
        storageKey: "storage-service-1",
      }),
    ];

    expect(
      saveServiceState({
        services,
        activeId: "service-1",
        editingServiceId: "service-1",
        newServiceName: "Docs",
        newServiceUrl: "https://docs.example.com/",
        createServiceId: () => "unused",
      }),
    ).toEqual({
      services: [
        {
          ...services[0],
          name: "Docs",
          url: "https://docs.example.com/",
        },
      ],
      activeId: "service-1",
      toastMessage: "",
      shouldCloseModal: true,
    });
  });

  it("recreates an active edited service after deleting the old webview", async () => {
    const services = [
      createService({
        id: "service-1",
        url: "https://slack.com/app",
        storageKey: "storage-service-1",
      }),
    ];
    const nextState = saveServiceState({
      services,
      activeId: "service-1",
      editingServiceId: "service-1",
      newServiceName: "Slack HQ",
      newServiceUrl: "https://app.slack.com/client",
      createServiceId: () => "unused",
    });

    const events: string[] = [];
    let currentOpenUrl = services[0].url;
    let runtimeState = {
      services,
      activeId: "service-1",
      isAddModalOpen: true,
    };

    await applySaveServiceResult({
      nextState,
      editingServiceId: "service-1",
      currentActiveId: runtimeState.activeId,
      showToast: () => undefined,
      setState: ({
        services,
        activeId,
        isAddModalOpen,
      }: {
        services: PageService[];
        activeId: string;
        isAddModalOpen: boolean;
      }) => {
        runtimeState = { services, activeId, isAddModalOpen };

        const activeService = runtimeState.services.find(
          (service) => service.id === runtimeState.activeId,
        );

        if (!runtimeState.isAddModalOpen && activeService && !activeService.disabled) {
          events.push(
            `open:${activeService.url}:existing=${currentOpenUrl || "none"}`,
          );

          if (!currentOpenUrl) {
            currentOpenUrl = activeService.url;
          }
        }
      },
      deleteWebview: async ({ id }: { id: string; storageKey: string }) => {
        events.push(`delete:${id}:${currentOpenUrl}`);
        currentOpenUrl = "";
      },
      loadService: async () => {
        events.push("load");
      },
    });

    expect(events).toEqual([
      "delete:service-1:https://slack.com/app",
      "open:https://app.slack.com/client:existing=none",
    ]);
    expect(currentOpenUrl).toBe("https://app.slack.com/client");
  });

  it("recreates an inactive edited service off-screen after deleting the old webview", async () => {
    const services = [
      createService({
        id: "active",
        url: "https://mail.example.com",
        storageKey: "storage-active",
      }),
      createService({
        id: "inactive",
        url: "https://chat.example.com",
        storageKey: "storage-inactive",
      }),
    ];
    const nextState = saveServiceState({
      services,
      activeId: "active",
      editingServiceId: "inactive",
      newServiceName: "Chat",
      newServiceUrl: "https://chat.example.com/inbox",
      createServiceId: () => "unused",
    });

    const events: string[] = [];
    let runtimeState = {
      services,
      activeId: "active",
      isAddModalOpen: true,
    };

    await applySaveServiceResult({
      nextState,
      editingServiceId: "inactive",
      currentActiveId: runtimeState.activeId,
      showToast: () => undefined,
      setState: ({
        services,
        activeId,
        isAddModalOpen,
      }: {
        services: PageService[];
        activeId: string;
        isAddModalOpen: boolean;
      }) => {
        runtimeState = { services, activeId, isAddModalOpen };
      },
      deleteWebview: async ({ id }: { id: string; storageKey: string }) => {
        events.push(`delete:${id}`);
      },
      loadService: async (service: PageService) => {
        events.push(`load:${service.id}:${service.url}`);
      },
    });

    expect(events).toEqual([
      "delete:inactive",
      "load:inactive:https://chat.example.com/inbox",
    ]);
  });

  it("does not reload a disabled edited service after deleting the old webview", async () => {
    const services = [
      createService({
        id: "active",
        url: "https://mail.example.com",
        storageKey: "storage-active",
      }),
      createService({
        id: "disabled",
        url: "https://chat.example.com",
        storageKey: "storage-disabled",
        disabled: true,
      }),
    ];
    const nextState = saveServiceState({
      services,
      activeId: "active",
      editingServiceId: "disabled",
      newServiceName: "Chat",
      newServiceUrl: "https://chat.example.com/inbox",
      createServiceId: () => "unused",
    });

    const events: string[] = [];

    await applySaveServiceResult({
      nextState,
      editingServiceId: "disabled",
      currentActiveId: "active",
      showToast: () => undefined,
      setState: () => undefined,
      deleteWebview: async ({ id }: { id: string; storageKey: string }) => {
        events.push(`delete:${id}`);
      },
      loadService: async (service: PageService) => {
        events.push(`load:${service.id}:${service.url}`);
      },
    });

    expect(events).toEqual(["delete:disabled"]);
  });
});

describe("serializeServicesForStorage", () => {
  it("strips runtime badge state before persisting services", () => {
    expect(
      serializeServicesForStorage([
        createService({
          id: "chat",
          badge: 9,
          disabled: true,
        }),
      ]),
    ).toBe(
      JSON.stringify([
        {
          ...createService({
            id: "chat",
            badge: 9,
            disabled: true,
          }),
          badge: undefined,
        },
      ]),
    );
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
