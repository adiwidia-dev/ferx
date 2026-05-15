// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import outlookBadgeEngineScript from "../../../src-tauri/scripts/outlook_badge_engine.js?raw";
import {
  cleanupBadgeTestGlobals,
  flushBadgeAsync,
  runBadgeEngineScript,
} from "./badge-engine-test-utils";

function runOutlookBadgeScript(bodyMarkup: string, title = "Outlook") {
  return runBadgeEngineScript({
    bodyMarkup,
    title,
    engineScript: outlookBadgeEngineScript,
    beforeEvaluate: () => {
      Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
        configurable: true,
        value: () => ({ width: 120, height: 24 }),
      });
    },
  });
}

afterEach(cleanupBadgeTestGlobals);

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
    await flushBadgeAsync();

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
    await flushBadgeAsync();

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
    await flushBadgeAsync();

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
    await flushBadgeAsync();

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
    await flushBadgeAsync();

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
    await flushBadgeAsync();

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
    await flushBadgeAsync();

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
    await flushBadgeAsync();

    const nav = document.querySelector("nav");
    expect(nav).not.toBeNull();
    expect(
      observers.some((observer) =>
        observer.observations.some((observation) => observation.target === nav),
      ),
    ).toBe(false);

    window.__ferxSetBadgeMonitoringMode?.("active", true);
    await flushBadgeAsync();

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
