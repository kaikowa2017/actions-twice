import { NextRequest, NextResponse } from "next/server";
import { App } from "@octokit/app";
import { classifyWorkflow } from "../../../../lib/classify";
import { fixWorkflow } from "../../../../lib/fix";
import { isWorkflowPath } from "../../../../lib/scan";

export const runtime = "nodejs";

function missingConfig(): string[] {
  const missing: string[] = [];
  if (!process.env.APP_ID) missing.push("APP_ID");
  if (!process.env.PRIVATE_KEY) missing.push("PRIVATE_KEY");
  if (!process.env.WEBHOOK_SECRET) missing.push("WEBHOOK_SECRET");
  return missing;
}

function getApp(): App | null {
  const missing = missingConfig();
  if (missing.length > 0) return null;

  const privateKey = process.env.PRIVATE_KEY!.replace(/\\n/g, "\n");
  return new App({
    appId: process.env.APP_ID!,
    privateKey,
    webhooks: { secret: process.env.WEBHOOK_SECRET! },
  });
}

async function listWorkflowFiles(
  octokit: Awaited<ReturnType<App["getInstallationOctokit"]>>,
  owner: string,
  repo: string
): Promise<Array<{ path: string; content: string }>> {
  try {
    const { data } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: ".github/workflows",
    });

    if (!Array.isArray(data)) return [];

    const files: Array<{ path: string; content: string }> = [];
    for (const entry of data) {
      if (entry.type !== "file" || !isWorkflowPath(entry.path)) continue;
      const file = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
        owner,
        repo,
        path: entry.path,
      });
      if (Array.isArray(file.data) || file.data.type !== "file" || !file.data.content) continue;
      const content = Buffer.from(file.data.content, "base64").toString("utf8");
      files.push({ path: entry.path, content });
    }
    return files;
  } catch {
    return [];
  }
}

async function openFixPullRequest(
  octokit: Awaited<ReturnType<App["getInstallationOctokit"]>>,
  owner: string,
  repo: string,
  defaultBranch: string,
  findings: Array<{ path: string; fixedYaml: string; classification: string; reason: string }>
): Promise<void> {
  if (findings.length === 0) return;

  const { data: ref } = await octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", {
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  });
  const baseSha = ref.object.sha;
  const branch = `actions-twice/fix-${Date.now().toString(36)}`;

  await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
    owner,
    repo,
    ref: `refs/heads/${branch}`,
    sha: baseSha,
  });

  for (const finding of findings) {
    // Get current file sha for update
    let sha: string | undefined;
    try {
      const { data } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
        owner,
        repo,
        path: finding.path,
        ref: branch,
      });
      if (!Array.isArray(data) && data.type === "file") sha = data.sha;
    } catch {
      // file may not exist on branch yet
    }

    await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: finding.path,
      message: `fix: stop GitHub Actions running twice (${finding.path})`,
      content: Buffer.from(finding.fixedYaml, "utf8").toString("base64"),
      branch,
      sha,
    });
  }

  const body = [
    "This PR scopes `push` to the default branch so the same commit is not double-scheduled when both `push` and `pull_request` are configured.",
    "",
    "Files:",
    ...findings.map((f) => `- \`${f.path}\` (${f.classification}): ${f.reason}`),
    "",
    "Opened by [actions-twice](https://github.com/kaikowa2017/actions-twice).",
  ].join("\n");

  await octokit.request("POST /repos/{owner}/{repo}/pulls", {
    owner,
    repo,
    title: "fix: GitHub Actions running twice on the same commit",
    head: branch,
    base: defaultBranch,
    body,
  });
}

async function processRepo(
  app: App,
  installationId: number,
  owner: string,
  repo: string
): Promise<void> {
  const octokit = await app.getInstallationOctokit(installationId);

  const { data: repoData } = await octokit.request("GET /repos/{owner}/{repo}", {
    owner,
    repo,
  });
  const defaultBranch = repoData.default_branch || "main";

  const files = await listWorkflowFiles(octokit, owner, repo);
  const findings: Array<{
    path: string;
    fixedYaml: string;
    classification: string;
    reason: string;
  }> = [];

  for (const file of files) {
    const result = classifyWorkflow(file.content);
    if (result.classification !== "hard" && result.classification !== "soft") continue;
    const fixed = fixWorkflow(file.content, defaultBranch);
    if (!fixed.fixed) continue;
    findings.push({
      path: file.path,
      fixedYaml: fixed.yaml,
      classification: result.classification,
      reason: result.reason,
    });
  }

  if (findings.length > 0) {
    await openFixPullRequest(octokit, owner, repo, defaultBranch, findings);
  }
}

export async function POST(request: NextRequest) {
  const missing = missingConfig();
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: "GitHub App not configured",
        message: `Missing env: ${missing.join(", ")}. Set APP_ID, PRIVATE_KEY, and WEBHOOK_SECRET to enable the webhook.`,
      },
      { status: 501 }
    );
  }

  const app = getApp();
  if (!app) {
    return NextResponse.json(
      { error: "GitHub App not configured", message: "Could not initialize Octokit App." },
      { status: 501 }
    );
  }

  const payload = await request.text();
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  const eventName = request.headers.get("x-github-event") ?? "";

  try {
    await app.webhooks.verify(payload, signature);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (eventName === "installation" && body.action === "created") {
      const installation = body.installation as { id: number };
      const repos = (body.repositories as Array<{ name: string; full_name: string }>) ?? [];
      for (const r of repos) {
        const [owner, name] = r.full_name.split("/");
        if (owner && name) {
          await processRepo(app, installation.id, owner, name);
        }
      }
    }

    if (eventName === "installation_repositories" && body.action === "added") {
      const installation = body.installation as { id: number };
      const repos =
        (body.repositories_added as Array<{ name: string; full_name: string }>) ?? [];
      for (const r of repos) {
        const [owner, name] = r.full_name.split("/");
        if (owner && name) {
          await processRepo(app, installation.id, owner, name);
        }
      }
    }

    if (eventName === "push") {
      const installation = body.installation as { id: number } | undefined;
      if (!installation?.id) {
        // Never touch repos without an installation context
        return NextResponse.json({ ok: true, skipped: "no installation" });
      }
      const repository = body.repository as { name: string; owner: { login: string } };
      const commits = (body.commits as Array<{ added: string[]; modified: string[] }>) ?? [];
      const touched = new Set<string>();
      for (const c of commits) {
        for (const p of [...(c.added ?? []), ...(c.modified ?? [])]) {
          if (isWorkflowPath(p)) touched.add(p);
        }
      }
      if (touched.size > 0) {
        await processRepo(app, installation.id, repository.owner.login, repository.name);
      }
    }
  } catch (err) {
    console.error("webhook processing error", err);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const missing = missingConfig();
  if (missing.length > 0) {
    return NextResponse.json(
      {
        status: "not configured",
        message: `Missing env: ${missing.join(", ")}`,
      },
      { status: 501 }
    );
  }
  return NextResponse.json({ status: "ok" });
}
