export interface NotificationPrefs {
  showBadge: boolean;
  affectTray: boolean;
  allowNotifications: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  showBadge: true,
  affectTray: true,
  allowNotifications: true,
};

type ServiceWithOptionalNotificationPrefs = {
  id: string;
  name: string;
  url: string;
  storageKey: string;
  disabled?: boolean;
  badge?: number;
  notificationPrefs?: Partial<NotificationPrefs>;
};

type ServiceWithNotificationPrefs = ServiceWithOptionalNotificationPrefs & {
  notificationPrefs: NotificationPrefs;
};

export function ensureServiceNotificationPrefs(
  services: ServiceWithOptionalNotificationPrefs[],
): {
  services: ServiceWithNotificationPrefs[];
  changed: boolean;
} {
  let changed = false;

  return {
    services: services.map((service) => {
      const notificationPrefs = {
        ...DEFAULT_NOTIFICATION_PREFS,
        ...service.notificationPrefs,
      };

      if (
        service.notificationPrefs &&
        service.notificationPrefs.showBadge !== undefined &&
        service.notificationPrefs.affectTray !== undefined &&
        service.notificationPrefs.allowNotifications !== undefined
      ) {
        return {
          ...service,
          notificationPrefs,
        } as ServiceWithNotificationPrefs;
      }

      changed = true;
      return {
        ...service,
        notificationPrefs,
      };
    }),
    changed,
  };
}

export function countTrayRelevantUnreadServices(
  services: ServiceWithNotificationPrefs[],
) {
  return services.filter(
    (service) =>
      !service.disabled &&
      service.notificationPrefs.affectTray &&
      !!service.badge &&
      service.badge !== 0,
  ).length;
}
