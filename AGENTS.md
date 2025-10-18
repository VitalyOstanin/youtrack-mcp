# Repository Guidelines

## Contributor Notes
- Keep source code, comments, documentation, and commit messages in English.
- Run `npm run build` and `npx eslint .` before publishing changes to ensure type-checking and linting stay green.
- When formatting or refactoring code, default to running `npx eslint --fix` (without dry-run) so lintable issues are auto-corrected early.
- Maintain `README.md` in English and `README-ru.md` in Russian so both stay aligned with the YouTrack MCP feature set.

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
- **Use professional style without emojis** in all documentation, commit messages, and code comments.
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

Run test: `npx tsx temp/test-mutex-pool.ts`

Expected output should show that no more than 3 tasks run concurrently.

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
