// @vitest-environment jsdom
import { flushSync, mount, unmount } from "svelte";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import SettingsPage from "./+page.svelte";

describe("settings page", () => {
  it("renders readonly app info and a check update button", () => {
    const component = mount(SettingsPage, {
      target: document.body,
    });

    flushSync();

    expect(document.body.textContent).toContain("Settings");
    expect(document.body.textContent).toContain("Ferx");
    expect(document.body.textContent).toContain("0.1.0");

    const checkUpdateButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Check Update"),
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
