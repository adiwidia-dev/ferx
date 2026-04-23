// @vitest-environment jsdom
import { flushSync, mount, unmount } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

import packageJson from "../../../package.json";
import SettingsPage from "./+page.svelte";

describe("settings page", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    invoke.mockClear();
  });

  it("renders a spell-check toggle that defaults to enabled", () => {
    const component = mount(SettingsPage, {
      target: document.body,
    });

    flushSync();

    expect(document.body.textContent).toContain("Enable Spell Checking");
    expect(document.body.textContent).toContain("Uses the built-in spell checker for service inputs.");
    expect(document.body.textContent).not.toContain(
      "Restart Ferx to apply spell checking changes.",
    );

    const checkbox = document.querySelector(
      'input[type="checkbox"][name="spell-check-enabled"]',
    ) as HTMLInputElement | null;

    expect(checkbox).toBeTruthy();
    expect(checkbox?.checked).toBe(true);

    unmount(component);
  });

  it("shows restart warning and restart prompt only after changing spell checking", () => {
    const component = mount(SettingsPage, {
      target: document.body,
    });

    flushSync();

    expect(document.body.textContent).not.toContain(
      "Restart Ferx to apply spell checking changes.",
    );

    const checkbox = document.querySelector(
      'input[type="checkbox"][name="spell-check-enabled"]',
    ) as HTMLInputElement;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();

    expect(document.body.textContent).toContain(
      "Restart Ferx to apply spell checking changes.",
    );
    expect(document.body.textContent).toContain("Spell checking will update after restart.");

    const restartPromptOverlay = document.querySelector(
      '[data-testid="spell-check-restart-prompt-overlay"]',
    );
    const restartPrompt = document.querySelector('[data-testid="spell-check-restart-prompt"]');
    expect(restartPromptOverlay?.className).toContain("absolute inset-0 z-50");
    expect(restartPromptOverlay?.className).toContain("bg-background/45");
    expect(restartPrompt?.className).toContain("w-full max-w-md rounded-2xl");

    const closeButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label") === "Dismiss restart prompt",
    );
    closeButton?.click();
    flushSync();

    expect(document.body.textContent).not.toContain(
      "Spell checking will update after restart.",
    );
    expect(document.body.textContent).toContain("Restart Ferx");

    unmount(component);
  });

  it("does not show restart warning after remounting with the saved spell-check value", () => {
    localStorage.setItem("ferx-app-settings", JSON.stringify({ spellCheckEnabled: false }));

    const component = mount(SettingsPage, {
      target: document.body,
    });

    flushSync();

    const checkbox = document.querySelector(
      'input[type="checkbox"][name="spell-check-enabled"]',
    ) as HTMLInputElement | null;

    expect(checkbox?.checked).toBe(false);
    expect(document.body.textContent).not.toContain(
      "Restart Ferx to apply spell checking changes.",
    );

    unmount(component);
  });

  it("asks for confirmation before manually restarting Ferx", () => {
    const component = mount(SettingsPage, {
      target: document.body,
    });

    flushSync();

    const restartButton = document.querySelector(
      '[data-testid="manual-restart-button"]',
    ) as HTMLButtonElement | null;
    restartButton?.click();
    flushSync();

    expect(invoke).not.toHaveBeenCalledWith("restart_app");
    expect(document.querySelector('[data-testid="restart-confirm-dialog"]')).toBeTruthy();
    expect(document.body.textContent).toContain("Restart Ferx?");

    const confirmButton = document.querySelector(
      '[data-testid="confirm-restart-button"]',
    ) as HTMLButtonElement | null;
    confirmButton?.click();

    expect(invoke).toHaveBeenCalledWith("restart_app");

    unmount(component);
  });

  it("restarts directly from the spell-check restart prompt", () => {
    const component = mount(SettingsPage, {
      target: document.body,
    });

    flushSync();

    const checkbox = document.querySelector(
      'input[type="checkbox"][name="spell-check-enabled"]',
    ) as HTMLInputElement;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();

    const promptRestartButton = document.querySelector(
      '[data-testid="prompt-restart-button"]',
    ) as HTMLButtonElement | null;
    promptRestartButton?.click();
    flushSync();

    expect(document.querySelector('[data-testid="restart-confirm-dialog"]')).toBeFalsy();
    expect(invoke).toHaveBeenCalledWith("restart_app");

    unmount(component);
  });

  it("renders app info and a check for updates button in the idle state", () => {
    const component = mount(SettingsPage, {
      target: document.body,
    });

    flushSync();

    expect(document.body.textContent).toContain("Settings");
    expect(document.body.textContent).toContain("Ferx");
    expect(document.body.textContent).toContain(packageJson.version);
    expect(document.body.textContent).toContain("Automatic updates");
    expect(document.body.textContent).not.toContain("Manual updates");

    const checkUpdateButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Check for Updates"),
    );

    expect(checkUpdateButton).toBeTruthy();

    unmount(component);
  });

  it("renders Settings button after Add Service in the sidebar footer", () => {
    const component = mount(SettingsPage, {
      target: document.body,
    });

    flushSync();

    const buttons = Array.from(document.querySelectorAll("button, a"))
      .map((node) => node.getAttribute("title"))
      .filter(Boolean);

    expect(buttons).toContain("Add Service");
    expect(buttons).toContain("Settings");

    const addIndex = buttons.indexOf("Add Service");
    const settingsIndex = buttons.indexOf("Settings");
    expect(settingsIndex).toBeGreaterThan(addIndex);

    unmount(component);
  });
});
