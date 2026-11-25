# Closing-soon reminder workflow (pending move)

`push-closing.yml` here is the GitHub Actions workflow that calls `GET /api/cron/push-closing` every 15 minutes (and on `workflow_dispatch`) with `Authorization: Bearer ${{ secrets.CRON_SECRET }}`.

It lives here only because the token that opened this PR lacks GitHub's `workflow` scope, which is required to create files under `.github/workflows/`. To enable it, after adding the repo secret `CRON_SECRET` (the same value as the Vercel env, as part of the later push setup list):

```bash
mkdir -p .github/workflows && git mv ci/push-closing.yml .github/workflows/push-closing.yml
```

GitHub only runs scheduled workflows from the default branch, and only once the file is under `.github/workflows/`. The route is safe to call at any frequency because of the per-bet claim. If the secret is missing, the workflow prints a short notice and exits 0.

# Tests and builds workflow (pending move)

`github-workflows/ci.yml` runs on every pull request and on pushes to `main`. It needs no secrets.

- `test-and-build` (ubuntu-latest, Node 22): `npm ci`, `CI=1 npx jest --watchAll=false`, `npm run mobile:build`.
- `mobile-build-macos` (macos-latest, Node 22): `npm ci`, `npm run mobile:build`. macOS has a case-insensitive filesystem, so this job catches imports that resolve to the wrong file only on a Mac (Linux never sees them).

Like `push-closing.yml`, it lives here only because the token that wrote it lacks GitHub's `workflow` scope. Someone with that scope should move it:

```bash
mkdir -p .github/workflows && git mv ci/github-workflows/ci.yml .github/workflows/ci.yml
```

Once both workflows are under `.github/workflows/`, remove this folder (`git rm -r ci`).

Environment: neither the Jest run nor `npm run mobile:build` needs any env vars or secrets. The Vite config reads `NEXT_PUBLIC_*` flags (result texts, ads, push, Pro early types, Terms and Privacy URLs) from the shell or `.env*` files and defaults each to empty, so CI builds the app with those features off. Set them as workflow `env` only if CI should build with a feature on. The Next web build (`npm run build`) is not in this workflow; Vercel builds it.
