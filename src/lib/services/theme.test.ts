// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyThemeClass,
  installThemeMode,
  resolveThemeIsDark,
  type ThemeEnvironment,
} from "./theme";

describe("theme resolution", () => {
  it("uses explicit dark and light overrides before system preference", () => {
    expect(resolveThemeIsDark("dark", false)).toBe(true);
    expect(resolveThemeIsDark("dark", true)).toBe(true);
    expect(resolveThemeIsDark("light", false)).toBe(false);
    expect(resolveThemeIsDark("light", true)).toBe(false);
  });

  it("uses system preference when theme mode is system", () => {
    expect(resolveThemeIsDark("system", true)).toBe(true);
    expect(resolveThemeIsDark("system", false)).toBe(false);
  });
});

describe("theme class application", () => {
  afterEach(() => {
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
  });

  it("adds the dark class and dark color scheme", () => {
    applyThemeClass(document, true);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("removes the dark class and applies light color scheme", () => {
    document.documentElement.classList.add("dark");

    applyThemeClass(document, false);

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
});

describe("theme installation", () => {
  afterEach(() => {
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
    vi.restoreAllMocks();
  });

  it("applies explicit dark mode without subscribing to system changes", () => {
    const addEventListener = vi.fn();
    const environment: ThemeEnvironment = {
      document,
      matchMedia: vi.fn(() => ({
        matches: false,
        addEventListener,
        removeEventListener: vi.fn(),
      })),
    };

    const cleanup = installThemeMode("dark", environment);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(addEventListener).not.toHaveBeenCalled();
    cleanup();
  });

  it("falls back safely when matchMedia is unavailable", () => {
    const cleanup = installThemeMode("system", {
      document,
      matchMedia: undefined,
    });

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
    cleanup();
  });

  it("uses a safe default environment when the browser lacks matchMedia", () => {
    const cleanup = installThemeMode("system");

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
    cleanup();
  });

  it("subscribes to OS changes for system mode and cleans up", () => {
    let changeHandler: ((event: MediaQueryListEvent) => void) | undefined;
    const removeEventListener = vi.fn();
    const environment: ThemeEnvironment = {
      document,
      matchMedia: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn((_type, handler) => {
          changeHandler = handler as (event: MediaQueryListEvent) => void;
        }),
        removeEventListener,
      })),
    };

    const cleanup = installThemeMode("system", environment);
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    changeHandler?.({ matches: true } as MediaQueryListEvent);
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    cleanup();
    expect(removeEventListener).toHaveBeenCalledWith("change", changeHandler);
  });
});
