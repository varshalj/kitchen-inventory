# Login 500 + broken inventory routing: root-cause analysis

## Scope
Analysis of recent backend refactor commits affecting API routes and Supabase wiring.

## Primary breakages

1. **Inventory route calls an undefined helper**
   - `app/api/inventory/route.ts` defines `getSupabaseFromRequest()` but calls `createSupabaseFromRequest()` in `GET`.
   - This causes a runtime reference error and leads to HTTP 500 immediately after authenticated calls.

2. **Repository signatures were changed, route handlers were not migrated**
   - `inventoryRepo` and `shoppingRepo` now expect a `SupabaseClient` as the first argument.
   - Multiple route handlers still pass `user.id` and payloads using the old call shape.
   - Result: broken item retrieval/update/delete paths and shopping/inventory operations.

3. **Type-checking currently fails across API handlers**
   - Current codebase reports multiple TypeScript errors in inventory/shopping API routes, matching runtime regressions.

4. **Profile settings module has unresolved imports/exports**
   - `components/profile-settings.tsx` imports missing symbols/modules (`@/lib/data`, `createSeedEmailAccounts`).
   - While not the login 500 root cause, this blocks healthy builds and may hide runtime routing issues behind broader compilation instability.

## Why behavior matches reported symptoms

- **"500 right after login"** is consistent with inventory route invoking an undefined function.
- **"Cannot see user-level inventory"** is consistent with repository API mismatch where user-id filtering calls were replaced by client-bound repo methods but routes were not updated.
- **"Rewiring/routing doesn't seem to work"** is consistent with refactor-incomplete endpoint handlers that no longer match repository contracts.

## Recommended fix order

1. Fix `app/api/inventory/route.ts` helper name mismatch (`createSupabaseFromRequest` -> `getSupabaseFromRequest` or import the shared helper correctly).
2. Migrate **all** route handlers to repository signatures that pass `supabase` first.
3. Re-introduce explicit user scoping (RLS policy verification and/or scoped queries) where older `user.id` arg was removed.
4. Resolve `components/profile-settings.tsx` missing imports/exports to restore full typecheck confidence.
5. Gate merges on `pnpm run typecheck`.
