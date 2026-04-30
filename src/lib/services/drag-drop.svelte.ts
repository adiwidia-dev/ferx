/**
 * Drag-and-drop state for the sidebar service list.
 *
 * Tracks pointer position and emits (from, to) IDs when a drop completes.
 * Has no workspace or webview dependencies — pure drag state only.
 */

type DropCallback = (fromId: string, toId: string) => void;

export function createDragDropState() {
  let draggedId = $state<string | null>(null);
  let dragOverId = $state<string | null>(null);
  let pointerDragId = $state<string | null>(null);
  let pointerStartX = 0;
  let pointerStartY = 0;
  let isPointerDragging = $state(false);
  let dragRafPending = false;

  function updatePointerTarget(clientX: number, clientY: number) {
    const element = document.elementFromPoint(clientX, clientY);
    const target = element?.closest<HTMLElement>("[data-service-drop-target]");
    const targetId = target?.dataset.serviceDropTarget ?? null;
    const next = targetId && targetId !== draggedId ? targetId : null;
    if (next !== dragOverId) {
      dragOverId = next;
    }
  }

  function reset() {
    pointerDragId = null;
    pointerStartX = 0;
    pointerStartY = 0;
    isPointerDragging = false;
    draggedId = null;
    dragOverId = null;
  }

  return {
    get draggedId() {
      return draggedId;
    },
    get dragOverId() {
      return dragOverId;
    },
    get isPointerDragging() {
      return isPointerDragging;
    },

    handlePointerDown(e: PointerEvent, id: string) {
      if (e.button !== 0) return;
      pointerDragId = id;
      pointerStartX = e.clientX;
      pointerStartY = e.clientY;
      isPointerDragging = false;
    },

    handlePointerMove(e: PointerEvent) {
      if (!pointerDragId) return;

      const movedEnough =
        Math.abs(e.clientX - pointerStartX) > 4 ||
        Math.abs(e.clientY - pointerStartY) > 4;

      if (!isPointerDragging && movedEnough) {
        draggedId = pointerDragId;
        isPointerDragging = true;
      }

      if (!isPointerDragging || dragRafPending) return;

      const cx = e.clientX;
      const cy = e.clientY;
      dragRafPending = true;
      requestAnimationFrame(() => {
        dragRafPending = false;
        updatePointerTarget(cx, cy);
      });
    },

    handlePointerUp(e: PointerEvent, onDrop: DropCallback) {
      if (isPointerDragging && draggedId && dragOverId) {
        onDrop(draggedId, dragOverId);
      }
      reset();
    },
  };
}
