// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDragDropState } from "./drag-drop.svelte";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pointerDown(x = 0, y = 0, button = 0): PointerEvent {
  return { button, clientX: x, clientY: y } as PointerEvent;
}

function pointerMove(x: number, y: number): PointerEvent {
  return { clientX: x, clientY: y } as PointerEvent;
}

function pointerUp(x = 0, y = 0): PointerEvent {
  return { clientX: x, clientY: y } as PointerEvent;
}

/** Flushes any pending requestAnimationFrame callbacks. */
async function flushRaf() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

/** Builds a fake drop-target element and makes document.elementFromPoint return it. */
function makeFakeDropTarget(id: string): () => void {
  const el = document.createElement("div");
  el.dataset.serviceDropTarget = id;
  document.body.appendChild(el);
  const spy = vi.spyOn(document, "elementFromPoint").mockReturnValue(el);
  return () => {
    spy.mockRestore();
    el.remove();
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createDragDropState — initial state", () => {
  it("starts with all drag values null / false", () => {
    const dnd = createDragDropState();
    expect(dnd.draggedId).toBeNull();
    expect(dnd.dragOverId).toBeNull();
    expect(dnd.isPointerDragging).toBe(false);
  });
});

describe("createDragDropState — handlePointerDown", () => {
  it("ignores non-primary button clicks", () => {
    const dnd = createDragDropState();
    dnd.handlePointerDown(pointerDown(0, 0, 2), "svc-1"); // right-click
    dnd.handlePointerMove(pointerMove(100, 0));
    expect(dnd.draggedId).toBeNull();
  });

  it("records the down position for threshold calculation", async () => {
    const dnd = createDragDropState();
    dnd.handlePointerDown(pointerDown(50, 50), "svc-1");
    // Sub-threshold move — should NOT start dragging
    dnd.handlePointerMove(pointerMove(52, 50));
    await flushRaf();
    expect(dnd.isPointerDragging).toBe(false);
    expect(dnd.draggedId).toBeNull();
  });
});

describe("createDragDropState — handlePointerMove", () => {
  it("does nothing when no pointer is down", async () => {
    const dnd = createDragDropState();
    dnd.handlePointerMove(pointerMove(100, 0));
    await flushRaf();
    expect(dnd.draggedId).toBeNull();
    expect(dnd.isPointerDragging).toBe(false);
  });

  it("does not start dragging when movement is within 4-px threshold", async () => {
    const dnd = createDragDropState();
    dnd.handlePointerDown(pointerDown(0, 0), "svc-1");
    dnd.handlePointerMove(pointerMove(4, 0)); // exactly at threshold
    await flushRaf();
    expect(dnd.isPointerDragging).toBe(false);
  });

  it("starts dragging once pointer moves more than 4 px", async () => {
    const dnd = createDragDropState();
    dnd.handlePointerDown(pointerDown(0, 0), "svc-1");
    dnd.handlePointerMove(pointerMove(5, 0)); // exceeds threshold
    await flushRaf();
    expect(dnd.isPointerDragging).toBe(true);
    expect(dnd.draggedId).toBe("svc-1");
  });

  it("also starts dragging on sufficient vertical movement", async () => {
    const dnd = createDragDropState();
    dnd.handlePointerDown(pointerDown(0, 0), "svc-2");
    dnd.handlePointerMove(pointerMove(0, 5));
    await flushRaf();
    expect(dnd.draggedId).toBe("svc-2");
  });

  it("updates dragOverId via RAF once drag is active", async () => {
    const restore = makeFakeDropTarget("svc-2");
    const dnd = createDragDropState();
    dnd.handlePointerDown(pointerDown(0, 0), "svc-1");
    dnd.handlePointerMove(pointerMove(5, 0));  // start drag
    dnd.handlePointerMove(pointerMove(10, 0)); // another move
    await flushRaf();
    expect(dnd.dragOverId).toBe("svc-2");
    restore();
  });

  it("does not set dragOverId to the same id as draggedId", async () => {
    // elementFromPoint returns the dragged item itself — should be ignored
    const restore = makeFakeDropTarget("svc-1");
    const dnd = createDragDropState();
    dnd.handlePointerDown(pointerDown(0, 0), "svc-1");
    dnd.handlePointerMove(pointerMove(5, 0));
    await flushRaf();
    expect(dnd.dragOverId).toBeNull();
    restore();
  });
});

describe("createDragDropState — handlePointerUp", () => {
  it("does NOT call onDrop when not dragging", () => {
    const dnd = createDragDropState();
    const onDrop = vi.fn();
    dnd.handlePointerUp(pointerUp(), onDrop);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("calls onDrop with (fromId, toId) when drag is active with a target", async () => {
    const restore = makeFakeDropTarget("svc-2");
    const dnd = createDragDropState();
    const onDrop = vi.fn();

    dnd.handlePointerDown(pointerDown(0, 0), "svc-1");
    dnd.handlePointerMove(pointerMove(5, 0));
    await flushRaf();

    dnd.handlePointerUp(pointerUp(), onDrop);
    expect(onDrop).toHaveBeenCalledWith("svc-1", "svc-2");
    restore();
  });

  it("does NOT call onDrop when dragging but dragOverId is null", async () => {
    // No drop target in DOM
    vi.spyOn(document, "elementFromPoint").mockReturnValue(null);
    const dnd = createDragDropState();
    const onDrop = vi.fn();

    dnd.handlePointerDown(pointerDown(0, 0), "svc-1");
    dnd.handlePointerMove(pointerMove(5, 0));
    await flushRaf();

    dnd.handlePointerUp(pointerUp(), onDrop);
    expect(onDrop).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("resets all drag state after pointer up", async () => {
    const restore = makeFakeDropTarget("svc-2");
    const dnd = createDragDropState();

    dnd.handlePointerDown(pointerDown(0, 0), "svc-1");
    dnd.handlePointerMove(pointerMove(5, 0));
    await flushRaf();
    dnd.handlePointerUp(pointerUp(), () => {});

    expect(dnd.draggedId).toBeNull();
    expect(dnd.dragOverId).toBeNull();
    expect(dnd.isPointerDragging).toBe(false);
    restore();
  });

  it("resets all state even when no drag was in progress (pointercancel path)", () => {
    const dnd = createDragDropState();
    dnd.handlePointerDown(pointerDown(0, 0), "svc-1");
    dnd.handlePointerUp(pointerUp(), () => {}); // cancel before threshold
    expect(dnd.draggedId).toBeNull();
    expect(dnd.isPointerDragging).toBe(false);
  });
});
