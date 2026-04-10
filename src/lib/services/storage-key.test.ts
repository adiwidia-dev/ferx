import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createStorageKey,
  ensureServiceStorageKeys,
} from "./storage-key";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createStorageKey", () => {
  it("creates different keys for repeated service creation", () => {
    const randomUUID = vi.spyOn(crypto, "randomUUID");

    randomUUID
      .mockReturnValueOnce("11111111-1111-1111-1111-111111111111")
      .mockReturnValueOnce("22222222-2222-2222-2222-222222222222");

    expect(createStorageKey()).toBe("storage-11111111");
    expect(createStorageKey()).toBe("storage-22222222");
  });
});

describe("ensureServiceStorageKeys", () => {
  it("backfills missing storage keys without changing existing service data", () => {
    const randomUUID = vi.spyOn(crypto, "randomUUID");
    randomUUID.mockReturnValue("33333333-3333-3333-3333-333333333333");

    const result = ensureServiceStorageKeys([
      { id: "one", name: "Outlook A", url: "https://outlook.office.com" },
    ]);

    expect(result.changed).toBe(true);
    expect(result.services).toEqual([
      {
        id: "one",
        name: "Outlook A",
        url: "https://outlook.office.com",
        storageKey: "storage-33333333",
      },
    ]);
  });

  it("preserves an existing valid storage key", () => {
    const result = ensureServiceStorageKeys([
      {
        id: "one",
        name: "Outlook A",
        url: "https://outlook.office.com",
        storageKey: "storage-existing",
      },
    ]);

    expect(result.changed).toBe(false);
    expect(result.services[0].storageKey).toBe("storage-existing");
  });

  it("keeps storage keys stable when service fields change", () => {
    const original = {
      id: "one",
      name: "Outlook A",
      url: "https://outlook.office.com",
      storageKey: "storage-stable",
    };

    const result = ensureServiceStorageKeys([
      {
        ...original,
        name: "Work Outlook",
        url: "https://outlook.office.com/mail",
      },
    ]);

    expect(result.changed).toBe(false);
    expect(result.services[0].storageKey).toBe("storage-stable");
  });

  it("repairs duplicate storage keys on later services", () => {
    const randomUUID = vi.spyOn(crypto, "randomUUID");
    randomUUID.mockReturnValue("44444444-4444-4444-4444-444444444444");

    const result = ensureServiceStorageKeys([
      {
        id: "one",
        name: "Outlook A",
        url: "https://outlook.office.com",
        storageKey: "storage-shared",
      },
      {
        id: "two",
        name: "Outlook B",
        url: "https://outlook.office.com",
        storageKey: "storage-shared",
      },
    ]);

    expect(result.changed).toBe(true);
    expect(result.services.map((service) => service.storageKey)).toEqual([
      "storage-shared",
      "storage-44444444",
    ]);
  });

  it("retries until it generates a unique storage key", () => {
    const randomUUID = vi.spyOn(crypto, "randomUUID");

    randomUUID
      .mockReturnValueOnce("44444444-4444-4444-4444-444444444444")
      .mockReturnValueOnce("55555555-5555-5555-5555-555555555555");

    const result = ensureServiceStorageKeys([
      {
        id: "one",
        name: "Outlook A",
        url: "https://outlook.office.com",
        storageKey: "storage-44444444",
      },
      {
        id: "two",
        name: "Outlook B",
        url: "https://outlook.office.com",
        storageKey: "storage-44444444",
      },
    ]);

    expect(result.changed).toBe(true);
    expect(result.services.map((service) => service.storageKey)).toEqual([
      "storage-44444444",
      "storage-55555555",
    ]);
    expect(randomUUID).toHaveBeenCalledTimes(2);
  });
});
