import { describe, expect, it } from "vitest";

import { DEFAULT_NOTIFICATION_PREFS } from "./notification-prefs";
import type { PageService } from "./workspace-state";
import {
  DEFAULT_WORKSPACE_ICON,
  DEFAULT_WORKSPACE_ID,
  WORKSPACES_STATE_VERSION,
  addServiceToWorkspace,
  createDefaultWorkspaceGroupsState,
  createNewWorkspace,
  createWorkspaceGroup,
  deleteWorkspaceGroup,
  getWorkspaceServices,
  normalizeWorkspaceGroupsState,
  pickWorkspaceColor,
  readWorkspaceGroupsStartupState,
  removeServiceFromWorkspace,
  renameWorkspaceGroup,
  serializeWorkspaceGroupsState,
  setCurrentWorkspaceId,
  setWorkspaceDisabled,
  setWorkspaceActiveService,
  updateWorkspaceGroupIcon,
  updateWorkspaceServices,
} from "./workspace-groups";
import { WORKSPACE_ICON_PRESETS } from "./workspace-icons";

function createService(overrides: Partial<PageService> = {}): PageService {
  return {
    id: overrides.id ?? "service-1",
    name: overrides.name ?? "Slack",
    url: overrides.url ?? "https://slack.com/app",
    storageKey: overrides.storageKey ?? `storage-${overrides.id ?? "service-1"}`,
    notificationPrefs: overrides.notificationPrefs ?? {
      ...DEFAULT_NOTIFICATION_PREFS,
    },
    disabled: overrides.disabled,
    badge: overrides.badge,
    iconBgColor: overrides.iconBgColor,
  };
}

describe("createDefaultWorkspaceGroupsState", () => {
  it("migrates a legacy service list into an editable Default workspace", () => {
    const services = [
      createService({ id: "mail" }),
      createService({ id: "chat", badge: 7 }),
    ];

    expect(createDefaultWorkspaceGroupsState(services, "chat")).toEqual({
      version: WORKSPACES_STATE_VERSION,
      currentWorkspaceId: DEFAULT_WORKSPACE_ID,
      workspaces: [
        {
          id: DEFAULT_WORKSPACE_ID,
          name: "Default",
          serviceIds: ["mail", "chat"],
          activeServiceId: "chat",
          color: "#3B82F6",
          icon: DEFAULT_WORKSPACE_ICON,
        },
      ],
      servicesById: {
        mail: { ...services[0], badge: undefined },
        chat: { ...services[1], badge: undefined },
      },
    });
  });

  it("falls back to the first enabled service when the legacy active id is invalid", () => {
    const services = [
      createService({ id: "disabled", disabled: true }),
      createService({ id: "enabled" }),
    ];

    expect(
      createDefaultWorkspaceGroupsState(services, "missing").workspaces[0]
        .activeServiceId,
    ).toBe("enabled");
  });
});

