/**
 * workspace-groups.ts — pure workspace state transforms
 *
 * Owns the `WorkspaceGroupsState` shape (the full multi-workspace tree) and
 * all pure functions that read or update it.
 *
 * RULES for this module:
 *  - Every exported function is a pure state transform: (state, …args) → newState.
 *  - No `invoke`, no webview side-effects, no localStorage reads/writes.
 *  - Side-effectful wrappers (e.g. "disable and close webviews") live in
 *    workspace-actions.ts, not here.
 *
 * BOUNDARY vs workspace-state.ts:
 *  - workspace-groups.ts  = workspace-level concerns (multi-workspace tree, service IDs,
 *                           active workspace, workspace metadata).
 *  - workspace-state.ts   = service-level concerns (PageService shape, single-service
 *                           add/edit/delete flow, startup migration).
 */
import type { PageService } from "./workspace-state";
import { readStoredServices } from "./service-config";
import { ensureServiceNotificationPrefs } from "./notification-prefs";
import {
  DEFAULT_WORKSPACE_ICON,
  normalizeWorkspaceIcon,
  type WorkspaceIconKey,
} from "./workspace-icons";

export { DEFAULT_WORKSPACE_ICON } from "./workspace-icons";

export const WORKSPACES_STATE_VERSION = 1;
export const WORKSPACES_STATE_KEY = "ferx-workspaces-state";
export const DEFAULT_WORKSPACE_ID = "default";
export const DEFAULT_WORKSPACE_NAME = "Default";
export const DEFAULT_WORKSPACE_COLOR = "#3B82F6";

const WORKSPACE_COLORS = ["#3B82F6", "#22C55E", "#F59E0B", "#A855F7", "#EF4444", "#14B8A6"];

export function pickWorkspaceColor(index: number): string {
  return WORKSPACE_COLORS[index % WORKSPACE_COLORS.length];
}

export function createNewWorkspace(
  state: WorkspaceGroupsState,
  input: { name: string; icon: WorkspaceIconKey },
): WorkspaceGroupsState {
  const id = `workspace-${crypto.randomUUID().slice(0, 8)}`;
  return setCurrentWorkspaceId(
    createWorkspaceGroup(state, {
      id,
      name: input.name,
      serviceIds: [],
      activeServiceId: "",
      color: pickWorkspaceColor(state.workspaces.length),
      icon: input.icon,
    }),
    id,
  );
}

export interface WorkspaceGroup {
  id: string;
  name: string;
  serviceIds: string[];
  activeServiceId: string;
  color?: string;
  icon?: string;
  disabled?: boolean;
}

export interface WorkspaceGroupsState {
  version: typeof WORKSPACES_STATE_VERSION;
  currentWorkspaceId: string;
  workspaces: WorkspaceGroup[];
  servicesById: Record<string, PageService>;
}

export interface WorkspaceGroupsStartupState {
  state: WorkspaceGroupsState;
  toastMessage: string;
}

export function stripRuntimeServiceState(service: PageService): PageService {
  if (service.badge === undefined) {
    return service;
  }

  return {
    ...service,
    badge: undefined,
  };
}

function createServicesById(services: PageService[]): Record<string, PageService> {
  const servicesById: Record<string, PageService> = {};
  const { services: normalizedServices } = ensureServiceNotificationPrefs(services);

  for (const service of normalizedServices) {
    if (!service.id || service.id in servicesById) {
      continue;
    }

    servicesById[service.id] = stripRuntimeServiceState(service);
  }

  return servicesById;
}

function resolveActiveServiceId(
  serviceIds: string[],
  servicesById: Record<string, PageService>,
  activeServiceId: string,
) {
  const activeService = servicesById[activeServiceId];
  if (activeService && serviceIds.includes(activeServiceId) && !activeService.disabled) {
    return activeServiceId;
  }

  return serviceIds.find((id) => {
    const service = servicesById[id];
    return service && !service.disabled;
  }) ?? "";
}

export function createDefaultWorkspaceGroupsState(
  services: PageService[] = [],
  activeServiceId = "",
): WorkspaceGroupsState {
  const servicesById = createServicesById(services);
  const serviceIds = services
    .map((service) => service.id)
    .filter((id, index, ids) => !!id && id in servicesById && ids.indexOf(id) === index);

  return {
    version: WORKSPACES_STATE_VERSION,
    currentWorkspaceId: DEFAULT_WORKSPACE_ID,
    workspaces: [
      {
        id: DEFAULT_WORKSPACE_ID,
        name: DEFAULT_WORKSPACE_NAME,
        serviceIds,
        activeServiceId: resolveActiveServiceId(serviceIds, servicesById, activeServiceId),
        color: DEFAULT_WORKSPACE_COLOR,
        icon: DEFAULT_WORKSPACE_ICON,
      },
    ],
    servicesById,
  };
}

