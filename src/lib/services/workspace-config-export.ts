import type { AppSettings } from "./app-settings";
import type { NotificationPrefs } from "./notification-prefs";
import {
  normalizeWorkspaceGroupsState,
  type WorkspaceGroupsState,
} from "./workspace-groups";

export const WORKSPACE_CONFIG_EXPORT_FORMAT = "ferx-workspace-config";
export const WORKSPACE_CONFIG_EXPORT_VERSION = 2;
export const WORKSPACE_CONFIG_EXPORT_LEGACY_VERSION = 1;

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
    version: typeof WORKSPACE_CONFIG_EXPORT_LEGACY_VERSION;
    exportedAt: string;
    appVersion: string;
  };
  appSettings: AppSettings;
  services: ExportedWorkspaceServiceV1[];
  activeServiceId: string | null;
}

export interface FerxWorkspaceConfigFileV2 {
  ferxExport: {
    format: typeof WORKSPACE_CONFIG_EXPORT_FORMAT;
    version: typeof WORKSPACE_CONFIG_EXPORT_VERSION;
    exportedAt: string;
    appVersion: string;
  };
  appSettings: AppSettings;
  workspaceState: WorkspaceGroupsState;
}

export type FerxWorkspaceConfigFile =
  | FerxWorkspaceConfigFileV1
  | FerxWorkspaceConfigFileV2;

export function buildWorkspaceConfigExportPayload({
  workspaceState,
  appSettings,
  appVersion,
  exportedAt = new Date().toISOString(),
}: {
  workspaceState: WorkspaceGroupsState;
  appSettings: AppSettings;
  appVersion: string;
  exportedAt?: string;
}): FerxWorkspaceConfigFileV2 {
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
    workspaceState: normalizeWorkspaceGroupsState(workspaceState),
  };
}

export function serializeWorkspaceConfigExport(payload: FerxWorkspaceConfigFile): string {
  return JSON.stringify(payload, null, 2);
}
