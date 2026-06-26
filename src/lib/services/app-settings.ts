export const APP_SETTINGS_STORAGE_KEY = "ferx-app-settings";
export const MAX_STARTUP_PRELOAD_LIMIT = 200;

export type ThemeMode = "system" | "light" | "dark";
export type StartupPreloadLimit = number | null;

export interface AppSettings {
  spellCheckEnabled: boolean;
  resourceUsageMonitoringEnabled: boolean;
  themeMode: ThemeMode;
  startupPreloadLimit: StartupPreloadLimit;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  spellCheckEnabled: true,
  resourceUsageMonitoringEnabled: false,
  themeMode: "system",
  startupPreloadLimit: null,
};

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

export function normalizeStartupPreloadLimit(value: unknown): StartupPreloadLimit {
  if (value === null || value === undefined) {
    return DEFAULT_APP_SETTINGS.startupPreloadLimit;
  }

  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_STARTUP_PRELOAD_LIMIT
  ) {
    return value;
  }

  return DEFAULT_APP_SETTINGS.startupPreloadLimit;
}

export function startupPreloadLimitToMaxPreloads(limit: StartupPreloadLimit): number {
  return limit === null ? Number.MAX_SAFE_INTEGER : limit;
}

export function readAppSettings(saved: string | null): AppSettings {
  if (!saved) {
    return { ...DEFAULT_APP_SETTINGS };
  }

  try {
    const parsed = JSON.parse(saved) as Partial<AppSettings>;

    return {
      spellCheckEnabled:
        typeof parsed.spellCheckEnabled === "boolean"
          ? parsed.spellCheckEnabled
          : DEFAULT_APP_SETTINGS.spellCheckEnabled,
      resourceUsageMonitoringEnabled:
        typeof parsed.resourceUsageMonitoringEnabled === "boolean"
          ? parsed.resourceUsageMonitoringEnabled
          : DEFAULT_APP_SETTINGS.resourceUsageMonitoringEnabled,
      themeMode: isThemeMode(parsed.themeMode)
        ? parsed.themeMode
        : DEFAULT_APP_SETTINGS.themeMode,
      startupPreloadLimit: normalizeStartupPreloadLimit(parsed.startupPreloadLimit),
    };
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

export function serializeAppSettings(settings: AppSettings): string {
  return JSON.stringify({
    spellCheckEnabled: settings.spellCheckEnabled,
    resourceUsageMonitoringEnabled: settings.resourceUsageMonitoringEnabled,
    themeMode: settings.themeMode,
    startupPreloadLimit: settings.startupPreloadLimit,
  });
}
