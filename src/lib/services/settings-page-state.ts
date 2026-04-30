import {
  APP_SETTINGS_STORAGE_KEY,
  readAppSettings,
} from "$lib/services/app-settings";
import { WORKSPACE_ACTIVE_ID_KEY } from "$lib/services/workspace-state";
import {
  WORKSPACES_STATE_KEY,
  readWorkspaceGroupsStartupState,
  serializeWorkspaceGroupsState,
  type WorkspaceGroupsState,
} from "$lib/services/workspace-groups";

export function readSettingsPageStartupState(storage: Storage): {
  workspaceState: WorkspaceGroupsState;
  spellCheckEnabled: boolean;
  resourceUsageMonitoringEnabled: boolean;
  initialSpellCheckEnabled: boolean;
} {
  const startup = readWorkspaceGroupsStartupState(
    storage.getItem(WORKSPACES_STATE_KEY),
    storage.getItem("ferx-workspace-services"),
    storage.getItem(WORKSPACE_ACTIVE_ID_KEY),
  );
  const settings = readAppSettings(storage.getItem(APP_SETTINGS_STORAGE_KEY));

  return {
    workspaceState: startup.state,
    spellCheckEnabled: settings.spellCheckEnabled,
    resourceUsageMonitoringEnabled: settings.resourceUsageMonitoringEnabled,
    initialSpellCheckEnabled: settings.spellCheckEnabled,
  };
}

export function commitSettingsWorkspaceState(storage: Storage, nextState: WorkspaceGroupsState) {
  storage.setItem(WORKSPACES_STATE_KEY, serializeWorkspaceGroupsState(nextState));
}

export function resolveSettingsServiceRoute(
  workspaceState: WorkspaceGroupsState,
  serviceId: string,
) {
  const service = workspaceState.servicesById[serviceId];
  if (!service || service.disabled) {
    return "/";
  }

  return `/?open=${encodeURIComponent(serviceId)}`;
}

export function scheduleSettingsWorkspaceReload(
  browserWindow: Window & { __TAURI_INTERNALS__?: unknown },
) {
  if (!("__TAURI_INTERNALS__" in browserWindow)) {
    return;
  }

  browserWindow.setTimeout(() => {
    try {
      browserWindow.location.replace("/");
    } catch {
      browserWindow.location.href = "/";
    }
  }, 250);
}

export function formatServiceCount(count: number) {
  return `${count} ${count === 1 ? "service" : "services"}`;
}

export function formatWorkspaceCount(count: number) {
  return `${count} ${count === 1 ? "workspace" : "workspaces"}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function sharedServiceCount(state: WorkspaceGroupsState) {
  return Object.keys(state.servicesById).length;
}

export function serviceHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function getSettingsActiveServiceId(workspaceState: WorkspaceGroupsState) {
  return (
    workspaceState.workspaces.find(
      (workspace) => workspace.id === workspaceState.currentWorkspaceId,
    )?.activeServiceId ?? ""
  );
}
