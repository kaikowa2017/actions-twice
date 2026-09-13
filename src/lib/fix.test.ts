import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";
import { fixWorkflow } from "./fix";
import { classifyWorkflow } from "./classify";

const fixtures = join(__dirname, "fixtures");

function load(name: string): string {
  return readFileSync(join(fixtures, name), "utf8");
}

describe("fixWorkflow", () => {
  it("scopes list-form push to main and leaves pull_request", () => {
    const before = load("hard-list.yml");
    const result = fixWorkflow(before, "main");
    expect(result.fixed).toBe(true);
    expect(result.yaml).toMatch(/push:/);
    expect(result.yaml).toMatch(/branches:/);
    expect(result.yaml).toMatch(/main/);
    expect(result.yaml).toMatch(/pull_request/);
    // After fix, classifier should see fixed
    expect(classifyWorkflow(result.yaml).classification).toBe("fixed");
  });

  it("scopes map-form unscoped push to main", () => {
    const before = load("hard-map.yml");
    const result = fixWorkflow(before, "main");
    expect(result.fixed).toBe(true);
    expect(classifyWorkflow(result.yaml).classification).toBe("fixed");
  });

  it("preserves comments from the original file", () => {
    const before = load("hard-list.yml");
    const result = fixWorkflow(before, "main");
    expect(result.yaml).toMatch(/Unscoped list-form/);
  });

  it("does not rewrite already-fixed main-only workflows", () => {
    const before = load("fixed-main.yml");
    const result = fixWorkflow(before, "main");
    expect(result.fixed).toBe(false);
  });

  it("fixes soft (concurrency) workflows the same way", () => {
    const before = load("soft-concurrency.yml");
    const result = fixWorkflow(before, "main");
    expect(result.fixed).toBe(true);
    expect(result.yaml).toMatch(/concurrency:/);
    expect(classifyWorkflow(result.yaml).classification).toBe("fixed");
  });
});
