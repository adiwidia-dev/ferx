// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import scaffoldScript from "../../../src-tauri/scripts/badge_engine_scaffold.js?raw";
import outlookBadgeEngineScript from "../../../src-tauri/scripts/outlook_badge_engine.js?raw";

type Observation = {
  target: Node;
  options?: MutationObserverInit;
};

type MockObserver = {
  observations: Observation[];
  disconnected: boolean;
  trigger: () => void;
};

function installMutationObserverMock() {
  const observers: MockObserver[] = [];

  class MockMutationObserver {
    private callback: MutationCallback;
    observations: Observation[] = [];
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

function runOutlookBadgeScript(bodyMarkup: string, title = "Outlook") {
  vi.useFakeTimers();
  document.title = title;
  document.body.innerHTML = bodyMarkup;

  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ width: 120, height: 24 }),
  });

  const reports: string[] = [];
  window.__TAURI_INTERNALS__ = {};
  window.__ferxBadgeReports = reports;

  const observers = installMutationObserverMock();

  const patchedScaffold = scaffoldScript.replace(
    "window.location.href = 'https://ferx.notify/' + payload;",
    "window.__ferxBadgeReports.push(payload);",
  );
  window.eval(patchedScaffold);
  window.eval(outlookBadgeEngineScript);

  return { observers, reports };
}

async function flushAsync() {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
  }
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
  delete window.__TAURI_INTERNALS__;
  delete window.__ferxBadgeReports;
  delete window.__ferx_badge_observers_active;
  delete window.__ferx_last_badge_state;
  delete window.__ferx_badge_dom_timer;
  delete window.__ferx_badge_monitoring_enabled;
  delete window.__ferx_badge_monitoring_mode;
  delete window.__ferxSetBadgeMonitoringMode;
  delete (window as Window & { __ferxInitBadgeMonitor?: unknown }).__ferxInitBadgeMonitor;
});

describe("Outlook badge engine script", () => {
  it("reports unread mail counts from structured Inbox folder rows", async () => {
    const { reports } = runOutlookBadgeScript(`
      <div role="tree">
        <div role="treeitem">
          <span>Inbox</span>
          <span>5</span>
        </div>
      </div>
    `);
    await flushAsync();

    expect(reports.at(-1)).toBe("count:5");
  });

  it("does not report unrelated navigation badge counts as Inbox unread mail", async () => {
    const { reports } = runOutlookBadgeScript(`
      <div role="tree">
        <div>
          <span>Inbox</span>
          <button aria-label="Microsoft apps">5</button>
        </div>
      </div>
    `);
    await flushAsync();

    expect(reports.at(-1)).toBe("clear");
  });

  it("does not report counts from broad Inbox containers with nested app controls", async () => {
    const { reports } = runOutlookBadgeScript(`
      <div role="tree">
        <button>
          <span>Inbox</span>
          <span>Microsoft apps</span>
          <span>5</span>
        </button>
      </div>
    `);
    await flushAsync();

    expect(reports.at(-1)).toBe("clear");
  });

  it("clears stale title counts when the visible Inbox folder has no count", async () => {
    const { reports } = runOutlookBadgeScript(`
      <div role="tree">
        <div role="treeitem">
          <span>Inbox</span>
        </div>
      </div>
    `, "(5) Outlook");
    await flushAsync();

    expect(reports.at(-1)).toBe("clear");
  });

  it("starts hidden services in background mode without observing the whole body", async () => {
    const { observers } = runOutlookBadgeScript(`
      <main>
        <section>
          <span>Inbox</span>
        </section>
      </main>
    `);
    await flushAsync();

    const bodySubtreeObservations = observers.flatMap((observer) =>
      observer.observations.filter(
        (observation) =>
          observation.target === document.body &&
          observation.options?.subtree === true,
      ),
    );

    expect(window.__ferx_badge_monitoring_mode).toBe("background");
    expect(bodySubtreeObservations).toHaveLength(0);
  });

  it("keeps background Outlook badge polling active for tray updates", async () => {
    const { reports } = runOutlookBadgeScript(`
      <div role="tree">
        <div role="treeitem">
          <span>Inbox</span>
        </div>
      </div>
    `);
    await flushAsync();

    expect(reports.at(-1)).toBe("clear");

    document.body.innerHTML = `
      <div role="tree">
        <div role="treeitem">
          <span>Inbox</span>
          <span>3</span>
        </div>
      </div>
    `;

    await vi.advanceTimersByTimeAsync(15_000);
    await flushAsync();

    expect(reports.at(-1)).toBe("count:3");
  });

  it("attaches targeted Outlook DOM observers only after switching to active mode", async () => {
    const { observers } = runOutlookBadgeScript(`
      <nav aria-label="Folders">
        <div role="treeitem">
          <span>Inbox</span>
          <span>4</span>
        </div>
      </nav>
    `);
    await flushAsync();

    const nav = document.querySelector("nav");
    expect(nav).not.toBeNull();
    expect(
      observers.some((observer) =>
        observer.observations.some((observation) => observation.target === nav),
      ),
    ).toBe(false);

    window.__ferxSetBadgeMonitoringMode?.("active", true);
    await flushAsync();

    expect(
      observers.some((observer) =>
        observer.observations.some(
          (observation) =>
            observation.target === nav && observation.options?.subtree === true,
        ),
      ),
    ).toBe(true);
  });
});

declare global {
  interface Window {
    __TAURI_INTERNALS__?: object;
    __ferxBadgeReports?: string[];
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
