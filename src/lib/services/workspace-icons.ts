export const WORKSPACE_ICON_PRESETS = [
  { key: "briefcase", label: "Briefcase" },
  { key: "building-2", label: "Office" },
  { key: "house", label: "Home" },
  { key: "user", label: "Person" },
  { key: "bike", label: "Bicycle" },
  { key: "coffee", label: "Coffee" },
  { key: "laptop", label: "Laptop" },
  { key: "code", label: "Code" },
  { key: "book-open", label: "Book" },
  { key: "mail", label: "Mail" },
  { key: "heart", label: "Heart" },
  { key: "star", label: "Star" },
  { key: "palette", label: "Palette" },
  { key: "music", label: "Music" },
  { key: "plane", label: "Travel" },
  { key: "shopping-bag", label: "Shopping" },
  { key: "graduation-cap", label: "School" },
  { key: "rocket", label: "Launch" },
  { key: "folder", label: "Folder" },
  { key: "camera", label: "Camera" },
  { key: "globe", label: "Global" },
  { key: "shield", label: "Secure" },
  { key: "wrench", label: "Tools" },
  { key: "gamepad-2", label: "Game" },
] as const;

export type WorkspaceIconKey = (typeof WORKSPACE_ICON_PRESETS)[number]["key"];

export const DEFAULT_WORKSPACE_ICON: WorkspaceIconKey = "briefcase";

const WORKSPACE_ICON_KEYS = new Set<string>(
  WORKSPACE_ICON_PRESETS.map((preset) => preset.key),
);

export function isWorkspaceIconKey(value: unknown): value is WorkspaceIconKey {
  return typeof value === "string" && WORKSPACE_ICON_KEYS.has(value);
}

export function normalizeWorkspaceIcon(value: unknown): WorkspaceIconKey {
  return isWorkspaceIconKey(value) ? value : DEFAULT_WORKSPACE_ICON;
}
