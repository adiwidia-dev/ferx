/**
 * Reactive state and operations for the todos panel.
 *
 * Call createTodoPanelStore() once at page level; inject a panel-width
 * callback there so native webview resizing stays in the page command queue.
 */

import {
  addTodoItem,
  createTodoItem,
  createTodoNote,
  deleteTodoItem,
  deleteTodoNote,
  insertTodoItemsAfter,
  reorderTodoItems,
  reorderTodoNotes,
  toggleTodoCompletedCollapsed,
  toggleTodoItemCompleted,
  toggleTodoNoteCollapsed,
  updateTodoItemText,
  updateTodoNoteTitle,
  type TodoNote,
} from "$lib/services/todos";
import type { DebouncedStorageWriter } from "$lib/services/workspace-page-lifecycle";

export const TODOS_PANEL_WIDTH = 360;

type SetPanelWidth = (width: number) => void | Promise<unknown>;

export function createTodoPanelStore(
  storage: DebouncedStorageWriter<TodoNote[]>,
  setPanelWidth: SetPanelWidth = () => undefined,
) {
  let notes = $state<TodoNote[]>([]);
  let isPanelOpen = $state(false);

  function createId() {
    return crypto.randomUUID().slice(0, 8);
  }

  return {
    get notes() {
      return notes;
    },
    set notes(v: TodoNote[]) {
      notes = v;
    },
    get isPanelOpen() {
      return isPanelOpen;
    },

    scheduleStorage() {
      storage.schedule(notes);
    },

    flush() {
      storage.flush(notes);
    },

    setOpen(open: boolean) {
      isPanelOpen = open;
      void setPanelWidth(open ? TODOS_PANEL_WIDTH : 0);
    },

    addNote() {
      notes = [createTodoNote(createId), ...notes];
    },

    deleteNote(noteId: string) {
      notes = deleteTodoNote(notes, noteId);
    },

    updateNoteTitle(noteId: string, title: string) {
      notes = updateTodoNoteTitle(notes, noteId, title);
    },

    /** Returns the new item's id. */
    addItem(noteId: string, afterItemId?: string, text = ""): string {
      const item = createTodoItem(createId, text);
      notes = afterItemId
        ? insertTodoItemsAfter(notes, noteId, afterItemId, [item])
        : addTodoItem(notes, noteId, item);
      return item.id;
    },

    /** Returns an array of new item ids, in order. */
    addItemsAfter(noteId: string, afterItemId: string, texts: string[]): string[] {
      const items = texts.map((text) => createTodoItem(createId, text));
      notes = insertTodoItemsAfter(notes, noteId, afterItemId, items);
      return items.map((item) => item.id);
    },

    deleteItem(noteId: string, itemId: string) {
      notes = deleteTodoItem(notes, noteId, itemId);
    },

    updateItemText(noteId: string, itemId: string, text: string) {
      notes = updateTodoItemText(notes, noteId, itemId, text);
    },

    toggleItemCompleted(noteId: string, itemId: string, completed: boolean) {
      notes = toggleTodoItemCompleted(notes, noteId, itemId, completed);
    },

    toggleCompletedCollapsed(noteId: string) {
      notes = toggleTodoCompletedCollapsed(notes, noteId);
    },

    toggleNoteCollapsed(noteId: string) {
      notes = toggleTodoNoteCollapsed(notes, noteId);
    },

    reorderNotes(draggedId: string, targetId: string) {
      notes = reorderTodoNotes(notes, draggedId, targetId);
    },

    reorderItems(noteId: string, draggedId: string, targetId: string) {
      notes = reorderTodoItems(notes, noteId, draggedId, targetId);
    },
  };
}
