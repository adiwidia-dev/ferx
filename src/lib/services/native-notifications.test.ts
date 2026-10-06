import { describe, expect, it } from "vitest";

import {
  buildNativeNotificationPreview,
  buildNativeUnreadNotification,
  parseNativeNotificationPreviewPayload,
  shouldSendNativeNotificationPreview,
  shouldSendNativeUnreadNotification,
} from "./native-notifications";

function service(overrides: {
  id?: string;
  name?: string;
  disabled?: boolean;
  hibernated?: boolean;
  showNativeNotifications?: boolean;
} = {}) {
  return {
    id: overrides.id ?? "chat",
    name: overrides.name ?? "Chat",
    disabled: overrides.disabled,
    hibernated: overrides.hibernated,
    notificationPrefs: {
      showNativeNotifications: overrides.showNativeNotifications ?? true,
    },
  };
}

describe("shouldSendNativeUnreadNotification", () => {
  it("notifies when a known unread count increases", () => {
    expect(
      shouldSendNativeUnreadNotification({
        service: service(),
        previousBadge: 2,
        nextBadge: 3,
        dndEnabled: false,
      }),
    ).toBe(true);
  });

  it("notifies when a known clear state becomes unread", () => {
    expect(
      shouldSendNativeUnreadNotification({
        service: service(),
        previousBadge: 0,
        nextBadge: 1,
        dndEnabled: false,
      }),
    ).toBe(true);
  });

  it("does not notify for the first positive badge report after startup", () => {
    expect(
      shouldSendNativeUnreadNotification({
        service: service(),
        previousBadge: undefined,
        nextBadge: 4,
        dndEnabled: false,
      }),
    ).toBe(false);
  });

  it("does not notify when DND or native notifications are disabled", () => {
    expect(
      shouldSendNativeUnreadNotification({
        service: service(),
        previousBadge: 0,
        nextBadge: 1,
        dndEnabled: true,
      }),
    ).toBe(false);
    expect(
      shouldSendNativeUnreadNotification({
        service: service({ showNativeNotifications: false }),
        previousBadge: 0,
        nextBadge: 1,
        dndEnabled: false,
      }),
    ).toBe(false);
  });

  it("does not notify for disabled, hibernated, unknown, clear, or decreased counts", () => {
    for (const input of [
      { service: service({ disabled: true }), previousBadge: 0, nextBadge: 1 },
      { service: service({ hibernated: true }), previousBadge: 0, nextBadge: 1 },
      { service: service(), previousBadge: 0, nextBadge: -1 },
      { service: service(), previousBadge: 1, nextBadge: 0 },
      { service: service(), previousBadge: 5, nextBadge: 3 },
      { service: service(), previousBadge: 3, nextBadge: 3 },
    ]) {
      expect(
        shouldSendNativeUnreadNotification({
          ...input,
          dndEnabled: false,
        }),
      ).toBe(false);
    }
  });
});

describe("buildNativeUnreadNotification", () => {
  it("creates stable notification content for a service unread count", () => {
    expect(buildNativeUnreadNotification(service({ id: "teams", name: "Teams" }), 3)).toEqual({
      title: "New message in Teams",
      body: "Teams has 3 unread messages.",
      icon: "/app-icon.png",
      tag: "ferx:teams:unread",
      data: { serviceId: "teams" },
    });
  });

  it("uses singular copy for one unread message", () => {
    expect(buildNativeUnreadNotification(service({ name: "WhatsApp" }), 1).body).toBe(
      "WhatsApp has 1 unread message.",
    );
  });
});

describe("parseNativeNotificationPreviewPayload", () => {
  it("accepts valid preview event payloads", () => {
    expect(
      parseNativeNotificationPreviewPayload({
        serviceId: "messenger",
        title: "Jane Doe",
        body: "Can you check this?",
        tag: "thread-123",
      }),
    ).toEqual({
      serviceId: "messenger",
      title: "Jane Doe",
      body: "Can you check this?",
      tag: "thread-123",
    });
  });

  it("rejects malformed or empty preview payloads", () => {
    expect(parseNativeNotificationPreviewPayload(null)).toBeNull();
    expect(parseNativeNotificationPreviewPayload({ serviceId: "", title: "Jane", body: "" })).toBeNull();
    expect(parseNativeNotificationPreviewPayload({ serviceId: "messenger", title: "", body: "" })).toBeNull();
    expect(
      parseNativeNotificationPreviewPayload({
        serviceId: "messenger",
        title: "Jane",
        body: "",
        tag: 42,
      }),
    ).toBeNull();
  });
});

describe("shouldSendNativeNotificationPreview", () => {
  it("sends previews when service native notifications are enabled", () => {
    expect(
      shouldSendNativeNotificationPreview({
        service: service(),
        dndEnabled: false,
      }),
    ).toBe(true);
  });

  it("does not send previews when blocked by DND or service state", () => {
    for (const input of [
      { service: service(), dndEnabled: true },
      { service: service({ disabled: true }), dndEnabled: false },
      { service: service({ hibernated: true }), dndEnabled: false },
      { service: service({ showNativeNotifications: false }), dndEnabled: false },
    ]) {
      expect(shouldSendNativeNotificationPreview(input)).toBe(false);
    }
  });
});

describe("buildNativeNotificationPreview", () => {
  it("uses web notification title and body for native preview content", () => {
    expect(
      buildNativeNotificationPreview(service({ id: "messenger", name: "Messenger" }), {
        serviceId: "messenger",
        title: "Jane Doe",
        body: "Can you check this?",
        tag: "thread-123",
      }),
    ).toEqual({
      title: "Jane Doe",
      body: "Can you check this?",
      icon: "/app-icon.png",
      tag: "ferx:messenger:preview:thread-123",
      data: { serviceId: "messenger" },
    });
  });

  it("falls back to service copy when preview title or body is missing", () => {
    expect(
      buildNativeNotificationPreview(service({ id: "chat", name: "Chat" }), {
        serviceId: "chat",
        title: "",
        body: "New encrypted message",
      }),
    ).toMatchObject({
      title: "New message in Chat",
      body: "New encrypted message",
      tag: "ferx:chat:preview:latest",
    });
    expect(
      buildNativeNotificationPreview(service({ id: "chat", name: "Chat" }), {
        serviceId: "chat",
        title: "Chat",
        body: "",
      }).body,
    ).toBe("Open Chat to view the message.");
  });
});
