import {
  APP_SETTINGS_STORAGE_KEY,
  readAppSettings,
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

export const WORKSPACE_SAVE_DEBOUNCE_MS = 1200;
export const PRELOAD_START_MS = 2000;
export const PRELOAD_GAP_MS = 1000;
export const MAX_BACKGROUND_PRELOADS = 3;

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
