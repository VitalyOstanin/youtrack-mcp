# Changelog

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
