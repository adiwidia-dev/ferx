// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import scaffoldScript from "../../../src-tauri/scripts/badge_engine_scaffold.js?raw";
import telegramBadgeEngineScript from "../../../src-tauri/scripts/telegram_badge_engine.js?raw";

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

function runTelegramBadgeScript(bodyMarkup: string, initialTitle = "Telegram") {
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
  window.eval(telegramBadgeEngineScript);

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

describe("Telegram badge engine script", () => {
  it("reports Telegram Web K unread badges without requiring the Tauri invoke bridge", async () => {
    const { reports } = runTelegramBadgeScript(`
      <ul class="chatlist">
        <a class="row rp chatlist-chat" data-peer-id="123">
          <div class="dialog-subtitle-badge badge-icon dialog-subtitle-badge-pinned is-visible">
            <span class="tgico"></span>
          </div>
          <div class="dialog-subtitle-badge dialog-subtitle-badge-unread is-visible unread">1</div>
        </a>
        <a class="row rp chatlist-chat is-muted" data-peer-id="-456">
          <div class="dialog-subtitle-badge dialog-subtitle-badge-unread is-visible unread">51</div>
        </a>
      </ul>
    `);

    await flushPromises();

    expect(reports.at(-1)).toBe("count:1");
  });

  it("ignores Web K pinned badges and reads count only from the unread badge", async () => {
    // Regression test: previously webKCount used querySelector('.dialog-subtitle-badge')
    // which returned the first matching child — the pinned icon badge — whose
    // textContent is non-numeric, so the unread count was never read.
    const { reports } = runTelegramBadgeScript(`
      <ul class="chatlist">
        <a class="row rp chatlist-chat" data-peer-id="-5284195286">
          <div class="dialog-subtitle-badge badge badge-icon badge-22 dialog-subtitle-badge-pinned is-visible">
            <span class="tgico"></span>
          </div>
          <div class="dialog-subtitle-badge badge badge-22 dialog-subtitle-badge-unread is-visible unread">2</div>
        </a>
      </ul>
    `);

    await flushPromises();

    expect(reports.at(-1)).toBe("count:2");
  });

  it("skips Web K unread badges whose chats are no longer visible", async () => {
    // When a chat is read, tweb removes .is-visible to animate the badge out.
    // The DOM node may linger; we must not count it.
    const { reports } = runTelegramBadgeScript(`
      <ul class="chatlist">
        <a class="row rp chatlist-chat" data-peer-id="1">
          <div class="dialog-subtitle-badge dialog-subtitle-badge-unread unread">7</div>
        </a>
      </ul>
    `);

    await flushPromises();

    expect(reports.at(-1)).toBe("clear");
  });

  it("reports Telegram Web Z unread badges while ignoring muted chats", async () => {
    const { reports } = runTelegramBadgeScript(`
      <div class="chat-list">
        <div class="ListItem private">
          <span class="ChatBadge unread">2</span>
        </div>
        <div class="ListItem group">
          <span class="ChatBadge unread">3</span>
        </div>
        <div class="ListItem group muted">
          <span class="ChatBadge unread muted">107</span>
        </div>
      </div>
    `);

    await flushPromises();

    expect(reports.at(-1)).toBe("count:5");
  });

  it("keeps background Telegram badge polling active for tray updates", async () => {
    const { reports } = runTelegramBadgeScript(`
      <ul class="chatlist">
        <a class="row rp chatlist-chat" data-peer-id="123">
          <div class="dialog-subtitle-badge dialog-subtitle-badge-unread is-visible unread">1</div>
        </a>
      </ul>
    `);

    await flushPromises();
    expect(reports.at(-1)).toBe("count:1");

    document.body.innerHTML = `
      <ul class="chatlist">
        <a class="row rp chatlist-chat" data-peer-id="123">
          <div class="dialog-subtitle-badge dialog-subtitle-badge-unread is-visible unread">4</div>
        </a>
      </ul>
    `;

    vi.advanceTimersByTime(15_000);
    await flushPromises();

    expect(reports.at(-1)).toBe("count:4");
  });

  it("falls back to document title when the chat list DOM has not yet rendered", async () => {
    // Simulate DOMContentLoaded before the Telegram SPA has rendered the chat list:
    // DOM is empty but the title already carries the unread count.
    const { reports } = runTelegramBadgeScript(
      `<div id="initial-loading"></div>`,
      "(3) Telegram Web",
    );

    await flushPromises();

    expect(reports.at(-1)).toBe("count:3");
  });

  it("picks up title-based count on safety poll when DOM count is zero", async () => {
    // Start with no chat list and a plain title (no unread count).
    const { reports } = runTelegramBadgeScript(`<div id="initial-loading"></div>`);

    await flushPromises();
    expect(reports.at(-1)).toBe("clear");

    // Telegram updates the title with a new unread count after the SPA has initialised.
    document.title = "(5) Telegram Web";

    // The 15-second safety poll re-reads the title and emits the new count.
    vi.advanceTimersByTime(15_000);
    await flushPromises();

    expect(reports.at(-1)).toBe("count:5");
  });

  it("reports Web A React unread count from the stable .unread-count element", async () => {
    const { reports } = runTelegramBadgeScript(`
      <div id="root">
        <div id="LeftColumn">
          <div class="chat-list"></div>
        </div>
        <div class="unread-count active">2</div>
      </div>
    `);

    await flushPromises();

    expect(reports.at(-1)).toBe("count:2");
  });

  it("updates Web A React badge on safety poll when unread count changes", async () => {
    const { reports } = runTelegramBadgeScript(`
      <div id="root">
        <div class="unread-count active">1</div>
      </div>
    `);

    await flushPromises();
    expect(reports.at(-1)).toBe("count:1");

    const el = document.querySelector(".unread-count")!;
    el.textContent = "5";

    vi.advanceTimersByTime(15_000);
    await flushPromises();

    expect(reports.at(-1)).toBe("count:5");
  });

  it("clears Web A React badge when unread-count element is removed", async () => {
    const { reports } = runTelegramBadgeScript(`
      <div id="root">
        <div class="unread-count active">3</div>
      </div>
    `);

    await flushPromises();
    expect(reports.at(-1)).toBe("count:3");

    document.querySelector(".unread-count")?.remove();

    vi.advanceTimersByTime(15_000);
    await flushPromises();

    expect(reports.at(-1)).toBe("clear");
  });

  it("ignores Web A React unread count when the stable counter is inactive", async () => {
    const { reports } = runTelegramBadgeScript(`
      <div id="root">
        <div class="unread-count">3</div>
      </div>
    `);

    await flushPromises();

    expect(reports.at(-1)).toBe("clear");
  });

  it("keeps background mode on polling only and attaches DOM observers only while active", async () => {
    const { observers, reports } = runTelegramBadgeScript(`
      <ul class="chat-list">
        <a class="row rp chatlist-chat" data-peer-id="123">
          <div class="dialog-subtitle-badge dialog-subtitle-badge-unread is-visible unread">1</div>
        </a>
      </ul>
    `);

    const chatList = document.querySelector(".chat-list");
    expect(chatList).not.toBeNull();

    await flushPromises();
    expect(reports.at(-1)).toBe("count:1");

    expect(
      observers.some((observer) =>
        observer.observations.some(
          (observation) =>
            observation.target === chatList && observation.options?.subtree === true,
        ),
      ),
    ).toBe(false);

    window.__ferxSetBadgeMonitoringMode?.("active", true);
    await flushPromises();

    const activeObserver = observers.find((observer) =>
      observer.observations.some(
        (observation) =>
          observation.target === chatList && observation.options?.subtree === true,
      ),
    );
    expect(activeObserver).toBeDefined();

    window.__ferxSetBadgeMonitoringMode?.("background", true);
    await flushPromises();

    expect(activeObserver?.disconnected).toBe(true);

    document.body.innerHTML = `
      <ul class="chat-list">
        <a class="row rp chatlist-chat" data-peer-id="123">
          <div class="dialog-subtitle-badge dialog-subtitle-badge-unread is-visible unread">4</div>
        </a>
      </ul>
    `;

    vi.advanceTimersByTime(15_000);
    await flushPromises();

    expect(reports.at(-1)).toBe("count:4");
  });

  it("matches tweb's '%d notifications' title format from the Notifications.Count i18n", async () => {
    const { reports } = runTelegramBadgeScript(
      `<div id="initial-loading"></div>`,
      "4 notifications",
    );

    await flushPromises();

    expect(reports.at(-1)).toBe("count:4");
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
