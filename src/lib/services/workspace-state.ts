import {
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefs,
} from "$lib/services/notification-prefs";
import {
  normalizeServiceUrl,
  readStoredServices,
} from "$lib/services/service-config";
import { createDeletePayload } from "$lib/services/service-runtime";
import { createStorageKey } from "$lib/services/storage-key";

/** Last focused service in the workspace sidebar (survives navigation to /settings). */
export const WORKSPACE_ACTIVE_ID_KEY = "ferx-workspace-active-id";

export interface PageService {
  id: string;
  name: string;
  url: string;
  storageKey: string;
  notificationPrefs: NotificationPrefs;
  disabled?: boolean;
  badge?: number;
  iconBgColor?: string;
}

export function serializeServicesForStorage(services: PageService[]): string {
  return JSON.stringify(
    services.map(({ badge: _badge, ...service }) => service),
  );
}

export function readStartupState(saved: string | null): {
  services: PageService[];
  activeId: string;
  toastMessage: string;
} {
  const { services, recoveredFromCorruption } = readStoredServices(saved);
  const startupServices = (services as PageService[]).map((service) => ({
    ...service,
    badge: undefined,
  }));
  const firstEnabled = startupServices.find((service) => !service.disabled);
  let activeId = firstEnabled?.id ?? "";
  if (typeof localStorage !== "undefined") {
    const storedActive = localStorage.getItem(WORKSPACE_ACTIVE_ID_KEY);
    if (storedActive) {
      const match = startupServices.find(
        (service) => service.id === storedActive && !service.disabled,
      );
      if (match) {
        activeId = match.id;
      }
    }
  }

  return {
    services: startupServices,
    activeId,
    toastMessage: recoveredFromCorruption ? "Saved services were reset." : "",
  };
}

export function saveServiceState({
  services,
  activeId,
  editingServiceId,
  newServiceName,
  newServiceUrl,
  newIconBgColor,
  createServiceId,
}: {
  services: PageService[];
  activeId: string;
  editingServiceId: string | null;
  newServiceName: string;
  newServiceUrl: string;
  newIconBgColor?: string;
  createServiceId: () => string;
}): {
  services: PageService[];
  activeId: string;
  toastMessage: string;
  shouldCloseModal: boolean;
  loadService?: PageService;
  deleteWebview?: { id: string; storageKey: string };
} {
  if (!newServiceName || !newServiceUrl) {
    return {
      services,
      activeId,
      toastMessage: "",
      shouldCloseModal: false,
    };
  }

  const normalized = normalizeServiceUrl(newServiceUrl);

  if (!normalized.ok) {
    return {
      services,
      activeId,
      toastMessage: normalized.message,
      shouldCloseModal: false,
    };
  }

  if (editingServiceId) {
    const existingService = services.find((service) => service.id === editingServiceId);

    if (!existingService) {
      return {
        services,
        activeId,
        toastMessage: "",
        shouldCloseModal: false,
      };
    }

    const updatedService = {
      ...existingService,
      name: newServiceName,
      url: normalized.url,
      iconBgColor: newIconBgColor || undefined,
    };
    const existingNormalized = normalizeServiceUrl(existingService.url);
    const effectiveUrlChanged = !existingNormalized.ok || existingNormalized.url !== normalized.url;

    return {
      services: services.map((service) =>
        service.id === editingServiceId ? updatedService : service,
      ),
      activeId,
      toastMessage: "",
      shouldCloseModal: true,
      deleteWebview: effectiveUrlChanged
        ? {
            id: existingService.id,
            storageKey: existingService.storageKey,
          }
        : undefined,
    };
  }

  const newService: PageService = {
    id: createServiceId(),
    name: newServiceName,
    url: normalized.url,
    storageKey: createStorageKey(),
    notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS },
    iconBgColor: newIconBgColor || undefined,
  };

  return {
    services: [...services, newService],
    activeId: newService.id,
    toastMessage: "",
    shouldCloseModal: true,
    loadService: newService,
  };
}

export async function applySaveServiceResult({
  nextState,
  editingServiceId,
  currentActiveId,
  showToast,
  setState,
  deleteWebview,
  loadService,
}: {
  nextState: ReturnType<typeof saveServiceState>;
  editingServiceId: string | null;
  currentActiveId: string;
  showToast: (message: string) => void;
  setState: (state: {
    services: PageService[];
    activeId: string;
    isAddModalOpen: boolean;
  }) => void;
  deleteWebview: (payload: { id: string; storageKey: string }) => Promise<unknown>;
  loadService: (service: PageService) => Promise<unknown>;
}) {
  if (nextState.toastMessage) {
    showToast(nextState.toastMessage);
  }

  if (!nextState.shouldCloseModal) {
    return;
  }

  const shouldRecreateActiveEditedService =
    !!editingServiceId && !!nextState.deleteWebview && currentActiveId === nextState.deleteWebview.id;

  if (shouldRecreateActiveEditedService && nextState.deleteWebview) {
    await deleteWebview(nextState.deleteWebview);
  }

  setState({
    services: nextState.services,
    activeId: nextState.activeId,
    isAddModalOpen: false,
  });

  if (!shouldRecreateActiveEditedService && nextState.deleteWebview) {
    await deleteWebview(nextState.deleteWebview);

    const editedService = editingServiceId
      ? nextState.services.find((service) => service.id === editingServiceId)
      : undefined;

    if (editedService && editedService.id !== currentActiveId && !editedService.disabled) {
      await loadService(editedService);
    }
  }

  if (nextState.loadService) {
    await loadService(nextState.loadService);
  }
}

export function toggleServiceDisabled(
  services: PageService[],
  activeId: string,
  id: string,
): {
  services: PageService[];
  activeId: string;
  deleteWebview?: { id: string; storageKey: string };
} {
  const targetService = services.find((service) => service.id === id);

  if (!targetService) {
    return { services, activeId };
  }

  const nextDisabledState = !targetService.disabled;
  const nextServices = services.map((service) =>
    service.id === id ? { ...service, disabled: nextDisabledState } : service,
  );

  if (!nextDisabledState) {
    return {
      services: nextServices,
      activeId,
    };
  }

  const nextActiveId =
    activeId === id
      ? nextServices.find((service) => service.id !== id && !service.disabled)?.id ?? ""
      : activeId;

  return {
    services: nextServices,
    activeId: nextActiveId,
    deleteWebview: createDeletePayload(targetService),
  };
}

export async function cleanupPageListeners({
  unlistenToastPromise,
  unlistenMenuPromise,
  unlistenBadgePromise,
  unlistenShortcutPromise,
  toastTimeout,
  clearTimeoutImpl = clearTimeout,
}: {
  unlistenToastPromise: Promise<() => void>;
  unlistenMenuPromise: Promise<() => void>;
  unlistenBadgePromise: Promise<() => void>;
  unlistenShortcutPromise: Promise<() => void>;
  toastTimeout: ReturnType<typeof setTimeout> | null;
  clearTimeoutImpl?: (timeout: ReturnType<typeof setTimeout>) => void;
}) {
  if (toastTimeout) {
    clearTimeoutImpl(toastTimeout);
  }

  const [unlistenToast, unlistenMenu, unlistenBadge, unlistenShortcut] = await Promise.all([
    unlistenToastPromise,
    unlistenMenuPromise,
    unlistenBadgePromise,
    unlistenShortcutPromise,
  ]);

  unlistenToast();
  unlistenMenu();
  unlistenBadge();
  unlistenShortcut();
}
