# Changelog

## [Unreleased]

## [0.12.0] - 2026-05-06

### Breaking

- **Node.js minimum bumped to 22** — `engines.node` raised to `>=22.0.0`. Node.js 20 reached EOL on 2026-04-30 and was no longer covered by CI matrix (which ran 22.x/24.x). Users on Node 20 must upgrade.

### Security

- **Dependencies updated to clear major published advisories** — `@modelcontextprotocol/sdk` `^1.20.0` → `^1.29.0` (clears `GHSA-w48q-cv73-mx4w`, `GHSA-345p-7cg4-v4c7`, `GHSA-8r9q-7v3j-jr4g`); `axios` `^1.12.2` → `^1.16.0` (clears 16 advisories including `GHSA-43fc-jf86-j433`, `GHSA-5c9x-8gcm-mpgx`, `GHSA-pmwg-cvhr-8vh7`, `GHSA-q8qp-cvcw-x6jj`, `GHSA-pf86-5x62-jrwf`, `GHSA-6chq-wfr3-2hj9` and others); transitive cleanup via `npm audit fix` removes `flatted`, `minimatch`, `picomatch`, `js-yaml`, `ajv`, `brace-expansion` advisories. A separate moderate `ip-address` advisory (`GHSA-v2v4-37r5-5v8g`) remains transitively pulled by `@modelcontextprotocol/sdk` → `express-rate-limit` and only affects unused HTML-emitting methods on the SDK side.
- **Path traversal hardening in `issue_attachment_upload`** — uploaded file paths are now resolved against `YOUTRACK_OUTPUT_DIR` and absolute / `..`-traversal segments are rejected with `UnsafePathError`, mirroring the existing safeguards on `saveToFile` / `downloadToFile`.
- **YQL injection in `issues_search`** — user-supplied literals that flow into YouTrack search queries are now properly quoted/escaped; raw concatenation has been removed.
- **SSRF mitigation in attachment URLs** — `attachment.url` is validated against the configured YouTrack base host; off-host redirects are rejected before the HTTP client follows them.
- **Local OAuth tokens stay out of `temp/`** — clarified handling so transient credentials are never written to the repo working tree.

### Fixed

- **`updateWorkItem` no longer loses data on transient failures** — previously deleted the existing record before creating the new one; if the create call failed (network/5xx) the original record was lost. Now creates the new record first and only deletes the previous one after success. If cleanup of the previous record fails, the error message contains both the new id and the orphaned id for manual reconciliation.
- **`file-download` `maxBytes` is now enforced precisely** — early-exit happens at exactly the configured byte boundary instead of one chunk later.
- **Date format consistency in YQL queries** — work-item / search filters now serialize dates the way the YouTrack API expects, eliminating off-by-one matches at day boundaries.
- **`generateWorkItemReport` handles empty periods** — when the period has no work items the report now returns an empty `days` array with zeroed totals instead of failing on undefined boundaries.
- **`streaming-client` no longer leaks sockets** — partial-file cleanup paths now also tear down the underlying HTTP socket on error / timeout / abort.

### Performance

- **`createIssue` creates links in parallel** — when `links[]` is provided the post-creation cascade now uses `processBatch` instead of awaiting each link sequentially.
- **`filterIssuesByUserActivity` rebuilt around `Map`** — replaces O(n²) array lookups with O(n) hashed access.
- **Holidays lookup switched to `Set`** — `filterWorkingDays` and the report builder now use a `Set<string>` for holiday membership instead of an array scan.
- **`existsSync` replaced with `fs.access`** — removes synchronous filesystem calls from hot paths.

### Changed (internal)

