# Contributing to Sentinel

Thanks for your interest in contributing! Sentinel is MIT-licensed and welcomes contributions of all kinds.

## Quick start

```bash
git clone https://github.com/ArasHuseyin/sentinel.ai
cd sentinel
npm install
npm run build
npm test
```

## Project structure

```
src/
  api/          # act(), extract(), observe()
  agent/        # autonomous agent loop (plan → execute → verify → reflect)
  core/         # StateParser, SentinelDriver, LocatorCache, PromptCache
  utils/        # LLM providers, TokenTracker, ProxyProvider, telemetry
  cli/          # npx sentinel CLI
  mcp/          # MCP server
  recorder/     # Record & Replay
  reliability/  # Verifier
  types/        # Error classes
  __tests__/    # Jest test suite
examples/       # Runnable example scripts
```

## How to contribute

### Bug fixes

1. Open an issue describing the bug and reproduction steps
2. Fork the repo and create a branch: `git checkout -b fix/your-bug`
3. Write a failing test that reproduces the bug
4. Fix the bug
5. Confirm all tests pass: `npm test`
6. Open a PR

### New features

1. Open an issue first — discuss the feature before investing time
2. Fork and branch: `git checkout -b feat/your-feature`
3. Implement the feature with tests
4. Update docs in the relevant section of README.md if needed
5. Open a PR with a clear description of what and why

### Good first issues

## Development

```bash
npm run build        # compile TypeScript
npm test             # run full test suite (Jest)
npm run test:watch   # watch mode
npm run typecheck    # tsc --noEmit over src/ and scripts/
npm run lint         # ESLint (type-aware)
npm run format:check # Prettier
npm run verify:package # pack, install into a temp project, import as a consumer
```

Tests use [Jest](https://jestjs.io/) in ESM mode (`node --experimental-vm-modules`).
Browser-level tests require a real Chromium install (`npx playwright install chromium`).
The nightly/manual CI job runs headed browsers under Xvfb on Ubuntu 24.04.
Configure the `GEMINI_API_KEY` Actions secret before running it; the job fails
when the secret is missing so an entirely skipped suite cannot appear green.

`npm run verify:package` is the gate that catches broken packaging (a missing
`files` entry, an unresolvable subpath export). It runs in CI and on
`prepublishOnly`; run it locally before proposing anything that touches
`package.json`, `tsconfig.build.json`, or the module layout.

## Publishing releases

The Release workflow publishes version tags with npm Trusted Publishing (OIDC).
It uses Node 24 and npm 11, and does not require the `NPM_TOKEN` secret.

A package maintainer must configure the following trusted publisher in the
settings for `@isoldex/sentinel` on npm before the next release:

- Provider: GitHub Actions
- Organization or user: `ArasHueseyin`
- Repository: `sentinel.ai`
- Workflow filename: `release.yml`
- Environment: leave empty (the workflow does not use a GitHub environment)
- Allowed action: direct publishing with `npm publish`

Follow the [npm Trusted Publishing setup](https://docs.npmjs.com/trusted-publishers/).
Create a new configuration shortly before a release: npm expires configurations
that do not complete their first publish within two days. `--provenance` signs
the package; authentication comes from the separate trusted publisher setup.

After merging and validating the release commit, create a version tag matching
`package.json` and push it. A workflow dry run cannot verify npm-side trust;
successful publishing is the final check.

## Code style

- TypeScript strict mode
- No unnecessary abstractions — solve the problem at hand
- Every new public API gets a test
- Error messages should be actionable (see `buildFailureMessage` in `src/api/act.ts` as a reference)

## Commit messages

Use conventional commits:

```
feat: add WebshareProxyProvider
fix: correct scroll-to fallback for off-screen elements
docs: update SentinelOptions table
test: add runStream generator tests
```

## Pull request checklist

- [ ] Tests written and passing (`npm test`)
- [ ] TypeScript compiles without errors (`npx tsc --noEmit`)
- [ ] README updated if public API changed
- [ ] No breaking changes without prior discussion

## Questions?
