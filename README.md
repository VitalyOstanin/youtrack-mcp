# YouTrack MCP Server

MCP server for comprehensive YouTrack integration. Manage issues, track work items with detailed reports, search by user activity, work with knowledge base articles, and access projects and users. Supports time tracking with holiday/pre-holiday configuration, batch operations, and structured responses for AI clients.

## Table of Contents

- [YouTrack MCP Server](#youtrack-mcp-server)
  - [Table of Contents](#table-of-contents)
  - [Requirements](#requirements)
  - [Installation](#installation)
  - [Running the server (stdio)](#running-the-server-stdio)
  - [Configuration for Code (Recommended)](#configuration-for-code-recommended)
  - [Configuration for Claude Code CLI](#configuration-for-claude-code-cli)
  - [MCP Tools](#mcp-tools)
    - [Service](#service)
    - [Issues](#issues)
    - [Work Items](#work-items)
    - [Users and Projects](#users-and-projects)
    - [Articles](#articles)
    - [structuredContent Examples](#structuredcontent-examples)
    - [Search](#search)
  - [Build](#build)
  - [Development](#development)
  - [Progress Log](#progress-log)

## Requirements

- Node.js ≥ 20
- Environment variables:
  - `YOUTRACK_URL` — base URL of YouTrack instance
  - `YOUTRACK_TOKEN` — permanent token with read permissions for issues and work items
  - `YOUTRACK_TIMEZONE` — optional timezone for date operations (default: `Europe/Moscow`), must be a valid IANA timezone identifier (e.g., `Europe/London`, `America/New_York`, `Asia/Tokyo`)
  - `YOUTRACK_HOLIDAYS` — optional comma-separated list of holiday dates (format `YYYY-MM-DD`), excluded from reports and batch operations
  - `YOUTRACK_PRE_HOLIDAYS` — optional comma-separated list of pre-holiday dates with reduced working hours
  - `YOUTRACK_USER_ALIASES` — optional comma-separated list of `alias:login` mappings (e.g., `me:vyt,petya:p.petrov`), used for automatic assignee selection

## Installation

### Using npx (Recommended)

You can run the server directly with npx without installation:

```bash
YOUTRACK_URL="https://youtrack.example.com" \
YOUTRACK_TOKEN="perm:your-token-here" \
npx -y @vitalyostanin/youtrack-mcp
```

### Using Claude MCP CLI

Install using Claude MCP CLI:

```bash
claude mcp add --scope user youtrack-mcp npx -y @vitalyostanin/youtrack-mcp
```

After running this command, you'll be prompted to enter your YouTrack URL and token.

**Scope Options:**
- `--scope user`: Install for current user (all projects)
- `--scope project`: Install for current project only

**Removal:**

```bash
claude mcp remove youtrack-mcp --scope user
```

### Manual Installation (Development)

```bash
npm install
npm run build
```

## Running the server (stdio)

```bash
YOUTRACK_URL="https://youtrack.example.com" \
YOUTRACK_TOKEN="perm:example-token" \
node dist/index.js
```

## Configuration for Code (Recommended)

To use this MCP server with [Code](https://github.com/just-every/code), add the following configuration to your `~/.code/config.toml`:

```toml
[mcp_servers.youtrack-mcp]
command = "npx"
args = ["-y", "@vitalyostanin/youtrack-mcp"]
env = { "YOUTRACK_URL" = "https://youtrack.example.com", "YOUTRACK_TOKEN" = "perm:your-token-here" }
```

**Note:** This configuration uses npx to run the published package. Alternatively, for local development, use `command = "node"` with `args = ["/path/to/dist/index.js"]`.

## Configuration for Claude Code CLI

To use this MCP server with [Claude Code CLI](https://github.com/anthropics/claude-code), you can:

1. **Use Claude MCP CLI** - see [Installation](#installation) section above
2. **Manual configuration** - add to your `~/.claude.json` file:

```json
{
  "mcpServers": {
    "youtrack-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@vitalyostanin/youtrack-mcp"],
      "env": {
        "YOUTRACK_URL": "https://youtrack.example.com",
        "YOUTRACK_TOKEN": "perm:your-token-here"
      }
    }
  }
}
```

**Note:** This configuration uses npx to run the published package. For local development, use `"command": "node"` with `"args": ["/absolute/path/to/youtrack-mcp/dist/index.js"]`. The `YOUTRACK_TIMEZONE`, `YOUTRACK_HOLIDAYS`, `YOUTRACK_PRE_HOLIDAYS`, and `YOUTRACK_USER_ALIASES` environment variables are optional.

## MCP Tools

All tools return `structuredContent` with a `success` flag and payload formatted for MCP clients.

### Service

| Tool | Description | Main Parameters |
| --- | --- | --- |
| `service_info` | Check YouTrack availability and current user | — |

### Issues

| Tool | Description | Main Parameters |
| --- | --- | --- |
| `issue_lookup` | Brief issue information | `issueId` — issue code (e.g., PROJ-123) |
| `issue_details` | Full issue data | `issueId` — issue code |
| `issue_comments` | Issue comments | `issueId` — issue code |
| `issue_create` | Create issue | `projectId`, `summary`, optionally `description`, `parentIssueId`, `assigneeLogin` |
| `issue_update` | Update existing issue | `issueId`, optionally `summary`, `description`, `parentIssueId` (empty string clears parent) |
| `issue_assign` | Assign issue to user | `issueId`, `assigneeLogin` (login or `me`) |
| `issue_comment_create` | Add comment to issue | `issueId`, `text` — comment text |
| `issue_search_by_user_activity` | Search issues with user activity | `userLogins[]` — array of user logins, optionally `startDate`, `endDate`, `dateFilterMode` (`issue_updated` fast mode or `user_activity` precise mode), `limit` (default 100, max 200). Finds issues where users updated, mentioned, reported, assigned, or commented. Fast mode filters by issue.updated field; precise mode checks actual user activity dates including comments, mentions, and field changes history (e.g., when user was assignee but later changed). In precise mode, returns `lastActivityDate` field. Sorted by activity time (newest first) |

### Work Items

| Tool | Description | Main Parameters |
| --- | --- | --- |
| `workitems_list` | Get work items for current or specified user | Optionally `issueId`, `author`, `startDate`, `endDate`, `allUsers` |
| `workitems_all_users` | Get work items for all users | Optionally `issueId`, `startDate`, `endDate` |
| `workitems_for_users` | Get work items for selected users | `users[]`, optionally `issueId`, `startDate`, `endDate` |
| `workitems_recent` | Get recent work items sorted by update time (newest first) | Optionally `users[]` (defaults to current user), `limit` (default 50, max 200) |
| `workitem_create` | Create work item entry | `issueId`, `date`, `minutes`, optionally `summary`, `description` |
| `workitem_create_idempotent` | Create work item without duplicates (by description and date) | `issueId`, `date`, `minutes`, `description` |
| `workitem_update` | Update work item (recreate) | `issueId`, `workItemId`, optionally `date`, `minutes`, `summary`, `description` |
| `workitem_delete` | Delete work item | `issueId`, `workItemId` |
| `workitems_create_period` | Batch create for date range | `issueId`, `startDate`, `endDate`, `minutes`, optionally `summary`, `description`, `excludeWeekends`, `excludeHolidays`, `holidays[]`, `preHolidays[]` |
| `workitems_report_summary` | Summary report for work items | Common parameters: `author`, `issueId`, `startDate`, `endDate`, `expectedDailyMinutes`, `excludeWeekends`, `excludeHolidays`, `holidays[]`, `preHolidays[]`, `allUsers` |
| `workitems_report_invalid` | Days with deviation from expected hours | Same parameters as summary |
| `workitems_report_users` | Work items report for list of users | `users[]` + common report parameters |
| `workitems_report` | Report structure (compatibility with older clients) | Optionally `author`, `issueId`, `startDate`, `endDate`, `expectedDailyMinutes`, `excludeWeekends`, `excludeHolidays`, `holidays[]`, `preHolidays[]`, `allUsers` |

### Users and Projects

| Tool | Description | Main Parameters |
| --- | --- | --- |
| `users_list` | List all YouTrack users | — |
| `user_get` | Get user by login | `login` — user login |
| `user_current` | Get current authenticated user | — |
| `projects_list` | List all YouTrack projects | — |
| `project_get` | Get project by short name | `shortName` — project short name |

### Articles

| Tool | Description | Main Parameters |
| --- | --- | --- |
| `article_get` | Get article by ID | `articleId` |
| `article_list` | List articles with filters | Optionally `parentArticleId`, `projectId` |
| `article_create` | Create article in knowledge base | `summary`, optionally `content`, `parentArticleId`, `projectId` |
| `article_update` | Update article | `articleId`, optionally `summary`, `content` |
| `article_search` | Search articles in knowledge base | `query`, optionally `projectId`, `parentArticleId`, `limit` |

### structuredContent Examples

```json
{
  "success": true,
  "summary": {
    "totalMinutes": 480,
    "expectedMinutes": 480,
    "totalHours": 8,
    "expectedHours": 8,
    "workDays": 1,
    "averageHoursPerDay": 8
  },
  "period": {
    "startDate": "2025-10-06",
    "endDate": "2025-10-06"
  },
  "invalidDays": []
}
```

```json
{
  "success": true,
  "item": {
    "id": "123-456",
    "date": 1765238400000,
    "duration": { "minutes": 120, "presentation": "2h" },
    "text": "Code review",
    "issue": { "idReadable": "PROJ-101" }
  }
}
```

### Search

| Tool | Description | Main Parameters |
| --- | --- | --- |
| `article_search` | Search articles in knowledge base | `query`, optionally `projectId`, `parentArticleId`, `limit` |

## Build

```bash
npm run build
```

## Development

```bash
npm run dev
```

## Progress Log

- 2025-10-13 — added holiday configuration extensions, new work item and report tools, structuredContent examples for MCP clients.
- 2025-10-13 — added `dateFilterMode` parameter to `issue_search_by_user_activity` tool with two modes: fast (`issue_updated`) filters by issue.updated field, precise (`user_activity`) checks actual user activity dates including comments, mentions, and field changes history (e.g., when user was assignee but later changed). Removed unreliable `commenter:` operator, added `reporter:` and `assignee:` operators.