- **`YoutrackClient` split into `base.ts` + 13 domain mixins** — `src/youtrack-client/index.ts` shrank from a 3397-line monolith to a 33-line mixin assembler. New domain files: `attachments.ts`, `users-projects.ts`, `articles.ts`, `comments.ts`, `stars.ts`, `state.ts`, `links.ts`, `core.ts`, `batch.ts`, `activities.ts`, `issue-search.ts`, `workitems.ts`. `YoutrackClientBase` exports the shared HTTP/cache/utility surface that every mixin depends on.
- **Unified `createToolHandler` across all MCP tools** — every tool registration now goes through the same factory; common zod fragments (`saveToFile`, `format`, `briefOutput`) are shared.
- **Lint pipeline tuned** — `parserOptions.projectService` (lazy TS Language Service) replaces eager project loading and `eslint --cache` is enabled. Cold lint now uses ~210 MB instead of >4 GB; warm runs are seconds.
- **Typed `$type` discriminators for YouTrack entities** and a single `customFieldsWithEvents` constant remove duplicated literal lists.
- **`searchIssuesByUserActivityStrict` pipeline deduplicated** — strict and simple variants now share the same builder.

### Added

- **`format` npm script and `.editorconfig`** for consistent editor / formatter behavior.
- **CI**: `npm test` step and `timeout-minutes: 20` on publish / CI jobs.
- **Tests**: `nock.disableNetConnect()`, explicit `testTimeout`, vitest pool limits.
- **Dependabot** configuration; clearer error when `YOUTRACK_*` config is missing or invalid.
- **Project Structure** section in README plus `CONTRIBUTING.md`.

### Migration Notes

- Verify your runtime is Node.js ≥ 22 before upgrading.
- If you import from `src/youtrack-client/index.ts` directly (not the public `dist/` API), update imports — the file is now an assembler; types live in `base.ts` and the per-domain mixin files.
- File paths passed to `issue_attachment_upload` must now be relative to `YOUTRACK_OUTPUT_DIR` (or absolute paths within it). Paths containing `..` segments are rejected.

## [0.11.0] - 2026-05-05

### Breaking

- **`processBatch` contract** — multiple rejections now propagate as `AggregateError` (single rejection still rethrown as-is). Callers that need partial-success semantics must collect results inside the job and not throw.
- **Path safety for file outputs** — `saveToFile` and `downloadToFile` paths are resolved against the new `YOUTRACK_OUTPUT_DIR` environment variable; absolute paths and `..` traversal segments are now rejected with `UnsafePathError`.
- **`workitem_delete` and `issue_link_delete`** require an explicit `confirmation: true` literal (mirrors the existing `issue_attachment_delete` guard).
- **Pagination** — read tools now expose explicit `limit`/`skip` parameters that are forwarded as `$top`/`$skip` on the server. Aggregated count fields renamed from `total` to `returned` to clarify per-page semantics. Default page size is 100 (max 200).
- **Tool responses** — `structuredContent` branch is no longer emitted; all responses are JSON-encoded text content via `toolSuccess`/`toolError`.

### Added

- **`YOUTRACK_OUTPUT_DIR`** environment variable for file outputs (defaults to current working directory).
- **`issue_status` / `issues_status`** lightweight state lookup tools backed by a new `getIssueState` client method.
- Public client API: `searchIssues`, `searchArticles`, `getBaseUrl`, `getOutputDir` so other modules can compose YouTrack queries without touching internals.
- HTTP timeouts and redirect/body limits in the YouTrack client.
- Single-flight caching for `listProjects` and `listLinkTypes` to deduplicate concurrent calls.
- `issue_activities` accepts `categories[]` and applies `$top`/`$skip` on the server.
- All read tools now describe themselves with the AGENTS.md Purpose / Use cases / Parameter examples / Response fields / Limitations template.

### Fixed

