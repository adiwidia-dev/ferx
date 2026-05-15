// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import whatsappBadgeEngineScript from "../../../src-tauri/scripts/whatsapp_badge_engine.js?raw";

type Observation = {
  target: Node;
  options?: MutationObserverInit;
};

type MockObserver = {
  observations: Observation[];
  disconnected: boolean;
  trigger: () => void;
};

type WhatsAppChatRecord = {
  unreadCount?: number;
  archive?: boolean;
  muteExpiration?: number;
  isAutoMuted?: boolean;
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

function installIndexedDbMock(chats: WhatsAppChatRecord[] | null) {
  const indexedDb = {
    databases: vi.fn(() =>
      Promise.resolve(chats ? [{ name: "model-storage" }] : []),
    ),
    open: vi.fn(() => {
      const request: {
        result?: unknown;
        onsuccess?: () => void;
        addEventListener: (eventName: string, callback: () => void) => void;
      } = {
        addEventListener: vi.fn(),
      };

      request.result = {
        close: vi.fn(),
        transaction: vi.fn(() => ({
          objectStore: vi.fn(() => ({
            getAll: vi.fn(() => {
              const query: {
                onsuccess?: (event: { target: { result: WhatsAppChatRecord[] } }) => void;
                addEventListener: (eventName: string, callback: () => void) => void;
              } = {
                addEventListener: vi.fn(),
              };

              Promise.resolve().then(() => {
                query.onsuccess?.({ target: { result: chats || [] } });
              });

              return query;
            }),
          })),
        })),
      };

      Promise.resolve().then(() => {
        request.onsuccess?.();
      });

      return request;
    }),
  };

  Object.defineProperty(window, "indexedDB", {
    configurable: true,
    value: indexedDb,
  });
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: indexedDb,
  });

  return indexedDb;
}

function runWhatsAppBadgeScript(
  bodyMarkup: string,
  options: {
    title?: string;
    chats?: WhatsAppChatRecord[] | null;
  } = {},
) {
  vi.useFakeTimers();
  document.title = options.title ?? "WhatsApp";
  document.body.innerHTML = bodyMarkup;

  const observers = installMutationObserverMock();
  const indexedDb = installIndexedDbMock(options.chats ?? null);
  const reports: string[] = [];

  window.__TAURI_INTERNALS__ = {};

  const script = whatsappBadgeEngineScript.replace(
    "window.location.href = 'https://ferx.notify/' + payload;",
    "window.__ferxBadgeReports.push(payload);",
  );
  window.__ferxBadgeReports = reports;

  window.eval(script);
  document.dispatchEvent(new Event("DOMContentLoaded"));

  return { indexedDb, observers, reports };
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
});

describe("WhatsApp badge engine script", () => {
  it("sums visible unread message badges from the chat list", async () => {
    const { reports } = runWhatsAppBadgeScript(
      `
        <div id="pane-side">
          <div role="row">
            <span aria-label="4 unread messages">4</span>
          </div>
          <div role="row">
            <span aria-label="1 unread message">1</span>
          </div>
        </div>
      `,
      { title: "(2) WhatsApp" },
    );

    await flushAsync();

    expect(reports.at(-1)).toBe("count:5");
  });

  it("emits clear while chat list has not loaded yet", async () => {
    const { reports } = runWhatsAppBadgeScript("", {
      title: "(2) WhatsApp",
      chats: [
        { unreadCount: 4, archive: false },
        { unreadCount: 1, archive: false },
      ],
    });

    await flushAsync();

    expect(reports.at(-1)).toBe("clear");
  });

  it("does not double-count nested row and cell-frame elements", async () => {
    const { reports } = runWhatsAppBadgeScript(
      `
        <div id="pane-side">
          <div role="row">
            <div data-testid="cell-frame-container">
              <span aria-label="4 unread messages">4</span>
            </div>
          </div>
          <div role="row">
            <div data-testid="cell-frame-container">
              <span aria-label="1 unread message">1</span>
            </div>
          </div>
        </div>
      `,
      { title: "(2) WhatsApp" },
    );

    await flushAsync();

    expect(reports.at(-1)).toBe("count:5");
  });

  it("keeps background mode on polling only and attaches DOM observers only while active", async () => {
    const { observers, reports } = runWhatsAppBadgeScript(
      `
        <div id="pane-side">
          <div role="row">
            <span aria-label="1 unread message">1</span>
          </div>
        </div>
      `,
      { chats: null },
    );

    const paneSide = document.querySelector("#pane-side");
    expect(paneSide).not.toBeNull();

    await flushAsync();
    expect(reports.at(-1)).toBe("count:1");

    expect(
      observers.some((observer) =>
        observer.observations.some(
          (observation) =>
            observation.target === paneSide &&
            observation.options?.subtree === true,
        ),
      ),
    ).toBe(false);

    window.__ferxSetBadgeMonitoringMode?.("active", true);
    await flushAsync();

    const activeObserver = observers.find((observer) =>
      observer.observations.some(
        (observation) =>
          observation.target === paneSide &&
          observation.options?.subtree === true,
      ),
    );
    expect(activeObserver).toBeDefined();

    window.__ferxSetBadgeMonitoringMode?.("background", true);
    await flushAsync();

    expect(activeObserver?.disconnected).toBe(true);
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
