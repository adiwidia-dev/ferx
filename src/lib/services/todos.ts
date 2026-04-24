export const TODO_NOTES_STORAGE_KEY = "ferx-todo-notes";

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface TodoNote {
  id: string;
  title: string;
  collapsed: boolean;
  items: TodoItem[];
  completedCollapsed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseTodoItem(value: unknown): TodoItem | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.text !== "string" ||
    typeof value.completed !== "boolean"
  ) {
    return null;
  }

  return {
    id: value.id,
    text: value.text,
    completed: value.completed,
  };
}

function parseTodoNote(value: unknown): TodoNote | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    (value.collapsed !== undefined && typeof value.collapsed !== "boolean") ||
    typeof value.completedCollapsed !== "boolean" ||
    !Array.isArray(value.items)
  ) {
    return null;
  }

  return {
    id: value.id,
    title: value.title,
    collapsed: value.collapsed ?? false,
    completedCollapsed: value.completedCollapsed,
    items: value.items.flatMap((item) => {
      const parsed = parseTodoItem(item);
      return parsed ? [parsed] : [];
    }),
  };
}

function moveById<T extends { id: string }>(
  items: T[],
  draggedId: string,
  targetId: string,
): T[] {
  if (draggedId === targetId) {
    return items;
  }

  const fromIndex = items.findIndex((item) => item.id === draggedId);
  const toIndex = items.findIndex((item) => item.id === targetId);

  if (fromIndex === -1 || toIndex === -1) {
    return items;
  }

  const next = [...items];
  const [dragged] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, dragged);
  return next;
}

export function readTodoNotes(saved: string | null): TodoNote[] {
  if (!saved) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(saved);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((note) => {
      const parsedNote = parseTodoNote(note);
      return parsedNote ? [parsedNote] : [];
    });
  } catch {
    return [];
  }
}

export function serializeTodoNotes(notes: TodoNote[]): string {
  return JSON.stringify(
    notes.map((note) => ({
      id: note.id,
      title: note.title,
      collapsed: note.collapsed,
      items: note.items.map((item) => ({
        id: item.id,
        text: item.text,
        completed: item.completed,
      })),
      completedCollapsed: note.completedCollapsed,
    })),
  );
}

export function createTodoNote(createId: () => string, title = "Title"): TodoNote {
  return {
    id: createId(),
    title,
    collapsed: false,
    items: [],
    completedCollapsed: false,
  };
}

export function createTodoItem(createId: () => string, text = ""): TodoItem {
  return {
    id: createId(),
    text,
    completed: false,
  };
}

export function updateTodoNoteTitle(
  notes: TodoNote[],
  noteId: string,
  title: string,
): TodoNote[] {
  return notes.map((note) => (note.id === noteId ? { ...note, title } : note));
}

export function deleteTodoNote(notes: TodoNote[], noteId: string): TodoNote[] {
  return notes.filter((note) => note.id !== noteId);
}

export function toggleTodoNoteCollapsed(
  notes: TodoNote[],
  noteId: string,
): TodoNote[] {
  return notes.map((note) =>
    note.id === noteId ? { ...note, collapsed: !note.collapsed } : note,
  );
}

export function addTodoItem(
  notes: TodoNote[],
  noteId: string,
  item: TodoItem,
): TodoNote[] {
  return notes.map((note) =>
    note.id === noteId ? { ...note, items: [...note.items, item] } : note,
  );
}

export function insertTodoItemsAfter(
  notes: TodoNote[],
  noteId: string,
  afterItemId: string,
  items: TodoItem[],
): TodoNote[] {
  if (items.length === 0) {
    return notes;
  }

  return notes.map((note) => {
    if (note.id !== noteId) {
      return note;
    }

    const insertIndex = note.items.findIndex((item) => item.id === afterItemId);
    if (insertIndex === -1) {
      return {
        ...note,
        items: [...note.items, ...items],
      };
    }

    const nextItems = [...note.items];
    nextItems.splice(insertIndex + 1, 0, ...items);
    return {
      ...note,
      items: nextItems,
    };
  });
}

export function updateTodoItemText(
  notes: TodoNote[],
  noteId: string,
  itemId: string,
  text: string,
): TodoNote[] {
  return notes.map((note) =>
    note.id === noteId
      ? {
          ...note,
          items: note.items.map((item) =>
            item.id === itemId ? { ...item, text } : item,
          ),
        }
      : note,
  );
}

export function deleteTodoItem(
  notes: TodoNote[],
  noteId: string,
  itemId: string,
): TodoNote[] {
  return notes.map((note) =>
    note.id === noteId
      ? { ...note, items: note.items.filter((item) => item.id !== itemId) }
      : note,
  );
}

export function toggleTodoItemCompleted(
  notes: TodoNote[],
  noteId: string,
  itemId: string,
  completed: boolean,
): TodoNote[] {
  return notes.map((note) => {
    if (note.id !== noteId) {
      return note;
    }

    const target = note.items.find((item) => item.id === itemId);
    if (!target || target.completed === completed) {
      return note;
    }

    const updated = { ...target, completed };
    const remaining = note.items.filter((item) => item.id !== itemId);

    if (completed) {
      return {
        ...note,
        items: [...remaining, updated],
      };
    }

    const firstCompletedIndex = remaining.findIndex((item) => item.completed);
    const insertIndex =
      firstCompletedIndex === -1 ? remaining.length : firstCompletedIndex;
    const nextItems = [...remaining];
    nextItems.splice(insertIndex, 0, updated);

    return {
      ...note,
      items: nextItems,
    };
  });
}

export function reorderTodoNotes(
  notes: TodoNote[],
  draggedId: string,
  targetId: string,
): TodoNote[] {
  return moveById(notes, draggedId, targetId);
}

export function reorderTodoItems(
  notes: TodoNote[],
  noteId: string,
  draggedId: string,
  targetId: string,
): TodoNote[] {
  return notes.map((note) =>
    note.id === noteId
      ? { ...note, items: moveById(note.items, draggedId, targetId) }
      : note,
  );
}

export function toggleTodoCompletedCollapsed(
  notes: TodoNote[],
  noteId: string,
): TodoNote[] {
  return notes.map((note) =>
    note.id === noteId
      ? { ...note, completedCollapsed: !note.completedCollapsed }
      : note,
  );
}