- **URL safety** — every path segment derived from issue codes, comment ids, attachment ids, login or project shortName goes through `encodeURIComponent`; id-like inputs are validated by regex schemas in `src/utils/validators.ts`.
- **`resolveIssueId`** is now applied consistently to mutations and bulk getters (`createIssueComment`, `updateIssue`, `changeIssueState`, `starIssue`/`unstarIssue`, `getIssues`, etc.).
- **Streaming JSONL** download via `stream-json` with proper partial-file cleanup on error/timeout/abort.
- **`deleteIssueLink`** falls back to `linkToDelete.issue.idReadable` when `targetId` is not provided (subtask removal).
- **`normalizeError`** whitelists error details (`error`, `error_description`, `message`, `code`) instead of forwarding raw payloads to clients.
- **Tool descriptions** brought to a consistent compact template across all 50+ tools.
- Anchored work-item date regex to `^\d{4}-\d{2}-\d{2}$`; replaced `Math.max(...dates)` with a reduce to avoid spread-arg limits.

### Migration Notes

- Set `YOUTRACK_OUTPUT_DIR` if your tooling previously relied on absolute or traversal paths in `filePath`/`downloadPath`.
- Update wrappers around `processBatch` to handle `AggregateError`.
- Add `confirmation: true` to clients that call `workitem_delete` or `issue_link_delete`.
- Read tools that aggregated multiple pages must walk pagination via `limit`/`skip` and consume the `returned` field.

## [0.10.2] - 2025-11-18

### Added
- **YouTrack attachment tools** - Comprehensive attachment management:
  - `issue_attachment_upload`: Upload one or more files to a YouTrack issue, with file existence validation and optional notification muting
  - `issue_attachment_download`: Get download information including signed URL for direct file access without additional authentication
  - `issue_attachment_delete`: Secure deletion with mandatory confirmation parameter to prevent accidental removal
  - `issue_attachment_get`: Detailed information about specific attachments including metadata and file properties
  - `issue_attachments_list`: Retrieve metadata for all files attached to an issue with proper pagination support

### Changed
- Enhanced file storage functionality with streaming capabilities
- Updated all tools documentation in README files with new attachment parameters
- Improved YouTrack client with comprehensive attachment API support

## [0.10.1] - 2025-11-17

### Added
- **Streaming functionality** - Direct HTTP response to file without memory accumulation:
  - New `streaming-client.ts` utility for handling large data streams
  - `streamHttpToFile` function with JSON/JSONL format support
  - Direct stream from HTTP response to file to prevent memory issues
- **Issue status tools** - Get issue state/status information:
  - `issue_status` tool: Get status of a single YouTrack issue
  - `issues_status` tool: Get status of multiple YouTrack issues (batch mode, max 50)
  - Returns State field values for issues
- **Enhanced file storage** - JSON/JSONL format support with overwrite options:
  - `format` parameter: Output format when saving to file (json or jsonl)
  - `overwrite` parameter: Allow overwriting existing files
  - Streaming support for large datasets to prevent memory issues
  - Updated file storage utilities with proper streaming implementation
- **Enhanced issue retrieval** - Include custom fields and additional metadata:
  - Added created, updated, reporter, updater fields to default issue queries
  - Added customFields with possibleEvents support when requested
  - Improved issue lookup with comprehensive field coverage

### Changed
- Updated all tools documentation in README files with new parameters
- Enhanced file storage functionality with streaming capabilities
- Improved YouTrack client with streaming and custom fields support

## [0.10.0] - 2025-11-04

### Changed
- Removed YOUTRACK_USE_STRUCTURED_CONTENT environment variable support
- All MCP responses now consistently return data in content node instead of optional structured content
- Updated tool response functions to always use text content format

## [0.9.0] - 2025-10-21

### Added

- **File storage functionality** - Save large tool results to JSON files instead of returning directly:
  - `saveToFile` and `filePath` parameters added to multiple tools for handling large datasets
  - New `file-storage.ts` utility module for managing file operations
  - Automatic file path generation with timestamp-based naming
  - Directory creation support for custom file paths
  - Applied to: issue comments, issue lookups, issue details, user lists, workitem reports, article searches, and activity tools
  - Useful for processing large datasets that exceed response size limits

## [0.8.0] - 2025-10-31

