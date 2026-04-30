// @vitest-environment jsdom
import { flushSync, mount, unmount } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_NOTIFICATION_PREFS } from "$lib/services/notification-prefs";
import {
  WORKSPACES_STATE_KEY,
  WORKSPACES_STATE_VERSION,
  type WorkspaceGroupsState,
} from "$lib/services/workspace-groups";
import WorkspacePage from "./+page.svelte";

const invoke = vi.hoisted(() => vi.fn());
const listen = vi.hoisted(() => vi.fn(() => Promise.resolve(() => {})));

vi.mock("@tauri-apps/api/core", () => ({
  invoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen,
}));

async function waitForTodoFocus() {
  flushSync();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  flushSync();
}

async function waitForPointerDrag() {
  flushSync();
  await Promise.resolve();
  await new Promise((resolve) => requestAnimationFrame(resolve));
  flushSync();
}

function mockElementFromPoint(target: Element) {
  const original = document.elementFromPoint;
  const mock = vi.fn(() => target);
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: mock,
  });

  return () => {
    if (original) {
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: original,
      });
      return;
    }

    Reflect.deleteProperty(document, "elementFromPoint");
  };
}

function createWorkspaceState(): WorkspaceGroupsState {
  return {
    version: WORKSPACES_STATE_VERSION,
    currentWorkspaceId: "default",
    workspaces: [
      {
        id: "default",
        name: "Default",
        serviceIds: ["chat"],
        activeServiceId: "chat",
        icon: "briefcase",
      },
    ],
    servicesById: {
      chat: {
        id: "chat",
        name: "Chat",
        url: "https://chat.example.com/",
        storageKey: "storage-chat",
        notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
      },
    },
  };
}

