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
  consumeOpenServiceParam,
  createDebouncedStorageWriter,
  readWorkspacePageStartupState,
  registerFlushOnExit,
  scheduleCancellableTask,
} from "./workspace-page-lifecycle";

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