### Added

- **User activity feed** - `users_activity` tool for comprehensive activity tracking:
  - Author-centric activity feed backed by `/api/activities`
  - Filter activities by author, date range, and activity categories
  - Support for pagination with limit and skip parameters
  - Activity categories: CustomFieldCategory (field changes), CommentsCategory (comments), AttachmentsCategory (attachments), LinksCategory (issue links), VcsChangeActivityCategory (VCS changes), WorkItemsActivityCategory (work items)
  - Returns detailed activity items with timestamps, authors, and change details
  - Useful for auditing teammate updates, tracking deployment timelines, and analyzing collaboration patterns

## [0.7.4] - 2025-10-24

### Added

- **Enhanced issue search filtering** - `issues_search` tool now supports multiple filter parameters:
  - `projects`: Filter by project short names (array)
  - `assignee`: Filter by assignee login
  - `reporter`: Filter by reporter/author login
  - `state`: Filter by state/status
  - `type`: Filter by issue type
  - Filters are combined with YouTrack Query Language for precise results

### Changed

- Documentation: Updated README.md and README-ru.md with new search filter parameters
- Query building: Improved logic in issue-search-tools.ts to handle multiple filters

## [0.7.3] - 2025-10-23

### Fixed

- Versioning: Corrected package.json and package-lock.json to reflect 0.7.3
- Documentation: Verified README.md and README-ru.md TOC presence
- Release Process: Followed full checklist from README-release.md including annotated tag creation and validation

## [0.7.2] - 2025-10-23

### Changed

- Documentation: Verified and aligned README.md and README-ru.md TOCs according to AGENTS.md and README-release.md requirements
- Code Review: Applied internal consistency checks per `ai-prompts/code-review.md` (no `any`, proper destructuring, DRY compliance)
- Build & Lint: Confirmed successful `npm run build` and `npx eslint .` with no errors
- Release Process: Prepared for automated GitHub Actions release following `README-release.md` procedure

## [0.7.1] - 2025-10-23

### Added

- Issues: Introduced `issues_list` and `issues_count` MCP tools for paginated listings and per-project totals with comprehensive filtering and sorting controls
- Query builder: Added `buildIssueQuery` utility to generate consistent search filters with project resolution support

### Changed

- Concurrency: Refined issue retrieval flows to reuse MutexPool-based batching so list/count operations honour concurrency limits across all underlying requests
- Types & client: Expanded issue-related types and YouTrack client methods to surface pagination metadata and per-project counts
- Documentation: Updated README (EN/RU) tool tables with new listing/counting capabilities and clarified usage guidance

## [0.7.0] - 2025-10-21

### Added

- Issue links: Introduced `issue_links`, `issue_link_types`, `issue_link_add`, and `issue_link_delete` MCP tools covering list, metadata, creation, and deletion flows with controlled per-issue mapping

### Changed

- Documentation: Added "Issue Links" section to README files describing new tooling and usage guidance

## [0.6.0] - 2025-10-21

### Added

- Issues: `issue_details` now supports `briefOutput` flag; full mode returns `customFields` including `State` for richer metadata

### Changed

- MCP responses: Switched default to `YOUTRACK_USE_STRUCTURED_CONTENT=true` with unified response shaping; updated docs accordingly
- MCP internals: Centralized compact/structured content handling and simplified tool responses

## [0.5.1] - 2025-10-21

### Changed

- Documentation: Regenerated README TOCs (EN/RU) and fixed Code config snippet duplication

## [0.5.0] - 2025-10-18

### Added

- **Issue starring** - Star/unstar issues to mark important items:
  - `issue_star`: Add star to issue for current user (idempotent operation)
  - `issue_unstar`: Remove star from issue for current user (idempotent operation)
  - `issues_star_batch`: Batch starring up to 50 issues with concurrency control
  - `issues_unstar_batch`: Batch unstarring up to 50 issues with concurrency control
  - `issues_starred_list`: Get all starred issues with pagination (default 50, max 200)
  - New field `watchers(hasStar)` in all issue responses to indicate star status
