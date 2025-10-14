# Changelog

## [Unreleased]

### Added

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

### Removed

- "Progress Log" section from README.md and README-ru.md (historical logs moved to changelog)
- "structuredContent Examples" section from README.md and README-ru.md (examples consolidated in tool descriptions)

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

[Unreleased]: https://github.com/VitalyOstanin/youtrack-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/VitalyOstanin/youtrack-mcp/releases/tag/v0.1.0
