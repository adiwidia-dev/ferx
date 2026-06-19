import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createServiceHibernationStore } from "./service-hibernation.svelte";

describe("createServiceHibernationStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs the hibernation callback only after the configured delay", async () => {
    const onHibernate = vi.fn(() => Promise.resolve());
    const hibernation = createServiceHibernationStore({ delayMs: 60000 });

    hibernation.schedule("chat", onHibernate);
    await vi.advanceTimersByTimeAsync(59999);

    expect(onHibernate).not.toHaveBeenCalled();
    expect(hibernation.isPending("chat")).toBe(true);
    expect(hibernation.isHibernated("chat")).toBe(false);

    await vi.advanceTimersByTimeAsync(1);

    expect(onHibernate).toHaveBeenCalledWith("chat");
    expect(hibernation.isPending("chat")).toBe(false);
    expect(hibernation.isHibernated("chat")).toBe(true);
  });

  it("cancels pending hibernation timers", async () => {
    const onHibernate = vi.fn();
    const hibernation = createServiceHibernationStore({ delayMs: 60000 });

    hibernation.schedule("chat", onHibernate);
    hibernation.cancel("chat");
    await vi.advanceTimersByTimeAsync(60000);

    expect(onHibernate).not.toHaveBeenCalled();
    expect(hibernation.isPending("chat")).toBe(false);
    expect(hibernation.isHibernated("chat")).toBe(false);
  });

  it("does not mark a service hibernated when the callback reports failure", async () => {
    const hibernation = createServiceHibernationStore({ delayMs: 60000 });

    hibernation.schedule("chat", () => false);
    await vi.advanceTimersByTimeAsync(60000);

    expect(hibernation.isHibernated("chat")).toBe(false);
  });

  it("does not mark a service hibernated when cancelled while the callback is in flight", async () => {
    let resolveHibernate: (value?: boolean | void) => void = () => {};
    const hibernation = createServiceHibernationStore({ delayMs: 60000 });

    hibernation.schedule(
      "chat",
      () =>
        new Promise<boolean | void>((resolve) => {
          resolveHibernate = resolve;
        }),
    );
    await vi.advanceTimersByTimeAsync(60000);

    hibernation.cancel("chat");
    resolveHibernate();
    await Promise.resolve();

    expect(hibernation.isHibernated("chat")).toBe(false);
  });

  it("clears hibernation and increments wake generation", () => {
    const hibernation = createServiceHibernationStore({ delayMs: 60000 });

    expect(hibernation.wakeGenerationFor("chat")).toBe(0);
    hibernation.markHibernated("chat");
    hibernation.clearHibernated("chat");

    expect(hibernation.isHibernated("chat")).toBe(false);
    expect(hibernation.wakeGenerationFor("chat")).toBe(1);
  });

  it("cleans up all timers", async () => {
    const onHibernate = vi.fn();
    const hibernation = createServiceHibernationStore({ delayMs: 60000 });

    hibernation.schedule("chat", onHibernate);
    hibernation.schedule("mail", onHibernate);
    hibernation.cancelAll();
    await vi.advanceTimersByTimeAsync(60000);

    expect(onHibernate).not.toHaveBeenCalled();
    expect(hibernation.isPending("chat")).toBe(false);
    expect(hibernation.isPending("mail")).toBe(false);
  });
});
