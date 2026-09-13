import {
  parseDocument,
  isMap,
  isSeq,
  isScalar,
  YAMLMap,
  YAMLSeq,
  Scalar,
  Pair,
} from "yaml";

export interface FixResult {
  fixed: boolean;
  yaml: string;
  message: string;
}

function scalarString(node: unknown): string | null {
  if (isScalar(node)) return String(node.value);
  if (typeof node === "string") return node;
  return null;
}

function getOnPair(root: YAMLMap): Pair | null {
  for (const item of root.items) {
    const key = item.key;
    if (isScalar(key)) {
      const v = key.value;
      // `on` or boolean true (YAML 1.1 treats bare `on` as true)
      if (v === "on" || v === true) return item;
    }
  }
  return null;
}

/**
 * Apply the typical fix: scope `push` to main/master, leave pull_request alone.
 * Preserves comments and unrelated YAML via the yaml AST.
 *
 * Returns the original text unchanged if there is nothing to fix.
 */
export function fixWorkflow(
  yamlText: string,
  defaultBranch: string = "main"
): FixResult {
  const doc = parseDocument(yamlText, { uniqueKeys: false, keepSourceTokens: true });
  const root = doc.contents;
  if (!isMap(root)) {
    return { fixed: false, yaml: yamlText, message: "not a workflow map" };
  }

  const onPair = getOnPair(root);
  if (!onPair) {
    return { fixed: false, yaml: yamlText, message: "no on: trigger found" };
  }

  const onNode = onPair.value;

  // List form: on: [push, pull_request] → convert to map with scoped push
  if (isSeq(onNode)) {
    const events: string[] = [];
    for (const item of onNode.items) {
      const name = scalarString(item);
      if (name) events.push(name);
    }
    if (!events.includes("push") || !events.includes("pull_request")) {
      return { fixed: false, yaml: yamlText, message: "list form without both triggers" };
    }

    const newMap = new YAMLMap();
    // Preserve key as "on" string for clarity
    if (isScalar(onPair.key) && onPair.key.value === true) {
      onPair.key = new Scalar("on");
    }

    for (const ev of events) {
      if (ev === "push") {
        const pushMap = new YAMLMap();
        const branches = new YAMLSeq();
        branches.add(defaultBranch);
        // Also include master if default is main, for broader compatibility? Spec says
        // "scope push to default branch (main/master)" – use the provided default.
        pushMap.set("branches", branches);
        newMap.set("push", pushMap);
      } else {
        newMap.set(ev, null);
      }
    }
    onPair.value = newMap;

    return {
      fixed: true,
      yaml: String(doc),
      message: `scoped push to branches: [${defaultBranch}]`,
    };
  }

  // Map form: on: { push: ..., pull_request: ... }
  if (isMap(onNode)) {
    let pushPair: Pair | null = null;
    let hasPullRequest = false;

    for (const item of onNode.items) {
      const key = scalarString(item.key);
      if (key === "push") pushPair = item;
      if (key === "pull_request") hasPullRequest = true;
    }

    if (!pushPair || !hasPullRequest) {
      return { fixed: false, yaml: yamlText, message: "map form without both triggers" };
    }

    // Already scoped?
    if (isMap(pushPair.value) && pushPair.value.has("branches")) {
      // Leave as-is if already has branches (classifier will mark fixed)
      const existing = pushPair.value.get("branches");
      // Still rewrite to ensure default branch is set cleanly if empty? No – don't touch fixed.
      return { fixed: false, yaml: yamlText, message: "push already has branches" };
    }

    const pushMap = new YAMLMap();
    const branches = new YAMLSeq();
    branches.add(defaultBranch);
    pushMap.set("branches", branches);

    // If push had other keys (paths, tags, etc.), preserve them
    if (isMap(pushPair.value)) {
      for (const item of pushPair.value.items) {
        const k = scalarString(item.key);
        if (k && k !== "branches" && k !== "branches-ignore") {
          pushMap.add(item);
        }
      }
    }

    pushPair.value = pushMap;

    if (isScalar(onPair.key) && onPair.key.value === true) {
      onPair.key = new Scalar("on");
    }

    return {
      fixed: true,
      yaml: String(doc),
      message: `scoped push to branches: [${defaultBranch}]`,
    };
  }

  return { fixed: false, yaml: yamlText, message: "unsupported on: shape" };
}