describe("workspace todos panel", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    invoke.mockClear();
    listen.mockClear();
  });

  it("renders the todo button between add service and settings", () => {
    const component = mount(WorkspacePage, {
      target: document.body,
    });

    flushSync();

    const controls = Array.from(document.querySelectorAll("button, a"))
      .map((node) => node.getAttribute("title"))
      .filter(Boolean);

    expect(controls).toContain("Add Service");
    expect(controls).toContain("Todos");
    expect(controls).toContain("Settings");
    expect(controls.indexOf("Todos")).toBeGreaterThan(controls.indexOf("Add Service"));
    expect(controls.indexOf("Todos")).toBeLessThan(controls.indexOf("Settings"));

    unmount(component);
  });

  it("toggles the todos panel and updates native webview bounds", async () => {
    const component = mount(WorkspacePage, {
      target: document.body,
    });

    flushSync();

    const todosButton = document.querySelector(
      'button[title="Todos"]',
    ) as HTMLButtonElement | null;
    todosButton?.click();
    flushSync();
    await Promise.resolve();

    expect(document.querySelector('[data-testid="todos-panel"]')).toBeTruthy();
    expect(document.body.textContent).toContain("Todos");
    expect(invoke).toHaveBeenCalledWith("set_right_panel_width", {
      payload: { width: 360 },
    });

    const closeButton = document.querySelector(
      'button[aria-label="Close todos panel"]',
    ) as HTMLButtonElement | null;
    closeButton?.click();
    flushSync();
    await waitForTodoFocus();

    expect(document.querySelector('[data-testid="todos-panel"]')).toBeFalsy();
    expect(invoke).toHaveBeenCalledWith("set_right_panel_width", {
      payload: { width: 0 },
    });

    unmount(component);
  });

  it("queues todo panel width updates behind pending webview commands", async () => {
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(createWorkspaceState()));
    let resolveOpenService: () => void = () => {};
    invoke.mockImplementation((command) => {
      if (command === "open_service") {
        return new Promise((resolve) => {
          resolveOpenService = () => resolve(undefined);
        });
      }

      return Promise.resolve();
    });

    const component = mount(WorkspacePage, {
      target: document.body,
    });

    flushSync();
    await Promise.resolve();
    invoke.mockClear();

    document.querySelector<HTMLButtonElement>('button[title="Todos"]')?.click();
    flushSync();
    await Promise.resolve();

    expect(invoke).not.toHaveBeenCalledWith("set_right_panel_width", {
      payload: { width: 360 },
    });

    resolveOpenService();
    await waitForTodoFocus();

    expect(invoke).toHaveBeenCalledWith("set_right_panel_width", {
      payload: { width: 360 },
    });

    unmount(component);
  });

  it("focuses the newly created item after pressing enter in a todo item", async () => {
    localStorage.setItem(
      "ferx-todo-notes",
      JSON.stringify([
        {
          id: "note-1",
          title: "Groceries",
          completedCollapsed: false,
          items: [{ id: "item-1", text: "Sawi", completed: false }],
        },
      ]),
    );

    const component = mount(WorkspacePage, {
      target: document.body,
    });

    flushSync();

    document.querySelector<HTMLButtonElement>('button[title="Todos"]')?.click();
    flushSync();

    const itemInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="Todo item text"]',
    );
    itemInput?.focus();
    itemInput?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    flushSync();
    await waitForTodoFocus();

    const itemInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[aria-label="Todo item text"]'),
    );
    expect(itemInputs).toHaveLength(2);
    expect(document.activeElement).toBe(itemInputs[1]);

    unmount(component);
  });

  it("pastes multiline clipboard text as multiple todo items", async () => {
    localStorage.setItem(
      "ferx-todo-notes",
      JSON.stringify([
        {
          id: "note-1",
          title: "Groceries",
          completedCollapsed: false,
          items: [{ id: "item-1", text: "", completed: false }],
        },
      ]),
    );

    const component = mount(WorkspacePage, {
      target: document.body,
    });

    flushSync();

    document.querySelector<HTMLButtonElement>('button[title="Todos"]')?.click();
    flushSync();

    const itemInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="Todo item text"]',
    );
    const pasteEvent = new Event("paste", {
      bubbles: true,
      cancelable: true,
    }) as ClipboardEvent;
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        getData: () => "Sawi hijau\nSawi\nSawi besar",
      },
    });
    itemInput?.dispatchEvent(pasteEvent);
    await waitForTodoFocus();

    const itemInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[aria-label="Todo item text"]'),
    );
    expect(itemInputs.map((input) => input.value)).toEqual([
      "Sawi hijau",
      "Sawi",
      "Sawi besar",
    ]);
    expect(document.activeElement).toBe(itemInputs[2]);

    unmount(component);
  });

  it("collapses and expands a todo note so only the title remains visible", () => {
    localStorage.setItem(
      "ferx-todo-notes",
      JSON.stringify([
        {
          id: "note-1",
          title: "Groceries",
          collapsed: false,
          completedCollapsed: false,
          items: [{ id: "item-1", text: "Sawi", completed: false }],
        },
      ]),
    );

    const component = mount(WorkspacePage, {
      target: document.body,
    });

    flushSync();
    document.querySelector<HTMLButtonElement>('button[title="Todos"]')?.click();
    flushSync();

    expect(
      document.querySelector<HTMLInputElement>('input[aria-label="Todo item text"]')?.value,
    ).toBe("Sawi");
    document.querySelector<HTMLButtonElement>('button[aria-label="Collapse todo note"]')?.click();
    flushSync();

    expect(
      document.querySelector<HTMLInputElement>('input[aria-label="Todo note title"]')?.value,
    ).toBe("Groceries");
    expect(document.querySelector('input[aria-label="Todo item text"]')).toBeFalsy();

    document.querySelector<HTMLButtonElement>('button[aria-label="Expand todo note"]')?.click();
    flushSync();
    expect(
      document.querySelector<HTMLInputElement>('input[aria-label="Todo item text"]')?.value,
    ).toBe("Sawi");

    unmount(component);
  });

  it("moves a dragged todo note after a lower target note", async () => {
    localStorage.setItem(
      "ferx-todo-notes",
      JSON.stringify([
        { id: "note-1", title: "First", collapsed: false, completedCollapsed: false, items: [] },
        { id: "note-2", title: "Second", collapsed: false, completedCollapsed: false, items: [] },
        { id: "note-3", title: "Third", collapsed: false, completedCollapsed: false, items: [] },
      ]),
    );

    const component = mount(WorkspacePage, {
      target: document.body,
    });

    flushSync();
    document.querySelector<HTMLButtonElement>('button[title="Todos"]')?.click();
    flushSync();

    const noteCards = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="todo-note-card"]'),
    );
    const todosPanel = document.querySelector<HTMLElement>('[data-testid="todos-panel"]');
    const restoreElementFromPoint = mockElementFromPoint(todosPanel ?? noteCards[2]);

    noteCards[0]
      .querySelector<HTMLButtonElement>('button[aria-label="Drag todo note"]')
      ?.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientX: 10,
          clientY: 10,
        }),
      );
    window.dispatchEvent(
      new MouseEvent("pointermove", { bubbles: true, clientX: 10, clientY: 40 }),
    );
    await waitForPointerDrag();
    window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    flushSync();
    restoreElementFromPoint();

    const titleInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[aria-label="Todo note title"]'),
    );
    expect(titleInputs.map((input) => input.value)).toEqual(["Second", "Third", "First"]);

    unmount(component);
  });

  it("moves a dragged todo item after a lower target item", async () => {
    localStorage.setItem(
      "ferx-todo-notes",
      JSON.stringify([
        {
          id: "note-1",
          title: "Groceries",
          collapsed: false,
          completedCollapsed: false,
          items: [
            { id: "item-1", text: "First", completed: false },
            { id: "item-2", text: "Second", completed: false },
            { id: "item-3", text: "Third", completed: false },
          ],
        },
      ]),
    );

    const component = mount(WorkspacePage, {
      target: document.body,
    });

    flushSync();
    document.querySelector<HTMLButtonElement>('button[title="Todos"]')?.click();
    flushSync();

    const itemRows = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="todo-item-row"]'),
    );
    const todosPanel = document.querySelector<HTMLElement>('[data-testid="todos-panel"]');
    const restoreElementFromPoint = mockElementFromPoint(todosPanel ?? itemRows[2]);

    itemRows[0]
      .querySelector<HTMLButtonElement>('button[aria-label="Drag todo item"]')
      ?.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientX: 10,
          clientY: 10,
        }),
      );
    window.dispatchEvent(
      new MouseEvent("pointermove", { bubbles: true, clientX: 10, clientY: 40 }),
    );
    await waitForPointerDrag();
    window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    flushSync();
    restoreElementFromPoint();

    const itemInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[aria-label="Todo item text"]'),
    );
    expect(itemInputs.map((input) => input.value)).toEqual(["Second", "Third", "First"]);

    unmount(component);
  });

  it("uses the persisted spell-check setting for todo inputs", () => {
    localStorage.setItem(
      "ferx-app-settings",
      JSON.stringify({ spellCheckEnabled: false, resourceUsageMonitoringEnabled: false }),
    );
    localStorage.setItem(
      "ferx-todo-notes",
      JSON.stringify([
        {
          id: "note-1",
          title: "Groceries",
          collapsed: false,
          completedCollapsed: false,
          items: [{ id: "item-1", text: "Sawi", completed: false }],
        },
      ]),
    );

    const component = mount(WorkspacePage, {
      target: document.body,
    });

    flushSync();
    document.querySelector<HTMLButtonElement>('button[title="Todos"]')?.click();
    flushSync();

    expect(
      document
        .querySelector<HTMLInputElement>('input[aria-label="Todo note title"]')
        ?.getAttribute("spellcheck"),
    ).toBe("false");
    expect(
      document
        .querySelector<HTMLInputElement>('input[aria-label="Todo item text"]')
        ?.getAttribute("spellcheck"),
    ).toBe("false");

    unmount(component);
  });
});
