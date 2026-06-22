import type { NotificationPrefs } from "./notification-prefs";

export type NativeNotificationService = {
  id: string;
  name: string;
  disabled?: boolean;
  hibernated?: boolean;
  notificationPrefs: Pick<NotificationPrefs, "showNativeNotifications">;
};

export type NativeUnreadNotification = {
  title: string;
  body: string;
  icon: string;
  tag: string;
  data: { serviceId: string };
};

export function shouldSendNativeUnreadNotification({
  service,
  previousBadge,
  nextBadge,
  dndEnabled,
}: {
  service: NativeNotificationService;
  previousBadge: number | undefined;
  nextBadge: number | undefined;
  dndEnabled: boolean;
}) {
  if (dndEnabled || service.disabled || service.hibernated) return false;
  if (!service.notificationPrefs.showNativeNotifications) return false;
  if (previousBadge === undefined || previousBadge < 0) return false;
  if (nextBadge === undefined || nextBadge <= 0) return false;
  return nextBadge > previousBadge;
}

export function buildNativeUnreadNotification(
  service: Pick<NativeNotificationService, "id" | "name">,
  unreadCount: number,
): NativeUnreadNotification {
  const noun = unreadCount === 1 ? "message" : "messages";
  return {
    title: `New message in ${service.name}`,
    body: `${service.name} has ${unreadCount} unread ${noun}.`,
    icon: "/app-icon.png",
    tag: `ferx:${service.id}:unread`,
    data: { serviceId: service.id },
  };
}
