import { invoke } from "@tauri-apps/api/core";
import {
  createDeletePayload,
  createServiceLoadPayload,
  shouldPreloadService,
} from "./service-runtime";

type InvokeCommand = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
type Sleep = (ms: number) => Promise<unknown>;

type WebviewService = Parameters<typeof createServiceLoadPayload>[0];
type DeleteWebviewPayload = ReturnType<typeof createDeletePayload>;

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
  service: WebviewService,
  spellCheckEnabled: boolean,
  resourceUsageMonitoringEnabled: boolean,
  invokeCommand: InvokeCommand = invoke,
) {
  return invokeCommand(
    "open_service",
    createServiceLoadPayload(service, spellCheckEnabled, resourceUsageMonitoringEnabled),
  );
}

export function preloadServiceWebview(
  service: WebviewService,
  spellCheckEnabled: boolean,
  invokeCommand: InvokeCommand = invoke,
) {
  return invokeCommand("load_service", createServiceLoadPayload(service, spellCheckEnabled, false));
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
  services: WebviewService[];
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
  return invokeCommand("reload_webview", { id });
}

export function closeServiceWebview(id: string, invokeCommand: InvokeCommand = invoke) {
  return invokeCommand("close_webview", { id });
}

export function deleteServiceWebview(
  service: DeleteWebviewPayload,
  invokeCommand: InvokeCommand = invoke,
) {
  return invokeCommand("delete_webview", service);
}

export function setRightPanelWidth(width: number, invokeCommand: InvokeCommand = invoke) {
  return invokeCommand("set_right_panel_width", { width });
}
