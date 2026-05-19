// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { APP_SETTINGS_STORAGE_KEY } from "$lib/services/app-settings";
import { DEFAULT_NOTIFICATION_PREFS } from "$lib/services/notification-prefs";
import { TODO_NOTES_STORAGE_KEY } from "$lib/services/todos";
import {
  WORKSPACES_STATE_KEY,
  WORKSPACES_STATE_VERSION,
  type WorkspaceGroupsState,
} from "$lib/services/workspace-groups";

import {
  computeActivationKey,
  consumeOpenServiceParam,
  createDebouncedStorageWriter,
  createDisplayServicesProjector,
  MAX_BACKGROUND_PRELOADS,
  readWorkspacePageStartupState,
  registerFlushOnExit,
  scheduleCancellableTask,
} from "./workspace-page-lifecycle";
import type { PageService } from "$lib/services/workspace-state";

function createWorkspaceState(): WorkspaceGroupsState {
  return {
    version: WORKSPACES_STATE_VERSION,
    currentWorkspaceId: "default",
    workspaces: [
      {
        id: "default",
        name: "Default",
        serviceIds: ["youtube", "slack"],
        activeServiceId: "youtube",
        icon: "briefcase",
      },
    ],
    servicesById: {
      youtube: {
        id: "youtube",
        name: "YouTube Music",
        url: "https://music.youtube.com/",
        storageKey: "storage-youtube",
        notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
      },
      slack: {
        id: "slack",
        name: "Slack",
        url: "https://app.slack.com/client",
        storageKey: "storage-slack",
        notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
      },
    },
  };
}

describe("readWorkspacePageStartupState", () => {
  it("hydrates workspace state, app settings, todos, and honors the open service param", () => {
    const workspaceState = createWorkspaceState();

    const startup = readWorkspacePageStartupState({
      savedWorkspaceState: JSON.stringify(workspaceState),
      legacySavedServices: null,
      legacyActiveServiceId: null,
      savedAppSettings: JSON.stringify({
        spellCheckEnabled: false,
        resourceUsageMonitoringEnabled: true,
      }),
      savedTodoNotes: JSON.stringify([
        {
          id: "note-1",
          title: "Inbox",
          items: [],
          collapsed: false,
          completedCollapsed: false,
        },
      ]),
      openServiceId: "slack",
    });

    expect(startup.workspaceState.currentWorkspaceId).toBe("default");
    expect(startup.workspaceState.workspaces[0].activeServiceId).toBe("slack");
    expect(startup.spellCheckEnabled).toBe(false);
    expect(startup.resourceUsageMonitoringEnabled).toBe(true);
    expect(startup.todoNotes).toHaveLength(1);
    expect(startup.toastMessage).toBe("");
  });
});

describe("background service preloading", () => {
  it("allows all enabled inactive services to preload during startup", () => {
    expect(MAX_BACKGROUND_PRELOADS).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("consumeOpenServiceParam", () => {
  it("extracts the open service id and removes it from the query string", () => {
    expect(consumeOpenServiceParam("?open=slack&foo=bar")).toEqual({
      openServiceId: "slack",
      nextSearch: "foo=bar",
    });
  });

  it("returns the original query when no open param exists", () => {
    expect(consumeOpenServiceParam("?foo=bar")).toEqual({
      openServiceId: null,
      nextSearch: "foo=bar",
    });
  });
});

describe("createDebouncedStorageWriter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  it("writes only after the debounce delay and flushes immediately", () => {
    const writer = createDebouncedStorageWriter({
      storageKey: WORKSPACES_STATE_KEY,
      delayMs: 1200,
      serialize: (value: { id: string }) => JSON.stringify(value),
      getStorage: () => localStorage,
    });

    writer.schedule({ id: "first" });
    writer.schedule({ id: "second" });

    expect(localStorage.getItem(WORKSPACES_STATE_KEY)).toBeNull();

    vi.advanceTimersByTime(1199);
    expect(localStorage.getItem(WORKSPACES_STATE_KEY)).toBeNull();

    vi.advanceTimersByTime(1);
    expect(localStorage.getItem(WORKSPACES_STATE_KEY)).toBe('{"id":"second"}');

    writer.schedule({ id: "third" });
    writer.flush({ id: "fourth" });

    expect(localStorage.getItem(WORKSPACES_STATE_KEY)).toBe('{"id":"fourth"}');
  });
});

describe("scheduleCancellableTask", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("does not run a canceled task", async () => {
    const run = vi.fn();

    const cancel = scheduleCancellableTask({
      delayMs: 2000,
      run,
    });

    cancel();
    vi.advanceTimersByTime(2000);
    await Promise.resolve();

    expect(run).not.toHaveBeenCalled();
  });
});

describe("registerFlushOnExit", () => {
  it("flushes on hidden visibility and stops after cleanup", () => {
    const flush = vi.fn();
    const cleanup = registerFlushOnExit(flush);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(flush).toHaveBeenCalledTimes(1);

    cleanup();
    document.dispatchEvent(new Event("visibilitychange"));

    expect(flush).toHaveBeenCalledTimes(1);
  });
});

