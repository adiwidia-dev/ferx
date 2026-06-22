// @vitest-environment jsdom
import { flushSync, mount, unmount } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
const goto = vi.hoisted(() => vi.fn());
const listen = vi.hoisted(() =>
  vi.fn((_event: string, _callback: (event: { payload: unknown }) => void) =>
    Promise.resolve(() => {}),
  ),
);

vi.mock("$app/navigation", () => ({
  goto,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

import packageJson from "../../../package.json";
import { clearDndState } from "$lib/services/dnd-state.svelte";
import {
  clearRuntimeBadges,
  setRuntimeBadge,
} from "$lib/services/runtime-badges.svelte";
import { DEFAULT_NOTIFICATION_PREFS } from "$lib/services/notification-prefs";
import {
  WORKSPACES_STATE_KEY,
  WORKSPACES_STATE_VERSION,
  type WorkspaceGroupsState,
} from "$lib/services/workspace-groups";
import SettingsPage from "./+page.svelte";

function createServiceManagementState(): WorkspaceGroupsState {
  return {
    version: WORKSPACES_STATE_VERSION,
    currentWorkspaceId: "personal",
    workspaces: [
      {
        id: "personal",
        name: "Personal",
        serviceIds: ["whatsapp-personal", "gmail"],
        activeServiceId: "whatsapp-personal",
        icon: "user",
      },
      {
        id: "work",
        name: "Work",
        serviceIds: ["whatsapp-work", "gmail"],
        activeServiceId: "whatsapp-work",
        icon: "briefcase",
      },
    ],
    servicesById: {
      "whatsapp-personal": {
        id: "whatsapp-personal",
        name: "WhatsApp Personal",
        url: "https://web.whatsapp.com/",
        storageKey: "storage-whatsapp-personal",
        notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
      },
      "whatsapp-work": {
        id: "whatsapp-work",
        name: "WhatsApp Work",
        url: "https://web.whatsapp.com/",
        storageKey: "storage-whatsapp-work",
        notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
      },
      gmail: {
        id: "gmail",
        name: "Gmail",
        url: "https://mail.google.com/mail/u/0/",
        storageKey: "storage-gmail",
        notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
      },
    },
  };
}

describe("settings page", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
    localStorage.clear();
    invoke.mockClear();
    goto.mockClear();
    listen.mockClear();
    clearDndState();
    clearRuntimeBadges();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:ferx-export"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
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

  it("renders a resource usage monitoring toggle that defaults to disabled and persists changes", () => {
    const component = mount(SettingsPage, {
      target: document.body,
    });

    flushSync();

    expect(document.body.textContent).toContain("Resource Usage Monitoring");
    expect(document.body.textContent).toContain("Shows estimated resource activity for the active service.");

    const checkbox = document.querySelector(
      'input[type="checkbox"][name="resource-usage-monitoring-enabled"]',
    ) as HTMLInputElement | null;

    expect(checkbox).toBeTruthy();
    expect(checkbox?.checked).toBe(false);

    checkbox!.checked = true;
    checkbox!.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();

    expect(localStorage.getItem("ferx-app-settings")).toBe(
      '{"spellCheckEnabled":true,"resourceUsageMonitoringEnabled":true,"themeMode":"system"}',
    );
    expect(document.body.textContent).not.toContain("Restart Ferx to apply resource usage changes.");

    unmount(component);
  });

  it("renders and persists the appearance segmented control", () => {
    localStorage.setItem(
      "ferx-app-settings",
      JSON.stringify({
        spellCheckEnabled: true,
        resourceUsageMonitoringEnabled: false,
        themeMode: "system",
      }),
    );

    const component = mount(SettingsPage, {
      target: document.body,
    });

    flushSync();

    expect(document.body.textContent).toContain("Appearance");
    expect(document.body.textContent).toContain(
      "Choose how the Ferx interface follows your system theme.",
    );

    const darkButton = document.querySelector(
      '[data-testid="appearance-option-dark"]',
    ) as HTMLButtonElement | null;
    darkButton?.click();
    flushSync();

    expect(JSON.parse(localStorage.getItem("ferx-app-settings") ?? "{}")).toEqual({
      spellCheckEnabled: true,
      resourceUsageMonitoringEnabled: false,
      themeMode: "dark",
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.body.textContent).not.toContain(
      "Restart Ferx to apply spell checking changes.",
    );

    unmount(component);
  });

  it("removes the dark class when explicit light appearance is selected", () => {
    document.documentElement.classList.add("dark");
    localStorage.setItem(
      "ferx-app-settings",
      JSON.stringify({
        spellCheckEnabled: true,
        resourceUsageMonitoringEnabled: false,
        themeMode: "dark",
      }),
    );

    const component = mount(SettingsPage, {
      target: document.body,
    });

    flushSync();

    const lightButton = document.querySelector(
      '[data-testid="appearance-option-light"]',
    ) as HTMLButtonElement | null;
    lightButton?.click();
    flushSync();

    expect(document.documentElement.classList.contains("dark")).toBe(false);

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
    expect(document.querySelector("header")?.textContent).not.toContain("Check updates");

    const checkUpdateButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Check for Updates"),
    );

    expect(checkUpdateButton).toBeTruthy();

    unmount(component);
  });

  it("renders settings as a same-page utility console with section navigation", () => {
    const component = mount(SettingsPage, {
      target: document.body,
    });

    flushSync();

    const sectionLinks = Array.from(
      document.querySelectorAll('[data-testid="settings-section-nav"] a'),
    ).map((link) => ({
      href: link.getAttribute("href"),
      text: link.textContent?.trim(),
    }));

    expect(sectionLinks).toEqual([
      { href: "/settings#general", text: "General" },
      { href: "/settings#preferences", text: "Preferences" },
      { href: "/settings#services", text: "Services" },
      { href: "/settings#configuration", text: "Configuration" },
      { href: "/settings#updates", text: "Updates" },
    ]);

    for (const id of ["general", "preferences", "services", "configuration", "updates"]) {
      expect(document.querySelector(`section#${id}`)).toBeTruthy();
    }

    unmount(component);
  });

  it("keeps the workspace sidebar controls visible on the settings page", () => {
    localStorage.setItem(
      "ferx-workspace-services",
      JSON.stringify([
        {
          id: "mail",
          name: "Mail",
          url: "https://mail.example.com/",
          storageKey: "storage-mail",
          notificationPrefs: {
            showBadge: true,
            affectTray: true,
            muteAudio: false,
          },
        },
      ]),
    );

    const component = mount(SettingsPage, {
      target: document.body,
    });

    flushSync();

    const buttons = Array.from(document.querySelectorAll("button, a"))
      .map((node) => node.getAttribute("title"))
      .filter(Boolean);

    expect(buttons).toContain("Switch workspace: Default");
    expect(buttons).toContain("Add Service");
    expect(buttons).toContain("Todos");
    expect(buttons).toContain("Settings");

    const addIndex = buttons.indexOf("Add Service");
    const todosIndex = buttons.indexOf("Todos");
    const settingsIndex = buttons.indexOf("Settings");
    expect(todosIndex).toBeGreaterThan(addIndex);
    expect(settingsIndex).toBeGreaterThan(addIndex);
    expect(settingsIndex).toBeGreaterThan(todosIndex);

    const serviceButton = document.querySelector(
      '[title="Mail (Cmd+1)"]',
    ) as HTMLElement | null;
    expect(serviceButton?.className).toContain("h-14 w-16");
    expect(serviceButton?.className).toContain("rounded-2xl");

    unmount(component);
  });

  it("renders service management rows and filters them by search and workspace", () => {
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(createServiceManagementState()));

    const component = mount(SettingsPage, {
      target: document.body,
    });

    flushSync();

    const table = document.querySelector('[data-testid="service-management-table"]');
    expect(table?.textContent).toContain("WhatsApp Personal");
    expect(table?.textContent).toContain("WhatsApp Work");
    expect(table?.textContent).toContain("Gmail");
    expect(table?.textContent).toContain("Personal");
    expect(table?.textContent).toContain("Work");

    const search = document.querySelector(
      '[data-testid="service-management-search"]',
    ) as HTMLInputElement | null;
    search!.value = "google";
    search!.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();

    expect(table?.textContent).toContain("Gmail");
    expect(table?.textContent).not.toContain("WhatsApp Personal");
    expect(table?.textContent).not.toContain("WhatsApp Work");

    search!.value = "";
    search!.dispatchEvent(new Event("input", { bubbles: true }));
    const workspaceFilter = document.querySelector(
      '[data-testid="service-management-workspace-filter"]',
    ) as HTMLSelectElement | null;
    workspaceFilter!.value = "work";
    workspaceFilter!.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();

    expect(table?.textContent).toContain("Gmail");
    expect(table?.textContent).toContain("WhatsApp Work");
    expect(table?.textContent).not.toContain("WhatsApp Personal");

    unmount(component);
  });

  it("persists service management toggles and mirrors runtime sound/close commands", () => {
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(createServiceManagementState()));

    const component = mount(SettingsPage, {
      target: document.body,
    });

    flushSync();
    invoke.mockClear();

    const enabled = document.querySelector(
      '[data-testid="service-enabled-whatsapp-work"]',
    ) as HTMLInputElement | null;
    enabled!.checked = false;
    enabled!.dispatchEvent(new Event("change", { bubbles: true }));

    const badge = document.querySelector(
      '[data-testid="service-badge-whatsapp-work"]',
    ) as HTMLInputElement | null;
    badge!.checked = false;
    badge!.dispatchEvent(new Event("change", { bubbles: true }));

    const tray = document.querySelector(
      '[data-testid="service-tray-whatsapp-work"]',
    ) as HTMLInputElement | null;
    tray!.checked = false;
    tray!.dispatchEvent(new Event("change", { bubbles: true }));

    const sound = document.querySelector(
      '[data-testid="service-sound-whatsapp-work"]',
    ) as HTMLInputElement | null;
    sound!.checked = false;
    sound!.dispatchEvent(new Event("change", { bubbles: true }));

    const native = document.querySelector(
      '[data-testid="service-native-whatsapp-work"]',
    ) as HTMLInputElement | null;
    native!.checked = false;
    native!.dispatchEvent(new Event("change", { bubbles: true }));

    const hibernate = document.querySelector(
      '[data-testid="service-hibernate-whatsapp-work"]',
    ) as HTMLInputElement | null;
    hibernate!.checked = true;
    hibernate!.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();

    const saved = JSON.parse(
      localStorage.getItem(WORKSPACES_STATE_KEY) ?? "",
    ) as WorkspaceGroupsState;
    expect(saved.servicesById["whatsapp-work"].disabled).toBe(true);
    expect(saved.servicesById["whatsapp-work"].hibernateWhenInactive).toBe(true);
    expect(saved.servicesById["whatsapp-work"].notificationPrefs).toEqual({
      showBadge: false,
      affectTray: false,
      muteAudio: true,
      showNativeNotifications: false,
    });
    expect(invoke).toHaveBeenCalledWith("close_webview", {
      payload: { id: "whatsapp-work" },
    });
    expect(invoke).toHaveBeenCalledWith("set_service_webview_audio_muted", {
      payload: { id: "whatsapp-work", muted: true },
    });

    unmount(component);
  });

  it("deletes a managed service after confirmation and shows affected workspaces", () => {
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(createServiceManagementState()));
    setRuntimeBadge("gmail", 8);

    const component = mount(SettingsPage, {
      target: document.body,
    });

    flushSync();
    invoke.mockClear();

    const deleteButton = document.querySelector(
      '[data-testid="service-delete-gmail"]',
    ) as HTMLButtonElement | null;
    deleteButton?.click();
    flushSync();

    expect(document.querySelector('[data-testid="service-delete-dialog"]')).toBeTruthy();
    expect(document.body.textContent).toContain("Delete Gmail?");
    expect(document.body.textContent).toContain("Personal");
    expect(document.body.textContent).toContain("Work");

    const confirmButton = document.querySelector(
      '[data-testid="confirm-service-delete-button"]',
    ) as HTMLButtonElement | null;
    confirmButton?.click();
    flushSync();

    const saved = JSON.parse(
      localStorage.getItem(WORKSPACES_STATE_KEY) ?? "",
    ) as WorkspaceGroupsState;
    expect(saved.servicesById.gmail).toBeUndefined();
    expect(saved.workspaces[0].serviceIds).toEqual(["whatsapp-personal"]);
    expect(saved.workspaces[1].serviceIds).toEqual(["whatsapp-work"]);
    expect(document.querySelector('[data-testid="service-delete-dialog"]')).toBeFalsy();
    expect(invoke).toHaveBeenCalledWith("delete_webview", {
      payload: {
        id: "gmail",
        name: "Gmail",
        url: "https://mail.google.com/mail/u/0/",
        storageKey: "storage-gmail",
        notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
      },
    });

    unmount(component);
  });

  it("keeps runtime notification badges visible on the settings sidebar", () => {
    localStorage.setItem(
      "ferx-workspace-services",
      JSON.stringify([
        {
          id: "mail",
          name: "Mail",
          url: "https://mail.example.com/",
          storageKey: "storage-mail",
          notificationPrefs: {
            showBadge: true,
            affectTray: true,
            muteAudio: false,
          },
        },
      ]),
    );
    setRuntimeBadge("mail", 4);

    const component = mount(SettingsPage, {
      target: document.body,
    });

    flushSync();

    const serviceButton = document.querySelector(
      '[title="Mail (Cmd+1)"]',
    ) as HTMLElement | null;
    expect(serviceButton?.textContent).toContain("4");

    unmount(component);
  });

  it("uses client navigation when selecting a service from settings", () => {
    localStorage.setItem(
      "ferx-workspace-services",
      JSON.stringify([
        {
          id: "mail",
          name: "Mail",
          url: "https://mail.example.com/",
          storageKey: "storage-mail",
          notificationPrefs: {
            showBadge: true,
            affectTray: true,
            muteAudio: false,
          },
        },
      ]),
    );

    const component = mount(SettingsPage, {
      target: document.body,
    });

    flushSync();

    document.querySelector<HTMLElement>('[title="Mail (Cmd+1)"]')?.click();
    flushSync();

    expect(goto).toHaveBeenCalledWith("/?open=mail");

    unmount(component);
  });

  it("mutes service webviews when Do Not Disturb is toggled from settings", () => {
    const component = mount(SettingsPage, {
      target: document.body,
    });

    flushSync();
    invoke.mockClear();

    document.querySelector<HTMLButtonElement>('[title="Turn On Do Not Disturb"]')?.click();
    flushSync();

    expect(invoke).toHaveBeenCalledWith("set_all_service_webviews_audio_muted", {
      payload: { muted: true },
    });

    unmount(component);
  });

  it("asks for confirmation and opens a native save dialog before exporting configuration", async () => {
    invoke.mockResolvedValue(true);
    localStorage.setItem(
      "ferx-workspace-services",
      JSON.stringify([
        {
          id: "mail",
          name: "Mail",
          url: "https://mail.example.com/",
          storageKey: "storage-mail",
          badge: 4,
          notificationPrefs: {
            showBadge: true,
            affectTray: true,
            muteAudio: false,
          },
        },
      ]),
    );

    const component = mount(SettingsPage, {
      target: document.body,
    });

    flushSync();

    const exportButton = document.querySelector(
      '[data-testid="export-config-button"]',
    ) as HTMLButtonElement | null;
    exportButton?.click();
    flushSync();

    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="export-config-dialog"]')).toBeTruthy();
    expect(document.body.textContent).toContain("Export configuration?");
    expect(document.body.textContent).toContain("1 workspace");
    expect(document.body.textContent).toContain("1 service");

    const confirmButton = document.querySelector(
      '[data-testid="confirm-export-config-button"]',
    ) as HTMLButtonElement | null;
    confirmButton?.click();
    await Promise.resolve();
    flushSync();

    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith(
      "save_workspace_config_export",
      expect.objectContaining({
        defaultFilename: expect.stringMatching(/^ferx-workspace-config-\d{4}-\d{2}-\d{2}\.json$/),
        contents: expect.stringContaining('"format": "ferx-workspace-config"'),
      }),
    );
    expect(document.body.textContent).toContain("Configuration export saved.");

    unmount(component);
  });

  it("previews an import file and only writes storage after confirmation", async () => {
    invoke.mockResolvedValue(undefined);
    localStorage.setItem("ferx-app-settings", JSON.stringify({ spellCheckEnabled: true }));
    localStorage.setItem(
      "ferx-workspace-services",
      JSON.stringify([
        {
          id: "old",
          name: "Old",
          url: "https://old.example.com/",
          storageKey: "storage-old",
          notificationPrefs: {
            showBadge: true,
            affectTray: true,
            muteAudio: false,
          },
        },
      ]),
    );

    const component = mount(SettingsPage, {
      target: document.body,
    });

    flushSync();

    const file = new File(
      [
        JSON.stringify({
          ferxExport: {
            format: "ferx-workspace-config",
            version: 1,
            exportedAt: "2026-04-23T12:00:00.000Z",
            appVersion: "0.2.4",
          },
          appSettings: {
            spellCheckEnabled: false,
          },
          services: [
            {
              id: "mail",
              name: "Mail",
              url: "https://mail.example.com",
              storageKey: "storage-mail",
            },
          ],
          activeServiceId: "mail",
        }),
      ],
      "ferx-workspace-config.json",
      { type: "application/json" },
    );
    const input = document.querySelector(
      'input[type="file"][data-testid="import-config-input"]',
    ) as HTMLInputElement | null;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });
    input?.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync();

    expect(localStorage.getItem("ferx-app-settings")).toBe('{"spellCheckEnabled":true}');
    expect(document.querySelector('[data-testid="import-config-dialog"]')).toBeTruthy();
    expect(document.body.textContent).toContain("Import configuration?");
    expect(document.body.textContent).toContain("Mail");
    expect(document.body.textContent).toContain("mail.example.com");

    const confirmButton = document.querySelector(
      '[data-testid="confirm-import-config-button"]',
    ) as HTMLButtonElement | null;
    confirmButton?.click();
    await Promise.resolve();
    flushSync();

    expect(invoke).toHaveBeenCalledWith("close_all_service_webviews");
    expect(localStorage.getItem("ferx-app-settings")).toBe(
      '{"spellCheckEnabled":false,"resourceUsageMonitoringEnabled":false,"themeMode":"system"}',
    );
    expect(localStorage.getItem("ferx-workspace-active-id")).toBeNull();
    expect(localStorage.getItem("ferx-workspace-services")).toBeNull();
    expect(JSON.parse(localStorage.getItem("ferx-workspaces-state") ?? "")).toMatchObject({
      currentWorkspaceId: "default",
      workspaces: [
        {
          id: "default",
          name: "Default",
          serviceIds: ["mail"],
          activeServiceId: "mail",
        },
      ],
      servicesById: {
        mail: {
          id: "mail",
          name: "Mail",
          url: "https://mail.example.com/",
          storageKey: "storage-mail",
        },
      },
    });
    expect(document.body.textContent).toContain("Configuration imported. Reload Ferx to apply it.");

    unmount(component);
  });
});
