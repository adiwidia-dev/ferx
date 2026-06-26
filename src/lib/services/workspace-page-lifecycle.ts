import {
  APP_SETTINGS_STORAGE_KEY,
  readAppSettings,
  type StartupPreloadLimit,
  type ThemeMode,
} from "$lib/services/app-settings";
import {
  TODO_NOTES_STORAGE_KEY,
  readTodoNotes,
  type TodoNote,
} from "$lib/services/todos";
import {
  WORKSPACES_STATE_KEY,
  getWorkspace,
  getWorkspaceServices,
  readWorkspaceGroupsStartupState,
  setWorkspaceActiveService,
  type WorkspaceGroupsState,
} from "$lib/services/workspace-groups";
import type { PageService } from "$lib/services/workspace-state";

export const WORKSPACE_SAVE_DEBOUNCE_MS = 1200;
export const PRELOAD_START_MS = 2000;
export const PRELOAD_GAP_MS = 1000;

export function consumeOpenServiceParam(search: string): {
  openServiceId: string | null;
  nextSearch: string;
} {
  const params = new URLSearchParams(search);
  const openServiceId = params.get("open");

  if (openServiceId) {
    params.delete("open");
  }

  return {
    openServiceId,
    nextSearch: params.toString(),
  };
}

export function readWorkspacePageStartupState({
  savedWorkspaceState,
  legacySavedServices,
  legacyActiveServiceId,
  savedAppSettings,
  savedTodoNotes,
  openServiceId,
}: {
  savedWorkspaceState: string | null;
  legacySavedServices: string | null;
  legacyActiveServiceId: string | null;
  savedAppSettings: string | null;
  savedTodoNotes: string | null;
  openServiceId: string | null;
}): {
  workspaceState: WorkspaceGroupsState;
  spellCheckEnabled: boolean;
  resourceUsageMonitoringEnabled: boolean;
  themeMode: ThemeMode;
  startupPreloadLimit: StartupPreloadLimit;
  todoNotes: TodoNote[];
  toastMessage: string;
} {
  const startupState = readWorkspaceGroupsStartupState(
    savedWorkspaceState,
    legacySavedServices,
    legacyActiveServiceId,
  );
  const settings = readAppSettings(savedAppSettings);
  let workspaceState = startupState.state;
  const todoNotes = readTodoNotes(savedTodoNotes);

  if (openServiceId) {
    const currentWorkspace = getWorkspace(workspaceState);
    const services = getWorkspaceServices(workspaceState);

    if (
      !currentWorkspace?.disabled &&
      services.some((service) => service.id === openServiceId && !service.disabled)
    ) {
      workspaceState = setWorkspaceActiveService(
        workspaceState,
        workspaceState.currentWorkspaceId,
        openServiceId,
      );
    }
  }

  return {
    workspaceState,
    spellCheckEnabled: settings.spellCheckEnabled,
    resourceUsageMonitoringEnabled: settings.resourceUsageMonitoringEnabled,
    themeMode: settings.themeMode,
    startupPreloadLimit: settings.startupPreloadLimit,
    todoNotes,
    toastMessage: startupState.toastMessage,
  };
}

export type DebouncedStorageWriter<T> = ReturnType<typeof createDebouncedStorageWriter<T>>;

export function createDebouncedStorageWriter<T>({
  storageKey,
  delayMs,
  serialize,
  getStorage,
}: {
  storageKey: string;
  delayMs: number;
  serialize: (value: T) => string;
  getStorage: () => Storage | null;
}) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function write(value: T) {
    getStorage()?.setItem(storageKey, serialize(value));
  }

  return {
    schedule(value: T) {
      if (timer) {
        clearTimeout(timer);
      }

      timer = setTimeout(() => {
        timer = null;
        write(value);
      }, delayMs);
    },
    flush(value: T) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      write(value);
    },
    clear() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

