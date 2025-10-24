# Repository Guidelines

## Contributor Notes
- Keep source code, comments, documentation, and commit messages in English.
- Run `npm run build` and `npx eslint .` before publishing changes to ensure type-checking and linting stay green.
- When formatting or refactoring code, default to running `npx eslint --fix` (without dry-run) so lintable issues are auto-corrected early.
- Maintain `README.md` in English and `README-ru.md` in Russian so both stay aligned with the YouTrack MCP feature set.
- Ensure every data-mutating MCP tool description explicitly instructs clients to re-fetch the updated entity and verify that requested properties were applied.

## Planning Workflow
- **Always create a plan document before implementation** for non-trivial tasks (new features, significant refactoring, or multi-file changes).
- **Plan documents must be stored in `temp/` directory** with descriptive filenames (e.g., `temp/issue-star-tools-plan.md`).
- **All plan documents must include a Table of Contents (TOC)** for easy navigation.
- **Rule: Documentation changes come before code changes** - When a task requires both adding new rules/guidelines and implementing them:
  1. First, update AGENTS.md with new rules and best practices
  2. Then, implement the code changes following those rules
  3. This ensures guidelines are documented before they become implicit knowledge
- Plan document structure should include:
  - Overview and motivation
  - Detailed implementation steps with file references and line numbers where applicable
  - Type definitions and interfaces
  - API endpoints and parameters
  - Error handling strategy
  - Testing approach
  - Files to be modified with estimated line counts
- Use the plan as a checklist during implementation - mark sections as completed as you progress.

## Documentation Guidelines
### Language Policy
- This AGENTS.md must always be written in English. Do not localize or translate this file.
- Examples, code snippets, and rule text in this file should remain in English for consistency across all contributors and tools.
- **STRICTLY FORBIDDEN: Never use emojis** in any documentation, commit messages, code comments, or tool responses. This applies to:
  - All Markdown files (README.md, README-ru.md, CHANGELOG.md, etc.)
  - Git commit messages
  - Code comments and documentation strings
  - MCP tool descriptions and responses
  - Release notes and GitHub releases
  - Any other project documentation
- Keep documentation clear, concise, and technically accurate.
- Focus on technical content rather than decorative elements.
- **Table of Contents (TOC) Policy**:
  - TOC is **required** for all Markdown files intended for human readers (e.g., `README.md`, `README-ru.md`, user-facing documentation, guides).
  - TOC is **not required** for instruction files for AI agents (e.g., `AGENTS.md`, `CLAUDE.md`, or similar AI instruction files).
  - Rationale: AI agents can navigate documents without TOC; humans benefit from quick navigation.
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

### TOC Exception for Robot-Facing Markdown
- Robot-facing instruction files do not require a TOC to stay compact for agent ingestion and reduce noise.
- Applies to: `AGENTS.md`, `CLAUDE.md`, and other docs intended primarily for AI agents.
- Human-facing documentation (e.g., `README.md`, `README-ru.md`, `README-release.md`, `CHANGELOG.md`) must include a TOC.

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
- When adding or modifying environment variables, update `README.md` and `README-ru.md` so setup instructions stay accurate.

## Git Commands
- **CRITICAL: Always use `--no-pager` flag with git commands** to prevent interactive pager (less/more) from blocking terminal output.
- This is especially important for commands like `git log`, `git show`, `git diff`, `git tag`, etc.
- Examples:
  - `git --no-pager log --oneline -10` instead of `git log --oneline -10`
  - `git --no-pager show HEAD` instead of `git show HEAD`
  - `git --no-pager tag -n1 v0.7.4` instead of `git tag -n1 v0.7.4`
  - `git --no-pager diff` instead of `git diff`
- Alternative: Set `GIT_PAGER=cat` environment variable for the command: `GIT_PAGER=cat git log`
- Rationale: Interactive pagers block automation and require manual intervention to exit, breaking CI/CD workflows and automated scripts.

## Coding Style & Tooling
- Project uses TypeScript + ESLint (flat config). Follow the automated lint checks; avoid disabling rules without discussion.
- Prefer modern ES/TypeScript features (`const`, optional chaining, nullish coalescing, async/await).
- Keep TypeScript types strict: no `any`, prefer precise interfaces.

