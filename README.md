# YouTrack MCP Server

[![CI](https://github.com/VitalyOstanin/youtrack-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/VitalyOstanin/youtrack-mcp/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@vitalyostanin/youtrack-mcp.svg)](https://www.npmjs.com/package/@vitalyostanin/youtrack-mcp)

MCP server for comprehensive YouTrack integration. Manage issues, track work items with detailed reports, search by user activity, work with knowledge base articles, and access projects and users. Supports time tracking with holiday/pre-holiday configuration, batch operations, and structured responses for AI clients.

## Table of Contents

- [YouTrack MCP Server](#youtrack-mcp-server)
  - [Table of Contents](#table-of-contents)
  - [Requirements](#requirements)
  - [Installation](#installation)
  - [Development & Release](#development--release)
  - [Running the server (stdio)](#running-the-server-stdio)
  - [Configuration for Code (Recommended)](#configuration-for-code-recommended)
  - [Configuration for Claude Code CLI](#configuration-for-claude-code-cli)
  - [MCP Tools](#mcp-tools)
    - [Service](#service)
    - [Issues](#issues)
    - [Work Items](#work-items)
    - [Users and Projects](#users-and-projects)
    - [Articles](#articles)
    - [Search](#search)
  - [Important Notes](#important-notes)

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

## Development & Release

### GitHub Actions Workflows

This project uses GitHub Actions for continuous integration and automated releases:

#### CI Workflow (`.github/workflows/ci.yml`)

Runs automatically on every push and pull request:
- **Triggers**: All branches, all pull requests
- **Node.js versions**: 20.x, 22.x (matrix testing)
- **Steps**:
  1. Install dependencies (`npm ci`)
  2. Run linter (`npm run lint`)
  3. Build project (`npm run build`)
  4. Verify build artifacts (executable check)

#### Publish Workflow (`.github/workflows/publish.yml`)

Runs automatically when you create a new version tag:
- **Trigger**: Git tags matching `v*` pattern (e.g., `v0.1.0`, `v1.2.3`)
- **Node.js version**: 20.x
- **Steps**:
  1. Install dependencies
  2. Build project
  3. Publish to npm registry
  4. Create GitHub Release

### Setting up NPM_TOKEN

To enable automatic publishing to npm, you need to configure the `NPM_TOKEN` secret:

1. **Generate npm Access Token**:
   - Go to [npmjs.com](https://www.npmjs.com/) and log in
   - Navigate to **Access Tokens** in your account settings
   - Click **Generate New Token** → **Classic Token**
   - Select **Automation** type (for CI/CD)
   - Copy the generated token

2. **Add Secret to GitHub**:
   - Go to your GitHub repository
   - Navigate to **Settings** → **Secrets and variables** → **Actions**
   - Click **New repository secret**
   - Name: `NPM_TOKEN`
   - Value: Paste your npm token
   - Click **Add secret**

### Release Process

To create a new release:

```bash
# 1. Update version in package.json and create git tag
npm version patch   # for 0.1.0 → 0.1.1
# or
npm version minor   # for 0.1.0 → 0.2.0
# or
npm version major   # for 0.1.0 → 1.0.0

# 2. Push the tag to GitHub
git push --follow-tags

# 3. GitHub Actions will automatically:
#    - Run tests and build
#    - Publish to npm
#    - Create GitHub Release
```

**Note**: The `npm version` command automatically:
- Updates `package.json` and `package-lock.json`
- Creates a git commit with message like "0.1.1"
- Creates a git tag like "v0.1.1"

### Manual Build & Test

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run linter
npm run lint

# Watch mode for development
npm run dev:watch
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
| `issue_create` | Create issue | `projectId`, `summary`, optionally `description`, `parentIssueId`, `assigneeLogin`, `usesMarkdown` |
| `issue_update` | Update existing issue | `issueId`, optionally `summary`, `description`, `parentIssueId` (empty string clears parent), `usesMarkdown` |
| `issue_assign` | Assign issue to user | `issueId`, `assigneeLogin` (login or `me`) |
| `issue_comment_create` | Add comment to issue | `issueId`, `text` — comment text, optionally `usesMarkdown` |
| `issue_search_by_user_activity` | Search issues with user activity | `userLogins[]` — array of user logins, optionally `startDate`, `endDate`, `dateFilterMode` (`issue_updated` fast mode or `user_activity` precise mode), `limit` (default 100, max 200). Finds issues where users updated, mentioned, reported, assigned, or commented. Fast mode filters by issue.updated field; precise mode checks actual user activity dates including comments, mentions, and field changes history (e.g., when user was assignee but later changed). In precise mode, returns `lastActivityDate` field. Sorted by activity time (newest first) |
| `issue_attachments_list` | Get list of attachments | `issueId` — issue code |
| `issue_attachment_get` | Get attachment info | `issueId`, `attachmentId` |
| `issue_attachment_download` | Get download URL for attachment | `issueId`, `attachmentId` — returns signed URL |
| `issue_attachment_upload` | Upload files to issue | `issueId`, `filePaths[]` — array of file paths (max 10), optionally `muteUpdateNotifications` |
| `issue_attachment_delete` | Delete attachment (requires confirmation) | `issueId`, `attachmentId`, `confirmation` (must be `true`) |

### Work Items

| Tool | Description | Main Parameters |
| --- | --- | --- |
| `workitems_list` | Get work items for current or specified user | Optionally `issueId`, `author`, `startDate`, `endDate`, `allUsers` |
| `workitems_all_users` | Get work items for all users | Optionally `issueId`, `startDate`, `endDate` |
| `workitems_for_users` | Get work items for selected users | `users[]`, optionally `issueId`, `startDate`, `endDate` |
| `workitems_recent` | Get recent work items sorted by update time (newest first) | Optionally `users[]` (defaults to current user), `limit` (default 50, max 200) |
| `workitem_create` | Create work item entry | `issueId`, `date`, `minutes`, optionally `summary`, `description`, `usesMarkdown` |
| `workitem_create_idempotent` | Create work item without duplicates (by description and date) | `issueId`, `date`, `minutes`, `description`, optionally `usesMarkdown` |
| `workitem_update` | Update work item (recreate) | `issueId`, `workItemId`, optionally `date`, `minutes`, `summary`, `description`, `usesMarkdown` |
| `workitem_delete` | Delete work item | `issueId`, `workItemId` |
| `workitems_create_period` | Batch create for date range | `issueId`, `startDate`, `endDate`, `minutes`, optionally `summary`, `description`, `usesMarkdown`, `excludeWeekends`, `excludeHolidays`, `holidays[]`, `preHolidays[]` |
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
| `article_create` | Create article in knowledge base | `summary`, optionally `content`, `parentArticleId`, `projectId`, `usesMarkdown`, `returnRendered` |
| `article_update` | Update article | `articleId`, optionally `summary`, `content`, `usesMarkdown`, `returnRendered` |
| `article_search` | Search articles in knowledge base | `query`, optionally `projectId`, `parentArticleId`, `limit`, `returnRendered` |

### Search

| Tool | Description | Main Parameters |
| --- | --- | --- |
| `article_search` | Search articles in knowledge base | `query`, optionally `projectId`, `parentArticleId`, `limit`, `returnRendered` |

## Important Notes

### Destructive Operations

Some operations cannot be undone and require explicit confirmation:

- **`issue_attachment_delete`** - Requires `confirmation: true` parameter. Deleted attachments cannot be recovered.
