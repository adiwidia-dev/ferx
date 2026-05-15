// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import teamsBadgeEngineScript from "../../../src-tauri/scripts/teams_badge_engine.js?raw";
import {
  cleanupBadgeTestGlobals,
  flushBadgeAsync,
  runBadgeEngineScript,
} from "./badge-engine-test-utils";

function runTeamsBadgeScript(bodyMarkup: string, title = "Teams") {
  return runBadgeEngineScript({
    bodyMarkup,
    title,
    engineScript: teamsBadgeEngineScript,
  });
}

afterEach(cleanupBadgeTestGlobals);

describe("Teams badge engine script", () => {
  it("reports Teams badges without requiring the Tauri invoke bridge", async () => {
    const { reports } = runTeamsBadgeScript(`
      <main>
        <span class="fui-Badge">2</span>
      </main>
    `);

    await flushBadgeAsync();

    expect(reports.at(-1)).toBe("count:2");
  });

  it("starts hidden services in background mode without observing the whole body", async () => {
    const { observers } = runTeamsBadgeScript(`
      <main>
        <span class="fui-Badge">2</span>
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

  it("keeps background Teams badge polling active for tray updates", async () => {
    const { reports } = runTeamsBadgeScript(`
      <main>
        <span class="fui-Badge">1</span>
      </main>
    `);

    await flushBadgeAsync();
    expect(reports.at(-1)).toBe("count:1");

    document.body.innerHTML = `
      <main>
        <span class="fui-Badge">5</span>
      </main>
    `;

    vi.advanceTimersByTime(15_000);
    await flushBadgeAsync();

    expect(reports.at(-1)).toBe("count:5");
  });

  it("does not double count duplicate Teams v2 badges for one navigation item", async () => {
    const { reports } = runTeamsBadgeScript(`
      <nav>
        <button data-tid="app-bar-chat">
          <span class="fui-Badge" data-tid="visible-chat-badge">1</span>
          <span class="fui-Badge" data-tid="mirrored-chat-badge">1</span>
        </button>
      </nav>
    `);

    await flushBadgeAsync();

    expect(reports.at(-1)).toBe("count:1");
  });

  it("prefers Teams app rail badges over mirrored in-page badges", async () => {
    const { reports } = runTeamsBadgeScript(`
      <nav data-tid="app-layout-area--sidebar">
        <button data-tid="app-bar-chat" aria-label="Chat">
          <span class="fui-Badge">1</span>
        </button>
      </nav>
      <main>
        <button role="button" aria-label="Chat">
          <span class="fui-Badge">1</span>
        </button>
      </main>
    `);

    await flushBadgeAsync();

    expect(reports.at(-1)).toBe("count:1");
  });

  it("deduplicates mirrored Teams app rail instances by semantic owner", async () => {
    const { reports } = runTeamsBadgeScript(`
      <nav data-tid="app-layout-area--sidebar">
        <button data-tid="app-bar-chat" aria-label="Chat">
          <span class="fui-Badge">1</span>
        </button>
      </nav>
      <nav data-tid="app-layout-area--sidebar-hidden">
        <button data-tid="app-bar-chat" aria-label="Chat">
          <span class="fui-Badge">1</span>
        </button>
      </nav>
    `);

    await flushBadgeAsync();

    expect(reports.at(-1)).toBe("count:1");
  });

  it("reports legacy Teams badge selectors through the navigation bridge", async () => {
    const { reports } = runTeamsBadgeScript(`
      <main>
        <div class="activity-badge dot-activity-badge">
          <span class="activity-badge">3</span>
        </div>
      </main>
    `);

    await flushBadgeAsync();

    expect(reports.at(-1)).toBe("count:3");
  });

  it("attaches targeted Teams DOM observers only after switching to active mode", async () => {
    const { observers } = runTeamsBadgeScript(`
      <nav data-tid="app-layout-area--sidebar">
        <span class="fui-Badge">6</span>
      </nav>
    `);

    const nav = document.querySelector("nav");
    expect(nav).not.toBeNull();

    await flushBadgeAsync();
    expect(
      observers.some((observer) =>
        observer.observations.some((observation) => observation.target === nav),
      ),
    ).toBe(false);

    window.__ferxSetBadgeMonitoringMode?.("active", true);

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
