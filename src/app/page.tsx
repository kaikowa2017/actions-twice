import WorkflowChecker from "../components/WorkflowChecker";

const BEFORE = `name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test`;

const AFTER = `name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test`;

export default function HomePage() {
  const slug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG;
  const installHref = slug
    ? `https://github.com/apps/${slug}/installations/new`
    : null;

  return (
    <main className="space-y-10">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-blue-400">
          actions-twice
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          GitHub Actions running twice
        </h1>
        <p className="text-lg text-[var(--muted)]">
          Same commit, two workflow runs.
        </p>
      </header>

      <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 text-sm leading-relaxed">
        <h2 className="text-base font-semibold text-[var(--fg)]">Why it happens</h2>
        <p className="text-[var(--muted)]">
          When a workflow&apos;s <code className="text-[var(--fg)]">on</code> includes
          both <code className="text-[var(--fg)]">push</code> and{" "}
          <code className="text-[var(--fg)]">pull_request</code>, and{" "}
          <code className="text-[var(--fg)]">push</code> is not limited to{" "}
          <code className="text-[var(--fg)]">main</code>/<code className="text-[var(--fg)]">master</code>,
          opening a same-repo PR schedules CI twice for one commit: once for the push to
          the branch, once for the pull_request event.{" "}
          <code className="text-[var(--fg)]">concurrency</code> may cancel one run but
          does not stop the double schedule. A common fix is to scope{" "}
          <code className="text-[var(--fg)]">push</code> to the default branch and leave{" "}
          <code className="text-[var(--fg)]">pull_request</code> for feature branches.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <div className="border-b border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-medium text-[var(--bad)]">
            Before — runs twice
          </div>
          <pre className="overflow-x-auto bg-[#0d1117] p-3 text-xs leading-5 text-[var(--fg)]">
            <code>{BEFORE}</code>
          </pre>
        </div>
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <div className="border-b border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-medium text-[var(--good)]">
            After — once per commit
          </div>
          <pre className="overflow-x-auto bg-[#0d1117] p-3 text-xs leading-5 text-[var(--fg)]">
            <code>{AFTER}</code>
          </pre>
        </div>
      </section>

      <WorkflowChecker />

      {installHref ? (
        <section className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <a
            href={installHref}
            className="inline-flex items-center rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
          >
            Install the GitHub App
          </a>
          <p className="text-xs text-[var(--muted)]">
            On install (and when workflow files change), the app scans{" "}
            <code>.github/workflows</code> and opens a fix PR for hard double-run cases.
          </p>
        </section>
      ) : null}

      <footer className="border-t border-[var(--border)] pt-6 text-xs text-[var(--muted)]">
        <a href="/privacy" className="hover:text-[var(--fg)] hover:underline">
          Privacy
        </a>
        <span className="mx-2">|</span>
        <a
          href="https://github.com/kaikowa2017/actions-twice"
          className="hover:text-[var(--fg)] hover:underline"
        >
          Source
        </a>
      </footer>
    </main>
  );
}
