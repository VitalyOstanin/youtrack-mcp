# Contributing to YouTrack MCP Server

Thanks for considering a contribution. This document covers the local setup, the
expected pre-PR checks, and how to file bugs and pull requests.

## Table of Contents

- [Quick start](#quick-start)
- [Pre-PR checks](#pre-pr-checks)
- [Coding style](#coding-style)
- [Filing bugs](#filing-bugs)
- [Filing pull requests](#filing-pull-requests)
- [Where to learn the codebase](#where-to-learn-the-codebase)

## Quick start

```bash
git clone https://github.com/VitalyOstanin/youtrack-mcp
cd youtrack-mcp
npm install
npm run build
```

For local development:

```bash
npm run dev:watch    # incremental TypeScript build
npm test             # vitest, no network (nock isolation)
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
```

There is no need to point the server at a real YouTrack instance to develop or
run tests; the test suite uses `nock` to stub HTTP traffic.

## Pre-PR checks

Before opening a PR run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

All four must succeed. CI runs the same checks on Node 22 and 24.

## Coding style

- The repo follows the rules enforced by `eslint.config.mjs`.
- Format with `npm run format` (Prettier) before committing.
- Public surface (MCP tool descriptions, environment variables, default ports)
  is part of the contract — flag any breaking change in the PR description and
  the CHANGELOG.
- Tests must pin behavior at the public surface (tool inputs/outputs, REST
  contract). Avoid asserting private internals.

## Filing bugs

Open an issue at <https://github.com/VitalyOstanin/youtrack-mcp/issues>. Useful
information:

- YouTrack version (cloud or on-prem release).
- Exact MCP tool call that misbehaves, including the JSON arguments.
- Observed result vs. expected result.
- Server log lines if available (with tokens redacted).

## Filing pull requests

- Keep the PR focused on a single concern. Larger refactors are easier to land
  as a sequence of small PRs.
- Update `CHANGELOG.md` for user-visible changes.
- Update `README.md` and `AGENTS.md` when behavior or project layout changes.
- Reference the issue the PR closes (`Fixes #123`).

## Where to learn the codebase

- [AGENTS.md](AGENTS.md) — authoritative description of the project structure
  and the conventions for adding new tools.
- [README.md](README.md) — user-oriented documentation.
- `src/__tests__/` — examples of how tools are exercised end-to-end.
