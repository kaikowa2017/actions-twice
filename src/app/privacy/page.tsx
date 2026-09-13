import Link from "next/link";

export const metadata = {
  title: "Privacy — actions-twice",
};

export default function PrivacyPage() {
  return (
    <main className="space-y-6">
      <p>
        <Link href="/" className="text-blue-400 hover:underline">
          ← actions-twice
        </Link>
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">Privacy</h1>
      <div className="space-y-4 text-sm leading-relaxed text-[var(--muted)]">
        <p>
          actions-twice is a GitHub App. On repositories where it is installed, it
          reads workflow files under <code className="text-[var(--fg)]">.github/workflows/</code>{" "}
          and may open pull requests that scope <code className="text-[var(--fg)]">push</code>{" "}
          triggers so CI does not run twice on the same commit.
        </p>
        <p>
          The app does not read source code outside workflow files for classification,
          does not store repository contents beyond what is needed to open a fix PR,
          and never acts on repositories where it is not installed.
        </p>
        <p>
          Webhook payloads are used only to detect installation events and pushes that
          change workflow files. Credentials (app private key, webhook secret) stay on
          the server and are not exposed to the landing page.
        </p>
      </div>
    </main>
  );
}
