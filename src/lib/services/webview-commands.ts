import { invoke } from "@tauri-apps/api/core";
import {
  createDeleteWebviewPayload,
  createRightPanelWidthPayload,
  createServiceWebviewPayload,
  createWebviewIdPayload,
  type DeleteWebviewPayload,
  type ServiceWebviewService,
  shouldPreloadService,
} from "./service-runtime";

type InvokeCommand = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
type Sleep = (ms: number) => Promise<unknown>;

export function createWebviewCommandQueue() {
  let queue: Promise<unknown> = Promise.resolve();

  return {
    run(run: () => Promise<unknown>) {
      queue = queue.then(run, run);
      void queue;
      return queue;
    },
    idle() {
      return queue;
    },
  };
}

export function hideAllWebviews(invokeCommand: InvokeCommand = invoke) {
  return invokeCommand("hide_all_webviews");
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
  return invokeCommand("delete_webview", { payload: createDeleteWebviewPayload(service) });
}

export function setRightPanelWidth(width: number, invokeCommand: InvokeCommand = invoke) {
  return invokeCommand("set_right_panel_width", {
    payload: createRightPanelWidthPayload(width),
  });
}
