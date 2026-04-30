/**
 * Reactive state and save logic for the "add / edit service" modal.
 *
 * - `isOpen` / `editingService` are reactive state the component binds to.
 * - `open`, `openForEdit`, `close` manage dialog visibility.
 * - `save` orchestrates the full add/edit save flow; callers supply only the
 *   page-level context (workspace state, webview callbacks).
 */

import type {
  ServiceEditorInput,
  ServiceEditorService,
} from "$lib/components/workspace/service-editor-dialog.svelte";
import {
  applySaveServiceResult,
  saveServiceState,
  type PageService,
} from "$lib/services/workspace-state";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Page-level context required by `save`.
 * The store owns all editor state; the page owns workspace state and webviews.
 */
export type SaveServiceContext = {
  /** Current flat list of services in the active workspace. */
  services: PageService[];
  /** Currently active service ID. */
  activeId: string;
  /** Called with toast text when a validation message or confirmation is needed. */
  showToast: (message: string) => void;
  /** Apply new service list + active ID to the workspace state. */
  onWorkspaceUpdate: (next: { services: PageService[]; activeId: string }) => void;
  /** Delete the webview for a service being replaced/removed on save. */
  deleteWebview: (payload: { id: string; storageKey: string }) => Promise<unknown>;
  /** Preload a newly added or updated service webview. */
  loadService: (service: PageService) => Promise<unknown>;
};

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

export function createServiceEditorStore() {
  let isOpen = $state(false);
  let editingService = $state<ServiceEditorService | null>(null);

  return {
    get isOpen() {
      return isOpen;
    },
    set isOpen(v: boolean) {
      isOpen = v;
    },
    get editingService() {
      return editingService;
    },

    /**
     * Open the dialog.
     * Callers must await hideActiveWebviewsForOverlay() before calling this
     * so the webview is moved offscreen before the overlay appears.
     */
    open(service: ServiceEditorService | null) {
      editingService = service;
      isOpen = true;
    },

    openForEdit(service: PageService) {
      editingService = {
        id: service.id,
        name: service.name,
        url: service.url,
        iconBgColor: service.iconBgColor,
      };
      isOpen = true;
    },

    close() {
      isOpen = false;
      editingService = null;
    },

    /**
     * Run the full add/edit save flow.
     *
     * Validates the input, applies workspace state changes via the supplied
     * context callbacks, and updates dialog state when the save completes.
     * All webview side-effects (delete old webview, preload new one) are
     * delegated back to the page through the context.
     */
    save(input: ServiceEditorInput, ctx: SaveServiceContext) {
      const currentEditingId = editingService?.id ?? null;

      const nextState = saveServiceState({
        services: ctx.services,
        activeId: ctx.activeId,
        editingServiceId: currentEditingId,
        newServiceName: input.name,
        newServiceUrl: input.url,
        newIconBgColor: input.iconBgColor,
        createServiceId: () => crypto.randomUUID().slice(0, 8),
      });

      applySaveServiceResult({
        nextState,
        editingServiceId: currentEditingId,
        currentActiveId: ctx.activeId,
        showToast: ctx.showToast,
        setState: (next) => {
          ctx.onWorkspaceUpdate({ services: next.services, activeId: next.activeId });
          isOpen = next.isAddModalOpen;
          if (!next.isAddModalOpen) {
            editingService = null;
          }
        },
        deleteWebview: ctx.deleteWebview,
        loadService: ctx.loadService,
      }).catch((err: unknown) => {
        console.error("[ferx] service save failed:", err);
      });
    },
  };
}
