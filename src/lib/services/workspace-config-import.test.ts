// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  parseWorkspaceConfigImport,
  writeWorkspaceConfigImportToStorage,
} from "./workspace-config-import";
import { APP_SETTINGS_STORAGE_KEY } from "./app-settings";
import { DEFAULT_WORKSPACE_ID, WORKSPACES_STATE_KEY } from "./workspace-groups";

const validFile = {
  ferxExport: {
    format: "ferx-workspace-config",
    version: 1,
    exportedAt: "2026-04-23T12:00:00.000Z",
    appVersion: "0.2.4",
  },
  appSettings: {
    spellCheckEnabled: false,
    futureSetting: "ignored",
  },
  services: [
    {
      id: "mail",
      name: "  Mail  ",
      url: "mail.example.com",
      storageKey: "storage-mail",
      badge: 99,
      notificationPrefs: {
        showBadge: false,
      },
    },
  ],
  activeServiceId: "mail",
};

describe("workspace config import", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("accepts a minimal valid v1 export and normalizes services", () => {
    const result = parseWorkspaceConfigImport(JSON.stringify(validFile));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.appSettings).toEqual({
      spellCheckEnabled: false,
      resourceUsageMonitoringEnabled: false,
    });
    expect(result.value.workspaceState.currentWorkspaceId).toBe(DEFAULT_WORKSPACE_ID);
    expect(result.value.workspaceState.workspaces[0]).toMatchObject({
      id: DEFAULT_WORKSPACE_ID,
      name: "Default",
      serviceIds: ["mail"],
      activeServiceId: "mail",
    });
    expect(result.value.workspaceState.servicesById.mail).toEqual({
      id: "mail",
      name: "Mail",
      url: "https://mail.example.com/",
      storageKey: "storage-mail",
      notificationPrefs: {
        showBadge: false,
        affectTray: true,
        allowNotifications: true,
      },
    });
  });

  it("rejects invalid JSON before changing storage", () => {
    const result = parseWorkspaceConfigImport("{bad json");

    expect(result).toEqual({
      ok: false,
      message: "File is not valid JSON.",
    });
  });

  it("rejects files with the wrong format", () => {
    const result = parseWorkspaceConfigImport(
      JSON.stringify({
        ...validFile,
        ferxExport: { ...validFile.ferxExport, format: "other" },
      }),
    );

    expect(result).toEqual({
      ok: false,
      message: "This is not a Ferx configuration export.",
    });
  });

  it("rejects files created by newer format versions", () => {
    const result = parseWorkspaceConfigImport(
      JSON.stringify({
        ...validFile,
        ferxExport: { ...validFile.ferxExport, version: 3 },
      }),
    );

    expect(result).toEqual({
      ok: false,
      message: "This file was created by a newer Ferx. Please update Ferx.",
    });
  });

  it("rejects duplicate service ids", () => {
    const result = parseWorkspaceConfigImport(
      JSON.stringify({
        ...validFile,
        services: [
          validFile.services[0],
          {
            ...validFile.services[0],
            name: "Duplicate",
          },
        ],
      }),
    );

    expect(result).toEqual({
      ok: false,
      message: 'Import contains duplicate service id "mail".',
    });
  });

  it("rejects invalid service URLs", () => {
    const result = parseWorkspaceConfigImport(
      JSON.stringify({
        ...validFile,
        services: [
          {
            ...validFile.services[0],
            url: "notaurl://example.com",
          },
        ],
      }),
    );

    expect(result).toEqual({
      ok: false,
      message: 'Service "Mail" has an invalid URL.',
    });
  });

  it("regenerates invalid or colliding storage keys", () => {
    const randomUUID = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222");

    const result = parseWorkspaceConfigImport(
      JSON.stringify({
        ...validFile,
        services: [
          {
            id: "one",
            name: "One",
            url: "https://one.example.com",
            storageKey: "bad key",
          },
          {
            id: "two",
            name: "Two",
            url: "https://two.example.com",
            storageKey: "storage-one",
          },
          {
            id: "three",
            name: "Three",
            url: "https://three.example.com",
            storageKey: "storage-one",
          },
        ],
      }),
    );

    randomUUID.mockRestore();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(Object.values(result.value.workspaceState.servicesById).map((service) => service.storageKey)).toEqual([
      "storage-11111111",
      "storage-one",
      "storage-22222222",
    ]);
  });

  it("ignores active service ids that are missing or disabled", () => {
    const result = parseWorkspaceConfigImport(
      JSON.stringify({
        ...validFile,
        services: [{ ...validFile.services[0], disabled: true }],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.workspaceState.workspaces[0].activeServiceId).toBe("");
  });

  it("accepts a valid v2 workspace export", () => {
    const result = parseWorkspaceConfigImport(
      JSON.stringify({
        ferxExport: {
          format: "ferx-workspace-config",
          version: 2,
          exportedAt: "2026-04-23T12:00:00.000Z",
          appVersion: "0.2.4",
        },
        appSettings: {
          spellCheckEnabled: true,
          resourceUsageMonitoringEnabled: true,
        },
        workspaceState: {
          version: 1,
          currentWorkspaceId: "work",
          workspaces: [
            {
              id: "work",
              name: "Work",
              serviceIds: ["mail"],
              activeServiceId: "mail",
              icon: "building-2",
            },
            {
              id: "personal",
              name: "Personal",
              serviceIds: ["mail"],
              activeServiceId: "mail",
              icon: "unknown-icon",
            },
          ],
          servicesById: {
            mail: {
              id: "mail",
              name: "Mail",
              url: "mail.example.com",
              storageKey: "storage-mail",
            },
          },
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.workspaceState.currentWorkspaceId).toBe("work");
    expect(result.value.workspaceState.workspaces.map((workspace) => workspace.icon)).toEqual([
      "building-2",
      "briefcase",
    ]);
    expect(result.value.workspaceState.workspaces.map((workspace) => workspace.serviceIds)).toEqual([
      ["mail"],
      ["mail"],
    ]);
    expect(result.value.workspaceState.servicesById.mail.url).toBe("https://mail.example.com/");
  });

  it("writes validated import data transactionally to localStorage", () => {
    const result = parseWorkspaceConfigImport(JSON.stringify(validFile));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    writeWorkspaceConfigImportToStorage(result.value, localStorage);

    expect(localStorage.getItem(APP_SETTINGS_STORAGE_KEY)).toBe(
      '{"spellCheckEnabled":false,"resourceUsageMonitoringEnabled":false}',
    );
    expect(localStorage.getItem("ferx-workspace-active-id")).toBeNull();
    expect(localStorage.getItem("ferx-workspace-services")).toBeNull();
    expect(JSON.parse(localStorage.getItem(WORKSPACES_STATE_KEY) ?? "")).toMatchObject({
      currentWorkspaceId: DEFAULT_WORKSPACE_ID,
      servicesById: {
        mail: {
          id: "mail",
          name: "Mail",
          url: "https://mail.example.com/",
          storageKey: "storage-mail",
        },
      },
    });
  });
});
