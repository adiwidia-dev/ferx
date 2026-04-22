import { describe, expect, it } from "vitest";

import { getServiceFaviconUrl, getServiceMonogram } from "./service-icon";

describe("getServiceMonogram", () => {
  it("uses the first alphanumeric character from the service name", () => {
    expect(getServiceMonogram("Discord")).toBe("D");
    expect(getServiceMonogram("  Slack")).toBe("S");
    expect(getServiceMonogram("123 Chat")).toBe("1");
  });

  it("falls back when the service name has no usable characters", () => {
    expect(getServiceMonogram("   ")).toBe("?");
    expect(getServiceMonogram("***")).toBe("?");
  });
});

describe("getServiceFaviconUrl", () => {
  it("builds the old remote favicon URL from a service URL", () => {
    expect(getServiceFaviconUrl("https://web.whatsapp.com/")).toBe(
      "https://www.google.com/s2/favicons?sz=64&domain_url=https%3A%2F%2Fweb.whatsapp.com%2F",
    );
  });

  it("falls back to a neutral favicon URL for invalid service URLs", () => {
    expect(getServiceFaviconUrl("not a url")).toBe(
      "https://www.google.com/s2/favicons?sz=64&domain=localhost",
    );
  });
});
