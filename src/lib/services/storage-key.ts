type ServiceWithOptionalStorageKey = {
  id: string;
  name: string;
  url: string;
  storageKey?: string;
  disabled?: boolean;
  badge?: number;
};

type ServiceWithStorageKey = ServiceWithOptionalStorageKey & {
  storageKey: string;
};

export function createStorageKey() {
  return `storage-${crypto.randomUUID().slice(0, 8)}`;
}

export function ensureServiceStorageKeys(
  services: ServiceWithOptionalStorageKey[],
): {
  services: ServiceWithStorageKey[];
  changed: boolean;
} {
  const seenStorageKeys = new Set<string>();
  let changed = false;

  const migratedServices = services.map<ServiceWithStorageKey>((service) => {
    let storageKey = service.storageKey;

    if (!storageKey || seenStorageKeys.has(storageKey)) {
      storageKey = createStorageKey();
      changed = true;

      while (seenStorageKeys.has(storageKey)) {
        storageKey = createStorageKey();
      }
    }

    seenStorageKeys.add(storageKey);

    return { ...service, storageKey };
  });

  return {
    services: migratedServices,
    changed,
  };
}