- **Concurrency control** - Efficient batch operation processing:
  - Added `@vitalyostanin/mutex-pool` dependency for managing concurrent API requests
  - Implemented `processBatch` helper method with configurable concurrency limit (default: 10)
  - Prevents API overload and timeout issues in batch operations
  - Applied to all batch tools: comments fetching, issue lookups, starring operations

### Changed

- Refactored all batch operations to use MutexPool for concurrency limiting:
  - `issues_comments`: Now processes up to 10 issues concurrently instead of unlimited
  - `issues_lookup`: Limited to 10 concurrent requests for better stability
  - `issues_details`: Controlled concurrency prevents API rate limiting
- Enhanced issue field definitions with array-based formatting for better maintainability
- Improved code organization with consistent result handling patterns

## [0.4.0] - 2025-10-17

### Added

- **Compact mode configuration** - `YOUTRACK_COMPACT_MODE` environment variable:
  - Control tool response format (compact vs. verbose)
  - Default: `true` (compact mode enabled)
  - Set to `false` for verbose responses with full field details
  - Improves performance and reduces token usage in Claude Code

### Changed

- Documentation improvements:
  - Enhanced post-release verification section in README-release.md
  - Added VS Code Cline setup instructions
  - Unified `@latest` usage in npx examples across documentation
- Refactored strict mode handling in YouTrack client for better maintainability

## [0.3.1] - 2025-10-16

### Fixed

- Package configuration: `package.json` now correctly included in published npm package
- Documentation: Improved installation guide with npx usage examples

## [0.3.0] - 2025-10-16

### Added

- **Issue comment updates** - `issue_comment_update` tool for editing existing comments:
  - Update comment text with markdown support
  - Change formatting mode (markdown/plain text)
  - Optional mute update notifications
  - Returns updated comment with metadata (id, text, author, timestamps, commentUrl)
- **Issue activity tracking** - `issue_activities` tool for viewing complete change history:
  - Track all field changes, comments, attachments, links, VCS changes
  - Filter by author, date range, and activity categories
  - Support for pagination with limit and skip parameters
  - Returns detailed activity items with timestamps, authors, and change details
- **State machine transitions** - `issue_change_state` tool for status updates:
  - Change issue state through workflow transitions (e.g., 'Open' → 'In Progress')
  - Automatic validation of allowed transitions based on workflow rules
  - Case-insensitive state name matching
  - Returns information about previous state, new state, and transition used
- **Folded sections support** - Enhanced markdown capabilities:
  - Support for `<details>/<summary>` tags in descriptions and comments
  - Useful for hiding logs, code examples, and large content blocks
  - Documented in all relevant tool descriptions

### Fixed

- Issue comment link generation in responses
- Version display now uses package.json version directly

### Changed

- Restructured features list in documentation as bullet points for better readability
- Updated tool descriptions to document folded sections support
- Enhanced AGENTS.md with documentation about markdown folded sections

## [0.2.0] - 2025-10-14

### Added

- **Attachment management** - Full support for working with issue attachments:
  - `issue_attachments_list`: Get list of all attachments for an issue with metadata
  - `issue_attachment_get`: Get detailed information about a specific attachment
  - `issue_attachment_download`: Get signed download URL for attachment (no auth required)
  - `issue_attachment_upload`: Upload multiple files to an issue (max 10 files per request)
  - `issue_attachment_delete`: Delete attachment with mandatory confirmation parameter
- File size formatting in attachment responses (e.g., "1.2 MB", "120.6 KB")
- Safety mechanism for destructive operations:
  - Attachment deletion requires explicit `confirmation: true` parameter
  - Clear error messages when confirmation is missing or false
  - Attachment name included in deletion response for verification
- File validation before upload (checks file existence on local filesystem)
- Support for muting update notifications when uploading attachments

