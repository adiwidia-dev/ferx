import { describe, expect, it } from "vitest";

import {
  addTodoItem,
  createTodoItem,
  createTodoNote,
  deleteTodoItem,
  deleteTodoNote,
  insertTodoItemsAfter,
  readTodoNotes,
  reorderTodoItems,
  reorderTodoNotes,
  serializeTodoNotes,
  toggleTodoNoteCollapsed,
  toggleTodoItemCompleted,
  updateTodoItemText,
  updateTodoNoteTitle,
  type TodoNote,
} from "./todos";

function note(overrides: Partial<TodoNote> = {}): TodoNote {
  return {
    id: overrides.id ?? "note-1",
    title: overrides.title ?? "Title",
    collapsed: overrides.collapsed ?? false,
    completedCollapsed: overrides.completedCollapsed ?? false,
    items: overrides.items ?? [],
  };
}

describe("readTodoNotes", () => {
  it("returns an empty list for missing or corrupted storage", () => {
    expect(readTodoNotes(null)).toEqual([]);
    expect(readTodoNotes("{")).toEqual([]);
    expect(readTodoNotes(JSON.stringify({ notes: [] }))).toEqual([]);
  });

  it("keeps valid notes and valid items while dropping malformed entries", () => {
    const saved = JSON.stringify([
      note({
        id: "valid",
        title: "Ideas",
        collapsed: true,
        completedCollapsed: true,
        items: [
          { id: "item-1", text: "Build kiosk", completed: false },
          { id: "broken", text: "No completed flag" } as unknown as TodoNote["items"][number],
          { id: "item-2", text: "Ship assistant", completed: true },
        ],
      }),
      { id: "bad-note", title: 123, items: [] },
    ]);

    expect(readTodoNotes(saved)).toEqual([
      {
        id: "valid",
        title: "Ideas",
        collapsed: true,
        completedCollapsed: true,
        items: [
          { id: "item-1", text: "Build kiosk", completed: false },
          { id: "item-2", text: "Ship assistant", completed: true },
        ],
      },
    ]);
  });

  it("removes arrow/navigation control characters from stored note and item text", () => {
    const saved = JSON.stringify([
      note({
        id: "valid",
        title: "Title\u{F703}\u001D",
        items: [{ id: "item-1", text: "test\u{F702}\u001C", completed: false }],
      }),
    ]);

    expect(readTodoNotes(saved)).toEqual([
      note({
        id: "valid",
        title: "Title",
        items: [{ id: "item-1", text: "test", completed: false }],
      }),
    ]);
  });
});

