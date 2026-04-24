import type { AppSettings } from "./app-settings";
import type { NotificationPrefs } from "./notification-prefs";
import type { PageService } from "./workspace-state";

export const WORKSPACE_CONFIG_EXPORT_FORMAT = "ferx-workspace-config";
export const WORKSPACE_CONFIG_EXPORT_VERSION = 1;

export interface ExportedWorkspaceServiceV1 {
  id: string;
  name: string;
  url: string;
  storageKey: string;
  disabled?: boolean;
  iconBgColor?: string;
  notificationPrefs: NotificationPrefs;
}

export interface FerxWorkspaceConfigFileV1 {
  ferxExport: {
    format: typeof WORKSPACE_CONFIG_EXPORT_FORMAT;
    version: typeof WORKSPACE_CONFIG_EXPORT_VERSION;
    exportedAt: string;
    appVersion: string;
  };
  appSettings: AppSettings;
  services: ExportedWorkspaceServiceV1[];
  activeServiceId: string | null;
}

export function buildWorkspaceConfigExportPayload({
  services,
  appSettings,
  activeId,
  appVersion,
  exportedAt = new Date().toISOString(),
}: {
  services: PageService[];
  appSettings: AppSettings;
  activeId: string;
  appVersion: string;
  exportedAt?: string;
}): FerxWorkspaceConfigFileV1 {
  const seenIds = new Set<string>();
  const exportedServices = services.flatMap<ExportedWorkspaceServiceV1>((service) => {
    if (seenIds.has(service.id)) {
      return [];
    }
    seenIds.add(service.id);

    return [
      {
        id: service.id,
        name: service.name,
        url: service.url,
        storageKey: service.storageKey,
        ...(service.disabled === undefined ? {} : { disabled: service.disabled }),
        ...(service.iconBgColor === undefined ? {} : { iconBgColor: service.iconBgColor }),
        notificationPrefs: { ...service.notificationPrefs },
      },
    ];
  });
  const activeServiceId = exportedServices.some(
    (service) => service.id === activeId && !service.disabled,
  )
    ? activeId
    : null;

  return {
    ferxExport: {
      format: WORKSPACE_CONFIG_EXPORT_FORMAT,
      version: WORKSPACE_CONFIG_EXPORT_VERSION,
      exportedAt,
      appVersion,
    },
    appSettings: {
      spellCheckEnabled: appSettings.spellCheckEnabled,
      resourceUsageMonitoringEnabled: appSettings.resourceUsageMonitoringEnabled,
    },
    services: exportedServices,
    activeServiceId,
  };
}

export function serializeWorkspaceConfigExport(payload: FerxWorkspaceConfigFileV1): string {
  return JSON.stringify(payload, null, 2);
}
