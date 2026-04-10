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
          storageKey: "storage-11111111",
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
