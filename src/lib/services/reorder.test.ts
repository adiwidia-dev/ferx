import { describe, expect, it } from "vitest";

import { moveItemToTarget } from "./reorder";

const services = [
  { id: "one", name: "One", url: "https://one.test" },
  { id: "two", name: "Two", url: "https://two.test" },
  { id: "three", name: "Three", url: "https://three.test" },
  { id: "four", name: "Four", url: "https://four.test", disabled: true },
];

describe("moveItemToTarget", () => {
  it("moves a middle item onto an earlier target index", () => {
    const result = moveItemToTarget(services, "three", "one");

    expect(result.map((service) => service.id)).toEqual([
      "three",
      "one",
      "two",
      "four",
    ]);
  });

  it("moves the first item onto a later target index", () => {
    const result = moveItemToTarget(services, "one", "four");

    expect(result.map((service) => service.id)).toEqual([
      "two",
      "three",
      "four",
      "one",
    ]);
  });

  it("moves the first item below the next icon when dragged downward", () => {
    const result = moveItemToTarget(services, "one", "two");

    expect(result.map((service) => service.id)).toEqual([
      "two",
      "one",
      "three",
      "four",
    ]);
  });

  it("returns the original array when dropping onto itself", () => {
    const result = moveItemToTarget(services, "two", "two");

    expect(result).toBe(services);
  });

  it("returns the original array when the source id is missing", () => {
    const result = moveItemToTarget(services, "missing", "two");

    expect(result).toBe(services);
  });

  it("returns the original array when the target id is missing", () => {
    const result = moveItemToTarget(services, "two", "missing");

    expect(result).toBe(services);
  });
});
