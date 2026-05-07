<script lang="ts">
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import GripVerticalIcon from "@lucide/svelte/icons/grip-vertical";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import XIcon from "@lucide/svelte/icons/x";
  import { Button } from "$lib/components/ui/button";
  import {
    preventMacosNavigationPrivateUseInput,
    preventMacosNavigationPrivateUseKeypress,
    sanitizeTextInputValue,
  } from "$lib/services/keyboard-input-guard";
  import type { TodoNote } from "$lib/services/todos";

  interface Props {
    notes: TodoNote[];
    width: number;
    spellCheckEnabled: boolean;
    onClose: () => void;
    onAddNote: () => void;
    onDeleteNote: (noteId: string) => void;
    onUpdateNoteTitle: (noteId: string, title: string) => void;
    onAddItem: (noteId: string, afterItemId?: string, text?: string) => string;
    onAddItemsAfter: (noteId: string, afterItemId: string, texts: string[]) => string[];
    onDeleteItem: (noteId: string, itemId: string) => void;
    onUpdateItemText: (noteId: string, itemId: string, text: string) => void;
    onToggleItemCompleted: (noteId: string, itemId: string, completed: boolean) => void;
    onToggleCompletedCollapsed: (noteId: string) => void;
    onToggleNoteCollapsed: (noteId: string) => void;
    onReorderNotes: (draggedId: string, targetId: string) => void;
    onReorderItems: (noteId: string, draggedId: string, targetId: string) => void;
  }

  let {
    notes,
    width,
    spellCheckEnabled,
    onClose,
    onAddNote,
    onDeleteNote,
    onUpdateNoteTitle,
    onAddItem,
    onAddItemsAfter,
    onDeleteItem,
    onUpdateItemText,
    onToggleItemCompleted,
    onToggleCompletedCollapsed,
    onToggleNoteCollapsed,
    onReorderNotes,
    onReorderItems,
  }: Props = $props();

  let dragOverNoteId = $state<string | null>(null);
  let dragOverItem = $state<{ noteId: string; itemId: string } | null>(null);
  let pointerDrag =
    $state<
      | { kind: "note"; noteId: string }
      | { kind: "item"; noteId: string; itemId: string }
      | null
    >(null);
  let pointerStartX = 0;
  let pointerStartY = 0;
  let isPointerDragging = $state(false);
  let dragRafPending = false;
  let pendingFocusItemId = $state<string | null>(null);

  function activeItems(note: TodoNote) {
    return note.items.filter((item) => !item.completed);
  }

  function completedItems(note: TodoNote) {
    return note.items.filter((item) => item.completed);
  }

  function resetPointerDrag() {
    pointerDrag = null;
    pointerStartX = 0;
    pointerStartY = 0;
    isPointerDragging = false;
    dragRafPending = false;
    dragOverNoteId = null;
    dragOverItem = null;
  }

  function handleNotePointerDown(event: PointerEvent, noteId: string) {
    if (event.button !== 0) {
      return;
    }

    pointerDrag = { kind: "note", noteId };
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
  }

  function handleItemPointerDown(event: PointerEvent, noteId: string, itemId: string) {
    if (event.button !== 0) {
      return;
    }

    event.stopPropagation();
    pointerDrag = { kind: "item", noteId, itemId };
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
  }

  function closestTargetByY(
    targets: HTMLElement[],
    clientY: number,
    getId: (target: HTMLElement) => string | undefined,
  ) {
    if (targets.length === 0) {
      return null;
    }

    let candidate = targets[0];

    for (const target of targets) {
      const rect = target.getBoundingClientRect();
      if (clientY >= rect.top + rect.height / 2) {
        candidate = target;
      }
    }

    return getId(candidate) ?? null;
  }

  function updatePointerTarget(clientX: number, clientY: number) {
    if (!pointerDrag) {
      return;
    }

    const element = document.elementFromPoint(clientX, clientY);

    if (pointerDrag.kind === "note") {
      const target = element?.closest<HTMLElement>("[data-todo-note-drop-target]");
      const fallbackTargets = Array.from(
        document.querySelectorAll<HTMLElement>("[data-todo-note-drop-target]"),
      );
      const targetId =
        target?.dataset.todoNoteDropTarget ??
        closestTargetByY(fallbackTargets, clientY, (targetElement) =>
          targetElement.dataset.todoNoteDropTarget,
        );
      dragOverNoteId = targetId && targetId !== pointerDrag.noteId ? targetId : null;
      return;
    }

    const draggedNoteId = pointerDrag.noteId;
    const target = element?.closest<HTMLElement>("[data-todo-item-drop-target]");
    const fallbackTargets = Array.from(
      document.querySelectorAll<HTMLElement>("[data-todo-item-note-id]"),
    ).filter((targetElement) => targetElement.dataset.todoItemNoteId === draggedNoteId);
    const fallbackTargetId = closestTargetByY(fallbackTargets, clientY, (targetElement) =>
      targetElement.dataset.todoItemDropTarget,
    );
    const targetId = target?.dataset.todoItemDropTarget ?? fallbackTargetId;
    const targetNoteId = target?.dataset.todoItemNoteId ?? draggedNoteId;
    const isValidTarget =
      targetId &&
      targetNoteId === draggedNoteId &&
      targetId !== pointerDrag.itemId;

    dragOverItem = isValidTarget
      ? { noteId: draggedNoteId, itemId: targetId }
      : null;
  }

  function handlePointerMove(event: PointerEvent) {
    if (!pointerDrag) {
      return;
    }

    const movedEnough =
      Math.abs(event.clientX - pointerStartX) > 4 ||
      Math.abs(event.clientY - pointerStartY) > 4;

    if (!isPointerDragging && movedEnough) {
      isPointerDragging = true;
    }

    if (!isPointerDragging || dragRafPending) {
      return;
    }

    const clientX = event.clientX;
    const clientY = event.clientY;
    dragRafPending = true;
    requestAnimationFrame(() => {
      dragRafPending = false;
      updatePointerTarget(clientX, clientY);
    });
  }

  function handlePointerUp(event: PointerEvent) {
    if (!pointerDrag || !isPointerDragging) {
      resetPointerDrag();
      return;
    }

    updatePointerTarget(event.clientX, event.clientY);

    if (pointerDrag.kind === "note" && dragOverNoteId) {
      onReorderNotes(pointerDrag.noteId, dragOverNoteId);
    }

    if (
      pointerDrag.kind === "item" &&
      dragOverItem &&
      dragOverItem.noteId === pointerDrag.noteId
    ) {
      onReorderItems(pointerDrag.noteId, pointerDrag.itemId, dragOverItem.itemId);
    }

    resetPointerDrag();
  }

  function focusWhenPending(
    input: HTMLTextAreaElement,
    params: { itemId: string; pendingFocusItemId: string | null },
  ) {
    function focusIfPending(next: typeof params) {
      if (next.pendingFocusItemId !== next.itemId) {
        return;
      }
      pendingFocusItemId = null;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }

    focusIfPending(params);

    return {
      update: focusIfPending,
    };
  }

  function autoResizeTextarea(textarea: HTMLTextAreaElement, value: string) {
    function resize() {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }

    queueMicrotask(resize);

    return {
      update(nextValue: string) {
        if (nextValue !== value) {
          value = nextValue;
        }
        queueMicrotask(resize);
      },
    };
  }

  function multilinePasteItems(event: ClipboardEvent): string[] {
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (!text.includes("\n") && !text.includes("\r")) {
      return [];
    }

    return text
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  function handleItemEnter(noteId: string, itemId: string, event: KeyboardEvent) {
    event.preventDefault();
    const nextItemId = onAddItem(noteId, itemId);
    pendingFocusItemId = nextItemId;
  }

  function handleItemPaste(noteId: string, itemId: string, event: ClipboardEvent) {
    const items = multilinePasteItems(event);
    if (items.length === 0) {
      return;
    }

    event.preventDefault();
    onUpdateItemText(noteId, itemId, items[0]);
    const insertedIds = onAddItemsAfter(noteId, itemId, items.slice(1));
    pendingFocusItemId = insertedIds.at(-1) ?? itemId;
  }

  function handleTodoInput(event: Event, onValue: (value: string) => void) {
    onValue(
      sanitizeTextInputValue(
        event.currentTarget as HTMLInputElement | HTMLTextAreaElement,
      ),
    );
  }
</script>

<svelte:window
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointercancel={resetPointerDrag}
/>

<aside
  class="h-screen shrink-0 border-l bg-background shadow-xl"
  style={`width: ${width}px;`}
  data-testid="todos-panel"
>
  <div class="flex h-full min-h-0 flex-col">
    <header class="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <h2 class="min-w-0 flex-1 text-base font-semibold text-foreground">Todos</h2>
      <Button
        title="Add todo note"
        aria-label="Add todo note"
        variant="ghost"
        size="icon-sm"
        class="text-muted-foreground"
        onclick={onAddNote}
      >
        <PlusIcon />
      </Button>
      <Button
        aria-label="Close todos panel"
        variant="ghost"
        size="icon-sm"
        class="text-muted-foreground"
        onclick={onClose}
      >
        <XIcon />
      </Button>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto px-3 py-4">
      {#each notes as note (note.id)}
        {@const active = activeItems(note)}
        {@const completed = completedItems(note)}
        <section
          data-testid="todo-note-card"
          data-todo-note-drop-target={note.id}
          role="listitem"
          class="mb-3 rounded-lg border bg-card text-card-foreground shadow-sm transition
            {dragOverNoteId === note.id ? 'ring-2 ring-ring/30' : ''}"
          draggable="false"
        >
          <div class="flex items-center gap-1 px-2 pt-2">
            <button
              type="button"
              aria-label="Drag todo note"
              class="flex size-5 shrink-0 cursor-grab items-center justify-center rounded-sm text-muted-foreground active:cursor-grabbing"
              onpointerdown={(event) => handleNotePointerDown(event, note.id)}
            >
              <GripVerticalIcon class="size-4" />
            </button>
            <Button
              aria-label={note.collapsed ? "Expand todo note" : "Collapse todo note"}
              variant="ghost"
              size="icon-xs"
              class="text-muted-foreground"
              onclick={() => onToggleNoteCollapsed(note.id)}
            >
              {#if note.collapsed}
                <ChevronRightIcon />
              {:else}
                <ChevronDownIcon />
              {/if}
            </Button>
            <input
              class="min-w-0 flex-1 border-0 bg-transparent px-1 py-2 text-sm font-semibold outline-none placeholder:text-muted-foreground"
              aria-label="Todo note title"
              spellcheck={spellCheckEnabled}
              value={note.title}
              onbeforeinput={(event) => preventMacosNavigationPrivateUseInput(event)}
              oninput={(event) =>
                handleTodoInput(event, (value) => onUpdateNoteTitle(note.id, value))}
              onkeypress={(event) => preventMacosNavigationPrivateUseKeypress(event)}
              onkeydown={(event) => {
                if (event.key === "Enter") {
                  (event.currentTarget as HTMLInputElement).blur();
                }
              }}
            />
            <Button
              aria-label="Delete todo note"
              variant="ghost"
              size="icon-xs"
              class="text-muted-foreground hover:text-destructive"
              onclick={() => onDeleteNote(note.id)}
            >
              <Trash2Icon />
            </Button>
          </div>

          {#if !note.collapsed}
          <div class="px-3 pb-2">
            {#each active as item (item.id)}
              <div
                data-testid="todo-item-row"
                data-todo-item-drop-target={item.id}
                data-todo-item-note-id={note.id}
                role="listitem"
                class="group flex min-h-9 items-center gap-2 rounded-md px-1 transition
                  {dragOverItem?.itemId === item.id ? 'bg-muted' : ''}"
                draggable="false"
              >
                <button
                  type="button"
                  aria-label="Drag todo item"
                  class="flex size-5 shrink-0 cursor-grab items-center justify-center rounded-sm text-muted-foreground/70 active:cursor-grabbing"
                  onpointerdown={(event) => handleItemPointerDown(event, note.id, item.id)}
                >
                  <GripVerticalIcon class="size-3.5" />
                </button>
                <input
                  type="checkbox"
                  class="size-4 shrink-0 accent-foreground"
                  checked={item.completed}
                  aria-label="Mark item completed"
                  onchange={(event) =>
                    onToggleItemCompleted(
                      note.id,
                      item.id,
                      (event.currentTarget as HTMLInputElement).checked,
                    )}
                />
                <textarea
                  class="min-h-7 w-full min-w-0 flex-1 resize-none overflow-hidden break-words whitespace-pre-wrap border-0 bg-transparent py-1 text-sm leading-5 outline-none placeholder:text-muted-foreground"
                  aria-label="Todo item text"
                  data-todo-item-input={item.id}
                  rows="1"
                  spellcheck={spellCheckEnabled}
                  use:focusWhenPending={{ itemId: item.id, pendingFocusItemId }}
                  use:autoResizeTextarea={item.text}
                  value={item.text}
                  placeholder="List item"
                  onbeforeinput={(event) => preventMacosNavigationPrivateUseInput(event)}
                  oninput={(event) =>
                    handleTodoInput(event, (value) => onUpdateItemText(note.id, item.id, value))}
                  onkeypress={(event) => preventMacosNavigationPrivateUseKeypress(event)}
                  onkeydown={(event) => {
                    if (event.key === "Enter") {
                      handleItemEnter(note.id, item.id, event);
                    }
                  }}
                  onpaste={(event) => handleItemPaste(note.id, item.id, event)}
                ></textarea>
                <Button
                  aria-label="Delete todo item"
                  variant="ghost"
                  size="icon-xs"
                  class="opacity-0 text-muted-foreground hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                  onclick={() => onDeleteItem(note.id, item.id)}
                >
                  <XIcon />
                </Button>
              </div>
            {/each}

            <button
              type="button"
              class="flex h-9 w-full items-center gap-3 rounded-md px-1 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
              onclick={() => {
                const itemId = onAddItem(note.id);
                pendingFocusItemId = itemId;
              }}
            >
              <PlusIcon class="ml-[22px] size-4" />
              <span>List item</span>
            </button>

            {#if completed.length > 0}
              <div class="mt-2 border-t pt-2">
                <button
                  type="button"
                  class="flex h-8 w-full items-center gap-2 rounded-md px-1 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  onclick={() => onToggleCompletedCollapsed(note.id)}
                >
                  {#if note.completedCollapsed}
                    <ChevronRightIcon class="size-4" />
                  {:else}
                    <ChevronDownIcon class="size-4" />
                  {/if}
                  <span>{completed.length} Completed {completed.length === 1 ? "item" : "items"}</span>
                </button>

                {#if !note.completedCollapsed}
                  {#each completed as item (item.id)}
                    <div
                      data-testid="todo-item-row"
                      data-todo-item-drop-target={item.id}
                      data-todo-item-note-id={note.id}
                      role="listitem"
                      class="group flex min-h-9 items-center gap-2 rounded-md px-1 text-muted-foreground transition
                        {dragOverItem?.itemId === item.id ? 'bg-muted' : ''}"
                      draggable="false"
                    >
                      <button
                        type="button"
                        aria-label="Drag todo item"
                        class="flex size-5 shrink-0 cursor-grab items-center justify-center rounded-sm text-muted-foreground/70 active:cursor-grabbing"
                        onpointerdown={(event) => handleItemPointerDown(event, note.id, item.id)}
                      >
                        <GripVerticalIcon class="size-3.5" />
                      </button>
                      <input
                        type="checkbox"
                        class="size-4 shrink-0 accent-foreground"
                        checked={item.completed}
                        aria-label="Mark item active"
                        onchange={(event) =>
                          onToggleItemCompleted(
                            note.id,
                            item.id,
                            (event.currentTarget as HTMLInputElement).checked,
                          )}
                      />
                      <textarea
                        class="min-h-7 w-full min-w-0 flex-1 resize-none overflow-hidden break-words whitespace-pre-wrap border-0 bg-transparent py-1 text-sm leading-5 line-through outline-none placeholder:text-muted-foreground"
                        aria-label="Completed todo item text"
                        data-todo-item-input={item.id}
                        rows="1"
                        spellcheck={spellCheckEnabled}
                        use:focusWhenPending={{ itemId: item.id, pendingFocusItemId }}
                        use:autoResizeTextarea={item.text}
                        value={item.text}
                        onbeforeinput={(event) => preventMacosNavigationPrivateUseInput(event)}
                        oninput={(event) =>
                          handleTodoInput(event, (value) => onUpdateItemText(note.id, item.id, value))}
                        onkeypress={(event) => preventMacosNavigationPrivateUseKeypress(event)}
                        onkeydown={(event) => {
                          if (event.key === "Enter") {
                            handleItemEnter(note.id, item.id, event);
                          }
                        }}
                        onpaste={(event) => handleItemPaste(note.id, item.id, event)}
                      ></textarea>
                      <Button
                        aria-label="Delete completed todo item"
                        variant="ghost"
                        size="icon-xs"
                        class="opacity-0 text-muted-foreground hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                        onclick={() => onDeleteItem(note.id, item.id)}
                      >
                        <XIcon />
                      </Button>
                    </div>
                  {/each}
                {/if}
              </div>
            {/if}
          </div>
          {/if}
        </section>
      {:else}
        <div class="flex h-full min-h-72 flex-col items-center justify-center text-center">
          <p class="text-sm font-medium text-foreground">No todo notes</p>
          <Button class="mt-3" variant="outline" size="sm" onclick={onAddNote}>
            <PlusIcon />
            New note
          </Button>
        </div>
      {/each}
    </div>
  </div>
</aside>
