# Changelog

## [Unreleased]

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

[Unreleased]: https://github.com/VitalyOstanin/youtrack-mcp/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/VitalyOstanin/youtrack-mcp/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/VitalyOstanin/youtrack-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/VitalyOstanin/youtrack-mcp/releases/tag/v0.1.0
