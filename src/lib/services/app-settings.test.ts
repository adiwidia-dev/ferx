import { describe, expect, it } from "vitest";

import {
  APP_SETTINGS_STORAGE_KEY,
  DEFAULT_APP_SETTINGS,
  readAppSettings,
  serializeAppSettings,
} from "./app-settings";

describe("app settings", () => {
  it("uses a dedicated storage key", () => {
    expect(APP_SETTINGS_STORAGE_KEY).toBe("ferx-app-settings");
  });

  it("defaults spell checking to enabled when storage is missing", () => {
    expect(readAppSettings(null)).toEqual({
      ...DEFAULT_APP_SETTINGS,
      spellCheckEnabled: true,
      resourceUsageMonitoringEnabled: false,
      themeMode: "system",
    });
  });

  it("falls back to defaults when storage is invalid", () => {
    expect(readAppSettings("{bad json")).toEqual(DEFAULT_APP_SETTINGS);
  });

  it("preserves an explicit disabled spell-check preference", () => {
    expect(readAppSettings('{"spellCheckEnabled":false}')).toEqual({
      spellCheckEnabled: false,
      resourceUsageMonitoringEnabled: false,
      themeMode: "system",
    });
  });

  it("preserves an explicit enabled resource usage monitoring preference", () => {
    expect(readAppSettings('{"resourceUsageMonitoringEnabled":true}')).toEqual({
      spellCheckEnabled: true,
      resourceUsageMonitoringEnabled: true,
      themeMode: "system",
    });
  });

  it("defaults appearance to system when storage is missing", () => {
    expect(readAppSettings(null)).toEqual({
      spellCheckEnabled: true,
      resourceUsageMonitoringEnabled: false,
      themeMode: "system",
    });
  });

  it("preserves valid theme mode preferences", () => {
    expect(readAppSettings('{"themeMode":"dark"}')).toEqual({
      spellCheckEnabled: true,
      resourceUsageMonitoringEnabled: false,
      themeMode: "dark",
    });

    expect(readAppSettings('{"themeMode":"light"}')).toEqual({
      spellCheckEnabled: true,
      resourceUsageMonitoringEnabled: false,
      themeMode: "light",
    });
  });

  it("falls back to system for invalid theme mode values", () => {
    expect(readAppSettings('{"themeMode":"midnight"}')).toEqual({
      spellCheckEnabled: true,
      resourceUsageMonitoringEnabled: false,
      themeMode: "system",
    });
  });

  it("serializes app-level settings including appearance", () => {
    expect(
      serializeAppSettings({
        spellCheckEnabled: true,
        resourceUsageMonitoringEnabled: true,
        themeMode: "dark",
      }),
    ).toBe(
      '{"spellCheckEnabled":true,"resourceUsageMonitoringEnabled":true,"themeMode":"dark"}',
    );
  });
});