describe("workspace membership", () => {
  it("allows the same service to appear in multiple workspaces with different order and active service", () => {
    const base = createDefaultWorkspaceGroupsState(
      [
        createService({ id: "mail" }),
        createService({ id: "chat" }),
        createService({ id: "docs" }),
      ],
      "mail",
    );
    const withPersonal = createWorkspaceGroup(base, {
      id: "personal",
      name: "Personal",
      serviceIds: ["chat", "mail"],
      activeServiceId: "chat",
      color: "#22C55E",
      icon: "bike",
    });

    expect(getWorkspaceServices(withPersonal, DEFAULT_WORKSPACE_ID).map((s) => s.id)).toEqual([
      "mail",
      "chat",
      "docs",
    ]);
    expect(getWorkspaceServices(withPersonal, "personal").map((s) => s.id)).toEqual([
      "chat",
      "mail",
    ]);
    expect(withPersonal.servicesById.chat).toBe(base.servicesById.chat);
    expect(withPersonal.workspaces.find((w) => w.id === "personal")?.icon).toBe("bike");
  });

  it("keeps workspace icons restricted to built-in presets", () => {
    const base = createDefaultWorkspaceGroupsState([createService({ id: "mail" })], "mail");
    const [firstPreset] = WORKSPACE_ICON_PRESETS;

    const valid = createWorkspaceGroup(base, {
      id: "focus",
      name: "Focus",
      serviceIds: ["mail"],
      activeServiceId: "mail",
      icon: firstPreset.key,
    });
    const invalid = createWorkspaceGroup(valid, {
      id: "external",
      name: "External",
      serviceIds: ["mail"],
      activeServiceId: "mail",
      icon: "remote-avatar-url",
    });

    expect(invalid.workspaces.find((workspace) => workspace.id === "focus")?.icon).toBe(
      firstPreset.key,
    );
    expect(invalid.workspaces.find((workspace) => workspace.id === "external")?.icon).toBe(
      DEFAULT_WORKSPACE_ICON,
    );
  });

  it("adds an existing service reference without duplicating the service record", () => {
    const base = createWorkspaceGroup(
      createDefaultWorkspaceGroupsState([createService({ id: "mail" })], "mail"),
      {
        id: "work",
        name: "Work",
        serviceIds: [],
        activeServiceId: "",
      },
    );

    const next = addServiceToWorkspace(base, "work", "mail");

    expect(next.workspaces.find((w) => w.id === "work")?.serviceIds).toEqual(["mail"]);
    expect(Object.keys(next.servicesById)).toEqual(["mail"]);
  });

  it("keeps active service per workspace when switching", () => {
    const base = createWorkspaceGroup(
      createDefaultWorkspaceGroupsState(
        [createService({ id: "mail" }), createService({ id: "chat" })],
        "mail",
      ),
      {
        id: "client",
        name: "Client",
        serviceIds: ["chat"],
        activeServiceId: "chat",
      },
    );

    const next = setCurrentWorkspaceId(
      setWorkspaceActiveService(base, DEFAULT_WORKSPACE_ID, "mail"),
      "client",
    );

    expect(next.currentWorkspaceId).toBe("client");
    expect(next.workspaces.find((w) => w.id === DEFAULT_WORKSPACE_ID)?.activeServiceId).toBe(
      "mail",
    );
    expect(next.workspaces.find((w) => w.id === "client")?.activeServiceId).toBe(
      "chat",
    );
  });

  it("updates only one workspace order while keeping shared service records", () => {
    const base = createWorkspaceGroup(
      createDefaultWorkspaceGroupsState(
        [createService({ id: "mail" }), createService({ id: "chat" })],
        "mail",
      ),
      {
        id: "personal",
        name: "Personal",
        serviceIds: ["chat", "mail"],
        activeServiceId: "chat",
      },
    );

    const next = updateWorkspaceServices(base, DEFAULT_WORKSPACE_ID, ["chat", "mail"], "chat");

    expect(next.workspaces.find((w) => w.id === DEFAULT_WORKSPACE_ID)?.serviceIds).toEqual([
      "chat",
      "mail",
    ]);
    expect(next.workspaces.find((w) => w.id === "personal")?.serviceIds).toEqual([
      "chat",
      "mail",
    ]);
    expect(next.servicesById.mail).toBe(base.servicesById.mail);
  });

  it("renames a workspace without changing its services", () => {
    const base = createDefaultWorkspaceGroupsState([createService({ id: "mail" })], "mail");
    const next = renameWorkspaceGroup(base, DEFAULT_WORKSPACE_ID, "Focus");

    expect(next.workspaces[0]).toMatchObject({
      id: DEFAULT_WORKSPACE_ID,
      name: "Focus",
      serviceIds: ["mail"],
    });
  });

  it("updates a workspace icon while keeping services and active service unchanged", () => {
    const base = createDefaultWorkspaceGroupsState([createService({ id: "mail" })], "mail");

    const next = updateWorkspaceGroupIcon(base, DEFAULT_WORKSPACE_ID, "bike");
    const invalid = updateWorkspaceGroupIcon(next, DEFAULT_WORKSPACE_ID, "remote-avatar-url");

    expect(next.workspaces[0]).toMatchObject({
      id: DEFAULT_WORKSPACE_ID,
      serviceIds: ["mail"],
      activeServiceId: "mail",
      icon: "bike",
    });
    expect(invalid.workspaces[0].icon).toBe(DEFAULT_WORKSPACE_ICON);
  });

  it("disables and enables a workspace without mutating shared service records", () => {
    const base = createWorkspaceGroup(
      createDefaultWorkspaceGroupsState([createService({ id: "mail" })], "mail"),
      {
        id: "work",
        name: "Work",
        serviceIds: ["mail"],
        activeServiceId: "mail",
      },
    );

    const disabled = setWorkspaceDisabled(base, "work", true);
    const enabled = setWorkspaceDisabled(disabled, "work", false);

    expect(disabled.workspaces.find((workspace) => workspace.id === "work")?.disabled).toBe(
      true,
    );
    expect(disabled.servicesById.mail).toBe(base.servicesById.mail);
    expect(enabled.workspaces.find((workspace) => workspace.id === "work")?.disabled).not.toBe(
      true,
    );
    expect(enabled.servicesById.mail).toBe(base.servicesById.mail);
  });

  it("deletes a workspace and falls back to the next available workspace", () => {
    const base = setCurrentWorkspaceId(
      createWorkspaceGroup(
        createDefaultWorkspaceGroupsState([createService({ id: "mail" })], "mail"),
        {
          id: "work",
          name: "Work",
          serviceIds: ["mail"],
          activeServiceId: "mail",
          icon: DEFAULT_WORKSPACE_ICON,
        },
      ),
      "work",
    );

    const next = deleteWorkspaceGroup(base, "work");

    expect(next.currentWorkspaceId).toBe(DEFAULT_WORKSPACE_ID);
    expect(next.workspaces.map((workspace) => workspace.id)).toEqual([DEFAULT_WORKSPACE_ID]);
    expect(next.servicesById.mail).toBe(base.servicesById.mail);
  });

  it("does not delete the last remaining workspace", () => {
    const base = createDefaultWorkspaceGroupsState([createService({ id: "mail" })], "mail");

    expect(deleteWorkspaceGroup(base, DEFAULT_WORKSPACE_ID)).toBe(base);
  });

  it("removes a service reference from one workspace without deleting the shared service", () => {
    const base = createWorkspaceGroup(
      createDefaultWorkspaceGroupsState([createService({ id: "mail" })], "mail"),
      {
        id: "work",
        name: "Work",
        serviceIds: ["mail"],
        activeServiceId: "mail",
      },
    );

    const next = removeServiceFromWorkspace(base, "work", "mail");

    expect(next.workspaces.find((workspace) => workspace.id === "work")?.serviceIds).toEqual([]);
    expect(next.servicesById.mail).toBe(base.servicesById.mail);
  });
});

