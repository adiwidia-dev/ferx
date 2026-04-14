import { describe, expect, it } from "vitest";

import {
  DEFAULT_NOTIFICATION_PREFS,
  countTrayRelevantUnreadServices,
  ensureServiceNotificationPrefs,
} from "./notification-prefs";

describe("DEFAULT_NOTIFICATION_PREFS", () => {
  it("enables all notification controls by default", () => {
    expect(DEFAULT_NOTIFICATION_PREFS).toEqual({
      showBadge: true,
      affectTray: true,
      allowNotifications: true,
    });
  });
});

describe("ensureServiceNotificationPrefs", () => {
  it("backfills missing notificationPrefs", () => {
    const result = ensureServiceNotificationPrefs([
      {
        id: "one",
        name: "Slack",
        url: "https://slack.com",
        storageKey: "storage-one",
      },
    ]);

    expect(result.changed).toBe(true);
    expect(result.services[0].notificationPrefs).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it("backfills missing fields in existing notificationPrefs", () => {
    const result = ensureServiceNotificationPrefs([
      {
        id: "one",
        name: "Slack",
        url: "https://slack.com",
        storageKey: "storage-one",
        notificationPrefs: {
          showBadge: false,
        } as any,
      },
    ]);

    expect(result.changed).toBe(true);
    expect(result.services[0].notificationPrefs).toEqual({
      showBadge: false,
      affectTray: true,
      allowNotifications: true,
    });
  });

  it("backfills defaults without changing unrelated service fields", () => {
    const result = ensureServiceNotificationPrefs([
      {
        id: "one",
        name: "Slack",
        url: "https://slack.com",
        storageKey: "storage-one",
        badge: 7,
        disabled: true,
      },
    ]);

    expect(result.services[0]).toEqual({
      id: "one",
      name: "Slack",
      url: "https://slack.com",
      storageKey: "storage-one",
      badge: 7,
      disabled: true,
      notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
    });
  });

  it("preserves existing notificationPrefs", () => {
    const result = ensureServiceNotificationPrefs([
      {
        id: "one",
        name: "Slack",
        url: "https://slack.com",
        storageKey: "storage-one",
        notificationPrefs: {
          showBadge: false,
          affectTray: true,
          allowNotifications: false,
        },
      },
    ]);

    expect(result.changed).toBe(false);
    expect(result.services[0].notificationPrefs).toEqual({
      showBadge: false,
      affectTray: true,
      allowNotifications: false,
    });
  });
});

describe("countTrayRelevantUnreadServices", () => {
  it("counts only services whose unread state should affect the tray", () => {
    const count = countTrayRelevantUnreadServices([
      {
        id: "one",
        name: "Slack",
        url: "https://slack.com",
        storageKey: "storage-one",
        badge: 3,
        notificationPrefs: {
          showBadge: true,
          affectTray: true,
          allowNotifications: true,
        },
      },
      {
        id: "two",
        name: "Teams",
        url: "https://teams.microsoft.com",
        storageKey: "storage-two",
        badge: 5,
        notificationPrefs: {
          showBadge: true,
          affectTray: false,
          allowNotifications: true,
        },
      },
    ]);

    expect(count).toBe(1);
  });

  it("excludes disabled services from the tray count", () => {
    const count = countTrayRelevantUnreadServices([
      {
        id: "one",
        name: "Slack",
        url: "https://slack.com",
        storageKey: "storage-one",
        badge: 3,
        disabled: true,
        notificationPrefs: {
          showBadge: true,
          affectTray: true,
          allowNotifications: true,
        },
      },
    ]);

    expect(count).toBe(0);
  });
});
