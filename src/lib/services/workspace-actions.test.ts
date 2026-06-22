import { describe, expect, it } from "vitest";

import { DEFAULT_NOTIFICATION_PREFS } from "$lib/services/notification-prefs";
import type { PageService } from "$lib/services/workspace-state";
import {
  type WorkspaceGroupsState,
  WORKSPACES_STATE_VERSION,
} from "$lib/services/workspace-groups";

import {
  applyCurrentWorkspaceServices,
  deleteServiceFromWorkspaceState,
  deleteWorkspaceWithEffects,
  pruneOrphanedServicesFromWorkspaceState,
  setWorkspaceDisabledWithEffects,
  toggleManagedServiceDisabled,
  toggleWorkspaceServiceDisabled,
  updateServiceNotificationPrefs,
} from "./workspace-actions";

function createService(overrides: Partial<PageService> = {}): PageService {
  return {
    id: overrides.id ?? "service-1",
    name: overrides.name ?? "Slack",
    url: overrides.url ?? "https://slack.com/app",
    storageKey: overrides.storageKey ?? "storage-service-1",
    notificationPrefs: overrides.notificationPrefs ?? {
      ...DEFAULT_NOTIFICATION_PREFS,
    },
    disabled: overrides.disabled,
    badge: overrides.badge,
    iconBgColor: overrides.iconBgColor,
  };
}

function createWorkspaceState(): WorkspaceGroupsState {
  const youtube = createService({
    id: "youtube",
    name: "YouTube Music",
    url: "https://music.youtube.com/",
    storageKey: "storage-youtube",
  });
  const slack = createService({
    id: "slack",
    name: "Slack",
    url: "https://app.slack.com/client",
    storageKey: "storage-slack",
  });
  const shared = createService({
    id: "shared",
    name: "Shared",
    url: "https://shared.example.com/",
    storageKey: "storage-shared",
  });

  return {
    version: WORKSPACES_STATE_VERSION,
    currentWorkspaceId: "default",
    workspaces: [
      {
        id: "default",
        name: "Default",
        serviceIds: ["youtube", "slack", "shared"],
        activeServiceId: "youtube",
        icon: "briefcase",
      },
      {
        id: "personal",
        name: "Personal",
        serviceIds: ["shared"],
        activeServiceId: "shared",
        icon: "user",
      },
    ],
    servicesById: {
      youtube,
      slack,
      shared,
    },
  };
}

describe("workspace actions", () => {
  it("applies current workspace services without mutating other workspaces", () => {
    const state = createWorkspaceState();

    const nextState = applyCurrentWorkspaceServices(
      state,
      [
        {
          ...state.servicesById.slack,
          name: "Slack HQ",
        },
      ],
      "slack",
    );

    expect(nextState.workspaces[0]).toMatchObject({
      id: "default",
      serviceIds: ["slack"],
      activeServiceId: "slack",
    });
    expect(nextState.workspaces[1]).toEqual(state.workspaces[1]);
    expect(nextState.servicesById.slack.name).toBe("Slack HQ");
    expect(nextState.servicesById.shared).toEqual(state.servicesById.shared);
  });

  it("toggles the current workspace service disabled state and returns a close payload when disabling", () => {
    const state = createWorkspaceState();

    const nextState = toggleWorkspaceServiceDisabled(state, "youtube");

    expect(nextState.state.workspaces[0]).toMatchObject({
      activeServiceId: "slack",
    });
    expect(nextState.state.servicesById.youtube.disabled).toBe(true);
    expect(nextState.closeWebviewId).toBe("youtube");
  });

  it("toggles a managed service across the workspace tree", () => {
    const state = {
      ...createWorkspaceState(),
      currentWorkspaceId: "default",
    };

    const nextState = toggleManagedServiceDisabled(state, "shared");

    expect(nextState.state.servicesById.shared.disabled).toBe(true);
    expect(nextState.state.workspaces[1].activeServiceId).toBe("");
    expect(nextState.closeWebviewId).toBe("shared");
  });

  it("updates notification preferences for only the targeted service", () => {
    const state = createWorkspaceState();

    const nextState = updateServiceNotificationPrefs(state, "shared", (prefs) => ({
      ...prefs,
      muteAudio: true,
    }));

    expect(nextState.servicesById.shared.notificationPrefs.muteAudio).toBe(true);
    expect(nextState.servicesById.youtube.notificationPrefs).toEqual(
      state.servicesById.youtube.notificationPrefs,
    );
  });

  it("removes a service from every workspace and clears its badge entry", () => {
    const state = createWorkspaceState();

    const nextState = deleteServiceFromWorkspaceState(state, { youtube: 5, shared: 2 }, "shared");

    expect(nextState.deletedService?.id).toBe("shared");
    expect(nextState.badges).toEqual({ youtube: 5 });
    expect(nextState.state.servicesById.shared).toBeUndefined();
    expect(nextState.state.workspaces[0]).toMatchObject({
      serviceIds: ["youtube", "slack"],
    });
    expect(nextState.state.workspaces[1]).toMatchObject({
      serviceIds: [],
      activeServiceId: "",
    });
  });

  it("marks a workspace disabled and returns the webviews that should close", () => {
    const state = createWorkspaceState();

    const nextState = setWorkspaceDisabledWithEffects(state, {
      workspaceId: "default",
      disabled: true,
    });

    expect(nextState.state.workspaces[0].disabled).toBe(true);
    expect(nextState.closeWebviewIds).toEqual(["youtube", "slack", "shared"]);
    expect(nextState.shouldHideWebviews).toBe(true);
  });

  it("deletes only orphaned services when deleting a workspace", () => {
    const state = createWorkspaceState();

    const nextState = deleteWorkspaceWithEffects(state, "personal");

    expect(nextState.state.workspaces).toHaveLength(1);
    expect(nextState.deletedServices).toEqual([]);

    const orphanState = {
      ...state,
      workspaces: [
        {
          ...state.workspaces[0],
          serviceIds: ["youtube", "slack"],
        },
        {
          ...state.workspaces[1],
          serviceIds: ["shared"],
        },
      ],
    };

    const deleted = deleteWorkspaceWithEffects(orphanState, "personal");

    expect(deleted.deletedServices.map((service) => service.id)).toEqual(["shared"]);
    expect(deleted.state.servicesById.shared).toBeUndefined();
    expect(deleted.state.servicesById.youtube).toBe(orphanState.servicesById.youtube);
  });

  it("prunes orphaned services from workspace state", () => {
    const baseState = createWorkspaceState();
    const state: WorkspaceGroupsState = {
      ...baseState,
      servicesById: {
        ...baseState.servicesById,
        orphan: createService({
          id: "orphan",
          name: "Orphan",
          url: "https://orphan.example.com/",
          storageKey: "storage-orphan",
        }),
      },
    };

    const nextState = pruneOrphanedServicesFromWorkspaceState(state);

    expect(nextState.deletedServices.map((service) => service.id)).toEqual(["orphan"]);
    expect(nextState.state.servicesById.orphan).toBeUndefined();
    expect(nextState.state.servicesById.shared).toBe(state.servicesById.shared);
  });
});
