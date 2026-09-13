import { parseDocument, YAMLMap, YAMLSeq, Scalar, isMap, isSeq, isScalar } from "yaml";

export type Classification = "hard" | "soft" | "fixed" | "ok";

export interface ClassifyResult {
  classification: Classification;
  reason: string;
  hasPush: boolean;
  hasPullRequest: boolean;
  pushScopedToDefault: boolean;
  hasSkipIf: boolean;
  hasConcurrency: boolean;
}

const DEFAULT_BRANCHES = new Set(["main", "master"]);

function scalarString(node: unknown): string | null {
  if (isScalar(node)) {
    return String(node.value);
  }
  if (typeof node === "string") return node;
  return null;
}

function normalizeBranch(name: string): string {
  return name.replace(/^['"]|['"]$/g, "");
}

function isDefaultOnlyBranches(branches: unknown): boolean {
  const names: string[] = [];

  if (isSeq(branches)) {
    for (const item of branches.items) {
      const s = scalarString(item);
      if (s != null) names.push(normalizeBranch(s));
    }
  } else if (isScalar(branches) || typeof branches === "string") {
    const s = scalarString(branches);
    if (s != null) names.push(normalizeBranch(s));
  } else if (Array.isArray(branches)) {
    for (const b of branches) {
      if (typeof b === "string") names.push(normalizeBranch(b));
    }
  } else if (typeof branches === "string") {
    names.push(normalizeBranch(branches));
  }

  if (names.length === 0) return false;
  return names.every((n) => DEFAULT_BRANCHES.has(n));
}

/**
 * Detect a skip-if that prevents duplicate runs on same-repo PRs.
 * Common patterns:
 *   if: github.event_name != 'pull_request'
 *   if: github.event.pull_request.head.repo.full_name != github.repository
 *   if: github.event.pull_request.head.repo.id != github.repository_id
 * Also job-level and step-level ifs that check these.
 */
function hasSameRepoSkipIf(doc: ReturnType<typeof parseDocument>): boolean {
  const raw = doc.toString();
  // Broad but practical: look for common skip-if idioms in the YAML text
  const patterns = [
    /github\.event_name\s*!=\s*['"]pull_request['"]/,
    /github\.event\.pull_request\.head\.repo\.(full_name|name|id)\s*!=/,
    /github\.repository\s*==\s*github\.event\.pull_request\.head\.repo\.full_name/,
    /github\.event\.pull_request\.head\.repo\.full_name\s*==\s*github\.repository/,
    // inverted forms that skip when it's a PR from same repo
    /github\.event_name\s*==\s*['"]push['"]/,
  ];

  // Only count event_name == 'push' if it's clearly a skip for PR duplication
  // (common: if: github.event_name == 'push' || github.event.pull_request.head.repo.full_name != github.repository)
  const hasHeadRepoCheck =
    /github\.event\.pull_request\.head\.repo\.(full_name|name|id)/.test(raw) &&
    /!=|==/.test(raw);

  const hasEventNameSkip =
    /github\.event_name\s*!=\s*['"]pull_request['"]/.test(raw) ||
    (/github\.event_name\s*==\s*['"]push['"]/.test(raw) && hasHeadRepoCheck);

  if (hasHeadRepoCheck) return true;
  if (/github\.event_name\s*!=\s*['"]pull_request['"]/.test(raw)) return true;

  // Also walk jobs for `if` fields
  const root = doc.contents;
  if (!isMap(root)) return hasEventNameSkip || hasHeadRepoCheck;

  const jobs = root.get("jobs");
  if (isMap(jobs)) {
    for (const item of jobs.items) {
      if (!isMap(item.value)) continue;
      const ifNode = item.value.get("if");
      const ifStr = scalarString(ifNode);
      if (!ifStr) continue;
      if (
        /github\.event_name\s*!=\s*['"]pull_request['"]/.test(ifStr) ||
        /github\.event\.pull_request\.head\.repo/.test(ifStr)
      ) {
        return true;
      }
    }
  }

  return false;
}

function getOnNode(root: YAMLMap): unknown {
  // YAML may use `on` or `"on"` (quoted because on is a boolean in YAML 1.1)
  return root.get("on") ?? root.get(true) ?? root.get("true");
}

interface TriggerInfo {
  hasPush: boolean;
  hasPullRequest: boolean;
  pushScopedToDefault: boolean;
  hasPullRequestTarget: boolean;
}

function analyzeTriggers(onNode: unknown): TriggerInfo {
  const info: TriggerInfo = {
    hasPush: false,
    hasPullRequest: false,
    pushScopedToDefault: false,
    hasPullRequestTarget: false,
  };

  // List form: on: [push, pull_request]
  if (isSeq(onNode)) {
    for (const item of onNode.items) {
      const name = scalarString(item);
      if (name === "push") info.hasPush = true;
      if (name === "pull_request") info.hasPullRequest = true;
      if (name === "pull_request_target") info.hasPullRequestTarget = true;
    }
    // List form means push is unscoped
    return info;
  }

  // Map form: on: { push: ..., pull_request: ... }
  if (isMap(onNode)) {
    for (const item of onNode.items) {
      const key = scalarString(item.key);
      if (!key) continue;

      if (key === "push") {
        info.hasPush = true;
        const val = item.value;
        if (isMap(val)) {
          const branches = val.get("branches") ?? val.get("branches-ignore");
          // Only "branches" (allow-list) scoped to main/master counts as fixed.
          // branches-ignore does NOT fix the double-run on feature PRs.
          if (val.has("branches") && isDefaultOnlyBranches(val.get("branches"))) {
            info.pushScopedToDefault = true;
          }
        } else if (val === null || val === undefined) {
          // push: (null) means all branches
        }
      }
      if (key === "pull_request") {
        info.hasPullRequest = true;
      }
      if (key === "pull_request_target") {
        info.hasPullRequestTarget = true;
      }
    }
  }

  // Plain string form: on: push
  if (isScalar(onNode)) {
    const name = scalarString(onNode);
    if (name === "push") info.hasPush = true;
    if (name === "pull_request") info.hasPullRequest = true;
    if (name === "pull_request_target") info.hasPullRequestTarget = true;
  }

  return info;
}

function hasTopLevelConcurrency(root: YAMLMap): boolean {
  return root.has("concurrency");
}

/**
 * Classify a GitHub Actions workflow YAML string.
 *
 * hard  – push + pull_request, push not scoped to main/master, no same-repo skip-if
 * soft  – hard pattern + top-level concurrency (still double-scheduled)
 * fixed – would be hard/soft but push is main/master-only OR skip-if present
 * ok    – not the double-run pattern (e.g. only push, or only PR)
 */
export function classifyWorkflow(yamlText: string): ClassifyResult {
  let doc;
  try {
    doc = parseDocument(yamlText, { uniqueKeys: false });
  } catch {
    return {
      classification: "ok",
      reason: "unparseable YAML",
      hasPush: false,
      hasPullRequest: false,
      pushScopedToDefault: false,
      hasSkipIf: false,
      hasConcurrency: false,
    };
  }

  const root = doc.contents;
  if (!isMap(root)) {
    return {
      classification: "ok",
      reason: "not a workflow map",
      hasPush: false,
      hasPullRequest: false,
      pushScopedToDefault: false,
      hasSkipIf: false,
      hasConcurrency: false,
    };
  }

  const onNode = getOnNode(root);
  const triggers = analyzeTriggers(onNode);
  const skipIf = hasSameRepoSkipIf(doc);
  const concurrency = hasTopLevelConcurrency(root);

  const base = {
    hasPush: triggers.hasPush,
    hasPullRequest: triggers.hasPullRequest,
    pushScopedToDefault: triggers.pushScopedToDefault,
    hasSkipIf: skipIf,
    hasConcurrency: concurrency,
  };

  // pull_request_target alone does not make this a double-run finding
  if (!(triggers.hasPush && triggers.hasPullRequest)) {
    return {
      classification: "ok",
      reason: "does not combine push and pull_request",
      ...base,
    };
  }

  // Fixed: push scoped to default branch, or real skip-if
  if (triggers.pushScopedToDefault) {
    return {
      classification: "fixed",
      reason: "push is limited to main/master",
      ...base,
    };
  }

  if (skipIf) {
    return {
      classification: "fixed",
      reason: "has skip-if for same-repo pull requests",
      ...base,
    };
  }

  // Soft: hard pattern + concurrency (concurrency does NOT fully fix)
  if (concurrency) {
    return {
      classification: "soft",
      reason: "push + pull_request unscoped; concurrency present but still schedules twice",
      ...base,
    };
  }

  return {
    classification: "hard",
    reason: "push + pull_request both present; push not limited to main/master; no same-repo skip-if",
    ...base,
  };
}
