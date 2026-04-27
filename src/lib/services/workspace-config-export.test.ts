import { describe, expect, it } from "vitest";

import type { PageService } from "./workspace-state";
import { createDefaultWorkspaceGroupsState } from "./workspace-groups";
import {
  buildWorkspaceConfigExportPayload,
  serializeWorkspaceConfigExport,
} from "./workspace-config-export";

const services: PageService[] = [
  {
    id: "mail",
    name: "Mail",
    url: "https://mail.example.com/",
    storageKey: "storage-mail",
    badge: 4,
    notificationPrefs: {
      showBadge: true,
      affectTray: false,
      allowNotifications: true,
    },
  },
  {
    id: "chat",
    name: "Chat",
    url: "https://chat.example.com/",
    storageKey: "storage-chat",
    disabled: true,
    iconBgColor: "#123456",
    notificationPrefs: {
      showBadge: false,
      affectTray: true,
      allowNotifications: false,
    },
  },
];

describe("workspace config export", () => {
  it("builds a versioned config-only payload without runtime badges", () => {
    const payload = buildWorkspaceConfigExportPayload({
      workspaceState: createDefaultWorkspaceGroupsState(services, "mail"),
      appSettings: {
        spellCheckEnabled: false,
        resourceUsageMonitoringEnabled: true,
      },
      appVersion: "0.2.4",
      exportedAt: "2026-04-23T12:00:00.000Z",
    });

    expect(payload).toEqual({
      ferxExport: {
        format: "ferx-workspace-config",
        version: 2,
        exportedAt: "2026-04-23T12:00:00.000Z",
        appVersion: "0.2.4",
      },
      appSettings: {
        spellCheckEnabled: false,
        resourceUsageMonitoringEnabled: true,
      },
      workspaceState: expect.objectContaining({
        version: 1,
        currentWorkspaceId: "default",
        workspaces: [
          {
            id: "default",
            name: "Default",
            serviceIds: ["mail", "chat"],
            activeServiceId: "mail",
            color: "#3B82F6",
            icon: "briefcase",
          },
        ],
        servicesById: {
          mail: expect.not.objectContaining({ badge: 4 }),
          chat: expect.objectContaining({ disabled: true }),
        },
      }),
    });
  });

  it("preserves shared workspace service references", () => {
    const payload = buildWorkspaceConfigExportPayload({
      workspaceState: {
        ...createDefaultWorkspaceGroupsState(services, "mail"),
        workspaces: [
          {
            id: "work",
            name: "Work",
            serviceIds: ["mail", "chat"],
            activeServiceId: "mail",
          },
          {
            id: "personal",
            name: "Personal",
            serviceIds: ["mail"],
            activeServiceId: "mail",
          },
        ],
      },
      appSettings: {
        spellCheckEnabled: true,
        resourceUsageMonitoringEnabled: false,
      },
      appVersion: "0.2.4",
      exportedAt: "2026-04-23T12:00:00.000Z",
    });

    expect(payload.workspaceState.workspaces.map((workspace) => workspace.serviceIds)).toEqual([
      ["mail", "chat"],
      ["mail"],
    ]);
    expect(Object.keys(payload.workspaceState.servicesById)).toEqual(["mail", "chat"]);
  });

  it("serializes readable JSON", () => {
    const json = serializeWorkspaceConfigExport(
      buildWorkspaceConfigExportPayload({
        workspaceState: createDefaultWorkspaceGroupsState(),
        appSettings: {
          spellCheckEnabled: true,
          resourceUsageMonitoringEnabled: false,
        },
        appVersion: "0.2.4",
        exportedAt: "2026-04-23T12:00:00.000Z",
      }),
    );

    expect(json).toContain('\n  "ferxExport": {');
    expect(JSON.parse(json).ferxExport.version).toBe(2);
  });
});
