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

const STORAGE_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

function isValidStorageKey(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && STORAGE_KEY_PATTERN.test(value);
}

function isNotificationPrefs(value: unknown): value is StoredService["notificationPrefs"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
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

function parseStoredService(value: unknown): StoredService | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.url !== "string" ||
    (candidate.disabled !== undefined && typeof candidate.disabled !== "boolean") ||
    (candidate.badge !== undefined && typeof candidate.badge !== "number") ||
    (candidate.notificationPrefs !== undefined &&
      !isNotificationPrefs(candidate.notificationPrefs))
  ) {
    return null;
  }

  if (candidate.storageKey !== undefined) {
    if (typeof candidate.storageKey !== "string") {
      return null;
    }

    if (!isValidStorageKey(candidate.storageKey)) {
      return {
        id: candidate.id,
        name: candidate.name,
        url: candidate.url,
        disabled: candidate.disabled,
        badge: candidate.badge,
        notificationPrefs: candidate.notificationPrefs,
      };
    }
  }

  return {
    id: candidate.id,
    name: candidate.name,
    url: candidate.url,
    storageKey: candidate.storageKey,
    disabled: candidate.disabled,
    badge: candidate.badge,
    notificationPrefs: candidate.notificationPrefs,
  };
}

export function normalizeServiceUrl(
  rawUrl: string,
): { ok: true; url: string } | { ok: false; message: string } {
  const trimmedUrl = rawUrl.trim();
  const urlWithScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmedUrl)
    ? trimmedUrl
    : `https://${trimmedUrl}`;

  try {
    const normalizedUrl = new URL(urlWithScheme);

    if (normalizedUrl.protocol !== "http:" && normalizedUrl.protocol !== "https:") {
      throw new TypeError("Unsupported URL scheme");
    }

    return {
      ok: true,
      url: normalizedUrl.toString(),
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
    ? parsedValue.flatMap((service) => {
        const parsedService = parseStoredService(service);
        return parsedService ? [parsedService] : [];
      })
    : [];

  const { services: withStorageKeys } = ensureServiceStorageKeys(parsedServices);
  const { services } = ensureServiceNotificationPrefs(withStorageKeys);

  return {
    services,
    recoveredFromCorruption: false,
  };
}

export type { StoredService };
