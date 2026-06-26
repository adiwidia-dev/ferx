import { describe, expect, it } from "vitest";

import {
  APP_SETTINGS_STORAGE_KEY,
  DEFAULT_APP_SETTINGS,
  MAX_STARTUP_PRELOAD_LIMIT,
  readAppSettings,
  serializeAppSettings,
  startupPreloadLimitToMaxPreloads,
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
      startupPreloadLimit: null,
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
      startupPreloadLimit: null,
    });
  });

  it("preserves an explicit enabled resource usage monitoring preference", () => {
    expect(readAppSettings('{"resourceUsageMonitoringEnabled":true}')).toEqual({
      spellCheckEnabled: true,
      resourceUsageMonitoringEnabled: true,
      themeMode: "system",
      startupPreloadLimit: null,
    });
  });

  it("defaults appearance to system when storage is missing", () => {
    expect(readAppSettings(null)).toEqual({
      spellCheckEnabled: true,
      resourceUsageMonitoringEnabled: false,
      themeMode: "system",
      startupPreloadLimit: null,
    });
  });

  it("preserves valid theme mode preferences", () => {
    expect(readAppSettings('{"themeMode":"dark"}')).toEqual({
      spellCheckEnabled: true,
      resourceUsageMonitoringEnabled: false,
      themeMode: "dark",
      startupPreloadLimit: null,
    });

    expect(readAppSettings('{"themeMode":"light"}')).toEqual({
      spellCheckEnabled: true,
      resourceUsageMonitoringEnabled: false,
      themeMode: "light",
      startupPreloadLimit: null,
    });
  });

  it("falls back to system for invalid theme mode values", () => {
    expect(readAppSettings('{"themeMode":"midnight"}')).toEqual({
      spellCheckEnabled: true,
      resourceUsageMonitoringEnabled: false,
      themeMode: "system",
      startupPreloadLimit: null,
    });
  });

  it("preserves valid startup preload limits", () => {
    expect(readAppSettings('{"startupPreloadLimit":0}').startupPreloadLimit).toBe(0);
    expect(readAppSettings('{"startupPreloadLimit":5}').startupPreloadLimit).toBe(5);
    expect(
      readAppSettings(`{"startupPreloadLimit":${MAX_STARTUP_PRELOAD_LIMIT}}`)
        .startupPreloadLimit,
    ).toBe(MAX_STARTUP_PRELOAD_LIMIT);
    expect(readAppSettings('{"startupPreloadLimit":null}').startupPreloadLimit).toBeNull();
  });

  it("falls back to all startup preloads for invalid preload limits", () => {
    for (const saved of [
      '{"startupPreloadLimit":-1}',
      '{"startupPreloadLimit":1.5}',
      `{"startupPreloadLimit":${MAX_STARTUP_PRELOAD_LIMIT + 1}}`,
      '{"startupPreloadLimit":"5"}',
    ]) {
      expect(readAppSettings(saved).startupPreloadLimit).toBeNull();
    }
  });

  it("converts the saved preload preference to a runtime preload cap", () => {
    expect(startupPreloadLimitToMaxPreloads(null)).toBe(Number.MAX_SAFE_INTEGER);
    expect(startupPreloadLimitToMaxPreloads(0)).toBe(0);
    expect(startupPreloadLimitToMaxPreloads(7)).toBe(7);
  });

  it("serializes app-level settings including appearance", () => {
    expect(
      serializeAppSettings({
        spellCheckEnabled: true,
        resourceUsageMonitoringEnabled: true,
        themeMode: "dark",
        startupPreloadLimit: 4,
      }),
    ).toBe(
      '{"spellCheckEnabled":true,"resourceUsageMonitoringEnabled":true,"themeMode":"dark","startupPreloadLimit":4}',
    );
  });
});
