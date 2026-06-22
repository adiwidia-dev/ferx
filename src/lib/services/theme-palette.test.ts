// @ts-nocheck
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readDarkThemeTokens() {
  const css = readFileSync(new URL("../../app.css", import.meta.url), "utf8");
  const darkBlock = css.match(/\.dark\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";
  const tokens = new Map<string, string>();

  for (const match of darkBlock.matchAll(/--([a-z-]+):\s*([^;]+);/g)) {
    tokens.set(match[1], match[2].trim());
  }

  return tokens;
}

describe("dark theme palette", () => {
  it("uses a neutral VS Code Dark Modern-style shell palette", () => {
    const tokens = readDarkThemeTokens();

    expect(tokens.get("background")).toBe("0 0% 12.2%");
    expect(tokens.get("foreground")).toBe("0 0% 80%");
    expect(tokens.get("muted")).toBe("0 0% 9.4%");
    expect(tokens.get("muted-foreground")).toBe("0 0% 61.6%");
    expect(tokens.get("card")).toBe("0 0% 12.2%");
    expect(tokens.get("border")).toBe("0 0% 16.9%");
    expect(tokens.get("input")).toBe("0 0% 19.2%");
    expect(tokens.get("primary")).toBe("206 100% 41.6%");
    expect(tokens.get("ring")).toBe("206 100% 41.6%");
  });
});
