export const dndState = $state({
  enabled: false,
});

export function setDndEnabled(enabled: boolean) {
  dndState.enabled = enabled;
}

export function toggleDndEnabled() {
  dndState.enabled = !dndState.enabled;
  return dndState.enabled;
}

export function clearDndState() {
  dndState.enabled = false;
}
