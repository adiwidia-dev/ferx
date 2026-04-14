import { describe, expect, it } from "vitest";

import {
  getBadgeCapability,
  resolveBadgeStrategy,
  type BadgeStrategyKind,
} from "./badge-strategies";

describe("resolveBadgeStrategy", () => {
  it("resolves Outlook URLs to the outlook folder strategy", () => {
    expect(resolveBadgeStrategy("https://outlook.office.com/mail/")).toBe(
      "outlook-folder-dom",
    );
  });

  it("resolves outlook.live.com to the outlook folder strategy", () => {
    expect(resolveBadgeStrategy("https://outlook.live.com/mail/")).toBe(
      "outlook-folder-dom",
    );
  });

  it("resolves office.com to the outlook folder strategy", () => {
    expect(resolveBadgeStrategy("https://office.com/mail")).toBe(
      "outlook-folder-dom",
    );
    expect(resolveBadgeStrategy("https://www.office.com/mail")).toBe(
      "outlook-folder-dom",
    );
  });

  it("resolves Teams URLs to the title numeric strategy", () => {
    expect(resolveBadgeStrategy("https://teams.microsoft.com/v2/")).toBe(
      "teams-title",
    );
  });

  it("resolves Teams cloud URLs to the title numeric strategy", () => {
    expect(resolveBadgeStrategy("https://teams.cloud.microsoft/")).toBe(
      "teams-title",
    );
  });

  it("resolves WhatsApp URLs to the WhatsApp title strategy", () => {
    expect(resolveBadgeStrategy("https://web.whatsapp.com/")).toBe(
      "whatsapp-title",
    );
  });

  it("falls back conservatively for unknown services", () => {
    expect(resolveBadgeStrategy("https://example.com/app")).toBe("unsupported");
  });

  it("falls back to unsupported for malformed URLs", () => {
    expect(resolveBadgeStrategy("not a valid absolute url")).toBe("unsupported");
  });

  it("does not match unrelated hostnames that only contain service substrings", () => {
    expect(resolveBadgeStrategy("https://myoutlook-notifier.example.com")).toBe(
      "unsupported",
    );
    expect(resolveBadgeStrategy("https://backoffice.example.com")).toBe(
      "unsupported",
    );
    expect(resolveBadgeStrategy("https://teams.microsoft.com.evil.test")).toBe(
      "unsupported",
    );
    expect(resolveBadgeStrategy("https://fake-whatsapp.com.evil.test")).toBe(
      "unsupported",
    );
    expect(resolveBadgeStrategy("https://config.office.com")).toBe(
      "unsupported",
    );
  });
});

describe("getBadgeCapability", () => {
  it("marks unsupported services as conservative fallback only", () => {
    expect(getBadgeCapability("unsupported")).toEqual({
      kind: "unsupported" satisfies BadgeStrategyKind,
      usesMutationObserver: false,
      usesTitleObserver: false,
      usesFallbackPolling: false,
    });
  });

  it("marks Outlook as a DOM-targeted observer strategy", () => {
    expect(getBadgeCapability("outlook-folder-dom")).toEqual({
      kind: "dom-targeted" satisfies BadgeStrategyKind,
      usesMutationObserver: true,
      usesTitleObserver: true,
      usesFallbackPolling: false,
    });
  });
});