describe("todo note helpers", () => {
  it("serializes only todo note fields", () => {
    expect(serializeTodoNotes([note({ id: "note-1", title: "Roadmap" })])).toBe(
      '[{"id":"note-1","title":"Roadmap","collapsed":false,"items":[],"completedCollapsed":false}]',
    );
  });

  it("creates notes and items with stable ids", () => {
    expect(createTodoNote(() => "note-2")).toEqual({
      id: "note-2",
      title: "Title",
      collapsed: false,
      items: [],
      completedCollapsed: false,
    });

    expect(createTodoItem(() => "item-1", "Draft")).toEqual({
      id: "item-1",
      text: "Draft",
      completed: false,
    });
  });

  it("updates titles, item text, and deletes notes or items immutably", () => {
    const notes = [
      note({
        id: "note-1",
        items: [
          { id: "item-1", text: "Old", completed: false },
          { id: "item-2", text: "Remove", completed: false },
        ],
      }),
      note({ id: "note-2" }),
    ];

    const renamed = updateTodoNoteTitle(notes, "note-1", "New title");
    expect(renamed[0].title).toBe("New title");
    expect(notes[0].title).toBe("Title");

    const edited = updateTodoItemText(renamed, "note-1", "item-1", "New item");
    expect(edited[0].items[0].text).toBe("New item");
    expect(renamed[0].items[0].text).toBe("Old");

    expect(deleteTodoItem(edited, "note-1", "item-2")[0].items).toEqual([
      { id: "item-1", text: "New item", completed: false },
    ]);
    expect(deleteTodoNote(edited, "note-2")).toHaveLength(1);
  });

  it("removes arrow/navigation control characters from edited todo text", () => {
    const notes = [
      note({
        id: "note-1",
        items: [{ id: "item-1", text: "Old", completed: false }],
      }),
    ];

    expect(updateTodoNoteTitle(notes, "note-1", "Title\u{F703}\u001D")[0].title).toBe(
      "Title",
    );
    expect(
      updateTodoItemText(notes, "note-1", "item-1", "test\u{F702}\u001C")[0].items[0]
        .text,
    ).toBe("test");
  });

  it("toggles note collapsed state", () => {
    expect(toggleTodoNoteCollapsed([note()], "note-1")).toEqual([
      note({ collapsed: true }),
    ]);
  });

  it("adds a todo item to the target note", () => {
    expect(addTodoItem([note()], "note-1", createTodoItem(() => "item-1"))).toEqual([
      note({
        items: [{ id: "item-1", text: "", completed: false }],
      }),
    ]);
  });

  it("inserts todo items after a target item", () => {
    const notes = [
      note({
        items: [
          { id: "item-1", text: "One", completed: false },
          { id: "item-2", text: "Two", completed: false },
        ],
      }),
    ];

    expect(
      insertTodoItemsAfter(notes, "note-1", "item-1", [
        { id: "item-3", text: "Three", completed: false },
        { id: "item-4", text: "Four", completed: false },
      ])[0].items,
    ).toEqual([
      { id: "item-1", text: "One", completed: false },
      { id: "item-3", text: "Three", completed: false },
      { id: "item-4", text: "Four", completed: false },
      { id: "item-2", text: "Two", completed: false },
    ]);
  });

  it("moves checked items to completed order and unchecked items back to active order", () => {
    const notes = [
      note({
        items: [
          { id: "active-1", text: "First", completed: false },
          { id: "active-2", text: "Second", completed: false },
          { id: "done-1", text: "Done", completed: true },
        ],
      }),
    ];

    const completed = toggleTodoItemCompleted(notes, "note-1", "active-1", true);
    expect(completed[0].items).toEqual([
      { id: "active-2", text: "Second", completed: false },
      { id: "done-1", text: "Done", completed: true },
      { id: "active-1", text: "First", completed: true },
    ]);

    const active = toggleTodoItemCompleted(completed, "note-1", "done-1", false);
    expect(active[0].items).toEqual([
      { id: "active-2", text: "Second", completed: false },
      { id: "done-1", text: "Done", completed: false },
      { id: "active-1", text: "First", completed: true },
    ]);
  });

  it("reorders notes and list items by dragged and target ids", () => {
    const notes = [
      note({ id: "note-1" }),
      note({
        id: "note-2",
        items: [
          { id: "item-1", text: "One", completed: false },
          { id: "item-2", text: "Two", completed: false },
          { id: "item-3", text: "Three", completed: false },
        ],
      }),
      note({ id: "note-3" }),
    ];

    expect(reorderTodoNotes(notes, "note-3", "note-1").map((item) => item.id)).toEqual([
      "note-3",
      "note-1",
      "note-2",
    ]);
    expect(reorderTodoNotes(notes, "note-1", "note-3").map((item) => item.id)).toEqual([
      "note-2",
      "note-3",
      "note-1",
    ]);

    expect(
      reorderTodoItems(notes, "note-2", "item-3", "item-1")[1].items.map((item) => item.id),
    ).toEqual(["item-3", "item-1", "item-2"]);
    expect(
      reorderTodoItems(notes, "note-2", "item-1", "item-3")[1].items.map((item) => item.id),
    ).toEqual(["item-2", "item-3", "item-1"]);
  });
});
