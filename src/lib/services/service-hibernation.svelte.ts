export const SERVICE_HIBERNATION_DELAY_MS = 60000;

type Timer = ReturnType<typeof setTimeout>;
type HibernateCallback = (serviceId: string) => boolean | void | Promise<boolean | void>;

export function createServiceHibernationStore({
  delayMs = SERVICE_HIBERNATION_DELAY_MS,
}: {
  delayMs?: number;
} = {}) {
  const timers = new Map<string, Timer>();
  let pending = $state<Record<string, true | undefined>>({});
  let hibernated = $state<Record<string, true | undefined>>({});
  let wakeGenerations = $state<Record<string, number | undefined>>({});

  function cancel(serviceId: string) {
    const timer = timers.get(serviceId);
    if (timer) {
      clearTimeout(timer);
      timers.delete(serviceId);
    }
    delete pending[serviceId];
  }

  function markHibernated(serviceId: string) {
    hibernated[serviceId] = true;
  }

  function schedule(serviceId: string, onHibernate: HibernateCallback) {
    cancel(serviceId);
    pending[serviceId] = true;

    const timer = setTimeout(() => {
      timers.delete(serviceId);
      delete pending[serviceId];

      void Promise.resolve(onHibernate(serviceId))
        .then((result) => {
          if (result !== false) {
            markHibernated(serviceId);
          }
        })
        .catch((error: unknown) => {
          console.error("[ferx] service hibernation failed:", error);
        });
    }, delayMs);

    timers.set(serviceId, timer);
  }

  function clearHibernated(serviceId: string) {
    if (!hibernated[serviceId]) return;
    delete hibernated[serviceId];
    wakeGenerations[serviceId] = (wakeGenerations[serviceId] ?? 0) + 1;
  }

  function cancelAll() {
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }
    timers.clear();
    pending = {};
  }

  return {
    schedule,
    cancel,
    cancelAll,
    markHibernated,
    clearHibernated,
    isPending(serviceId: string) {
      return pending[serviceId] === true;
    },
    isHibernated(serviceId: string) {
      return hibernated[serviceId] === true;
    },
    wakeGenerationFor(serviceId: string) {
      return wakeGenerations[serviceId] ?? 0;
    },
    get pendingServices() {
      return { ...pending };
    },
    get hibernatedServices() {
      return { ...hibernated };
    },
  };
}