describe("normalizeWorkspaceGroupsState", () => {
  it("repairs missing current workspace, missing services, duplicate refs, and invalid active ids", () => {
    const service = createService({ id: "mail" });

    expect(
      normalizeWorkspaceGroupsState({
        version: WORKSPACES_STATE_VERSION,
        currentWorkspaceId: "missing",
        workspaces: [
          {
            id: "work",
            name: "Work",
            serviceIds: ["missing", "mail", "mail"],
            activeServiceId: "missing",
          },
        ],
        servicesById: {
          mail: service,
        },
      }),
    ).toEqual({
      version: WORKSPACES_STATE_VERSION,
      currentWorkspaceId: "work",
      workspaces: [
        {
          id: "work",
          name: "Work",
          serviceIds: ["mail"],
          activeServiceId: "mail",
          icon: DEFAULT_WORKSPACE_ICON,
        },
      ],
      servicesById: {
        mail: { ...service, badge: undefined },
      },
    });
  });
});

describe("serializeWorkspaceGroupsState", () => {
  it("strips runtime badges before persisting", () => {
    const state = createDefaultWorkspaceGroupsState(
      [createService({ id: "chat", badge: 9 })],
      "chat",
    );

    expect(JSON.parse(serializeWorkspaceGroupsState(state)).servicesById.chat.badge).toBe(
      undefined,
    );
  });
});

