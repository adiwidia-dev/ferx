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

export type WebNotificationPreview = {
  serviceId: string;
  title: string;
  body: string;
  tag?: string;
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

export function parseNativeNotificationPreviewPayload(
  payload: unknown,
): WebNotificationPreview | null {
  if (!payload || typeof payload !== "object") return null;

  const candidate = payload as Record<string, unknown>;
  const serviceId = typeof candidate.serviceId === "string" ? candidate.serviceId : "";
  const title = typeof candidate.title === "string" ? candidate.title : "";
  const body = typeof candidate.body === "string" ? candidate.body : "";
  const tag = candidate.tag;

  if (!serviceId || (!title && !body)) return null;
  if (tag !== undefined && typeof tag !== "string") return null;

  return {
    serviceId,
    title,
    body,
    ...(tag ? { tag } : {}),
  };
}

export function shouldSendNativeNotificationPreview({
  service,
  dndEnabled,
}: {
  service: NativeNotificationService;
  dndEnabled: boolean;
}) {
  if (dndEnabled || service.disabled || service.hibernated) return false;
  return service.notificationPrefs.showNativeNotifications;
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

export function buildNativeNotificationPreview(
  service: Pick<NativeNotificationService, "id" | "name">,
  preview: WebNotificationPreview,
): NativeUnreadNotification {
  return {
    title: preview.title || `New message in ${service.name}`,
    body: preview.body || `Open ${service.name} to view the message.`,
    icon: "/app-icon.png",
    tag: `ferx:${service.id}:preview:${preview.tag || "latest"}`,
    data: { serviceId: service.id },
  };
}
