import { describe, expect, it, vi, type MockInstance } from "vitest";

import { createServiceEditorStore, type SaveServiceContext } from "./service-editor.svelte";
import type { PageService } from "./workspace-state";

function makePageService(overrides = {}) {
  return {
    id: "svc-1",
    name: "Slack",
    url: "https://app.slack.com",
    storageKey: "storage-svc-1",
    notificationPrefs: { allowNotifications: true, showBadge: true, affectTray: true },
    ...overrides,
  };
}

describe("createServiceEditorStore", () => {
  it("starts closed with no editing service", () => {
    const editor = createServiceEditorStore();
    expect(editor.isOpen).toBe(false);
    expect(editor.editingService).toBeNull();
  });

  it("open(null) opens the dialog in add-new mode", () => {
    const editor = createServiceEditorStore();
    editor.open(null);
    expect(editor.isOpen).toBe(true);
    expect(editor.editingService).toBeNull();
  });

  it("open(service) opens the dialog with the given service pre-loaded", () => {
    const editor = createServiceEditorStore();
    const svc = { id: "svc-1", name: "Slack", url: "https://app.slack.com" };
    editor.open(svc);
    expect(editor.isOpen).toBe(true);
    expect(editor.editingService).toEqual(svc);
  });

  it("openForEdit extracts id, name, url, iconBgColor from a PageService", () => {
    const editor = createServiceEditorStore();
    const svc = makePageService({ iconBgColor: "#aabbcc" });
    editor.openForEdit(svc);
    expect(editor.isOpen).toBe(true);
    expect(editor.editingService).toEqual({
      id: "svc-1",
      name: "Slack",
      url: "https://app.slack.com",
      iconBgColor: "#aabbcc",
    });
  });

  it("openForEdit handles a service with no iconBgColor", () => {
    const editor = createServiceEditorStore();
    editor.openForEdit(makePageService());
    expect(editor.editingService?.iconBgColor).toBeUndefined();
  });

  it("close() sets isOpen to false and clears editingService", () => {
    const editor = createServiceEditorStore();
    editor.open({ id: "x", name: "X", url: "https://x.com" });
    editor.close();
    expect(editor.isOpen).toBe(false);
    expect(editor.editingService).toBeNull();
  });

  it("isOpen setter allows external control (e.g. bind:open from dialog)", () => {
    const editor = createServiceEditorStore();
    editor.open(null);
    editor.isOpen = false; // simulate dialog close via bind:open
    expect(editor.isOpen).toBe(false);
    // editingService is NOT cleared by the setter alone — that requires close()
    expect(editor.editingService).toBeNull(); // was null to begin with
  });

  it("editingService is preserved after open when dialog re-opens with same data", () => {
    const editor = createServiceEditorStore();
    const svc = { id: "abc", name: "Notion", url: "https://notion.so" };
    editor.open(svc);
    editor.isOpen = false;
    // Without calling close(), editingService is still set so next open can pre-fill
    editor.isOpen = true;
    expect(editor.editingService).toEqual(svc);
  });
});

type CtxMocks = {
  showToast: MockInstance;
  onWorkspaceUpdate: MockInstance;
  deleteWebview: MockInstance;
  loadService: MockInstance;
};

function makeCtx(overrides: Partial<SaveServiceContext> = {}): SaveServiceContext & CtxMocks {
  return {
    services: [] as PageService[],
    activeId: "",
    showToast: vi.fn(),
    onWorkspaceUpdate: vi.fn(),
    deleteWebview: vi.fn(() => Promise.resolve()),
    loadService: vi.fn(() => Promise.resolve()),
    ...overrides,
  } as unknown as SaveServiceContext & CtxMocks;
}

