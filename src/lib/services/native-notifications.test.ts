import { describe, expect, it } from "vitest";

import {
  buildNativeUnreadNotification,
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