## Concurrency Control for Batch Operations
- **CRITICAL: All `Promise.all()` operations on arrays must implement concurrency limiting** to prevent API overload and timeout issues.
- **Never use unlimited `Promise.all()` for external API calls** - this can cause:
  - YouTrack API rate limiting or rejection
  - Server overload with hundreds of concurrent connections
  - Memory exhaustion in Node.js
  - Unpredictable timeout failures

### Implementation Pattern
Use the `@vitalyostanin/mutex-pool` package for concurrency control:

```typescript
import { MutexPool } from '@vitalyostanin/mutex-pool';

/**
 * Process items with concurrency limit using MutexPool
 * @param items - Array of items to process
 * @param processor - Async function to process each item
 * @param limit - Maximum number of concurrent operations (default: 10)
 * @returns Array of results in original order
 */
private async processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  limit: number = 10
): Promise<R[]> {
  const pool = new MutexPool(limit);
  const results: R[] = new Array(items.length);

  // Submit all jobs to the pool
  items.forEach((item, index) => {
    pool.start(async () => {
      results[index] = await processor(item);
    });
  });

  // Wait for all jobs to complete
  await pool.allJobsFinished();

  return results;
}
```

### Usage Examples

**INCORRECT - Unlimited concurrency:**
```typescript
// BAD: Can spawn 200+ concurrent requests
const promises = issueIds.map(async (issueId) => {
  return await this.http.get(`/api/issues/${issueId}/comments`);
});
const results = await Promise.all(promises);
```

**CORRECT - Controlled concurrency with MutexPool:**
```typescript
// GOOD: Maximum 10 concurrent requests
const results = await this.processBatch(
  issueIds,
  async (issueId) => {
    const response = await this.http.get(`/api/issues/${issueId}/comments`);
    return response.data;
  },
  10 // concurrency limit
);
```

### When Concurrency Limiting is Required
- **ALWAYS** for batch operations on issue lists (e.g., fetching comments for multiple issues)
- **ALWAYS** for operations on activity/history data (can be 200+ issues)
- **ALWAYS** for batch work item creation (can be 30+ days)
- **USUALLY** for operations on user lists (though typically <10 users)

### When Concurrency Limiting is NOT Required
- Fixed small arrays (≤5 items) where total count is guaranteed
- Operations that don't make HTTP requests
- Single API call with array parameter (e.g., YouTrack search with multiple IDs)

### Recommended Concurrency Limits
- **10** - Default for most batch operations
- **5** - For resource-intensive operations (reports, bulk creates)
- **20** - Only for very lightweight read operations with proven stability

### Refactoring Priority
When reviewing code for concurrency issues, prioritize by risk:
1. **CRITICAL** - Operations that can spawn 50-200+ concurrent requests
2. **HIGH** - Operations with 20-50 concurrent requests
3. **MEDIUM** - Operations with 10-20 concurrent requests
4. **LOW** - Operations with <10 requests (consider on case-by-case basis)

### Testing Concurrency Control
Always verify that concurrency limiting works correctly:

```typescript
// Test file: temp/test-mutex-pool.ts
import { MutexPool } from '@vitalyostanin/mutex-pool';

async function testConcurrency() {
  const limit = 3;
  const pool = new MutexPool(limit);
  let currentlyRunning = 0;
  let maxConcurrent = 0;

  const tasks = Array.from({ length: 10 }, (_, i) => i);

  tasks.forEach((taskId) => {
    pool.start(async () => {
      currentlyRunning++;
      maxConcurrent = Math.max(maxConcurrent, currentlyRunning);

      console.log(`Task ${taskId} started. Running: ${currentlyRunning}, Available slots: ${pool.getSemaphoreValue()}`);

      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 100));

      currentlyRunning--;
      console.log(`Task ${taskId} finished. Running: ${currentlyRunning}`);
    });
  });

  await pool.allJobsFinished();

  console.log(`\nMax concurrent tasks: ${maxConcurrent}`);
  console.log(`Expected limit: ${limit}`);
  console.log(`Test ${maxConcurrent <= limit ? 'PASSED' : 'FAILED'}`);
}

testConcurrency();
```

