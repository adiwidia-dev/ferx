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
    expect(readAppSettings(null)).toEqual(DEFAULT_APP_SETTINGS);
  });

  it("falls back to defaults when storage is invalid", () => {
    expect(readAppSettings("{bad json")).toEqual(DEFAULT_APP_SETTINGS);
  });

  it("preserves an explicit disabled spell-check preference", () => {
    expect(readAppSettings('{"spellCheckEnabled":false}')).toEqual({
      spellCheckEnabled: false,
    });
  });

  it("serializes only app-level settings", () => {
    expect(serializeAppSettings({ spellCheckEnabled: true })).toBe('{"spellCheckEnabled":true}');
  });
});
