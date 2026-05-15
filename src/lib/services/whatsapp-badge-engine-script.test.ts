// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import whatsappBadgeEngineScript from "../../../src-tauri/scripts/whatsapp_badge_engine.js?raw";
import {
  cleanupBadgeTestGlobals,
  flushBadgeAsync,
  runBadgeEngineScript,
} from "./badge-engine-test-utils";

function runWhatsAppBadgeScript(
  bodyMarkup: string,
  options: {
    title?: string;
  } = {},
) {
  return runBadgeEngineScript({
    bodyMarkup,
    title: options.title ?? "WhatsApp",
    engineScript: whatsappBadgeEngineScript,
    dispatchDOMContentLoaded: true,
  });
}

afterEach(cleanupBadgeTestGlobals);

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

    await flushBadgeAsync();

    expect(reports.at(-1)).toBe("count:5");
  });

  it("emits clear while chat list has not loaded yet", async () => {
    const { reports } = runWhatsAppBadgeScript("", {
      title: "(2) WhatsApp",
    });

    await flushBadgeAsync();

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

    await flushBadgeAsync();

    expect(reports.at(-1)).toBe("count:5");
  });

  it("does not treat read-chat numeric timestamps as unread badges", async () => {
    const { reports } = runWhatsAppBadgeScript(`
      <div id="pane-side">
        <div role="row" aria-label="Project Team">
          <span>Project Team</span>
          <span data-testid="msg-time">1</span>
        </div>
      </div>
    `);

    await flushBadgeAsync();

    expect(reports.at(-1)).toBe("clear");
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
      {},
    );

    const paneSide = document.querySelector("#pane-side");
    expect(paneSide).not.toBeNull();

    await flushBadgeAsync();
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
    await flushBadgeAsync();

    const activeObserver = observers.find((observer) =>
      observer.observations.some(
        (observation) =>
          observation.target === paneSide &&
          observation.options?.subtree === true,
      ),
    );
    expect(activeObserver).toBeDefined();

    window.__ferxSetBadgeMonitoringMode?.("background", true);
    await flushBadgeAsync();

    expect(activeObserver?.disconnected).toBe(true);
  });
});
