# Slice 0C: Next.js 16 Security Upgrade

**Date:** 2026-10-03
**Status:** Implemented and verified locally; not deployed
**Evidence ceiling:** Static/local runtime verification with mocked database-boundary tests

## Approval and scope

The owner explicitly approved a bounded major-framework update after Slice 0 found production dependency advisories rooted in Next.js 14.2.35.

Included:

- Incremental Next.js 14 to 15 to 16 migration using official codemods and upgrade guidance.
- React, React DOM, and matching type upgrades.
- Async request API migration for route `params`, page `params`/`searchParams`, and `cookies()`.
- Next.js 16 `middleware.ts` to `proxy.ts` migration.
- Migration from removed `next lint` command to ESLint 9 flat configuration.
- Compatibility fixes required to obtain a passing test, lint, type, build, and local runtime baseline.
- Dependency audit and recorded evidence.

Excluded: deployment, Vercel configuration changes, Supabase/schema changes, provider calls, production data, notification sends, GitHub issue #3 implementation or closure, and real beta/device testing.

## Version changes

| Package/runtime | Before | After |
|---|---:|---:|
| Next.js | 14.2.35 | 16.3.8 |
| React / React DOM | 18.3.1 resolved | 19.3.0 |
| React types | 18.x | 19.3.0 |
| ESLint | not configured | 9.39.5 |
| eslint-config-next | not configured | 16.3.8 |
| Node contract | implicit | `>=20.9.0` |

Primary migration references:

- [Next.js version 15 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-15)
- [Next.js version 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Next.js codemods](https://nextjs.org/docs/app/guides/upgrading/codemods)

## Delivered compatibility changes

- Converted all App Router request-time parameters to promises and awaited them.
- Awaited `cookies()` in league pages/layouts.
- Renamed the request boundary from `middleware.ts`/`middleware()` to `proxy.ts`/`proxy()` and updated its focused test.
- Updated request-boundary comments to reflect the Next.js 16 Node.js proxy runtime.
- Added ESLint flat config and replaced `next lint` with `eslint .`.
- Replaced internal plain anchors with `next/link` where required by the Next ruleset.
- Deferred three mount-time client state updates to satisfy the React 19 hooks rules without changing their user-facing conditions.
- Escaped two JSX apostrophes required by the React ruleset.
- Accepted Next.js mandatory TypeScript configuration updates.

## Build-path decision

Next.js 16 defaults production builds to Turbopack. In this managed local execution environment, Turbopack's PostCSS worker panicked because it could not bind an internal local port (`EPERM`). The same source compiled successfully with the officially supported `--webpack` fallback. The committed production build script therefore uses `next build --webpack`; development remains `next dev`.

This is a deterministic local/CI path, not evidence that Turbopack is incompatible with the application. Turbopack adoption can be reassessed separately without coupling it to the security upgrade.

## Verification results

| Check | Result | Evidence level |
|---|---|---|
| Next.js 15 checkpoint | 22 tests, typecheck, and production build passed | Static/local |
| `npm test` | Pass: 6 files, 22 tests | Static/local with mocked database boundary |
| `npm run lint` | Pass: 0 errors; 10 pre-existing unused-variable warnings | Static/local |
| `npm run build` | Pass: Next.js 16.3.8 webpack production build; 16 static pages generated | Static/local |
| `npx tsc --noEmit` | Pass after build-generated route types | Static/local |
| Local `next start` smoke | `/`, `/about`, `/create`, and `/manifest.webmanifest` each returned `200` | Static/local runtime |
| `git diff --check` | Pass | Static/local |
| `npm audit --omit=dev` | Pass: 0 production vulnerabilities | Registry audit |
| `npm audit` | 7 high findings in development-only Tailwind 3 / glob tooling paths; aggregate fix requires breaking Tailwind 4 | Registry audit; deferred |

## Evidence boundaries

This slice proves local compilation, route generation, four local HTTP responses, lint/type compatibility, dependency resolution, and mocked organizer-session behavior. It does not prove Vercel deployment, live Supabase-backed league routes, production proxy behavior, browser interaction, PWA installation, provider ingestion, or physical-device push delivery.

## Residual risks and follow-up

1. Deployment requires its own approval, preview deployment, proxy/admin smoke checks, and rollback checkpoint.
2. The full dependency tree retains development-only audit findings. Do not force-upgrade Tailwind during this slice; evaluate Tailwind 4 separately with visual regression coverage.
3. ESLint has ten non-blocking unused-variable warnings that should be cleaned up before adopting `--max-warnings=0`.
4. A parent-directory `pnpm-lock.yaml` produces a harmless Next.js root-inference warning; the repository build still resolves from its own `package-lock.json`.
5. Real Supabase integration and browser/device evidence remain later QA gates.

## Rollback

Before deployment, rollback is a normal git revert. After deployment, revert to the prior build only if its known dependency risk is explicitly accepted; otherwise prefer a corrective forward patch on Next.js 16. No database rollback is involved.
