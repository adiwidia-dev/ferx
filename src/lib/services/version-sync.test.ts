import { describe, expect, it } from "vitest";

import packageJson from "../../../package.json";
import tauriConfig from "../../../src-tauri/tauri.conf.json";

describe("release metadata", () => {
  it("keeps package and tauri versions in sync", () => {
    expect(tauriConfig.version).toBe(packageJson.version);
  });
});
