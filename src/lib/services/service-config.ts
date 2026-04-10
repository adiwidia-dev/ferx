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
    ? (parsedValue as StoredService[])
    : [];

  const { services: withStorageKeys } = ensureServiceStorageKeys(parsedServices);
  const { services } = ensureServiceNotificationPrefs(withStorageKeys);

  return {
    services,
    recoveredFromCorruption: false,
  };
}

export type { StoredService };
