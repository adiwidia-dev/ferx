import { describe, expect, it } from "vitest";

import type { PageService } from "./workspace-state";
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
      services,
      appSettings: { spellCheckEnabled: false },
      activeId: "mail",
      appVersion: "0.2.4",
      exportedAt: "2026-04-23T12:00:00.000Z",
    });

    expect(payload).toEqual({
      ferxExport: {
        format: "ferx-workspace-config",
        version: 1,
        exportedAt: "2026-04-23T12:00:00.000Z",
        appVersion: "0.2.4",
      },
      appSettings: {
        spellCheckEnabled: false,
      },
      services: [
        {
          id: "mail",
          name: "Mail",
          url: "https://mail.example.com/",
          storageKey: "storage-mail",
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
      ],
      activeServiceId: "mail",
    });
  });

  it("omits duplicate service ids and ignores disabled active service ids", () => {
    const payload = buildWorkspaceConfigExportPayload({
      services: [services[0], { ...services[0], name: "Duplicate" }, services[1]],
      appSettings: { spellCheckEnabled: true },
      activeId: "chat",
      appVersion: "0.2.4",
      exportedAt: "2026-04-23T12:00:00.000Z",
    });

    expect(payload.services.map((service) => service.name)).toEqual(["Mail", "Chat"]);
    expect(payload.activeServiceId).toBeNull();
  });

  it("serializes readable JSON", () => {
    const json = serializeWorkspaceConfigExport(
      buildWorkspaceConfigExportPayload({
        services: [],
        appSettings: { spellCheckEnabled: true },
        activeId: "",
        appVersion: "0.2.4",
        exportedAt: "2026-04-23T12:00:00.000Z",
      }),
    );

    expect(json).toContain('\n  "ferxExport": {');
    expect(JSON.parse(json).ferxExport.version).toBe(1);
  });
});
