import { classifyWorkflow, type Classification } from "./classify";
import { fixWorkflow } from "./fix";

export interface WorkflowFinding {
  path: string;
  classification: Classification;
  reason: string;
  fixedYaml?: string;
}

const WORKFLOW_RE = /^\.github\/workflows\/.+\.ya?ml$/i;

export function isWorkflowPath(path: string): boolean {
  return WORKFLOW_RE.test(path);
}

/**
 * Scan workflow file contents. Only hard (and optionally soft) produce fixable findings.
 */
export function scanWorkflowContents(
  files: Array<{ path: string; content: string }>,
  options: { includeSoft?: boolean; defaultBranch?: string } = {}
): WorkflowFinding[] {
  const includeSoft = options.includeSoft ?? true;
  const defaultBranch = options.defaultBranch ?? "main";
  const findings: WorkflowFinding[] = [];

  for (const file of files) {
    if (!isWorkflowPath(file.path) && !file.path.endsWith(".yml") && !file.path.endsWith(".yaml")) {
      // Allow callers to pass already-filtered paths under workflows/
    }
    const result = classifyWorkflow(file.content);
    if (result.classification === "hard" || (includeSoft && result.classification === "soft")) {
      const fixed = fixWorkflow(file.content, defaultBranch);
      findings.push({
        path: file.path,
        classification: result.classification,
        reason: result.reason,
        fixedYaml: fixed.fixed ? fixed.yaml : undefined,
      });
    }
  }

  return findings.filter((f) => f.fixedYaml);
}
