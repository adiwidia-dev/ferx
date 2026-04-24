type ServiceRuntimeService = {
  id: string;
  url: string;
  storageKey: string;
  disabled?: boolean;
  notificationPrefs: {
    showBadge?: boolean;
    affectTray?: boolean;
    allowNotifications: boolean;
  };
};

export function createServiceLoadPayload(
  service: ServiceRuntimeService,
  spellCheckEnabled: boolean,
  resourceUsageMonitoringEnabled = false,
) {
  const badgeMonitoringEnabled =
    service.notificationPrefs.showBadge !== false ||
    service.notificationPrefs.affectTray !== false;

  return {
    id: service.id,
    url: service.url,
    storageKey: service.storageKey,
    allowNotifications: service.notificationPrefs.allowNotifications,
    badgeMonitoringEnabled,
    spellCheckEnabled,
    resourceUsageMonitoringEnabled,
  };
}

export function createDeletePayload(service: Pick<ServiceRuntimeService, "id" | "storageKey">) {
  return {
    id: service.id,
    storageKey: service.storageKey,
  };
}

export function shouldPreloadService(
  service: Pick<ServiceRuntimeService, "id" | "disabled">,
  activeId: string,
) {
  return !service.disabled && service.id !== activeId;
}
