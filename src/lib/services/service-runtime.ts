export type ServiceWebviewService = {
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

export type ServiceWebviewCommandPayload = {
  id: string;
  url: string;
  storageKey: string;
  allowNotifications: boolean;
  badgeMonitoringEnabled: boolean;
  spellCheckEnabled: boolean;
  resourceUsageMonitoringEnabled: boolean;
};

export type DeleteWebviewPayload = {
  id: string;
  storageKey: string;
};

export type WebviewIdPayload = {
  id: string;
};

export type RightPanelWidthPayload = {
  width: number;
};

export function createServiceWebviewPayload(
  service: ServiceWebviewService,
  spellCheckEnabled: boolean,
  resourceUsageMonitoringEnabled = false,
): ServiceWebviewCommandPayload {
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

export function createDeleteWebviewPayload(
  service: Pick<ServiceWebviewService, "id" | "storageKey">,
): DeleteWebviewPayload {
  return {
    id: service.id,
    storageKey: service.storageKey,
  };
}

export function createWebviewIdPayload(id: string): WebviewIdPayload {
  return { id };
}

export function createRightPanelWidthPayload(width: number): RightPanelWidthPayload {
  return { width };
}

export function shouldPreloadService(
  service: Pick<ServiceWebviewService, "id" | "disabled">,
  activeId: string,
) {
  return !service.disabled && service.id !== activeId;
}
