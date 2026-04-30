import {
  APP_SETTINGS_STORAGE_KEY,
  readAppSettings,
  serializeAppSettings,
  type AppSettings,
} from "./app-settings";
import { ensureServiceNotificationPrefs, type NotificationPrefs } from "./notification-prefs";
import { normalizeServiceUrl } from "./service-config";
import { ensureServiceStorageKeys } from "./storage-key";
import type { PageService } from "./workspace-state";
import {
  WORKSPACE_CONFIG_EXPORT_FORMAT,
  WORKSPACE_CONFIG_EXPORT_LEGACY_VERSION,
  WORKSPACE_CONFIG_EXPORT_VERSION,
} from "./workspace-config-export";
import {
  WORKSPACES_STATE_KEY,
  createDefaultWorkspaceGroupsState,
  normalizeWorkspaceGroupsState,
  serializeWorkspaceGroupsState,
  type WorkspaceGroup,
  type WorkspaceGroupsState,
} from "./workspace-groups";

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
  workspaceState: WorkspaceGroupsState;
  appSettings: AppSettings;
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
  for (const key of ["showBadge", "affectTray", "muteAudio"] as const) {
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

function normalizeImportedServices(
  values: unknown[],
): { ok: true; services: PageService[] } | { ok: false; message: string } {
  if (values.length > WORKSPACE_CONFIG_IMPORT_MAX_SERVICES) {
    return {
      ok: false,
      message: `Import files can contain at most ${WORKSPACE_CONFIG_IMPORT_MAX_SERVICES} services.`,
    };
  }

  const seenIds = new Set<string>();
  const parsedServices: ImportedServiceDraft[] = [];
  for (const service of values) {
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

  return { ok: true, services };
}

function parseWorkspaceGroupsState(value: unknown): WorkspaceGroupsState | string {
  if (!isRecord(value)) {
    return "Import file does not contain workspace state.";
  }

  if (!isRecord(value.servicesById)) {
    return "Import file does not contain a services list.";
  }

  const normalizedServices = normalizeImportedServices(Object.values(value.servicesById));
  if (!normalizedServices.ok) {
    return normalizedServices.message;
  }

  const servicesById = Object.fromEntries(
    normalizedServices.services.map((service) => [service.id, service]),
  );
  const workspaces = Array.isArray(value.workspaces)
    ? value.workspaces.flatMap<WorkspaceGroup>((workspace) => {
        if (!isRecord(workspace)) {
          return [];
        }

        return [
          {
            id: typeof workspace.id === "string" ? workspace.id : "",
            name: typeof workspace.name === "string" ? workspace.name : "",
            serviceIds: Array.isArray(workspace.serviceIds)
              ? workspace.serviceIds.filter((serviceId): serviceId is string => typeof serviceId === "string")
              : [],
            activeServiceId:
              typeof workspace.activeServiceId === "string" ? workspace.activeServiceId : "",
            ...(typeof workspace.color === "string" ? { color: workspace.color } : {}),
            ...(typeof workspace.icon === "string" ? { icon: workspace.icon } : {}),
          },
        ];
      })
    : [];

  return normalizeWorkspaceGroupsState({
    version: 1,
    currentWorkspaceId:
      typeof value.currentWorkspaceId === "string" ? value.currentWorkspaceId : "",
    workspaces,
    servicesById,
  });
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

  const exportVersion = parsed.ferxExport.version;
  if (
    exportVersion !== WORKSPACE_CONFIG_EXPORT_LEGACY_VERSION &&
    exportVersion !== WORKSPACE_CONFIG_EXPORT_VERSION
  ) {
    return {
      ok: false,
      message:
        typeof exportVersion === "number" &&
        exportVersion > WORKSPACE_CONFIG_EXPORT_VERSION
          ? "This file was created by a newer Ferx. Please update Ferx."
          : "This Ferx configuration export version is not supported.",
    };
  }

  const appSettings = readAppSettings(
    isRecord(parsed.appSettings) ? JSON.stringify(parsed.appSettings) : null,
  );

  if (exportVersion === WORKSPACE_CONFIG_EXPORT_VERSION) {
    const workspaceState = parseWorkspaceGroupsState(parsed.workspaceState);
    if (typeof workspaceState === "string") {
      return {
        ok: false,
        message: workspaceState,
      };
    }

    return {
      ok: true,
      value: {
        workspaceState,
        appSettings,
      },
    };
  }

  if (!Array.isArray(parsed.services)) {
    return {
      ok: false,
      message: "Import file does not contain a services list.",
    };
  }

  const normalizedServices = normalizeImportedServices(parsed.services);
  if (!normalizedServices.ok) {
    return normalizedServices;
  }

  const activeServiceId =
    typeof parsed.activeServiceId === "string" ? parsed.activeServiceId.trim() : "";

  return {
    ok: true,
    value: {
      workspaceState: createDefaultWorkspaceGroupsState(
        normalizedServices.services,
        activeServiceId,
      ),
      appSettings,
    },
  };
}

export function writeWorkspaceConfigImportToStorage(
  config: ImportedWorkspaceConfig,
  storage: Storage,
) {
  storage.setItem(WORKSPACES_STATE_KEY, serializeWorkspaceGroupsState(config.workspaceState));
  storage.setItem(APP_SETTINGS_STORAGE_KEY, serializeAppSettings(config.appSettings));
  storage.removeItem("ferx-workspace-services");
  storage.removeItem("ferx-workspace-active-id");
}
