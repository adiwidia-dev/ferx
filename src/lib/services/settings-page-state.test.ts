// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_NOTIFICATION_PREFS } from "$lib/services/notification-prefs";
import {
  APP_SETTINGS_STORAGE_KEY,
  type AppSettings,
} from "$lib/services/app-settings";
import { WORKSPACE_ACTIVE_ID_KEY } from "$lib/services/workspace-state";
import {
  pickWorkspaceColor,
  WORKSPACES_STATE_KEY,
  WORKSPACES_STATE_VERSION,
  type WorkspaceGroupsState,
} from "$lib/services/workspace-groups";

import {
  commitSettingsWorkspaceState,
  formatBytes,
  formatServiceCount,
  formatWorkspaceCount,
  readSettingsPageStartupState,
  resolveSettingsServiceRoute,
  scheduleSettingsWorkspaceReload,
  serviceHostname,
  sharedServiceCount,
} from "./settings-page-state";

function createWorkspaceState(): WorkspaceGroupsState {
  return {
    version: WORKSPACES_STATE_VERSION,
    currentWorkspaceId: "default",
    workspaces: [
      {
        id: "default",
        name: "Default",
        serviceIds: ["mail", "disabled"],
        activeServiceId: "mail",
        icon: "briefcase",
      },
    ],
    servicesById: {
      mail: {
        id: "mail",
        name: "Mail",
        url: "https://mail.example.com/",
        storageKey: "storage-mail",
        notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
      },
      disabled: {
        id: "disabled",
        name: "Disabled",
        url: "https://disabled.example.com/",
        storageKey: "storage-disabled",
        notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
        disabled: true,
      },
    },
  };
}

describe("readSettingsPageStartupState", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("hydrates workspace and app settings from existing storage", () => {
    const workspaceState = createWorkspaceState();
    const appSettings: AppSettings = {
      spellCheckEnabled: false,
      resourceUsageMonitoringEnabled: true,
    };

    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(workspaceState));
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(appSettings));

    expect(readSettingsPageStartupState(localStorage)).toEqual({
      workspaceState,
      spellCheckEnabled: false,
      resourceUsageMonitoringEnabled: true,
      initialSpellCheckEnabled: false,
    });
  });
});

describe("commitSettingsWorkspaceState", () => {
  it("persists workspace state to the current storage key", () => {
    const nextState = createWorkspaceState();

    commitSettingsWorkspaceState(localStorage, nextState);

    expect(JSON.parse(localStorage.getItem(WORKSPACES_STATE_KEY) ?? "")).toEqual(nextState);
  });
});

describe("resolveSettingsServiceRoute", () => {
  it("routes enabled services back to the workspace page with an open param", () => {
    expect(resolveSettingsServiceRoute(createWorkspaceState(), "mail")).toBe("/?open=mail");
  });

  it("routes missing or disabled services back to the workspace root", () => {
    expect(resolveSettingsServiceRoute(createWorkspaceState(), "disabled")).toBe("/");
    expect(resolveSettingsServiceRoute(createWorkspaceState(), "missing")).toBe("/");
  });
});

describe("scheduleSettingsWorkspaceReload", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("redirects to the workspace page only in tauri contexts", () => {
    const replace = vi.fn();
    const location = {
      replace,
      href: "/settings",
    };
    const tauriWindow = {
      __TAURI_INTERNALS__: {},
      setTimeout: window.setTimeout.bind(window),
      location,
    } as unknown as Window & { __TAURI_INTERNALS__: unknown };

    scheduleSettingsWorkspaceReload(tauriWindow);
    vi.runAllTimers();

    expect(replace).toHaveBeenCalledWith("/");

    replace.mockReset();
    scheduleSettingsWorkspaceReload(window);
    vi.runAllTimers();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("settings page formatting helpers", () => {
  it("formats service and workspace counts with singular/plural labels", () => {
    expect(formatServiceCount(1)).toBe("1 service");
    expect(formatServiceCount(2)).toBe("2 services");
    expect(formatWorkspaceCount(1)).toBe("1 workspace");
    expect(formatWorkspaceCount(3)).toBe("3 workspaces");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });

  it("counts shared services and extracts service hostnames safely", () => {
    expect(sharedServiceCount(createWorkspaceState())).toBe(2);
    expect(serviceHostname("https://mail.example.com/app")).toBe("mail.example.com");
    expect(serviceHostname("not a url")).toBe("not a url");
  });

  it("keeps workspace colors on the existing palette rotation", () => {
    expect(pickWorkspaceColor(0)).toBe("#3B82F6");
    expect(pickWorkspaceColor(6)).toBe("#3B82F6");
  });
});
