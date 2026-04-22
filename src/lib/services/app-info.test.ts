import { describe, expect, it } from "vitest";

import packageJson from "../../../package.json";
import { getAppInfo } from "./app-info";

describe("getAppInfo", () => {
  it("returns the configured app name and version as a frozen object", () => {
    const appInfo = getAppInfo();

    expect(appInfo).toEqual({
      name: "Ferx",
      version: packageJson.version,
      releasesUrl: "https://github.com/adiwidia-dev/ferx/releases",
    });
    expect(Object.isFrozen(appInfo)).toBe(true);
  });
});
