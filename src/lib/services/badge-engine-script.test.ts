// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import badgeEngineScript from "../../../src-tauri/scripts/badge_engine.js?raw";
import {
  cleanupBadgeTestGlobals,
  flushBadgeAsync,
  installMutationObserverMock,
  reconfigureJsdomUrl,
} from "./badge-engine-test-utils";

function runGenericBadgeScript(title = "Service") {
  vi.useFakeTimers();
  reconfigureJsdomUrl("https://example.com/app");
  document.title = title;
  document.body.innerHTML = "<main></main>";
  installMutationObserverMock();

  const reports: string[] = [];
  window.__TAURI_INTERNALS__ = { invoke: vi.fn() };
  window.__ferxBadgeReports = reports;

  const script = badgeEngineScript
    .replace("__FERX_STRATEGY__", "unsupported")
    .replace(
      "window.location.href = 'https://ferx.notify/' + payload;",
      "window.__ferxBadgeReports.push(payload);",
    );

  window.eval(script);

  return { reports };
}

afterEach(cleanupBadgeTestGlobals);

describe("generic badge engine script", () => {
  it("delays the initial clear payload so startup navigation is not interrupted", async () => {
    const { reports } = runGenericBadgeScript();

    await flushBadgeAsync();
    expect(reports).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1000);
    await flushBadgeAsync();

    expect(reports).toEqual(["clear"]);
  });

  it("reports title counts immediately", async () => {
    const { reports } = runGenericBadgeScript("(2) Service");

    await flushBadgeAsync();

    expect(reports).toEqual(["count:2"]);
  });
});
