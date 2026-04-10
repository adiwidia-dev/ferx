import { describe, expect, it, vi } from "vitest";

import { DEFAULT_NOTIFICATION_PREFS } from "./notification-prefs";
import { normalizeServiceUrl, readStoredServices } from "./service-config";

describe("normalizeServiceUrl", () => {
  it("trims input, adds https, and returns a canonical URL", () => {
    expect(normalizeServiceUrl(" example.com/chat ")).toEqual({
      ok: true,
      url: "https://example.com/chat",
    });
  });

  it("preserves an explicit scheme and canonicalizes the URL", () => {
    expect(normalizeServiceUrl("HTTP://Example.com")).toEqual({
      ok: true,
      url: "http://example.com/",
    });
  });

  it("does not prepend https when a non-slash scheme is already present", () => {
    expect(normalizeServiceUrl("mailto:team@example.com")).toEqual({
      ok: true,
      url: "mailto:team@example.com",
    });
  });

  it("rejects malformed URLs", () => {
    expect(normalizeServiceUrl("https://exa mple.com")).toEqual({
      ok: false,
      message: "Please enter a valid service URL.",
    });
  });
});

describe("readStoredServices", () => {
  it("returns an empty list when nothing is stored", () => {
    expect(readStoredServices(null)).toEqual({
      services: [],
      recoveredFromCorruption: false,
    });
  });

  it("recovers from malformed JSON", () => {
    expect(readStoredServices("{")).toEqual({
      services: [],
      recoveredFromCorruption: true,
    });
  });

  it("treats valid non-array JSON as an empty service list", () => {
    expect(readStoredServices("{}")).toEqual({
      services: [],
      recoveredFromCorruption: false,
    });
  });

  it("ignores malformed array members and keeps valid service objects", () => {
    const randomUUID = vi.spyOn(crypto, "randomUUID");
    randomUUID.mockReturnValue("22222222-2222-2222-2222-222222222222");

    const result = readStoredServices(
      JSON.stringify([
        null,
        "bad-entry",
        42,
        {
          id: "one",
          name: "Slack",
          url: "https://slack.com",
        },
      ]),
    );

    expect(result).toEqual({
      services: [
        {
          id: "one",
          name: "Slack",
          url: "https://slack.com",
          storageKey: "storage-22222222",
          notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
        },
      ],
      recoveredFromCorruption: false,
    });
  });

  it("ignores entries whose optional fields have invalid runtime types", () => {
    const randomUUID = vi.spyOn(crypto, "randomUUID");
    randomUUID
      .mockReturnValueOnce("33333333-3333-3333-3333-333333333333")
      .mockReturnValueOnce("44444444-4444-4444-4444-444444444444")
      .mockReturnValueOnce("55555555-5555-5555-5555-555555555555")
      .mockReturnValueOnce("66666666-6666-6666-6666-666666666666");

    const result = readStoredServices(
      JSON.stringify([
        {
          id: "bad-storage-key",
          name: "Slack",
          url: "https://slack.com",
          storageKey: 123,
        },
        {
          id: "bad-disabled",
          name: "Teams",
          url: "https://teams.microsoft.com",
          disabled: "yes",
        },
        {
          id: "bad-badge",
          name: "Discord",
          url: "https://discord.com",
          badge: { count: 1 },
        },
        {
          id: "bad-prefs",
          name: "Linear",
          url: "https://linear.app",
          notificationPrefs: {
            showBadge: "true",
          },
        },
        {
          id: "one",
          name: "Slack",
          url: "https://slack.com",
        },
      ]),
    );

    expect(result).toEqual({
      services: [
        {
          id: "one",
          name: "Slack",
          url: "https://slack.com",
          storageKey: "storage-33333333",
          notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
        },
      ],
      recoveredFromCorruption: false,
    });
  });

  it("migrates stored services with missing storage keys and notification prefs", () => {
    const randomUUID = vi.spyOn(crypto, "randomUUID");
    randomUUID.mockReturnValue("11111111-1111-1111-1111-111111111111");

    const result = readStoredServices(
      JSON.stringify([
        {
          id: "one",
          name: "Slack",
          url: "https://slack.com",
        },
      ]),
    );

    expect(result).toEqual({
      services: [
        {
          id: "one",
          name: "Slack",
          url: "https://slack.com",
          storageKey: "storage-44444444",
          notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
        },
      ],
      recoveredFromCorruption: false,
    });
  });

  it("preserves valid stored services", () => {
    const saved = JSON.stringify([
      {
        id: "one",
        name: "Slack",
        url: "https://slack.com",
        storageKey: "storage-one",
        disabled: true,
        badge: 5,
        notificationPrefs: {
          showBadge: false,
          affectTray: true,
          allowNotifications: false,
        },
      },
    ]);

    expect(readStoredServices(saved)).toEqual({
      services: [
        {
          id: "one",
          name: "Slack",
          url: "https://slack.com",
          storageKey: "storage-one",
          disabled: true,
          badge: 5,
          notificationPrefs: {
            showBadge: false,
            affectTray: true,
            allowNotifications: false,
          },
        },
      ],
      recoveredFromCorruption: false,
    });
  });
});
