import type { NotificationPrefs } from "$lib/services/notification-prefs";
import {
  deleteWorkspaceGroup,
  getWorkspaceServices,
  normalizeWorkspaceGroupsState,
  setWorkspaceDisabled as setWorkspaceGroupDisabled,
  updateWorkspaceServices,
  type WorkspaceGroupsState,
} from "$lib/services/workspace-groups";
import { toggleServiceDisabled, type PageService } from "$lib/services/workspace-state";

export function applyCurrentWorkspaceServices(
  state: WorkspaceGroupsState,
  nextServices: PageService[],
  nextActiveId: string,
): WorkspaceGroupsState {
  const nextServicesById = {
    ...state.servicesById,
  };

  for (const service of nextServices) {
    nextServicesById[service.id] = service;
  }

  return updateWorkspaceServices(
    {
      ...state,
      servicesById: nextServicesById,
    },
    state.currentWorkspaceId,
    nextServices.map((service) => service.id),
    nextActiveId,
  );
}

export function toggleWorkspaceServiceDisabled(
  state: WorkspaceGroupsState,
  serviceId: string,
): {
  state: WorkspaceGroupsState;
  deleteWebview?: { id: string; storageKey: string };
} {
  const services = getWorkspaceServices(state);
  const activeId =
    state.workspaces.find((workspace) => workspace.id === state.currentWorkspaceId)
      ?.activeServiceId ?? "";
  const nextState = toggleServiceDisabled(services, activeId, serviceId);

  return {
    state: applyCurrentWorkspaceServices(state, nextState.services, nextState.activeId),
    deleteWebview: nextState.deleteWebview,
  };
}

export function updateServiceNotificationPrefs(
  state: WorkspaceGroupsState,
  serviceId: string,
  updater: (prefs: NotificationPrefs) => NotificationPrefs,
): WorkspaceGroupsState {
  const service = state.servicesById[serviceId];
  if (!service) {
    return state;
  }

  return normalizeWorkspaceGroupsState({
    ...state,
    servicesById: {
      ...state.servicesById,
      [serviceId]: {
        ...service,
        notificationPrefs: updater(service.notificationPrefs),
      },
    },
  });
}

export function deleteServiceFromWorkspaceState(
  state: WorkspaceGroupsState,
  badges: Record<string, number | undefined>,
  serviceId: string,
): {
  state: WorkspaceGroupsState;
  badges: Record<string, number | undefined>;
  deletedService?: PageService;
} {
  const deletedService = state.servicesById[serviceId];
  if (!deletedService) {
    return {
      state,
      badges,
    };
  }

  const { [serviceId]: _removedService, ...nextServicesById } = state.servicesById;
  const nextState = normalizeWorkspaceGroupsState({
    ...state,
    servicesById: nextServicesById,
    workspaces: state.workspaces.map((workspace) => ({
      ...workspace,
      serviceIds: workspace.serviceIds.filter((id) => id !== serviceId),
      activeServiceId: workspace.activeServiceId === serviceId ? "" : workspace.activeServiceId,
    })),
  });

  if (!(serviceId in badges)) {
    return {
      state: nextState,
      badges,
      deletedService,
    };
  }

  const { [serviceId]: _removedBadge, ...remainingBadges } = badges;
  return {
    state: nextState,
    badges: remainingBadges,
    deletedService,
  };
}

export function setWorkspaceDisabledWithEffects(
  state: WorkspaceGroupsState,
  input: { workspaceId: string; disabled: boolean },
): {
  state: WorkspaceGroupsState;
  closeWebviewIds: string[];
  shouldHideWebviews: boolean;
} {
  const workspaceServices = getWorkspaceServices(state, input.workspaceId);
  const nextState = setWorkspaceGroupDisabled(state, input.workspaceId, input.disabled);

  if (!input.disabled) {
    return {
      state: nextState,
      closeWebviewIds: [],
      shouldHideWebviews: false,
    };
  }

  return {
    state: nextState,
    closeWebviewIds: workspaceServices.map((service) => service.id),
    shouldHideWebviews: input.workspaceId === nextState.currentWorkspaceId,
  };
}

export function deleteWorkspaceWithEffects(
  state: WorkspaceGroupsState,
  workspaceId: string,
): {
  state: WorkspaceGroupsState;
  closeWebviewIds: string[];
} {
  const deletedWorkspaceServices = getWorkspaceServices(state, workspaceId);
  const nextState = deleteWorkspaceGroup(state, workspaceId);

  return {
    state: nextState,
    closeWebviewIds: deletedWorkspaceServices
      .filter(
        (service) =>
          !nextState.workspaces.some((workspace) => workspace.serviceIds.includes(service.id)),
      )
      .map((service) => service.id),
  };
}
