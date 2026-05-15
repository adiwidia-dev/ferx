// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import scaffoldScript from "../../../src-tauri/scripts/badge_engine_scaffold.js?raw";
import googleChatBadgeEngineScript from "../../../src-tauri/scripts/google_chat_badge_engine.js?raw";

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

function runGoogleChatBadgeScript(bodyMarkup: string, initialTitle = "Chat") {
  vi.useFakeTimers();
  document.title = initialTitle;
  document.body.innerHTML = bodyMarkup;

  const observers = installMutationObserverMock();
  const reports: string[] = [];

  window.__TAURI_INTERNALS__ = {};

  window.__ferxBadgeReports = reports;

  const patchedScaffold = scaffoldScript.replace(
    "window.location.href = 'https://ferx.notify/' + payload;",
    "window.__ferxBadgeReports.push(payload);",
  );
  window.eval(patchedScaffold);
  window.eval(googleChatBadgeEngineScript);

  return { observers, reports };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
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

    await flushPromises();

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

    await flushPromises();

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

    await flushPromises();

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

    await flushPromises();

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

    await flushPromises();

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

    await flushPromises();
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
    await flushPromises();

    const activeObserver = observers.find((observer) =>
      observer.observations.some(
        (observation) =>
          observation.target === nav && observation.options?.subtree === true,
      ),
    );
    expect(activeObserver).toBeDefined();

    window.__ferxSetBadgeMonitoringMode?.("background", true);
    await flushPromises();

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
    await flushPromises();

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

    await flushPromises();
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
    await flushPromises();

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
    __ferx_badge_monitoring_mode?: "active" | "background";
    __ferxSetBadgeMonitoringMode?: (
      mode: "active" | "background",
      enabled?: boolean,
    ) => void;
  }
}
