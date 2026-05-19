import { vi } from "vitest";
import badgeEngineUtilsScript from "../../../src-tauri/scripts/badge_engine_utils.js?raw";
import scaffoldScript from "../../../src-tauri/scripts/badge_engine_scaffold.js?raw";

export type BadgeObserverObservation = {
  target: Node;
  options?: MutationObserverInit;
};

export type BadgeMockObserver = {
  observations: BadgeObserverObservation[];
  disconnected: boolean;
  trigger: () => void;
};

export function installMutationObserverMock() {
  const observers: BadgeMockObserver[] = [];

  class MockMutationObserver {
    private callback: MutationCallback;
    observations: BadgeObserverObservation[] = [];
    disconnected = false;

    constructor(callback: MutationCallback) {
      this.callback = callback;
      observers.push(this);
    }

    observe(target: Node, options?: MutationObserverInit) {
      this.observations.push({ target, options });
    }

    disconnect() {
      this.disconnected = true;
    }

    takeRecords() {
      return [];
    }

    trigger() {
      this.callback([], this as unknown as MutationObserver);
    }
  }

  Object.defineProperty(window, "MutationObserver", {
    configurable: true,
    value: MockMutationObserver,
  });
  Object.defineProperty(globalThis, "MutationObserver", {
    configurable: true,
    value: MockMutationObserver,
  });

  return observers;
}

export function reconfigureJsdomUrl(url: string) {
  (
    globalThis as typeof globalThis & {
      jsdom?: { reconfigure: (options: { url: string }) => void };
    }
  ).jsdom?.reconfigure({ url });
}

export function runBadgeEngineScript({
  bodyMarkup,
  engineScript,
  title = "Service",
  beforeEvaluate,
  dispatchDOMContentLoaded = false,
}: {
  bodyMarkup: string;
  engineScript: string;
  title?: string;
  beforeEvaluate?: () => void;
  dispatchDOMContentLoaded?: boolean;
}) {
  vi.useFakeTimers();
  document.title = title;
  document.body.innerHTML = bodyMarkup;

  beforeEvaluate?.();

  const observers = installMutationObserverMock();
  const reports: string[] = [];

  window.__TAURI_INTERNALS__ = {};
  window.__ferxBadgeReports = reports;

  const patchedScaffold = scaffoldScript.replace(
    "window.location.href = 'https://ferx.notify/' + payload;",
    "window.__ferxBadgeReports.push(payload);",
  );

  window.eval(badgeEngineUtilsScript);
  window.eval(patchedScaffold);
  window.eval(engineScript);

  if (dispatchDOMContentLoaded) {
    document.dispatchEvent(new Event("DOMContentLoaded"));
  }

  return { observers, reports };
}

export async function flushBadgeAsync() {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
  }
}

export function cleanupBadgeTestGlobals() {
  vi.useRealTimers();
  document.body.innerHTML = "";
  delete window.__TAURI_INTERNALS__;
  delete window.__ferxBadgeReports;
  delete window.__ferxBadgeUtils;
  delete window.__ferx_badge_observers_active;
  delete window.__ferx_last_badge_state;
  delete window.__ferx_badge_dom_timer;
  delete window.__ferx_badge_monitoring_enabled;
  delete window.__ferx_badge_monitoring_mode;
  delete window.__ferxSetBadgeMonitoringMode;
  delete (window as Window & { __ferxInitBadgeMonitor?: unknown }).__ferxInitBadgeMonitor;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: object;
    __ferxBadgeReports?: string[];
    __ferxBadgeUtils?: object;
    __ferx_badge_observers_active?: boolean;
    __ferx_last_badge_state?: string;
    __ferx_badge_dom_timer?: number | null;
    __ferx_badge_monitoring_enabled?: boolean;
    __ferx_badge_monitoring_mode?: "active" | "background";
    __ferxSetBadgeMonitoringMode?: (
      mode: "active" | "background",
      enabled?: boolean,
    ) => void;
  }
}
