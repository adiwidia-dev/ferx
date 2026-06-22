import { describe, expect, it } from "vitest";

import { DEFAULT_NOTIFICATION_PREFS } from "./notification-prefs";
import {
  buildServiceManagementRows,
  filterServiceManagementRows,
  setServiceHibernationEnabled,
} from "./service-management";
import {
  WORKSPACES_STATE_VERSION,
  type WorkspaceGroupsState,
} from "./workspace-groups";

function createState(): WorkspaceGroupsState {
  return {
    version: WORKSPACES_STATE_VERSION,
    currentWorkspaceId: "personal",
    workspaces: [
      {
        id: "personal",
        name: "Personal",
        serviceIds: ["whatsapp-personal", "gmail"],
        activeServiceId: "whatsapp-personal",
        icon: "house",
      },
      {
        id: "work",
        name: "Work",
        serviceIds: ["whatsapp-work", "gmail"],
        activeServiceId: "whatsapp-work",
        icon: "briefcase",
      },
    ],
    servicesById: {
      "whatsapp-personal": {
        id: "whatsapp-personal",
        name: "WhatsApp Personal",
        url: "https://web.whatsapp.com/",
        storageKey: "storage-whatsapp-personal",
        notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
      },
      "whatsapp-work": {
        id: "whatsapp-work",
        name: "WhatsApp Work",
        url: "https://web.whatsapp.com/",
        storageKey: "storage-whatsapp-work",
        notificationPrefs: {
          ...DEFAULT_NOTIFICATION_PREFS,
          showBadge: false,
        },
        disabled: true,
      },
      gmail: {
        id: "gmail",
        name: "Gmail",
        url: "https://mail.google.com/mail/u/0/",
        storageKey: "storage-gmail",
        notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
        hibernateWhenInactive: true,
      },
    },
  };
}

describe("buildServiceManagementRows", () => {
  it("creates one row per service record and lists every workspace membership", () => {
    const rows = buildServiceManagementRows(createState());

    expect(rows.map((row) => row.service.id)).toEqual([
      "whatsapp-personal",
      "gmail",
      "whatsapp-work",
    ]);
    expect(rows.find((row) => row.service.id === "gmail")?.workspaces).toEqual([
      { id: "personal", name: "Personal" },
      { id: "work", name: "Work" },
    ]);
  });

  it("keeps separate accounts for the same service app as separate rows", () => {
    const rows = buildServiceManagementRows(createState());

    expect(rows.filter((row) => row.hostname === "web.whatsapp.com")).toHaveLength(2);
    expect(rows.filter((row) => row.service.name.startsWith("WhatsApp"))).toHaveLength(2);
  });
});

describe("filterServiceManagementRows", () => {
  it("filters by workspace id", () => {
    const rows = filterServiceManagementRows(buildServiceManagementRows(createState()), {
      workspaceId: "work",
      query: "",
    });

    expect(rows.map((row) => row.service.id)).toEqual(["gmail", "whatsapp-work"]);
  });

  it("searches service name, hostname, and workspace names", () => {
    const rows = buildServiceManagementRows(createState());

    expect(
      filterServiceManagementRows(rows, { workspaceId: "all", query: "work" }).map(
        (row) => row.service.id,
      ),
    ).toEqual(["gmail", "whatsapp-work"]);
    expect(
      filterServiceManagementRows(rows, { workspaceId: "all", query: "google" }).map(
        (row) => row.service.id,
      ),
    ).toEqual(["gmail"]);
    expect(
      filterServiceManagementRows(rows, { workspaceId: "all", query: "personal" }).map(
        (row) => row.service.id,
      ),
    ).toEqual(["whatsapp-personal", "gmail"]);
  });
});

describe("setServiceHibernationEnabled", () => {
  it("sets or removes service hibernation without changing unrelated services", () => {
    const state = createState();
    const enabled = setServiceHibernationEnabled(state, "whatsapp-personal", true);
    const disabled = setServiceHibernationEnabled(enabled, "gmail", false);

    expect(enabled.servicesById["whatsapp-personal"].hibernateWhenInactive).toBe(true);
    expect(disabled.servicesById.gmail.hibernateWhenInactive).toBeUndefined();
    expect(disabled.servicesById["whatsapp-work"]).toEqual(state.servicesById["whatsapp-work"]);
  });

  it("returns the original state for missing services", () => {
    const state = createState();

    expect(setServiceHibernationEnabled(state, "missing", true)).toBe(state);
  });
});
