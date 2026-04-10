type ServiceRuntimeService = {
  id: string;
  url: string;
  storageKey: string;
  disabled?: boolean;
  notificationPrefs: {
    allowNotifications: boolean;
  };
};

export function createServiceLoadPayload(service: ServiceRuntimeService) {
  return {
    id: service.id,
    url: service.url,
    storageKey: service.storageKey,
    allowNotifications: service.notificationPrefs.allowNotifications,
  };
}

export function createDeletePayload(service: Pick<ServiceRuntimeService, "id" | "storageKey">) {
  return {
    id: service.id,
    storageKey: service.storageKey,
  };
}

export function shouldPreloadService(
  service: Pick<ServiceRuntimeService, "id" | "disabled">,
  activeId: string,
) {
  return !service.disabled && service.id !== activeId;
}
