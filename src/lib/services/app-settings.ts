export const APP_SETTINGS_STORAGE_KEY = "ferx-app-settings";

export interface AppSettings {
  spellCheckEnabled: boolean;
  resourceUsageMonitoringEnabled: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  spellCheckEnabled: true,
  resourceUsageMonitoringEnabled: false,
};

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
    };
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

export function serializeAppSettings(settings: AppSettings): string {
  return JSON.stringify({
    spellCheckEnabled: settings.spellCheckEnabled,
    resourceUsageMonitoringEnabled: settings.resourceUsageMonitoringEnabled,
  });
}
