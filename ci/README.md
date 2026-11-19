# Closing-soon reminder workflow (pending move)

`push-closing.yml` here is the GitHub Actions workflow that calls `GET /api/cron/push-closing` every 15 minutes (and on `workflow_dispatch`) with `Authorization: Bearer ${{ secrets.CRON_SECRET }}`.

It lives here only because the token that opened this PR lacks GitHub's `workflow` scope, which is required to create files under `.github/workflows/`. To enable it, after adding the repo secret `CRON_SECRET` (the same value as the Vercel env, as part of the later push setup list):

```bash
mkdir -p .github/workflows && git mv ci/push-closing.yml .github/workflows/push-closing.yml && git rm ci/README.md
```

GitHub only runs scheduled workflows from the default branch, and only once the file is under `.github/workflows/`. The route is safe to call at any frequency because of the per-bet claim. If the secret is missing, the workflow prints a short notice and exits 0.
