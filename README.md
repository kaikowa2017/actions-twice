# actions-twice

Find and fix **GitHub Actions running twice** on the same commit（**GitHub Actions が2回走る**）.

When a workflow listens to both `push` and `pull_request` and `push` is not limited to `main`/`master`, a same-repo PR schedules CI twice. This app detects that pattern and opens a fix PR that scopes `push` to the default branch.

## Setup: create a GitHub App

1. Open [GitHub → Settings → Developer settings → GitHub Apps → New GitHub App](https://github.com/settings/apps/new).
2. **Webhook URL**: `https://<your-deploy>/api/github/webhook`
3. **Webhook secret**: generate a random string; set as `WEBHOOK_SECRET`.
4. **Permissions**:
   - Repository permissions: **Contents** Read & write, **Pull requests** Read & write, **Metadata** Read-only
5. **Subscribe to events**: `Installation`, `Installation repositories`, `Push` (and `Pull request` if you want PR-related signals later).
6. After creating the app, note the **App ID**, generate a **private key** (`.pem`), and set the public slug (from the app URL `https://github.com/apps/<slug>`).

## Environment variables

Copy `.env.example` to `.env.local`:

| Variable | Purpose |
| --- | --- |
| `APP_ID` | GitHub App ID |
| `PRIVATE_KEY` | PEM private key (use `\n` for newlines in env hosts) |
| `WEBHOOK_SECRET` | Webhook secret |
| `NEXT_PUBLIC_GITHUB_APP_SLUG` | App slug for the Install CTA |

If app credentials are missing, the webhook route returns **501** with a clear message; the landing page still works.

## Develop

```bash
npm install
npm test
npm run dev
```

## Build

```bash
npm run build
npm start
```

## Classifier (summary)

| Result | Meaning |
| --- | --- |
| **hard** | `on` has both `push` and `pull_request`; push not limited to main/master; no same-repo skip-if |
| **soft** | hard pattern + top-level `concurrency` (still scheduled twice) |
| **fixed** | push branches only main/master (including quoted `"main"`), or a real skip-if for same-repo PRs |
| **ok** | not the double-run pattern (e.g. PR-only; do not flag merely for `pull_request_target`) |

Typical fix: scope `push` to the default branch; leave `pull_request` for feature branches.

## License

MIT
