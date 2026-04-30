import type { PageService } from "$lib/services/workspace-state";

export const runtimeBadges = $state<Record<string, number | undefined>>({});

export function setRuntimeBadge(serviceId: string, badge: number) {
  runtimeBadges[serviceId] = badge;
}

export function replaceRuntimeBadges(nextBadges: Record<string, number | undefined>) {
  clearRuntimeBadges();
  for (const [serviceId, badge] of Object.entries(nextBadges)) {
    runtimeBadges[serviceId] = badge;
  }
}

export function clearRuntimeBadges() {
  for (const serviceId of Object.keys(runtimeBadges)) {
    delete runtimeBadges[serviceId];
  }
}

export function applyRuntimeBadgePayload(
  payload: unknown,
  services?: readonly Pick<PageService, "id">[],
) {
  if (typeof payload !== "string") return false;

  const [targetId, countStr] = payload.split(":");
  const count = Number.parseInt(countStr, 10);
  if (!targetId || Number.isNaN(count)) return false;
  if (services && !services.some((service) => service.id === targetId)) return false;
  if (runtimeBadges[targetId] === count) return false;

  setRuntimeBadge(targetId, count);
  return true;
}