export function scheduleCancellableTask({
  delayMs,
  run,
}: {
  delayMs: number;
  run: (isCancelled: () => boolean) => void | Promise<void>;
}) {
  let cancelled = false;
  const timer = setTimeout(() => {
    void run(() => cancelled);
  }, delayMs);

  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}

export function registerFlushOnExit(flush: () => void) {
  const onVisibilityForFlush = () => {
    if (document.visibilityState === "hidden") {
      flush();
    }
  };

  window.addEventListener("beforeunload", flush);
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", onVisibilityForFlush);

  return () => {
    window.removeEventListener("beforeunload", flush);
    window.removeEventListener("pagehide", flush);
    document.removeEventListener("visibilitychange", onVisibilityForFlush);
  };
}

export const WORKSPACE_PAGE_STORAGE_KEYS = {
  workspaceState: WORKSPACES_STATE_KEY,
  appSettings: APP_SETTINGS_STORAGE_KEY,
  todoNotes: TODO_NOTES_STORAGE_KEY,
} as const;

export type ActivationInputs = {
  shouldHide: boolean;
  activeServiceId: string;
  activeServiceUrl: string;
  activeServiceStorageKey: string;
  activeServiceWakeGeneration?: number;
  spellCheckEnabled: boolean;
  resourceUsageMonitoringEnabled: boolean;
};

/**
 * Stable key describing what the switching effect would do. Equal keys mean
 * the effect's action would be identical, so it can be skipped — this removes
 * the spurious re-activation (focus steal + stutter) on unrelated workspace
 * mutations. url + storageKey are included so an edit to the *active* service
 * (which deletes+recreates its webview) still re-activates it.
 */
export function computeActivationKey(inputs: ActivationInputs): string {
  if (inputs.shouldHide) {
    return "hide";
  }
  if (!inputs.activeServiceId) {
    return "none";
  }
  return [
    "show",
    inputs.activeServiceId,
    inputs.activeServiceUrl,
    inputs.activeServiceStorageKey,
    String(inputs.activeServiceWakeGeneration ?? 0),
    inputs.spellCheckEnabled ? "1" : "0",
    inputs.resourceUsageMonitoringEnabled ? "1" : "0",
  ].join(" ");
}

export type DisplayService = PageService & {
  disabled: boolean | undefined;
  badge: number | undefined;
  hibernated: boolean | undefined;
};

/**
 * Projects services into the sidebar view-model while preserving object
 * references for services whose source object, effective-disabled state and
 * badge are all unchanged. A single badge tick mutates one entry of the
 * `runtimeBadges` map; without this cache, `$derived` would rebuild the whole
 * array and every keyed sidebar item would re-render. With it, only the
 * changed service gets a new object so only that item re-renders.
 */
export function createDisplayServicesProjector() {
  type Entry = {
    src: PageService;
    disabled: boolean | undefined;
    badge: number | undefined;
    hibernated: boolean | undefined;
    out: DisplayService;
  };
  let cache = new Map<string, Entry>();

  return (
    services: PageService[],
    isWorkspaceDisabled: boolean,
    badges: Record<string, number | undefined>,
    hibernatedServices: Record<string, true | undefined> = {},
  ): DisplayService[] => {
    const next = new Map<string, Entry>();

    const result = services.map((service) => {
      const disabled = isWorkspaceDisabled || service.disabled;
      const badge = badges[service.id];
      const hibernated = hibernatedServices[service.id];
      const prev = cache.get(service.id);

      if (
        prev &&
        prev.src === service &&
        prev.disabled === disabled &&
        prev.badge === badge &&
        prev.hibernated === hibernated
      ) {
        next.set(service.id, prev);
        return prev.out;
      }

      const entry: Entry = {
        src: service,
        disabled,
        badge,
        hibernated,
        out: { ...service, disabled, badge, hibernated },
      };
      next.set(service.id, entry);
      return entry.out;
    });

    cache = next;
    return result;
  };
}