function normalizeWorkspace(
  workspace: WorkspaceGroup,
  servicesById: Record<string, PageService>,
): WorkspaceGroup | null {
  const id = typeof workspace.id === "string" ? workspace.id.trim() : "";
  const name = typeof workspace.name === "string" ? workspace.name.trim() : "";

  if (!id || !name) {
    return null;
  }

  const seenIds = new Set<string>();
  const serviceIds = Array.isArray(workspace.serviceIds)
    ? workspace.serviceIds.filter((serviceId) => {
        if (
          typeof serviceId !== "string" ||
          !(serviceId in servicesById) ||
          seenIds.has(serviceId)
        ) {
          return false;
        }

        seenIds.add(serviceId);
        return true;
      })
    : [];

  return {
    id,
    name,
    serviceIds,
    activeServiceId: resolveActiveServiceId(
      serviceIds,
      servicesById,
      typeof workspace.activeServiceId === "string" ? workspace.activeServiceId : "",
    ),
    ...(typeof workspace.color === "string" && workspace.color ? { color: workspace.color } : {}),
    icon: normalizeWorkspaceIcon(workspace.icon),
    ...(workspace.disabled === true ? { disabled: true } : {}),
  };
}

export function normalizeWorkspaceGroupsState(
  state: WorkspaceGroupsState,
): WorkspaceGroupsState {
  const servicesById = createServicesById(Object.values(state.servicesById ?? {}));
  const seenWorkspaceIds = new Set<string>();
  const workspaces = (Array.isArray(state.workspaces) ? state.workspaces : [])
    .map((workspace) => normalizeWorkspace(workspace, servicesById))
    .filter((workspace): workspace is WorkspaceGroup => {
      if (!workspace || seenWorkspaceIds.has(workspace.id)) {
        return false;
      }

      seenWorkspaceIds.add(workspace.id);
      return true;
    });

  if (workspaces.length === 0) {
    return createDefaultWorkspaceGroupsState(Object.values(servicesById));
  }

  const currentWorkspaceId = workspaces.some(
    (workspace) => workspace.id === state.currentWorkspaceId,
  )
    ? state.currentWorkspaceId
    : workspaces[0].id;

  return {
    version: WORKSPACES_STATE_VERSION,
    currentWorkspaceId,
    workspaces,
    servicesById,
  };
}

export function serializeWorkspaceGroupsState(state: WorkspaceGroupsState): string {
  return JSON.stringify(normalizeWorkspaceGroupsState(state));
}

function isWorkspaceGroupsState(value: unknown): value is WorkspaceGroupsState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<WorkspaceGroupsState>;

  return (
    candidate.version === WORKSPACES_STATE_VERSION &&
    typeof candidate.currentWorkspaceId === "string" &&
    Array.isArray(candidate.workspaces) &&
    !!candidate.servicesById &&
    typeof candidate.servicesById === "object" &&
    !Array.isArray(candidate.servicesById)
  );
}

export function readWorkspaceGroupsStartupState(
  savedWorkspaceState: string | null,
  legacySavedServices: string | null,
  legacyActiveServiceId: string | null,
): WorkspaceGroupsStartupState {
  if (savedWorkspaceState) {
    try {
      const parsed: unknown = JSON.parse(savedWorkspaceState);

      if (isWorkspaceGroupsState(parsed)) {
        return {
          state: normalizeWorkspaceGroupsState(parsed),
          toastMessage: "",
        };
      }
    } catch {
      return {
        state: createDefaultWorkspaceGroupsState(),
        toastMessage: "Saved workspaces were reset.",
      };
    }

    return {
      state: createDefaultWorkspaceGroupsState(),
      toastMessage: "Saved workspaces were reset.",
    };
  }

  const { services, recoveredFromCorruption } = readStoredServices(legacySavedServices);

  return {
    state: createDefaultWorkspaceGroupsState(services as PageService[], legacyActiveServiceId ?? ""),
    toastMessage: recoveredFromCorruption ? "Saved services were reset." : "",
  };
}

export function getWorkspace(
  state: WorkspaceGroupsState,
  workspaceId = state.currentWorkspaceId,
) {
  return state.workspaces.find((workspace) => workspace.id === workspaceId);
}

export function getWorkspaceServices(
  state: WorkspaceGroupsState,
  workspaceId = state.currentWorkspaceId,
): PageService[] {
  const workspace = getWorkspace(state, workspaceId);

  if (!workspace) {
    return [];
  }

  return workspace.serviceIds.flatMap((serviceId) => {
    const service = state.servicesById[serviceId];
    return service ? [service] : [];
  });
}

export function setCurrentWorkspaceId(
  state: WorkspaceGroupsState,
  workspaceId: string,
): WorkspaceGroupsState {
  if (!state.workspaces.some((workspace) => workspace.id === workspaceId)) {
    return state;
  }

  return {
    ...state,
    currentWorkspaceId: workspaceId,
  };
}