describe("startup storage keys", () => {
  it("uses the existing persisted storage keys", () => {
    expect(WORKSPACES_STATE_KEY).toBe("ferx-workspaces-state");
    expect(APP_SETTINGS_STORAGE_KEY).toBe("ferx-app-settings");
    expect(TODO_NOTES_STORAGE_KEY).toBe("ferx-todo-notes");
  });
});

describe("computeActivationKey", () => {
  const base = {
    shouldHide: false,
    activeServiceId: "slack",
    activeServiceUrl: "https://app.slack.com/client",
    activeServiceStorageKey: "storage-slack",
    spellCheckEnabled: true,
    resourceUsageMonitoringEnabled: false,
  };

  it("returns a stable 'hide' key whenever shouldHide is set, ignoring other fields", () => {
    expect(computeActivationKey({ ...base, shouldHide: true })).toBe("hide");
    expect(
      computeActivationKey({
        ...base,
        shouldHide: true,
        activeServiceId: "other",
        activeServiceUrl: "https://x.test/",
      }),
    ).toBe("hide");
  });

  it("returns 'none' when not hiding and there is no active service", () => {
    expect(computeActivationKey({ ...base, activeServiceId: "" })).toBe("none");
  });

  it("changes when the active service id changes", () => {
    expect(computeActivationKey(base)).not.toBe(
      computeActivationKey({ ...base, activeServiceId: "youtube" }),
    );
  });

  it("changes when the active service URL changes (active-service edit case)", () => {
    expect(computeActivationKey(base)).not.toBe(
      computeActivationKey({ ...base, activeServiceUrl: "https://app.slack.com/client/T2" }),
    );
  });

  it("changes when the active service storageKey changes", () => {
    expect(computeActivationKey(base)).not.toBe(
      computeActivationKey({ ...base, activeServiceStorageKey: "storage-slack-2" }),
    );
  });

  it("changes when spellCheckEnabled or resourceUsageMonitoringEnabled changes", () => {
    expect(computeActivationKey(base)).not.toBe(
      computeActivationKey({ ...base, spellCheckEnabled: false }),
    );
    expect(computeActivationKey(base)).not.toBe(
      computeActivationKey({ ...base, resourceUsageMonitoringEnabled: true }),
    );
  });

  it("is stable when only notification-pref-like fields (not in inputs) would change", () => {
    expect(computeActivationKey(base)).toBe(computeActivationKey({ ...base }));
  });
});

describe("createDisplayServicesProjector", () => {
  const svc = (id: string, over: Partial<PageService> = {}): PageService => ({
    id,
    name: id,
    url: `https://${id}.test/`,
    storageKey: `storage-${id}`,
    notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
    ...over,
  });

  it("merges effective disabled + badge onto each service", () => {
    const project = createDisplayServicesProjector();
    const a = svc("a", { disabled: true });
    const out = project([svc("b"), a], false, { b: 3 });

    expect(out[0]).toMatchObject({ id: "b", disabled: undefined, badge: 3 });
    expect(out[1]).toMatchObject({ id: "a", disabled: true, badge: undefined });
  });

  it("applies workspace-disabled to every service", () => {
    const project = createDisplayServicesProjector();
    const out = project([svc("a")], true, {});
    expect(out[0].disabled).toBe(true);
  });

  it("keeps the same object reference for services whose inputs are unchanged", () => {
    const project = createDisplayServicesProjector();
    const a = svc("a");
    const b = svc("b");

    const first = project([a, b], false, { a: 1 });
    const second = project([a, b], false, { a: 1 });

    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
  });

  it("returns a new object only for the service whose badge changed", () => {
    const project = createDisplayServicesProjector();
    const a = svc("a");
    const b = svc("b");

    const first = project([a, b], false, { a: 1 });
    const second = project([a, b], false, { a: 2 });

    expect(second[0]).not.toBe(first[0]); // a's badge changed
    expect(second[0].badge).toBe(2);
    expect(second[1]).toBe(first[1]); // b unchanged -> same ref
  });

  it("rebuilds when the workspace-disabled flag flips", () => {
    const project = createDisplayServicesProjector();
    const a = svc("a");
    const first = project([a], false, {});
    const second = project([a], true, {});
    expect(second[0]).not.toBe(first[0]);
    expect(second[0].disabled).toBe(true);
  });

  it("rebuilds when the source service object identity changes", () => {
    const project = createDisplayServicesProjector();
    const first = project([svc("a")], false, {});
    const second = project([svc("a")], false, {});
    expect(second[0]).not.toBe(first[0]);
  });

  it("does not leak removed services (re-adding rebuilds)", () => {
    const project = createDisplayServicesProjector();
    const a = svc("a");
    const first = project([a], false, {});
    project([], false, {}); // a removed
    const third = project([a], false, {});
    expect(third[0]).not.toBe(first[0]);
  });
});
