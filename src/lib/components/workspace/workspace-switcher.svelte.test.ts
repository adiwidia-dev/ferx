// @vitest-environment jsdom
import { flushSync, mount, unmount } from "svelte";
import { describe, expect, it, vi } from "vitest";

import WorkspaceSwitcher from "./workspace-switcher.svelte";

const workspaces = [
  {
    id: "default",
    name: "Default",
    serviceIds: [],
    activeServiceId: "",
    color: "#3B82F6",
    icon: "briefcase",
  },
  {
    id: "work",
    name: "Work",
    serviceIds: ["mail"],
    activeServiceId: "mail",
    color: "#22C55E",
    icon: "building-2",
  },
];

describe("WorkspaceSwitcher", () => {
  it("notifies the page when the popover opens so native webviews can be hidden", () => {
    const onOpenChange = vi.fn();
    const component = mount(WorkspaceSwitcher, {
      target: document.body,
      props: {
        workspaces,
        currentWorkspaceId: "default",
        onSelectWorkspace: vi.fn(),
        onCreateWorkspace: vi.fn(),
        onUpdateWorkspaceIcon: vi.fn(),
        onRenameWorkspace: vi.fn(),
        onSetWorkspaceDisabled: vi.fn(),
        onDeleteWorkspace: vi.fn(),
        onOpenChange,
      } as never,
    });

    flushSync();
    const trigger = document.querySelector('[data-testid="workspace-switcher-trigger"]') as HTMLButtonElement;
    trigger.click();
    flushSync();

    expect(onOpenChange).toHaveBeenCalledWith(true);

    unmount(component);
  });

  it("uses a compact icon-first trigger with the workspace name as a tooltip", () => {
    const component = mount(WorkspaceSwitcher, {
      target: document.body,
      props: {
        workspaces,
        currentWorkspaceId: "default",
        onSelectWorkspace: vi.fn(),
        onCreateWorkspace: vi.fn(),
        onUpdateWorkspaceIcon: vi.fn(),
        onRenameWorkspace: vi.fn(),
        onSetWorkspaceDisabled: vi.fn(),
        onDeleteWorkspace: vi.fn(),
      },
    });

    flushSync();
    const trigger = document.querySelector('[data-testid="workspace-switcher-trigger"]') as HTMLButtonElement;
    const icon = document.querySelector('[data-testid="workspace-trigger-icon"]');

    expect(icon).not.toBeNull();
    expect(trigger.title).toBe("Switch workspace: Default");
    expect(trigger.textContent).not.toContain("Default");
    expect(trigger.className).toContain("w-14");

    unmount(component);
  });

  it("creates a workspace with a selected built-in icon from the workspace popover", () => {
    const onCreateWorkspace = vi.fn();
    const component = mount(WorkspaceSwitcher, {
      target: document.body,
      props: {
        workspaces,
        currentWorkspaceId: "default",
        onSelectWorkspace: vi.fn(),
        onCreateWorkspace,
        onUpdateWorkspaceIcon: vi.fn(),
        onRenameWorkspace: vi.fn(),
        onSetWorkspaceDisabled: vi.fn(),
        onDeleteWorkspace: vi.fn(),
      },
    });

    flushSync();
    const trigger = document.querySelector('[data-testid="workspace-switcher-trigger"]') as HTMLButtonElement;
    trigger.click();
    flushSync();

    expect(document.querySelector('[data-testid="workspace-create-icon-picker"]')).toBeNull();

    const selectedIconButton = document.querySelector(
      '[title="Choose new workspace icon"]',
    ) as HTMLButtonElement;
    selectedIconButton.click();
    flushSync();

    const iconOptions = document.querySelectorAll('[data-testid="workspace-icon-option"]');
    expect(iconOptions.length).toBeGreaterThanOrEqual(20);

    const bikeIcon = Array.from(iconOptions).find((button) =>
      button.getAttribute("title")?.includes("Bicycle"),
    ) as HTMLButtonElement;
    bikeIcon.click();
    flushSync();

    const input = document.querySelector(
      'input[placeholder="Workspace name"]',
    ) as HTMLInputElement;
    input.value = "Client A";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();

    const createButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Create workspace"),
    ) as HTMLButtonElement;
    createButton.click();
    flushSync();

    expect(onCreateWorkspace).toHaveBeenCalledWith({
      name: "Client A",
      icon: "bike",
    });
    expect(document.body.textContent).not.toContain("Manage workspaces");

    unmount(component);
  });

  it("renders the workspace picker as a centered overlay instead of an anchored side popover", () => {
    const component = mount(WorkspaceSwitcher, {
      target: document.body,
      props: {
        workspaces,
        currentWorkspaceId: "default",
        onSelectWorkspace: vi.fn(),
        onCreateWorkspace: vi.fn(),
        onUpdateWorkspaceIcon: vi.fn(),
        onRenameWorkspace: vi.fn(),
        onSetWorkspaceDisabled: vi.fn(),
        onDeleteWorkspace: vi.fn(),
      },
    });

    flushSync();
    const trigger = document.querySelector('[data-testid="workspace-switcher-trigger"]') as HTMLButtonElement;
    trigger.click();
    flushSync();

    const overlay = document.querySelector('[data-testid="workspace-picker-overlay"]');
    const panel = document.querySelector('[data-testid="workspace-picker-panel"]');

    expect(overlay?.className).toContain("fixed inset-y-0 left-20 right-0");
    expect(panel?.className).toContain("left-1/2 top-1/2");
    expect(panel?.className).toContain("-translate-x-1/2 -translate-y-1/2");

    unmount(component);
  });

  it("updates an existing workspace icon from the workspace list without switching workspace", () => {
    const onSelectWorkspace = vi.fn();
    const onUpdateWorkspaceIcon = vi.fn();
    const component = mount(WorkspaceSwitcher, {
      target: document.body,
      props: {
        workspaces,
        currentWorkspaceId: "default",
        onSelectWorkspace,
        onCreateWorkspace: vi.fn(),
        onUpdateWorkspaceIcon,
        onRenameWorkspace: vi.fn(),
        onSetWorkspaceDisabled: vi.fn(),
        onDeleteWorkspace: vi.fn(),
      },
    });

    flushSync();
    const trigger = document.querySelector('[data-testid="workspace-switcher-trigger"]') as HTMLButtonElement;
    trigger.click();
    flushSync();

    const changeWorkIcon = document.querySelector(
      '[title="Change Work icon"]',
    ) as HTMLButtonElement;
    changeWorkIcon.click();
    flushSync();

    const bikeIcon = Array.from(
      document.querySelectorAll('[data-testid="workspace-edit-icon-option"]'),
    ).find((button) => button.getAttribute("title")?.includes("Bicycle")) as HTMLButtonElement;
    bikeIcon.click();
    flushSync();

    expect(onSelectWorkspace).not.toHaveBeenCalled();
    expect(onUpdateWorkspaceIcon).toHaveBeenCalledWith({
      workspaceId: "work",
      icon: "bike",
    });

    unmount(component);
  });

  it("renames an existing workspace from the workspace list without switching workspace", () => {
    const onSelectWorkspace = vi.fn();
    const onRenameWorkspace = vi.fn();
    const component = mount(WorkspaceSwitcher, {
      target: document.body,
      props: {
        workspaces,
        currentWorkspaceId: "default",
        onSelectWorkspace,
        onCreateWorkspace: vi.fn(),
        onUpdateWorkspaceIcon: vi.fn(),
        onRenameWorkspace,
        onSetWorkspaceDisabled: vi.fn(),
        onDeleteWorkspace: vi.fn(),
      },
    });

    flushSync();
    const trigger = document.querySelector('[data-testid="workspace-switcher-trigger"]') as HTMLButtonElement;
    trigger.click();
    flushSync();

    const renameButton = document.querySelector(
      '[title="Rename Work workspace"]',
    ) as HTMLButtonElement;
    renameButton.click();
    flushSync();

    const input = document.querySelector(
      'input[aria-label="Workspace name for Work"]',
    ) as HTMLInputElement;
    input.value = "Client Work";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();

    const saveButton = document.querySelector(
      '[title="Save Work workspace name"]',
    ) as HTMLButtonElement;
    expect(saveButton.textContent).toContain("Save");
    saveButton.click();
    flushSync();

    expect(onSelectWorkspace).not.toHaveBeenCalled();
    expect(onRenameWorkspace).toHaveBeenCalledWith({
      workspaceId: "work",
      name: "Client Work",
    });

    unmount(component);
  });

  it("toggles a workspace disabled state from the workspace list without switching workspace", () => {
    const onSelectWorkspace = vi.fn();
    const onSetWorkspaceDisabled = vi.fn();
    const disabledWorkspaces = [
      workspaces[0],
      {
        ...workspaces[1],
        disabled: true,
      },
    ];
    const component = mount(WorkspaceSwitcher, {
      target: document.body,
      props: {
        workspaces,
        currentWorkspaceId: "default",
        onSelectWorkspace,
        onCreateWorkspace: vi.fn(),
        onUpdateWorkspaceIcon: vi.fn(),
        onRenameWorkspace: vi.fn(),
        onSetWorkspaceDisabled,
        onDeleteWorkspace: vi.fn(),
      },
    });

    flushSync();
    const trigger = document.querySelector('[data-testid="workspace-switcher-trigger"]') as HTMLButtonElement;
    trigger.click();
    flushSync();

    const disableButton = document.querySelector(
      '[title="Disable Work workspace"]',
    ) as HTMLButtonElement;
    disableButton.click();
    flushSync();

    expect(onSelectWorkspace).not.toHaveBeenCalled();
    expect(onSetWorkspaceDisabled).toHaveBeenCalledWith({
      workspaceId: "work",
      disabled: true,
    });

    unmount(component);

    const enabledComponent = mount(WorkspaceSwitcher, {
      target: document.body,
      props: {
        workspaces: disabledWorkspaces,
        currentWorkspaceId: "default",
        onSelectWorkspace,
        onCreateWorkspace: vi.fn(),
        onUpdateWorkspaceIcon: vi.fn(),
        onRenameWorkspace: vi.fn(),
        onSetWorkspaceDisabled,
        onDeleteWorkspace: vi.fn(),
      },
    });

    flushSync();
    const nextTrigger = document.querySelector('[data-testid="workspace-switcher-trigger"]') as HTMLButtonElement;
    nextTrigger.click();
    flushSync();

    const enableButton = document.querySelector(
      '[title="Enable Work workspace"]',
    ) as HTMLButtonElement;
    enableButton.click();
    flushSync();

    expect(onSetWorkspaceDisabled).toHaveBeenCalledWith({
      workspaceId: "work",
      disabled: false,
    });

    unmount(enabledComponent);
  });

  it("deletes an existing workspace only after confirmation", () => {
    const onDeleteWorkspace = vi.fn();
    const component = mount(WorkspaceSwitcher, {
      target: document.body,
      props: {
        workspaces,
        currentWorkspaceId: "default",
        onSelectWorkspace: vi.fn(),
        onCreateWorkspace: vi.fn(),
        onUpdateWorkspaceIcon: vi.fn(),
        onRenameWorkspace: vi.fn(),
        onSetWorkspaceDisabled: vi.fn(),
        onDeleteWorkspace,
      },
    });

    flushSync();
    const trigger = document.querySelector('[data-testid="workspace-switcher-trigger"]') as HTMLButtonElement;
    trigger.click();
    flushSync();

    const deleteButton = document.querySelector(
      '[title="Delete Work workspace"]',
    ) as HTMLButtonElement;
    deleteButton.click();
    flushSync();

    expect(onDeleteWorkspace).not.toHaveBeenCalled();

    const confirmButton = document.querySelector(
      '[title="Confirm delete Work workspace"]',
    ) as HTMLButtonElement;
    confirmButton.click();
    flushSync();

    expect(onDeleteWorkspace).toHaveBeenCalledWith("work");

    unmount(component);
  });
});
