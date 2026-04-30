// Payload types are generated from Rust via tauri-specta. Import them from
// there so this file never drifts from the actual Tauri command signatures.
import type {
  ServiceWebviewCommandPayload,
  AudioMutedPayload,
  DeleteWebviewPayload,
  WebviewIdPayload,
  RightPanelWidthPayload,
} from "$lib/tauri-commands";

export type {
  ServiceWebviewCommandPayload,
  AudioMutedPayload,
  DeleteWebviewPayload,
  WebviewIdPayload,
  RightPanelWidthPayload,
};

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

export function createAudioMutedPayload(muted: boolean): AudioMutedPayload {
  return { muted };
}

export function shouldPreloadService(
  service: Pick<ServiceWebviewService, "id" | "disabled">,
  activeId: string,
) {
  return !service.disabled && service.id !== activeId;
}
