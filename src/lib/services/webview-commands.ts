import { invoke } from "@tauri-apps/api/core";
import {
  createRightPanelWidthPayload,
  createAudioMutedPayload,
  createServiceWebviewPayload,
  createWebviewIdPayload,
  type DeleteWebviewPayload,
  type ServiceWebviewService,
  shouldPreloadService,
} from "./service-runtime";

type InvokeCommand = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
type Sleep = (ms: number) => Promise<unknown>;
type QueueOptions = {
  interruptible?: boolean;
};

export function createWebviewCommandQueue() {
  let queue: Promise<unknown> = Promise.resolve();
  let generation = 0;

  function enqueue(fn: () => Promise<unknown>, commandGeneration: number | null) {
    const result = queue.then(() => {
      if (commandGeneration !== null && commandGeneration !== generation) {
        return undefined;
      }

      return fn();
    });
    // Keep the queue moving even if this command fails, but don't silently
    // swallow the error — log it so it shows up in Tauri's dev console.
    queue = result.catch((error: unknown) => {
      console.error("[ferx] webview command failed:", error);
    });
    // Return the un-caught promise so callers that need to sequence on
    // success/failure (e.g. hideActiveWebviewsForOverlay) still can.
    return result;
  }

  return {
    run(fn: () => Promise<unknown>, options: QueueOptions = {}) {
      return enqueue(fn, options.interruptible ? generation : null);
    },
    interrupt(fn: () => Promise<unknown>) {
      generation += 1;
      return enqueue(fn, null);
    },
    idle() {
      return queue;
    },
  };
}

export function hideAllWebviews(invokeCommand: InvokeCommand = invoke) {
  return invokeCommand("hide_all_webviews");
}

export function showServiceContextMenu(
  id: string,
  disabled: boolean,
  notificationPrefs: { showBadge: boolean; affectTray: boolean; muteAudio: boolean },
  invokeCommand: InvokeCommand = invoke,
) {
  return invokeCommand("show_context_menu", {
    id,
    disabled,
    showBadge: notificationPrefs.showBadge,
    affectTray: notificationPrefs.affectTray,
    muteAudio: notificationPrefs.muteAudio,
  });
}

export function setServiceWebviewAudioMuted(
  id: string,
  muted: boolean,
  invokeCommand: InvokeCommand = invoke,
) {
  return invokeCommand("set_service_webview_audio_muted", {
    payload: { id, muted },
  });
}

export function openServiceWebview(
  service: ServiceWebviewService,
  spellCheckEnabled: boolean,
  resourceUsageMonitoringEnabled: boolean,
  invokeCommand: InvokeCommand = invoke,
) {
  return invokeCommand(
    "open_service",
    {
      payload: createServiceWebviewPayload(
        service,
        spellCheckEnabled,
        resourceUsageMonitoringEnabled,
      ),
    },
  );
}

export function preloadServiceWebview(
  service: ServiceWebviewService,
  spellCheckEnabled: boolean,
  invokeCommand: InvokeCommand = invoke,
) {
  return invokeCommand("load_service", {
    payload: createServiceWebviewPayload(service, spellCheckEnabled, false),
  });
}

export async function preloadBackgroundServices({
  services,
  activeId,
  spellCheckEnabled,
  maxPreloads,
  gapMs,
  shouldCancel,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  invokeCommand = invoke,
}: {
  services: ServiceWebviewService[];
  activeId: string;
  spellCheckEnabled: boolean;
  maxPreloads: number;
  gapMs: number;
  shouldCancel: () => boolean;
  sleep?: Sleep;
  invokeCommand?: InvokeCommand;
}) {
  let preloaded = 0;

  for (const service of services) {
    if (shouldCancel()) {
      break;
    }
    if (preloaded >= maxPreloads) {
      break;
    }
    if (shouldPreloadService(service, activeId)) {
      await preloadServiceWebview(service, spellCheckEnabled, invokeCommand);
      preloaded++;
      await sleep(gapMs);
    }
  }
}

export function reloadServiceWebview(id: string, invokeCommand: InvokeCommand = invoke) {
  return invokeCommand("reload_webview", { payload: createWebviewIdPayload(id) });
}

export function closeServiceWebview(id: string, invokeCommand: InvokeCommand = invoke) {
  return invokeCommand("close_webview", { payload: createWebviewIdPayload(id) });
}

export function deleteServiceWebview(
  service: DeleteWebviewPayload,
  invokeCommand: InvokeCommand = invoke,
) {
  return invokeCommand("delete_webview", { payload: service });
}

export function setRightPanelWidth(width: number, invokeCommand: InvokeCommand = invoke) {
  return invokeCommand("set_right_panel_width", {
    payload: createRightPanelWidthPayload(width),
  });
}

export function setAllServiceWebviewsAudioMuted(
  muted: boolean,
  invokeCommand: InvokeCommand = invoke,
) {
  return invokeCommand("set_all_service_webviews_audio_muted", {
    payload: createAudioMutedPayload(muted),
  });
}
