// @vitest-environment jsdom
import { flushSync, mount, unmount } from "svelte";
import { describe, expect, it, vi } from "vitest";

import WorkspaceSidebar from "./workspace-sidebar.svelte";
import { DEFAULT_NOTIFICATION_PREFS } from "$lib/services/notification-prefs";
import type { PageService } from "$lib/services/workspace-state";
import type { WorkspaceGroup } from "$lib/services/workspace-groups";

type SidebarTestService = PageService & { hibernated?: boolean };

const workspaces: WorkspaceGroup[] = [
  {
    id: "default",
    name: "Default",
    serviceIds: [],
    activeServiceId: "service-1",
    color: "#3B82F6",
    icon: "briefcase",
  },
];

function service(index: number, overrides: Partial<SidebarTestService> = {}): SidebarTestService {
  return {
    id: `service-${index}`,
    name: `Service ${index}`,
    url: `https://service-${index}.example.com`,
    storageKey: `service-${index}`,
    notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
    ...overrides,
  };
}

function mountSidebar(serviceCountOrServices: number | SidebarTestService[]) {
  const services = Array.isArray(serviceCountOrServices)
    ? serviceCountOrServices
    : Array.from({ length: serviceCountOrServices }, (_, index) => service(index + 1));

  return mount(WorkspaceSidebar, {
    target: document.body,
    props: {
      services,
      activeId: "service-1",
      workspaces,
      currentWorkspaceId: "default",
      draggedId: null,
      dragOverId: null,
      isDnd: false,
      isTodosPanelOpen: false,
      isWorkspaceSwitcherOpen: false,
      onPointerDown: vi.fn(),
      onSelectService: vi.fn(),
      onSelectWorkspace: vi.fn(),
      onCreateWorkspace: vi.fn(),
      onUpdateWorkspaceIcon: vi.fn(),
      onRenameWorkspace: vi.fn(),
      onSetWorkspaceDisabled: vi.fn(),
      onDeleteWorkspace: vi.fn(),
      onWorkspaceSwitcherOpenChange: vi.fn(),
      onOpenServiceContextMenu: vi.fn(),
      onToggleDnd: vi.fn(),
      onOpenAddModal: vi.fn(),
      onToggleTodosPanel: vi.fn(),
    },
  });
}

describe("WorkspaceSidebar", () => {
  it("keeps utility controls outside the scrollable service list when many services exist", () => {
    const component = mountSidebar(14);

    flushSync();

    const sidebar = document.querySelector('[data-testid="workspace-sidebar"]');
    const serviceList = document.querySelector('[data-testid="workspace-service-list"]');
    const utilityControls = document.querySelector('[data-testid="workspace-utility-controls"]');

    expect(sidebar?.className).toContain("overflow-hidden");
    expect(serviceList?.className).toContain("overflow-y-auto");
    expect(serviceList?.className).toContain("min-h-0");
    expect(utilityControls?.className).toContain("shrink-0");
    expect(serviceList?.contains(utilityControls)).toBe(false);
    expect(utilityControls?.querySelector('[title="Settings"]')).toBeTruthy();

    unmount(component);
  });

  it("shows enabled hibernated services without using disabled styling", () => {
    const component = mountSidebar([
      service(1),
      service(2, { hibernated: true }),
      service(3, { disabled: true, hibernated: true }),
    ]);

    flushSync();

    const hibernatedButton = document.querySelector<HTMLButtonElement>(
      '[title="Service 2 is hibernated. Click to wake."]',
    );
    const disabledButton = document.querySelector<HTMLButtonElement>('[title="Service 3 (Cmd+3)"]');

    expect(hibernatedButton).toBeTruthy();
    expect(hibernatedButton?.className).toContain("bg-sky-500/10");
    expect(hibernatedButton?.className).toContain("ring-sky-400/40");
    expect(hibernatedButton?.className).not.toContain("opacity-40");
    expect(hibernatedButton?.className).not.toContain("grayscale");
    expect(
      hibernatedButton?.querySelector('[data-testid="service-hibernation-indicator"]'),
    ).toBeTruthy();

    expect(disabledButton?.className).toContain("opacity-40");
    expect(disabledButton?.className).toContain("grayscale");
    expect(disabledButton?.className).not.toContain("bg-sky-500/10");
    expect(
      disabledButton?.querySelector('[data-testid="service-hibernation-indicator"]'),
    ).toBeFalsy();

    unmount(component);
  });
});
