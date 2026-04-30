import { describe, expect, it, vi } from "vitest";

import { createTodoPanelStore, TODOS_PANEL_WIDTH } from "./todo-panel.svelte";

function makeStorage() {
  return {
    schedule: vi.fn(),
    flush: vi.fn(),
    clear: vi.fn(),
  };
}

describe("createTodoPanelStore — panel state", () => {
  it("starts closed with no notes", () => {
    const todos = createTodoPanelStore(makeStorage());
    expect(todos.isPanelOpen).toBe(false);
    expect(todos.notes).toEqual([]);
  });

  it("setOpen(true) opens panel and calls setRightPanelWidth with panel width", () => {
    const setPanelWidth = vi.fn();
    const todos = createTodoPanelStore(makeStorage(), setPanelWidth);
    todos.setOpen(true);
    expect(todos.isPanelOpen).toBe(true);
    expect(setPanelWidth).toHaveBeenCalledWith(TODOS_PANEL_WIDTH);
  });

  it("setOpen(false) closes panel and calls setRightPanelWidth(0)", () => {
    const setPanelWidth = vi.fn();
    const todos = createTodoPanelStore(makeStorage(), setPanelWidth);
    todos.setOpen(true);
    setPanelWidth.mockClear();
    todos.setOpen(false);
    expect(todos.isPanelOpen).toBe(false);
    expect(setPanelWidth).toHaveBeenCalledWith(0);
  });
});

describe("createTodoPanelStore — storage", () => {
  it("scheduleStorage delegates to storage.schedule with current notes", () => {
    const storage = makeStorage();
    const todos = createTodoPanelStore(storage);
    todos.addNote();
    todos.scheduleStorage();
    expect(storage.schedule).toHaveBeenCalledWith(todos.notes);
  });

  it("flush delegates to storage.flush with current notes", () => {
    const storage = makeStorage();
    const todos = createTodoPanelStore(storage);
    todos.addNote();
    todos.flush();
    expect(storage.flush).toHaveBeenCalledWith(todos.notes);
  });
});

describe("createTodoPanelStore — note operations", () => {
  it("addNote prepends a new note", () => {
    const todos = createTodoPanelStore(makeStorage());
    todos.addNote();
    expect(todos.notes).toHaveLength(1);
    todos.addNote();
    expect(todos.notes).toHaveLength(2);
    // newest note is first
    expect(todos.notes[0].id).not.toBe(todos.notes[1].id);
  });

  it("deleteNote removes the note by id", () => {
    const todos = createTodoPanelStore(makeStorage());
    todos.addNote();
    todos.addNote();
    const [first] = todos.notes;
    todos.deleteNote(first.id);
    expect(todos.notes).toHaveLength(1);
    expect(todos.notes[0].id).not.toBe(first.id);
  });

  it("updateNoteTitle changes the title of the specified note", () => {
    const todos = createTodoPanelStore(makeStorage());
    todos.addNote();
    const [note] = todos.notes;
    todos.updateNoteTitle(note.id, "New title");
    expect(todos.notes[0].title).toBe("New title");
  });

  it("notes setter allows bulk assignment (used on page startup)", () => {
    const todos = createTodoPanelStore(makeStorage());
    const seedNotes = [{ id: "n1", title: "Note 1", collapsed: false, completedCollapsed: false, items: [] }];
    todos.notes = seedNotes;
    expect(todos.notes).toEqual(seedNotes);
  });
});

describe("createTodoPanelStore — item operations", () => {
  it("addItem returns a new item id and appends to the note", () => {
    const todos = createTodoPanelStore(makeStorage());
    todos.addNote();
    const [note] = todos.notes;
    const id = todos.addItem(note.id);
    expect(typeof id).toBe("string");
    expect(todos.notes[0].items).toHaveLength(1);
    expect(todos.notes[0].items[0].id).toBe(id);
  });

  it("addItem with afterItemId inserts after the target", () => {
    const todos = createTodoPanelStore(makeStorage());
    todos.addNote();
    const [note] = todos.notes;
    const firstId = todos.addItem(note.id, undefined, "first");
    const secondId = todos.addItem(note.id, undefined, "second");
    const insertedId = todos.addItem(note.id, firstId, "inserted");
    const ids = todos.notes[0].items.map((i) => i.id);
    expect(ids).toEqual([firstId, insertedId, secondId]);
  });

  it("addItemsAfter inserts multiple items and returns all ids", () => {
    const todos = createTodoPanelStore(makeStorage());
    todos.addNote();
    const [note] = todos.notes;
    const anchorId = todos.addItem(note.id, undefined, "anchor");
    const newIds = todos.addItemsAfter(note.id, anchorId, ["a", "b", "c"]);
    expect(newIds).toHaveLength(3);
    const texts = todos.notes[0].items.map((i) => i.text);
    expect(texts).toEqual(["anchor", "a", "b", "c"]);
  });

  it("deleteItem removes the item from its note", () => {
    const todos = createTodoPanelStore(makeStorage());
    todos.addNote();
    const [note] = todos.notes;
    const itemId = todos.addItem(note.id, undefined, "todo");
    todos.deleteItem(note.id, itemId);
    expect(todos.notes[0].items).toHaveLength(0);
  });

  it("updateItemText changes the text of the specified item", () => {
    const todos = createTodoPanelStore(makeStorage());
    todos.addNote();
    const [note] = todos.notes;
    const itemId = todos.addItem(note.id, undefined, "old text");
    todos.updateItemText(note.id, itemId, "new text");
    expect(todos.notes[0].items[0].text).toBe("new text");
  });

  it("toggleItemCompleted marks and unmarks a todo item", () => {
    const todos = createTodoPanelStore(makeStorage());
    todos.addNote();
    const [note] = todos.notes;
    const itemId = todos.addItem(note.id);
    todos.toggleItemCompleted(note.id, itemId, true);
    expect(todos.notes[0].items[0].completed).toBe(true);
    todos.toggleItemCompleted(note.id, itemId, false);
    expect(todos.notes[0].items[0].completed).toBe(false);
  });
});

describe("createTodoPanelStore — reordering", () => {
  it("reorderNotes moves a note to a new position", () => {
    const todos = createTodoPanelStore(makeStorage());
    todos.addNote();
    todos.addNote();
    todos.addNote();
    const [third, second, first] = todos.notes; // newest first
    todos.reorderNotes(first.id, third.id);
    expect(todos.notes[0].id).toBe(first.id);
  });

  it("reorderItems moves an item within a note", () => {
    const todos = createTodoPanelStore(makeStorage());
    todos.addNote();
    const [note] = todos.notes;
    const id1 = todos.addItem(note.id, undefined, "A");
    const id2 = todos.addItem(note.id, undefined, "B");
    const id3 = todos.addItem(note.id, undefined, "C");
    todos.reorderItems(note.id, id1, id3);
    const texts = todos.notes[0].items.map((i) => i.text);
    expect(texts).toEqual(["B", "C", "A"]);
  });
});