export function setWorkspaceActiveService(
  state: WorkspaceGroupsState,
  workspaceId: string,
  activeServiceId: string,
): WorkspaceGroupsState {
  return {
    ...state,
    workspaces: state.workspaces.map((workspace) =>
      workspace.id === workspaceId
        ? {
            ...workspace,
            activeServiceId: resolveActiveServiceId(
              workspace.serviceIds,
              state.servicesById,
              activeServiceId,
            ),
          }
        : workspace,
    ),
  };
}

export function updateWorkspaceServices(
  state: WorkspaceGroupsState,
  workspaceId: string,
  serviceIds: string[],
  activeServiceId?: string,
): WorkspaceGroupsState {
  const nextState = {
    ...state,
    workspaces: state.workspaces.map((workspace) => {
      if (workspace.id !== workspaceId) {
        return workspace;
      }

      const seenIds = new Set<string>();
      const nextServiceIds = serviceIds.filter((serviceId) => {
        if (!(serviceId in state.servicesById) || seenIds.has(serviceId)) {
          return false;
        }

        seenIds.add(serviceId);
        return true;
      });

      return {
        ...workspace,
        serviceIds: nextServiceIds,
        activeServiceId: resolveActiveServiceId(
          nextServiceIds,
          state.servicesById,
          activeServiceId ?? workspace.activeServiceId,
        ),
      };
    }),
  };

  return normalizeWorkspaceGroupsState(nextState);
}

export function addServiceToWorkspace(
  state: WorkspaceGroupsState,
  workspaceId: string,
  serviceId: string,
): WorkspaceGroupsState {
  const workspace = getWorkspace(state, workspaceId);

  if (!workspace || !(serviceId in state.servicesById) || workspace.serviceIds.includes(serviceId)) {
    return state;
  }

  return updateWorkspaceServices(
    state,
    workspaceId,
    [...workspace.serviceIds, serviceId],
    workspace.activeServiceId || serviceId,
  );
}

export function createWorkspaceGroup(
  state: WorkspaceGroupsState,
  workspace: Omit<WorkspaceGroup, "activeServiceId"> & { activeServiceId?: string },
): WorkspaceGroupsState {
  if (state.workspaces.some((existing) => existing.id === workspace.id)) {
    return state;
  }

  return normalizeWorkspaceGroupsState({
    ...state,
    workspaces: [
      ...state.workspaces,
      {
        ...workspace,
        activeServiceId: workspace.activeServiceId ?? "",
      },
    ],
  });
}

export function renameWorkspaceGroup(
  state: WorkspaceGroupsState,
  workspaceId: string,
  name: string,
): WorkspaceGroupsState {
  const trimmedName = name.trim();

  if (!trimmedName) {
    return state;
  }

  return normalizeWorkspaceGroupsState({
    ...state,
    workspaces: state.workspaces.map((workspace) =>
      workspace.id === workspaceId ? { ...workspace, name: trimmedName } : workspace,
    ),
  });
}

export function updateWorkspaceGroupIcon(
  state: WorkspaceGroupsState,
  workspaceId: string,
  icon: string,
): WorkspaceGroupsState {
  if (!state.workspaces.some((workspace) => workspace.id === workspaceId)) {
    return state;
  }

  return normalizeWorkspaceGroupsState({
    ...state,
    workspaces: state.workspaces.map((workspace) =>
      workspace.id === workspaceId
        ? { ...workspace, icon: normalizeWorkspaceIcon(icon) }
        : workspace,
    ),
  });
}

export function setWorkspaceDisabled(
  state: WorkspaceGroupsState,
  workspaceId: string,
  disabled: boolean,
): WorkspaceGroupsState {
  if (!state.workspaces.some((workspace) => workspace.id === workspaceId)) {
    return state;
  }

  return normalizeWorkspaceGroupsState({
    ...state,
    workspaces: state.workspaces.map((workspace) =>
      workspace.id === workspaceId ? { ...workspace, disabled } : workspace,
    ),
  });
}

export function deleteWorkspaceGroup(
  state: WorkspaceGroupsState,
  workspaceId: string,
): WorkspaceGroupsState {
  if (state.workspaces.length <= 1) {
    return state;
  }

  const workspaces = state.workspaces.filter((workspace) => workspace.id !== workspaceId);

  if (workspaces.length === state.workspaces.length) {
    return state;
  }

  return normalizeWorkspaceGroupsState({
    ...state,
    currentWorkspaceId:
      state.currentWorkspaceId === workspaceId ? workspaces[0].id : state.currentWorkspaceId,
    workspaces,
  });
}

export function removeServiceFromWorkspace(
  state: WorkspaceGroupsState,
  workspaceId: string,
  serviceId: string,
): WorkspaceGroupsState {
  const workspace = getWorkspace(state, workspaceId);

  if (!workspace || !workspace.serviceIds.includes(serviceId)) {
    return state;
  }

  return updateWorkspaceServices(
    state,
    workspaceId,
    workspace.serviceIds.filter((id) => id !== serviceId),
    workspace.activeServiceId === serviceId ? "" : workspace.activeServiceId,
  );
}
