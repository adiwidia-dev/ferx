import { describe, expect, it } from "vitest";

import { getAppInfo } from "./app-info";

describe("getAppInfo", () => {
  it("returns the configured app name and version as a frozen object", () => {
    const appInfo = getAppInfo();

    expect(appInfo).toEqual({
      name: "Ferx",
      version: "0.1.0",
    });
    expect(Object.isFrozen(appInfo)).toBe(true);
  });
});
