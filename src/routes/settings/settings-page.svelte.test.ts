// @vitest-environment jsdom
import { flushSync, mount, unmount } from "svelte";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

import packageJson from "../../../package.json";
import SettingsPage from "./+page.svelte";

describe("settings page", () => {
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
