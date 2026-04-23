import {
  APP_SETTINGS_STORAGE_KEY,
  readAppSettings,
  serializeAppSettings,
  type AppSettings,
} from "./app-settings";
import { ensureServiceNotificationPrefs, type NotificationPrefs } from "./notification-prefs";
import { normalizeServiceUrl } from "./service-config";
import { ensureServiceStorageKeys } from "./storage-key";
import {
  serializeServicesForStorage,
  WORKSPACE_ACTIVE_ID_KEY,
  type PageService,
} from "./workspace-state";
import {
  WORKSPACE_CONFIG_EXPORT_FORMAT,
  WORKSPACE_CONFIG_EXPORT_VERSION,
} from "./workspace-config-export";

export const WORKSPACE_CONFIG_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const WORKSPACE_CONFIG_IMPORT_MAX_SERVICES = 200;

const STORAGE_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

type ParseResult =
  | {
      ok: true;
      value: ImportedWorkspaceConfig;
    }
  | {
      ok: false;
      message: string;
    };

export interface ImportedWorkspaceConfig {
  services: PageService[];
  appSettings: AppSettings;
  activeId: string;
}

type ImportedServiceDraft = {
  id: string;
  name: string;
  url: string;
  storageKey?: string;
  disabled?: boolean;
  iconBgColor?: string;
  notificationPrefs?: Partial<NotificationPrefs>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isValidStorageKey(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && STORAGE_KEY_PATTERN.test(value);
}

function parseNotificationPrefs(value: unknown): Partial<NotificationPrefs> | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    return null;
  }

  const prefs: Partial<NotificationPrefs> = {};
  for (const key of ["showBadge", "affectTray", "allowNotifications"] as const) {
    const candidate = value[key];
    if (candidate !== undefined && typeof candidate !== "boolean") {
      return null;
    }
    if (candidate !== undefined) {
      prefs[key] = candidate;
    }
  }

  return prefs;
}

function parseImportedService(value: unknown): ImportedServiceDraft | string {
  if (!isRecord(value)) {
    return "Import contains an invalid service entry.";
  }

  const id = typeof value.id === "string" ? value.id.trim() : "";
  const name = typeof value.name === "string" ? value.name.trim() : "";

  if (!id || !name || typeof value.url !== "string") {
    return "Import contains an invalid service entry.";
  }

  if (value.disabled !== undefined && typeof value.disabled !== "boolean") {
    return `Service "${name}" has an invalid disabled flag.`;
  }

  if (value.iconBgColor !== undefined && typeof value.iconBgColor !== "string") {
    return `Service "${name}" has an invalid icon color.`;
  }

  const normalized = normalizeServiceUrl(value.url);
  if (!normalized.ok) {
    return `Service "${name}" has an invalid URL.`;
  }

  const notificationPrefs = parseNotificationPrefs(value.notificationPrefs);
  if (notificationPrefs === null) {
    return `Service "${name}" has invalid notification preferences.`;
  }

  return {
    id,
    name,
    url: normalized.url,
    ...(isValidStorageKey(value.storageKey) ? { storageKey: value.storageKey } : {}),
    ...(value.disabled === undefined ? {} : { disabled: value.disabled }),
    ...(value.iconBgColor === undefined ? {} : { iconBgColor: value.iconBgColor }),
    ...(notificationPrefs === undefined ? {} : { notificationPrefs }),
  };
}

export function parseWorkspaceConfigImport(fileContents: string): ParseResult {
  if (fileContents.length > WORKSPACE_CONFIG_IMPORT_MAX_BYTES) {
    return {
      ok: false,
      message: "File is too large to import.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fileContents);
  } catch {
    return {
      ok: false,
      message: "File is not valid JSON.",
    };
  }

  if (!isRecord(parsed) || !isRecord(parsed.ferxExport)) {
    return {
      ok: false,
      message: "This is not a Ferx configuration export.",
    };
  }

  if (parsed.ferxExport.format !== WORKSPACE_CONFIG_EXPORT_FORMAT) {
    return {
      ok: false,
      message: "This is not a Ferx configuration export.",
    };
  }

  if (parsed.ferxExport.version !== WORKSPACE_CONFIG_EXPORT_VERSION) {
    return {
      ok: false,
      message:
        typeof parsed.ferxExport.version === "number" &&
        parsed.ferxExport.version > WORKSPACE_CONFIG_EXPORT_VERSION
          ? "This file was created by a newer Ferx. Please update Ferx."
          : "This Ferx configuration export version is not supported.",
    };
  }

  if (!Array.isArray(parsed.services)) {
    return {
      ok: false,
      message: "Import file does not contain a services list.",
    };
  }

  if (parsed.services.length > WORKSPACE_CONFIG_IMPORT_MAX_SERVICES) {
    return {
      ok: false,
      message: `Import files can contain at most ${WORKSPACE_CONFIG_IMPORT_MAX_SERVICES} services.`,
    };
  }

  const seenIds = new Set<string>();
  const parsedServices: ImportedServiceDraft[] = [];
  for (const service of parsed.services) {
    const parsedService = parseImportedService(service);
    if (typeof parsedService === "string") {
      return {
        ok: false,
        message: parsedService,
      };
    }

    if (seenIds.has(parsedService.id)) {
      return {
        ok: false,
        message: `Import contains duplicate service id "${parsedService.id}".`,
      };
    }

    seenIds.add(parsedService.id);
    parsedServices.push(parsedService);
  }

  const withStorageKeys = ensureServiceStorageKeys(parsedServices).services as Array<
    ImportedServiceDraft & { storageKey: string }
  >;
  const withNotificationPrefs = ensureServiceNotificationPrefs(withStorageKeys).services as Array<
    ImportedServiceDraft & { storageKey: string; notificationPrefs: NotificationPrefs }
  >;
  const services = withNotificationPrefs.map<PageService>((service) => ({
      id: service.id,
      name: service.name,
      url: service.url,
      storageKey: service.storageKey,
      ...(service.disabled === undefined ? {} : { disabled: service.disabled }),
      ...(service.iconBgColor === undefined ? {} : { iconBgColor: service.iconBgColor }),
      notificationPrefs: { ...service.notificationPrefs },
    }));
  const appSettings = readAppSettings(
    isRecord(parsed.appSettings) ? JSON.stringify(parsed.appSettings) : null,
  );
  const activeServiceId =
    typeof parsed.activeServiceId === "string" ? parsed.activeServiceId.trim() : "";
  const activeId = services.some(
    (service) => service.id === activeServiceId && !service.disabled,
  )
    ? activeServiceId
    : "";

  return {
    ok: true,
    value: {
      services,
      appSettings,
      activeId,
    },
  };
}

export function writeWorkspaceConfigImportToStorage(
  config: ImportedWorkspaceConfig,
  storage: Storage,
) {
  storage.setItem("ferx-workspace-services", serializeServicesForStorage(config.services));
  storage.setItem(APP_SETTINGS_STORAGE_KEY, serializeAppSettings(config.appSettings));

  if (config.activeId) {
    storage.setItem(WORKSPACE_ACTIVE_ID_KEY, config.activeId);
  } else {
    storage.removeItem(WORKSPACE_ACTIVE_ID_KEY);
  }
}
