# P2 Release Operations Checklist

This checklist captures non-code production-hardening tasks that should be completed in GitHub/Vercel/Supabase after P0/P1 code changes are merged.

## 1) GitHub repository protections

1. Open **Settings → Branches → Branch protection rules**.
2. Create a rule for `main` (or default branch).
3. Enable:
   - Require a pull request before merging.
   - Require approvals (at least 1).
   - Require status checks to pass before merging.
4. Mark these checks as required:
   - `PR Checks / checks`
   - `Security Scans / secret-scan`
   - `Security Scans / dependency-scan`

## 2) Vercel environment hygiene

For **Production**, **Preview**, and **Development** environments, set/validate:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `KMS_MASTER_KEY`
- `AI_MODEL_URL`

After updating variables, trigger a fresh deploy to ensure no stale build cache uses old values.

## 3) Supabase Auth/OAuth setup

In Supabase dashboard:

1. Open **Authentication → URL configuration**.
2. Ensure Site URL is your production Vercel domain.
3. Ensure Redirect URLs include:
   - production domain callback URLs,
   - preview domain callback URLs (if preview auth testing is required).

## 4) Secret rotation runbook

Run every 60–90 days:

1. Rotate `SUPABASE_SERVICE_ROLE_KEY` (Supabase).
2. Rotate `KMS_MASTER_KEY` (app secret manager / Vercel env var).
3. Rotate any AI provider keys behind `AI_MODEL_URL` service.
4. Update Vercel env vars.
5. Redeploy and run smoke checks.

## 5) Post-deploy smoke checks

After each production deploy, manually verify:

1. Open `/auth` and complete sign-in.
2. Confirm redirect to requested `next` route.
3. Add an inventory item.
4. Mark item consumed/wasted and verify archived behavior.
5. Add/remove shopping list item.
6. Open profile and verify no runtime errors.
7. Confirm `/api/debug-auth` is not exposed in production (expect 404).

## 6) Incident rollback reminder

If critical issue appears after deploy:

1. Roll back via Vercel to previous healthy deployment.
2. Create GitHub issue with:
   - timestamp,
   - failing route,
   - user impact,
   - reproduction steps.
3. Patch on a hotfix branch and redeploy.