- Markdown formatting support via `usesMarkdown` parameter in issue tools:
  - `issue_create`: Create issues with Markdown-formatted descriptions
  - `issue_update`: Update issues with Markdown-formatted descriptions
  - `issue_comment_create`: Add comments with Markdown formatting
- Markdown formatting support via `usesMarkdown` parameter in work item tools:
  - `workitem_create`: Create work items with Markdown-formatted descriptions
  - `workitem_create_idempotent`: Create work items without duplicates with Markdown support
  - `workitem_update`: Update work items with Markdown-formatted descriptions
  - `workitems_create_period`: Batch create work items with Markdown formatting
- Markdown formatting support via `usesMarkdown` parameter in article tools:
  - `article_create`: Create articles with Markdown-formatted content
  - `article_update`: Update articles with Markdown-formatted content
- Rendered content preview support via `returnRendered` parameter in article tools:
  - `article_create`: Get rendered preview when creating articles
  - `article_update`: Get rendered preview when updating articles
  - `article_search`: Get rendered preview in search results
- New response fields for better content presentation:
  - `wikifiedDescription` and `usesMarkdown` fields in issue responses
  - `textPreview` and `usesMarkdown` fields in comment responses
  - `contentPreview` and `usesMarkdown` fields in article responses
- Enhanced development guidelines in AGENTS.md:
  - Requirements for comprehensive MCP tool descriptions with usage hints
  - Requirements for pagination in all tools returning large result sets
  - Instructions for maintaining English and Russian documentation in sync

### Changed

- Updated all MCP tool descriptions to include new fields in response documentation
- Improved configuration parsing in `src/config.ts` for better readability
- Enhanced AGENTS.md with clearer guidelines for tool development and documentation
- Refined code formatting in `src/server.ts` for consistency

### Changed

- Updated README.md with attachment tools documentation
- Added "Important Notes" section in README.md for destructive operations
- Bumped version to 0.2.0 (minor version update - new functionality)

### Technical

- Added `form-data` dependency for multipart/form-data uploads
- New types in `src/types.ts` for attachment operations
- New mapper functions in `src/utils/mappers.ts` for attachment data transformation
- New client methods in `src/youtrack-client.ts` for attachment API calls
- New tool registration file `src/tools/attachment-tools.ts`

## [0.1.0] - 2025-10-13

### Added

- Initial release of YouTrack MCP Server
- Comprehensive YouTrack integration via Model Context Protocol
- Issue management tools (lookup, details, comments, create, update, assign)
- Work item tracking with detailed reports
- User activity search with two filter modes (fast and precise)
- Knowledge base article management
- Project and user management tools
- Holiday and pre-holiday configuration support
- User alias mapping for assignee selection
- Timezone configuration for date operations
- Batch operations for work items
- Comprehensive reporting tools for work items

[0.10.2]: https://github.com/VitalyOstanin/youtrack-mcp/compare/v0.10.1...v0.10.2
[0.10.1]: https://github.com/VitalyOstanin/youtrack-mcp/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/VitalyOstanin/youtrack-mcp/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/VitalyOstanin/youtrack-mcp/compare/v0.8.0...v0.9.0
[0.7.3]: https://github.com/VitalyOstanin/youtrack-mcp/compare/v0.7.2...v0.7.3
[0.7.2]: https://github.com/VitalyOstanin/youtrack-mcp/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/VitalyOstanin/youtrack-mcp/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/VitalyOstanin/youtrack-mcp/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/VitalyOstanin/youtrack-mcp/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/VitalyOstanin/youtrack-mcp/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/VitalyOstanin/youtrack-mcp/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/VitalyOstanin/youtrack-mcp/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/VitalyOstanin/youtrack-mcp/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/VitalyOstanin/youtrack-mcp/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/VitalyOstanin/youtrack-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/VitalyOstanin/youtrack-mcp/releases/tag/v0.1.0
