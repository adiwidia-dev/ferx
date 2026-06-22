import type { ThemeMode } from "./app-settings";

const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

type MediaQueryLike = Pick<
  MediaQueryList,
  "matches" | "addEventListener" | "removeEventListener"
>;

export interface ThemeEnvironment {
  document?: Document;
  matchMedia?: (query: string) => MediaQueryLike;
}

export function resolveThemeIsDark(themeMode: ThemeMode, systemPrefersDark: boolean) {
  if (themeMode === "dark") return true;
  if (themeMode === "light") return false;
  return systemPrefersDark;
}

export function applyThemeClass(targetDocument: Document | undefined, isDark: boolean) {
  if (!targetDocument) return;

  const root = targetDocument.documentElement;
  root.classList.toggle("dark", isDark);
  root.style.colorScheme = isDark ? "dark" : "light";
}

export function installThemeMode(
  themeMode: ThemeMode,
  environment: ThemeEnvironment = {
    document: typeof document === "undefined" ? undefined : document,
    matchMedia:
      typeof window === "undefined" || typeof window.matchMedia !== "function"
        ? undefined
        : window.matchMedia.bind(window),
  },
) {
  const media = environment.matchMedia?.(DARK_SCHEME_QUERY);
  const apply = (systemPrefersDark: boolean) => {
    applyThemeClass(environment.document, resolveThemeIsDark(themeMode, systemPrefersDark));
  };

  apply(media?.matches ?? false);

  if (themeMode !== "system" || !media) {
    return () => {};
  }

  const handleChange = (event: MediaQueryListEvent) => {
    apply(event.matches);
  };

  media.addEventListener("change", handleChange);

  return () => {
    media.removeEventListener("change", handleChange);
  };
}