describe("readWorkspaceGroupsStartupState", () => {
  it("reads valid workspace state from the new storage key", () => {
    const saved = serializeWorkspaceGroupsState(
      createWorkspaceGroup(
        createDefaultWorkspaceGroupsState([createService({ id: "mail" })], "mail"),
        {
          id: "work",
          name: "Work",
          serviceIds: ["mail"],
          activeServiceId: "mail",
        },
      ),
    );

    expect(readWorkspaceGroupsStartupState(saved, null, null)).toMatchObject({
      state: {
        currentWorkspaceId: DEFAULT_WORKSPACE_ID,
        workspaces: [
          expect.objectContaining({ id: DEFAULT_WORKSPACE_ID }),
          expect.objectContaining({ id: "work" }),
        ],
      },
      toastMessage: "",
    });
  });

  it("migrates legacy service storage when new workspace storage is missing", () => {
    const legacyServices = JSON.stringify([createService({ id: "mail" })]);

    expect(readWorkspaceGroupsStartupState(null, legacyServices, "mail")).toMatchObject({
      state: {
        currentWorkspaceId: DEFAULT_WORKSPACE_ID,
        workspaces: [
          {
            id: DEFAULT_WORKSPACE_ID,
            name: "Default",
            serviceIds: ["mail"],
            activeServiceId: "mail",
            color: "#3B82F6",
            icon: DEFAULT_WORKSPACE_ICON,
          },
        ],
      },
      toastMessage: "",
    });
  });

  it("repairs corrupted workspace storage and reports a reset toast", () => {
    expect(readWorkspaceGroupsStartupState("{", null, null)).toMatchObject({
      state: {
        currentWorkspaceId: DEFAULT_WORKSPACE_ID,
        workspaces: [expect.objectContaining({ id: DEFAULT_WORKSPACE_ID })],
      },
      toastMessage: "Saved workspaces were reset.",
    });
  });
});

describe("pickWorkspaceColor", () => {
  it("returns a hex color string", () => {
    expect(pickWorkspaceColor(0)).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("cycles through colors by index", () => {
    const c0 = pickWorkspaceColor(0);
    const c6 = pickWorkspaceColor(6);
    expect(c0).toBe(c6); // palette has 6 entries, index 6 wraps to 0
  });

  it("returns a different color for consecutive indices", () => {
    expect(pickWorkspaceColor(0)).not.toBe(pickWorkspaceColor(1));
  });
});

describe("createNewWorkspace", () => {
  it("appends a new workspace and switches to it", () => {
    const base = createDefaultWorkspaceGroupsState();
    const next = createNewWorkspace(base, { name: "Work", icon: "briefcase" });
    expect(next.workspaces).toHaveLength(2);
    const added = next.workspaces.find((w) => w.name === "Work");
    expect(added).toBeDefined();
    expect(next.currentWorkspaceId).toBe(added!.id);
  });

  it("generates a unique id prefixed with 'workspace-'", () => {
    const base = createDefaultWorkspaceGroupsState();
    const next = createNewWorkspace(base, { name: "Home", icon: "house" });
    const added = next.workspaces.find((w) => w.name === "Home")!;
    expect(added.id).toMatch(/^workspace-/);
  });

  it("assigns a color from the palette", () => {
    const base = createDefaultWorkspaceGroupsState();
    const next = createNewWorkspace(base, { name: "Home", icon: "house" });
    const added = next.workspaces.find((w) => w.name === "Home")!;
    expect(added.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("normalizes the icon", () => {
    const base = createDefaultWorkspaceGroupsState();
    const next = createNewWorkspace(base, { name: "Home", icon: "house" });
    const added = next.workspaces.find((w) => w.name === "Home")!;
    expect(added.icon).toBe("house");
  });
});
