import type { PageService } from "./workspace-state";
import {
  normalizeWorkspaceGroupsState,
  type WorkspaceGroupsState,
} from "./workspace-groups";

export type ServiceManagementWorkspace = {
  id: string;
  name: string;
};

export type ServiceManagementRow = {
  service: PageService;
  workspaces: ServiceManagementWorkspace[];
  hostname: string;
  searchText: string;
};

export type ServiceManagementWorkspaceFilter = "all" | string;

export function serviceManagementHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function buildServiceManagementRows(
  state: WorkspaceGroupsState,
): ServiceManagementRow[] {
  const workspaceIndex = new Map<string, ServiceManagementWorkspace[]>();
  const orderedServiceIds: string[] = [];
  const seenServiceIds = new Set<string>();

  for (const workspace of state.workspaces) {
    for (const serviceId of workspace.serviceIds) {
      const workspaces = workspaceIndex.get(serviceId) ?? [];
      workspaces.push({ id: workspace.id, name: workspace.name });
      workspaceIndex.set(serviceId, workspaces);

      if (!seenServiceIds.has(serviceId) && state.servicesById[serviceId]) {
        seenServiceIds.add(serviceId);
        orderedServiceIds.push(serviceId);
      }
    }
  }

  for (const serviceId of Object.keys(state.servicesById)) {
    if (!seenServiceIds.has(serviceId)) {
      orderedServiceIds.push(serviceId);
    }
  }

  return orderedServiceIds.map((serviceId) => {
    const service = state.servicesById[serviceId];
    const workspaces = workspaceIndex.get(serviceId) ?? [];
    const hostname = serviceManagementHostname(service.url);

    return {
      service,
      workspaces,
      hostname,
      searchText: [
        service.name,
        service.url,
        hostname,
        ...workspaces.map((workspace) => workspace.name),
      ]
        .join(" ")
        .toLowerCase(),
    };
  });
}

export function filterServiceManagementRows(
  rows: ServiceManagementRow[],
  filter: { workspaceId: ServiceManagementWorkspaceFilter; query: string },
): ServiceManagementRow[] {
  const query = filter.query.trim().toLowerCase();

  return rows.filter((row) => {
    if (
      filter.workspaceId !== "all" &&
      !row.workspaces.some((workspace) => workspace.id === filter.workspaceId)
    ) {
      return false;
    }

    if (!query) {
      return true;
    }

    return row.searchText.includes(query);
  });
}

export function setServiceHibernationEnabled(
  state: WorkspaceGroupsState,
  serviceId: string,
  enabled: boolean,
): WorkspaceGroupsState {
  const service = state.servicesById[serviceId];

  if (!service) {
    return state;
  }

  const { hibernateWhenInactive: _hibernateWhenInactive, ...serviceWithoutHibernation } = service;
  const nextService = enabled
    ? { ...serviceWithoutHibernation, hibernateWhenInactive: true }
    : serviceWithoutHibernation;

  return normalizeWorkspaceGroupsState({
    ...state,
    servicesById: {
      ...state.servicesById,
      [serviceId]: nextService,
    },
  });
}
