// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import outlookBadgeEngineScript from "../../../src-tauri/scripts/outlook_badge_engine.js?raw";

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

  const script = outlookBadgeEngineScript
    .replace(
      "window.location.href = 'https://ferx.notify/' + payload;",
      "window.__ferxBadgeReports.push(payload);",
    )
    .replace("__FERX_STRATEGY__", "outlook-folder-dom");

  window.eval(script);
  vi.runOnlyPendingTimers();

  return reports;
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
});

describe("Outlook badge engine script", () => {
  it("reports unread mail counts from structured Inbox folder rows", () => {
    const reports = runOutlookBadgeScript(`
      <div role="tree">
        <div role="treeitem">
          <span>Inbox</span>
          <span>5</span>
        </div>
      </div>
    `);

    expect(reports.at(-1)).toBe("count:5");
  });

  it("does not report unrelated navigation badge counts as Inbox unread mail", () => {
    const reports = runOutlookBadgeScript(`
      <div role="tree">
        <div>
          <span>Inbox</span>
          <button aria-label="Microsoft apps">5</button>
        </div>
      </div>
    `);

    expect(reports.at(-1)).toBe("clear");
  });

  it("does not report counts from broad Inbox containers with nested app controls", () => {
    const reports = runOutlookBadgeScript(`
      <div role="tree">
        <button>
          <span>Inbox</span>
          <span>Microsoft apps</span>
          <span>5</span>
        </button>
      </div>
    `);

    expect(reports.at(-1)).toBe("clear");
  });

  it("clears stale title counts when the visible Inbox folder has no count", () => {
    const reports = runOutlookBadgeScript(`
      <div role="tree">
        <div role="treeitem">
          <span>Inbox</span>
        </div>
      </div>
    `, "(5) Outlook");

    expect(reports.at(-1)).toBe("clear");
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
  }
}
