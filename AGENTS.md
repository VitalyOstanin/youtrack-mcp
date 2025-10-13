# Repository Guidelines

## Contributor Notes
- Keep source code, comments, documentation, and commit messages in English.
- Run `npm run build` and `npx eslint .` before publishing changes to ensure type-checking and linting stay green.
- When formatting or refactoring code, default to running `npx eslint --fix` (without dry-run) so lintable issues are auto-corrected early.

## Project Structure
- `src/`: TypeScript sources for the MCP server, YouTrack client, and tool registrations.
- `dist/`: Compiled JavaScript emitted by `npm run build` (ignored by git).
- `index.ts`: Entry point that wires the stdio transport to the server.

## Build & Development Commands
- `npm run build`: Compile TypeScript to `dist/`.
- `npm run dev`: Watch mode for local development (`tsc --watch`).
- `npx eslint --print-config <file>`: Dry-run lint config inspection (first run rule).
- After each development iteration, update progress in all documentation variants: `README.md`, `README-ru.md`, `TODO.md`, and `TODO-ru.md`, so that task lists and tool descriptions remain up-to-date in both English and Russian versions.

## Coding Style & Tooling
- Project uses TypeScript + ESLint (flat config). Follow the automated lint checks; avoid disabling rules without discussion.
- Prefer modern ES/TypeScript features (`const`, optional chaining, nullish coalescing, async/await).
- Keep TypeScript types strict: no `any`, prefer precise interfaces.

## MCP Response Format for Claude Code
- **Important**: Claude Code requires tool responses to include data in the `content` field (as text), not just in `structuredContent`.
- Per MCP specification, the `content` field has a default value (empty array) and is always present, while `structuredContent` is optional.
- The `toolSuccess` helper in `src/utils/tool-response.ts` serializes the payload as JSON into `content[0].text` for Claude Code compatibility.
- This ensures responses are visible in Claude Code (which reads `content`), while maintaining `structuredContent` for clients that prefer structured data.

## Build Artifacts
- Only `dist/` should contain compiled assets; do not commit build output.
