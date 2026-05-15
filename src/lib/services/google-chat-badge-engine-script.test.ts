// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import googleChatBadgeEngineScript from "../../../src-tauri/scripts/google_chat_badge_engine.js?raw";
import {
  cleanupBadgeTestGlobals,
  flushBadgeAsync,
  runBadgeEngineScript,
} from "./badge-engine-test-utils";

function runGoogleChatBadgeScript(bodyMarkup: string, initialTitle = "Chat") {
  return runBadgeEngineScript({
    bodyMarkup,
    title: initialTitle,
    engineScript: googleChatBadgeEngineScript,
  });
}

afterEach(cleanupBadgeTestGlobals);

describe("Google Chat badge engine script", () => {
  it("reports unread direct messages and unread spaces from the Google Chat side nav", async () => {
    const { reports } = runGoogleChatBadgeScript(`
      <aside aria-label="Chat navigation">
        <section aria-label="Direct messages">
          <div role="listitem" aria-label="Desy Christy, 1 unread message">
            <span>Desy Christy</span>
            <span aria-label="1 unread message">1</span>
          </div>
        </section>
        <section aria-label="Spaces">
          <div role="listitem" aria-label="Papa,Mama,Mi has unread messages">
            <span>Papa,Mama,Mi...</span>
            <span aria-label="Unread"></span>
          </div>
        </section>
      </aside>
    `);

    await flushBadgeAsync();

    expect(reports.at(-1)).toBe("count:2");
  });

  it("does not count repeated nested unread labels and unrelated unread controls", async () => {
    const { reports } = runGoogleChatBadgeScript(`
      <main>
        <button aria-label="Unread">Unread filter</button>
        <div aria-label="3 unread results outside the side nav">3</div>
      </main>
      <aside aria-label="Chat navigation">
        <section aria-label="Direct messages">
          <h2>Direct messages <span>1</span></h2>
          <div role="listitem" aria-label="Desy Christy, 1 unread message">
            <span aria-label="Unread"></span>
            <span aria-label="1 unread message">1</span>
            <span title="1 unread message">1</span>
          </div>
        </section>
        <section aria-label="Spaces">
          <h2>Spaces <span>1</span></h2>
          <div role="listitem" aria-label="Papa,Mama,Mi has unread messages">
            <span aria-label="Unread"></span>
          </div>
        </section>
      </aside>
    `);

    await flushBadgeAsync();

    expect(reports.at(-1)).toBe("count:2");
  });

  it("does not double count duplicated Google Chat side-nav sections", async () => {
    const duplicatedSideNav = `
      <aside aria-label="Chat navigation">
        <section aria-label="Direct messages">
          <h2>Direct messages <span>1</span></h2>
          <div role="listitem" aria-label="Desy Christy, 1 unread message">
            <span>Desy Christy</span>
            <span aria-label="1 unread message">1</span>
          </div>
        </section>
        <section aria-label="Spaces">
          <h2>Spaces <span>1</span></h2>
          <div role="listitem" aria-label="Papa,Mama,Mi has unread messages">
            <span>Papa,Mama,Mi...</span>
            <span aria-label="Unread"></span>
          </div>
        </section>
      </aside>
    `;
    const { reports } = runGoogleChatBadgeScript(
      duplicatedSideNav + duplicatedSideNav,
    );

    await flushBadgeAsync();

    expect(reports.at(-1)).toBe("count:2");
  });

  it("does not treat read-row numeric timestamps as unread badges", async () => {
    const { reports } = runGoogleChatBadgeScript(`
      <aside aria-label="Chat navigation">
        <section aria-label="Direct messages">
          <div role="listitem" aria-label="Ada Lovelace">
            <span>Ada Lovelace</span>
            <time>1</time>
          </div>
        </section>
      </aside>
    `);

    await flushBadgeAsync();

    expect(reports.at(-1)).toBe("clear");
  });

  it("uses Ferdium's legacy Google Chat direct and indirect badge signals as fallbacks", async () => {
    const { reports } = runGoogleChatBadgeScript(`
      <head>
        <link rel="icon" href="https://ssl.gstatic.com/ui/v1/icons/mail/images/favicon_chat_new_notif_1.ico">
      </head>
      <div class="V6 CL V2 X9 Y2">
        <span class="akt"><span class="XU">3</span></span>
      </div>
    `);

    await flushBadgeAsync();

    expect(reports.at(-1)).toBe("count:4");
  });

  it("keeps background mode on polling only and attaches DOM observers only while active", async () => {
    const { observers, reports } = runGoogleChatBadgeScript(`
      <aside aria-label="Chat navigation">
        <section aria-label="Direct messages">
          <div role="listitem" aria-label="Desy Christy, 1 unread message">
            <span>Desy Christy</span>
            <span aria-label="1 unread message">1</span>
          </div>
        </section>
      </aside>
    `);

    const nav = document.querySelector("aside");
    expect(nav).not.toBeNull();

    await flushBadgeAsync();
    expect(reports.at(-1)).toBe("count:1");

    expect(
      observers.some((observer) =>
        observer.observations.some(
          (observation) =>
            observation.target === nav && observation.options?.subtree === true,
        ),
      ),
    ).toBe(false);

    window.__ferxSetBadgeMonitoringMode?.("active", true);
    await flushBadgeAsync();

    const activeObserver = observers.find((observer) =>
      observer.observations.some(
        (observation) =>
          observation.target === nav && observation.options?.subtree === true,
      ),
    );
    expect(activeObserver).toBeDefined();

    window.__ferxSetBadgeMonitoringMode?.("background", true);
    await flushBadgeAsync();

    expect(activeObserver?.disconnected).toBe(true);

    document.body.innerHTML = `
      <aside aria-label="Chat navigation">
        <section aria-label="Direct messages">
          <div role="listitem" aria-label="Desy Christy, 4 unread messages">
            <span>Desy Christy</span>
            <span aria-label="4 unread messages">4</span>
          </div>
        </section>
      </aside>
    `;

    vi.advanceTimersByTime(15_000);
    await flushBadgeAsync();

    expect(reports.at(-1)).toBe("count:4");
  });

  it("clears the badge when unread markers are removed", async () => {
    const { reports } = runGoogleChatBadgeScript(`
      <aside aria-label="Chat navigation">
        <section aria-label="Direct messages">
          <div role="listitem" aria-label="Desy Christy, 1 unread message">
            <span>Desy Christy</span>
            <span aria-label="1 unread message">1</span>
          </div>
        </section>
      </aside>
    `);

    await flushBadgeAsync();
    expect(reports.at(-1)).toBe("count:1");

    document.body.innerHTML = `
      <aside aria-label="Chat navigation">
        <section aria-label="Direct messages">
          <div role="listitem" aria-label="Desy Christy">
            <span>Desy Christy</span>
          </div>
        </section>
      </aside>
    `;

    vi.advanceTimersByTime(15_000);
    await flushBadgeAsync();

    expect(reports.at(-1)).toBe("clear");
  });
});
