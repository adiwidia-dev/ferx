import { ensureServiceNotificationPrefs } from "./notification-prefs";
import { ensureServiceStorageKeys } from "./storage-key";

type StoredService = {
  id: string;
  name: string;
  url: string;
  storageKey?: string;
  disabled?: boolean;
  badge?: number;
  notificationPrefs?: {
    showBadge?: boolean;
    affectTray?: boolean;
    allowNotifications?: boolean;
  };
};

function isNotificationPrefs(value: unknown): value is StoredService["notificationPrefs"] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    (candidate.showBadge === undefined || typeof candidate.showBadge === "boolean") &&
    (candidate.affectTray === undefined ||
      typeof candidate.affectTray === "boolean") &&
    (candidate.allowNotifications === undefined ||
      typeof candidate.allowNotifications === "boolean")
  );
}

function isStoredService(value: unknown): value is StoredService {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.url === "string" &&
    (candidate.storageKey === undefined || typeof candidate.storageKey === "string") &&
    (candidate.disabled === undefined || typeof candidate.disabled === "boolean") &&
    (candidate.badge === undefined || typeof candidate.badge === "number") &&
    (candidate.notificationPrefs === undefined ||
      isNotificationPrefs(candidate.notificationPrefs))
  );
}

export function normalizeServiceUrl(
  rawUrl: string,
): { ok: true; url: string } | { ok: false; message: string } {
  const trimmedUrl = rawUrl.trim();
  const urlWithScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmedUrl)
    ? trimmedUrl
    : `https://${trimmedUrl}`;

  try {
    return {
      ok: true,
      url: new URL(urlWithScheme).toString(),
    };
  } catch {
    return {
      ok: false,
      message: "Please enter a valid service URL.",
    };
  }
}

export function readStoredServices(saved: string | null): {
  services: StoredService[];
  recoveredFromCorruption: boolean;
} {
  if (saved === null) {
    return {
      services: [],
      recoveredFromCorruption: false,
    };
  }

  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(saved);
  } catch {
    return {
      services: [],
      recoveredFromCorruption: true,
    };
  }

  const parsedServices = Array.isArray(parsedValue)
    ? parsedValue.filter(isStoredService)
    : [];

  const { services: withStorageKeys } = ensureServiceStorageKeys(parsedServices);
  const { services } = ensureServiceNotificationPrefs(withStorageKeys);

  return {
    services,
    recoveredFromCorruption: false,
  };
}

export type { StoredService };
