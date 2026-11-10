# AGENTS.md

This repository is a personal fork of [lukeautry/tsoa](https://github.com/lukeautry/tsoa), published as `@iffa/tsoa`, `@iffa/tsoa-cli` and `@iffa/tsoa-runtime`. It is customized for its maintainer's own projects. Its scope follows those projects, not upstream's users.

## Relationship to upstream

The fork has been largely refactored and rewritten since it branched from upstream in December 2025. Express 5 is the only framework (koa and hapi are gone), output is ESM, and the toolchain is TypeScript 6, Yarn 4 and tsdown. Many fixes and features exist only here.

Parity with upstream is not a goal. Assume upstream code, docs and issues describe a different codebase until you have checked the fork. The goal is to stay roughly in sync: take upstream fixes and features that matter for the fork, and skip the rest.

### Syncing from upstream

The `upstream` remote points at lukeautry/tsoa. Find the last sync in `git log --grep=upstream`; sync PR descriptions list which upstream PRs and commits they took.

- Port by behavior. Upstream patches rarely apply cleanly here. Read what a change fixes, reproduce it against the fork, and write the fork's version of the fix.
- Name every upstream PR (`lukeautry/tsoa#1234`) or commit you port in the sync PR, along with anything you adapted or left out and why.
- An upstream change that conflicts with a deliberate fork divergence stays out. Call it out to the maintainer.
- Upstream PRs that are still open can be taken early. Re-check them on the next sync. They often change before merge.

## Verification

`yarn build` comes before `yarn test`, and `yarn test` before `yarn check`. Tests import the built packages, and type-aware lint reads route files that the tests generate. CI runs the same order on Linux, macOS and Windows. Keep paths and line endings platform-neutral.

## Contributing

Read `docs/CONTRIBUTING.md` before adding tests or cutting a release. Issues and PRs for this fork go to [iffa/tsoa](https://github.com/iffa/tsoa), and PR descriptions follow `docs/PULL_REQUEST_TEMPLATE.md`.
