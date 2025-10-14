# Repository Guidelines

## Contributor Notes
- Keep source code, comments, documentation, and commit messages in English.
- Run `npm run build` and `npx eslint .` before publishing changes to ensure type-checking and linting stay green.
- When formatting or refactoring code, default to running `npx eslint --fix` (without dry-run) so lintable issues are auto-corrected early.
- Maintain `README.md` in English and `README-ru.md` in Russian so both stay aligned with the YouTrack MCP feature set.

## Documentation Guidelines
- **All Markdown files must include a Table of Contents (TOC)** after the main heading and before the first section.
- TOC should use standard Markdown anchor links (e.g., `[Overview](#overview)`).
- Include all level 2 (`##`) and level 3 (`###`) headers in the TOC for easy navigation.
- Update the TOC whenever document structure changes (new sections, renamed headers, etc.).
- Example TOC format:
  ```markdown
  ## Table of Contents
  - [Section 1](#section-1)
    - [Subsection 1.1](#subsection-11)
  - [Section 2](#section-2)
  ```

## Project Structure
- `src/`: TypeScript sources for the MCP server, YouTrack client, and tool registrations.
- `dist/`: Compiled JavaScript emitted by `npm run build` (ignored by git).
- `index.ts`: Entry point that wires the stdio transport to the server.
- `README-release.md`: Release procedure checklist in English — comprehensive guide for executing project releases.

## Build & Development Commands
- `npm run build`: Compile TypeScript to `dist/`.
- `npm run dev`: Watch mode for local development (`tsc --watch`).
- `npx eslint --print-config <file>`: Dry-run lint config inspection (first run rule).
- After modifying `package.json` dependencies, always run `npm install` to update `package-lock.json` accordingly.
- Keep documentation (`README*`, `TODO*`, ru variants when available) aligned with the current YouTrack feature set after each iteration.

## Coding Style & Tooling
- Project uses TypeScript + ESLint (flat config). Follow the automated lint checks; avoid disabling rules without discussion.
- Prefer modern ES/TypeScript features (`const`, optional chaining, nullish coalescing, async/await).
- Keep TypeScript types strict: no `any`, prefer precise interfaces.

## MCP Response Format for Claude Code
- Claude Code reads data from the MCP `content` field, so every tool response must serialize its payload there.
- The `content` array should include at least one `text` item containing the JSON stringified payload for compatibility.
- Continue providing `structuredContent` for richer clients, but never rely on it alone.
- Use `toolSuccess` in `src/utils/tool-response.ts` to ensure both `content` and `structuredContent` are populated consistently.

## MCP Tooling Expectations
- Implement pagination for every MCP tool that may return large result sets; every tool must expose explicit pagination parameters and defaults in the schema.
- Use conservative defaults (≤100 items per page unless the YouTrack API enforces a different limit) and document maximum supported sizes.

## MCP Tool Registration
- **Always use the `.tool()` method** for registering MCP tools instead of `registerTool()`.
- The `.tool()` method provides better compatibility with Claude Code MCP client and ensures proper parameter parsing.

### Method Signatures
- **Preferred**: `.tool(name, description, argsObject, handler)`
  - `name`: Tool name (string)
  - `description`: Detailed usage description (string)
  - `argsObject`: Plain object with Zod schema definitions (e.g., `{ param: z.string().describe("...") }`)
  - `handler`: Async function that receives parsed arguments

- **Avoid**: `registerTool(name, schema, handler)`
  - This older API wraps args in `z.object()`, which can cause parameter parsing issues with some MCP clients

### Tool File Export Pattern
Each tool file should export both the args object and a composed schema:
```typescript
// ✅ Correct pattern
export const issueDetailsArgs = {
  issueId: z.string().min(1).describe("Issue code (e.g., PROJ-123)"),
  // ... other parameters
};

export const issueDetailsSchema = z.object(issueDetailsArgs);

export async function issueDetailsHandler(client: YouTrackClient, rawInput: unknown) {
  const input = issueDetailsSchema.parse(rawInput);
  // ... implementation
}
```

### Registration Examples
```typescript
// ✅ CORRECT: Use .tool() with args object
import { issueDetailsArgs, issueDetailsHandler } from "./tools/issue-details.js";

this.youtrackMcpServer.tool(
  "issue_details",
  "Get detailed information about YouTrack issue. Use for: Viewing full issue details, checking assignee and status.",
  issueDetailsArgs,
  async (args) => issueDetailsHandler(this.client, args),
);

// ❌ INCORRECT: Using registerTool with schema
import { issueDetailsSchema, issueDetailsHandler } from "./tools/issue-details.js";

this.youtrackMcpServer.registerTool(
  "issue_details",
  issueDetailsSchema,
  async (args) => issueDetailsHandler(this.client, args),
);
```

### Why .tool() is Better
- Direct parameter passing without double-wrapping in `z.object()`
- Required description field encourages better documentation
- Consistent parameter structure across all tools
- Better error messages when parameters are missing or invalid

## MCP Tool Descriptions & Documentation
- **All MCP tool descriptions must include usage hints** to help users understand when and how to use each tool effectively.
- Each tool description should contain:
  - **Purpose**: Brief explanation of what the tool does (1-2 sentences).
  - **Use cases**: Bulleted list of typical scenarios where the tool is useful (e.g., "Use for: Browsing available issues, Searching issues by user activity").
  - **Parameter examples**: Concrete examples of parameter values in parameter descriptions (e.g., "Filter by state (e.g., 'opened', 'closed')").
  - **Response field explanations**: Key fields returned and their meaning, especially for non-obvious fields.
  - **Limitations**: Any constraints or edge cases users should be aware of (e.g., "max 50 issues per request").
- Keep descriptions concise but informative; prioritize clarity over brevity when it helps prevent common mistakes.
- Update tool descriptions whenever adding new parameters or changing behavior.

## Build Artifacts
- Only `dist/` should contain compiled assets; do not commit build output.