### MCP Stdio Debugging Workflow
- To run the built server locally, execute `YOUTRACK_URL="https://youtrack.example.com" YOUTRACK_TOKEN="perm:example-token" node dist/index.js` (replace with real credentials).
- For rapid manual testing without a full client, you can pipe JSON-RPC messages directly:
  1. Start the server in one terminal with the environment variables above.
  2. In another terminal, send the initialization sequence by writing JSON-RPC lines directly to the server STDIN:
     ```bash
     cat <<'JSON' | YOUTRACK_URL=... YOUTRACK_TOKEN=... node dist/index.js
     {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","clientInfo":{"name":"debug","version":"0.1"},"capabilities":{}}}
     {"jsonrpc":"2.0","method":"notifications/initialized"}
     {"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"issue_create","arguments":{"projectId":"0-4","summary":"Sample","description":"Manual test"}}}
     JSON
     ```
     For interactive sessions, you can keep the process running and append more requests either via `printf '...\n' >>pipe` (using a named pipe) or by entering lines manually.
  3. After the server responds, continue sending `notifications/initialized` and subsequent `tools/call` payloads (e.g., `issue_create`, `issue_link_add`).
- When debugging complex flows, prefer writing a short Node.js script that uses `StdioClientTransport` and `Client` from `@modelcontextprotocol/sdk/dist/esm/client/index.js`. Spawn the server via `child_process.spawn`, wire its `stdin`/`stdout` to the transport, call `await client.connect()`, then invoke `client.callTool(...)` with structured arguments. This provides richer logs and automatic initialization handling.

Run test: `npx tsx temp/test-mutex-pool.ts`

Expected output should show that no more than 3 tasks run concurrently.

## MCP Response Format
- The server returns exactly one data node by default, controlled via `YOUTRACK_USE_STRUCTURED_CONTENT` (default: `"true"`).
- When `true`: return only `structuredContent` with full data, and include an empty `content: []` to satisfy MCP typing.
- When `false`: return only `content` (single `text` item with JSON string), omit `structuredContent`.
- For errors, always set `isError: true` and apply the same single-node rule (i.e., empty `content` with `structuredContent` when `true`, or text `content` when `false`).
- Use `toolSuccess`/`toolError` in `src/utils/tool-response.ts` to keep behavior consistent.

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

## Issue Creation Link Rules
- Extend `issue_create` inputs to support link descriptors with `linkType`, `targetId`, optional `direction`, and optional `sourceId` so clients can build arbitrary relationship chains during creation.
- Plain numeric identifiers provided via `parentIssueId`, `links[].targetId`, or `links[].sourceId` must resolve through `resolveIssueId`, applying `YOUTRACK_DEFAULT_PROJECT` when present so missing project prefixes do not break linking.
- After creating an issue with links, always re-fetch the created issue or its links to confirm YouTrack applied every requested relationship; tool descriptions must remind clients to perform this verification step.

## Build Artifacts
- Only `dist/` should contain compiled assets; do not commit build output.

### Pre‑Release TOC Verification (Release Rule)
- Before every release, verify that README TOCs are present and accurate:
  - Files: `README.md` and `README-ru.md`.
  - Ensure each TOC includes all `##` and `###` headings in the correct order and with proper anchors.
- Suggested quick checks:
  - Presence: `rg -n "^## Table of Contents" README.md README-ru.md`
  - Compare headers vs TOC entries:
    ```bash
    for f in README.md README-ru.md; do
      echo "== $f ==";
      echo "Headers (H2/H3):";
      rg -n "^(##|###) " "$f" | sed -E 's/^[^ ]+\s+//' | sed -E 's/^#+ //';
      echo "TOC entries:";
      rg -n "^- \\[[^\\]]+\\\\]\\(#[^)]+\\)" "$f" || true;
    done
    ```
  - If mismatches are found, update the TOC blocks in the README files accordingly.
