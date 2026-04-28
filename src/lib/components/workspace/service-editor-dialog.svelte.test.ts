// @vitest-environment jsdom
import { flushSync, mount, unmount } from "svelte";
import { describe, expect, it, vi } from "vitest";

import ServiceEditorDialog from "./service-editor-dialog.svelte";

async function waitForDialogCleanup() {
  flushSync();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  flushSync();
}

describe("ServiceEditorDialog", () => {
  it("uses service terminology for add and edit modes", async () => {
    const addComponent = mount(ServiceEditorDialog, {
      target: document.body,
      props: {
        open: true,
        editingService: null,
        onSave: vi.fn(),
      },
    });

    flushSync();

    expect(document.body.textContent).toContain("Add New Service");
    expect(document.body.textContent).not.toContain("Add New Workspace");

    unmount(addComponent);
    await waitForDialogCleanup();
    document.body.innerHTML = "";

    const editComponent = mount(ServiceEditorDialog, {
      target: document.body,
      props: {
        open: true,
        editingService: {
          id: "slack",
          name: "Slack",
          url: "https://slack.com/app",
          iconBgColor: "#3B82F6",
        },
        onSave: vi.fn(),
      },
    });

    flushSync();

    expect(document.body.textContent).toContain("Edit Service");
    expect(document.body.textContent).not.toContain("Edit Workspace");
    expect((document.querySelector("#name") as HTMLInputElement | null)?.value).toBe("Slack");
    expect((document.querySelector("#url") as HTMLInputElement | null)?.value).toBe(
      "https://slack.com/app",
    );

    unmount(editComponent);
    await waitForDialogCleanup();
  });

  it("keeps required service fields and saves the selected icon ring color", async () => {
    const onSave = vi.fn();
    const component = mount(ServiceEditorDialog, {
      target: document.body,
      props: {
        open: true,
        editingService: null,
        onSave,
      },
    });

    flushSync();

    const saveButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Add Service"),
    ) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    const nameInput = document.querySelector("#name") as HTMLInputElement;
    const urlInput = document.querySelector("#url") as HTMLInputElement;
    nameInput.value = "Discord";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    urlInput.value = "discord.com/app";
    urlInput.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();

    const purpleSwatch = document.querySelector('[title="Purple"]') as HTMLButtonElement;
    purpleSwatch.click();
    flushSync();

    saveButton.click();
    flushSync();

    expect(onSave).toHaveBeenCalledWith({
      name: "Discord",
      url: "discord.com/app",
      iconBgColor: "#A855F7",
    });

    unmount(component);
    await waitForDialogCleanup();
  });
});
