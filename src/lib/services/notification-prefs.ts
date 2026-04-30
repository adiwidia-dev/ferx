export interface NotificationPrefs {
  showBadge: boolean;
  affectTray: boolean;
  muteAudio: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  showBadge: true,
  affectTray: true,
  muteAudio: false,
};

type LegacyNotificationPrefs = Partial<NotificationPrefs> & {
  allowNotifications?: boolean;
};

type ServiceWithOptionalNotificationPrefs = {
  id: string;
  name: string;
  url: string;
  storageKey: string;
  disabled?: boolean;
  badge?: number;
  notificationPrefs?: LegacyNotificationPrefs;
};

type ServiceWithNotificationPrefs = ServiceWithOptionalNotificationPrefs & {
  notificationPrefs: NotificationPrefs;
};

function hasOwn(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeNotificationPrefs(notificationPrefs?: LegacyNotificationPrefs): {
  notificationPrefs: NotificationPrefs;
  changed: boolean;
} {
  const legacyHasAllowNotifications =
    !!notificationPrefs && hasOwn(notificationPrefs, "allowNotifications");
  const hasMuteAudio = !!notificationPrefs && hasOwn(notificationPrefs, "muteAudio");
  const migratedMuteAudio =
    hasMuteAudio
      ? notificationPrefs.muteAudio
      : legacyHasAllowNotifications
        ? !notificationPrefs.allowNotifications
        : DEFAULT_NOTIFICATION_PREFS.muteAudio;

  return {
    notificationPrefs: {
      showBadge: notificationPrefs?.showBadge ?? DEFAULT_NOTIFICATION_PREFS.showBadge,
      affectTray: notificationPrefs?.affectTray ?? DEFAULT_NOTIFICATION_PREFS.affectTray,
      muteAudio: migratedMuteAudio ?? DEFAULT_NOTIFICATION_PREFS.muteAudio,
    },
    changed:
      !notificationPrefs ||
      notificationPrefs.showBadge === undefined ||
      notificationPrefs.affectTray === undefined ||
      !hasMuteAudio ||
      legacyHasAllowNotifications,
  };
}

export function ensureServiceNotificationPrefs<T extends ServiceWithOptionalNotificationPrefs>(
  services: T[],
): {
  services: Array<T & ServiceWithNotificationPrefs>;
  changed: boolean;
} {
  let changed = false;

  return {
    services: services.map((service) => {
      const normalized = normalizeNotificationPrefs(service.notificationPrefs);

      if (!normalized.changed) {
        return service as T & ServiceWithNotificationPrefs;
      }

      changed = true;
      return {
        ...service,
        notificationPrefs: normalized.notificationPrefs,
      } as T & ServiceWithNotificationPrefs;
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
