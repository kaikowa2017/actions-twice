import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";
import { classifyWorkflow } from "./classify";

const fixtures = join(__dirname, "fixtures");

function load(name: string): string {
  return readFileSync(join(fixtures, name), "utf8");
}

describe("classifyWorkflow", () => {
  it("flags unscoped list-form as hard", () => {
    const r = classifyWorkflow(load("hard-list.yml"));
    expect(r.classification).toBe("hard");
    expect(r.hasPush).toBe(true);
    expect(r.hasPullRequest).toBe(true);
    expect(r.pushScopedToDefault).toBe(false);
    expect(r.hasSkipIf).toBe(false);
  });

  it("flags map-form unscoped as hard", () => {
    const r = classifyWorkflow(load("hard-map.yml"));
    expect(r.classification).toBe("hard");
    expect(r.hasPush).toBe(true);
    expect(r.hasPullRequest).toBe(true);
  });

  it("flags concurrency + hard pattern as soft", () => {
    const r = classifyWorkflow(load("soft-concurrency.yml"));
    expect(r.classification).toBe("soft");
    expect(r.hasConcurrency).toBe(true);
  });

  it("treats push.branches main only as fixed", () => {
    const r = classifyWorkflow(load("fixed-main.yml"));
    expect(r.classification).toBe("fixed");
    expect(r.pushScopedToDefault).toBe(true);
  });

  it('treats quoted "main" as fixed', () => {
    const r = classifyWorkflow(load("fixed-quoted-main.yml"));
    expect(r.classification).toBe("fixed");
    expect(r.pushScopedToDefault).toBe(true);
  });

  it("treats skip-if same-repo PR as fixed", () => {
    const r = classifyWorkflow(load("fixed-skip-if.yml"));
    expect(r.classification).toBe("fixed");
    expect(r.hasSkipIf).toBe(true);
  });

  it("does not flag pull_request-only workflows", () => {
    const r = classifyWorkflow(load("ok-pr-only.yml"));
    expect(r.classification).toBe("ok");
  });

  it("does not fail merely for pull_request_target", () => {
    const r = classifyWorkflow(load("ok-prt.yml"));
    expect(r.classification).toBe("ok");
  });

  it("treats master-only push as fixed", () => {
    const yaml = `
name: CI
on:
  push:
    branches: [master]
  pull_request:
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
`;
    expect(classifyWorkflow(yaml).classification).toBe("fixed");
  });

  it("concurrency alone does not make an ok workflow soft", () => {
    const yaml = `
name: CI
concurrency:
  group: x
on:
  push:
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
`;
    expect(classifyWorkflow(yaml).classification).toBe("ok");
  });
});