describe("createServiceEditorStore — save()", () => {
  it("keeps dialog open and fires no callbacks when name is empty", () => {
    const editor = createServiceEditorStore();
    const ctx = makeCtx();
    editor.open(null);
    editor.save({ name: "", url: "https://example.com", iconBgColor: undefined }, ctx);
    expect(editor.isOpen).toBe(true);
    expect(ctx.showToast).not.toHaveBeenCalled();
    expect(ctx.onWorkspaceUpdate).not.toHaveBeenCalled();
  });

  it("keeps dialog open and fires no callbacks when url is empty", () => {
    const editor = createServiceEditorStore();
    const ctx = makeCtx();
    editor.open(null);
    editor.save({ name: "Slack", url: "", iconBgColor: undefined }, ctx);
    expect(editor.isOpen).toBe(true);
    expect(ctx.showToast).not.toHaveBeenCalled();
    expect(ctx.onWorkspaceUpdate).not.toHaveBeenCalled();
  });

  it("keeps dialog open and calls showToast when url has unsupported scheme", () => {
    const editor = createServiceEditorStore();
    const ctx = makeCtx();
    editor.open(null);
    // ftp:// fails the http/https scheme check in normalizeServiceUrl
    editor.save({ name: "Slack", url: "ftp://example.com", iconBgColor: undefined }, ctx);
    expect(editor.isOpen).toBe(true);
    expect(ctx.showToast).toHaveBeenCalledOnce();
    expect(ctx.onWorkspaceUpdate).not.toHaveBeenCalled();
  });

  it("closes dialog and calls onWorkspaceUpdate synchronously on successful add", () => {
    const editor = createServiceEditorStore();
    const ctx = makeCtx();
    editor.open(null);
    editor.save({ name: "Slack", url: "https://app.slack.com", iconBgColor: undefined }, ctx);
    // setState runs before any await in applySaveServiceResult — synchronous
    expect(editor.isOpen).toBe(false);
    expect(ctx.onWorkspaceUpdate).toHaveBeenCalledOnce();
    const { services, activeId } = ctx.onWorkspaceUpdate.mock.calls[0][0] as {
      services: { id: string; name: string }[];
      activeId: string;
    };
    expect(services).toHaveLength(1);
    expect(services[0].name).toBe("Slack");
    expect(activeId).toBe(services[0].id);
  });

  it("calls loadService after successful add", async () => {
    const editor = createServiceEditorStore();
    const ctx = makeCtx();
    editor.open(null);
    editor.save({ name: "Notion", url: "https://notion.so", iconBgColor: undefined }, ctx);
    await Promise.resolve(); // loadService is the first await in applySaveServiceResult for add
    expect(ctx.loadService).toHaveBeenCalledOnce();
    const calledWith = ctx.loadService.mock.calls[0][0] as { name: string };
    expect(calledWith.name).toBe("Notion");
  });

  it("closes dialog on successful edit with unchanged url — no webview operations", () => {
    const svc = makePageService();
    const editor = createServiceEditorStore();
    editor.openForEdit(svc);
    const ctx = makeCtx({ services: [svc], activeId: "svc-1" });
    editor.save({ name: "Slack Updated", url: "https://app.slack.com", iconBgColor: undefined }, ctx);
    expect(editor.isOpen).toBe(false);
    expect(ctx.onWorkspaceUpdate).toHaveBeenCalledOnce();
    expect(ctx.deleteWebview).not.toHaveBeenCalled();
    expect(ctx.loadService).not.toHaveBeenCalled();
  });

  it("calls deleteWebview after edit when url changes and service is not active", async () => {
    const svc = makePageService();
    const editor = createServiceEditorStore();
    editor.openForEdit(svc);
    // activeId = "other-svc" so shouldRecreateActiveEditedService = false → setState runs sync
    const ctx = makeCtx({ services: [svc], activeId: "other-svc" });
    editor.save({ name: "Slack", url: "https://slack.com", iconBgColor: undefined }, ctx);
    expect(editor.isOpen).toBe(false);
    expect(ctx.onWorkspaceUpdate).toHaveBeenCalledOnce();
    await Promise.resolve(); // flush the deleteWebview microtask
    expect(ctx.deleteWebview).toHaveBeenCalledOnce();
    const called = ctx.deleteWebview.mock.calls[0][0] as { id: string };
    expect(called.id).toBe("svc-1");
  });
});
