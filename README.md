# YouTrack MCP Server

Also available in Russian: [README-ru.md](README-ru.md)

[![CI](https://github.com/VitalyOstanin/youtrack-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/VitalyOstanin/youtrack-mcp/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@vitalyostanin/youtrack-mcp.svg)](https://www.npmjs.com/package/@vitalyostanin/youtrack-mcp)

MCP server for comprehensive YouTrack integration with the following capabilities:

- **Issue management** - create, update, comment, assign, change state, batch operations
- **Issue starring** - mark important issues with stars, batch starring (up to 50), list starred issues
- **Attachment management** - upload files (up to 10), download with signed URLs, delete
- **Work items tracking** - create entries with idempotent operations, batch creation for periods
- **Detailed time reports** - summary reports, deviation analysis, multi-user statistics
- **Advanced search** - find issues by user activity with fast/precise filtering modes
- **Change history** - complete issue activity log with filtering and pagination
- **Knowledge base** - create, update, search articles with hierarchical structure
- **User and project access** - retrieve information about users and projects
- **Batch operations** - efficient processing of up to 50 issues simultaneously
- **File storage** - save large tool results to JSON files instead of returning directly
- **Additional features** - Markdown support, folded sections, holiday configuration, user aliases

## Table of Contents

- [YouTrack MCP Server](#youtrack-mcp-server)
  - [Table of Contents](#table-of-contents)
  - [Requirements](#requirements)
  - [Installation](#installation)
    - [Using npx (Recommended)](#using-npx-recommended)
    - [Using Claude MCP CLI](#using-claude-mcp-cli)
    - [Manual Installation (Development)](#manual-installation-development)
  - [Development \& Release](#development--release)
    - [GitHub Actions Workflows](#github-actions-workflows)
      - [CI Workflow (`.github/workflows/ci.yml`)](#ci-workflow-githubworkflowsciyml)
      - [Publish Workflow (`.github/workflows/publish.yml`)](#publish-workflow-githubworkflowspublishyml)
    - [Setting up NPM\_TOKEN](#setting-up-npm_token)
    - [Release Process](#release-process)
    - [Manual Build \& Test](#manual-build--test)
  - [Running the server (stdio)](#running-the-server-stdio)
  - [Configuration for Code (Recommended)](#configuration-for-code-recommended)
  - [Configuration for Claude Code CLI](#configuration-for-claude-code-cli)
  - [Configuration for VS Code Cline](#configuration-for-vs-code-cline)
  - [MCP Tools](#mcp-tools)
    - [File Storage Parameters](#file-storage-parameters)
    - [Service](#service)
    - [Issues](#issues)
    - [Issue Links](#issue-links)
    - [Issues Status](#issues-status)
    - [Issue Stars](#issue-stars)
    - [Attachments](#attachments)
    - [Work Items](#work-items)
    - [Users and Projects](#users-and-projects)
    - [Articles](#articles)
    - [Search](#search)
    - [Activity Feed](#activity-feed)
  - [Important Notes](#important-notes)
    - [Destructive Operations](#destructive-operations)

## Requirements

- Node.js ≥ 20
- Environment variables:
  - `YOUTRACK_URL` — base URL of YouTrack instance
  - `YOUTRACK_TOKEN` — permanent token with read permissions for issues and work items
  - `YOUTRACK_TIMEZONE` — optional timezone for date operations (default: `Europe/Moscow`), must be a valid IANA timezone identifier (e.g., `Europe/London`, `America/New_York`, `Asia/Tokyo`)
  - `YOUTRACK_HOLIDAYS` — optional comma-separated list of holiday dates (format `YYYY-MM-DD`), excluded from reports and batch operations
- `YOUTRACK_PRE_HOLIDAYS` — optional comma-separated list of pre-holiday dates with reduced working hours
- `YOUTRACK_USER_ALIASES` — optional comma-separated list of `alias:login` mappings (e.g., `me:vyt,petya:p.petrov`), used for automatic assignee selection
- `YOUTRACK_DEFAULT_PROJECT` — optional project code used for manual verification tasks and default parent issues in docs/examples (use `PROJ` in documentation examples)


## Installation

### Using npx (Recommended)

You can run the server directly with npx without installation:

```bash
YOUTRACK_URL="https://youtrack.example.com" \
YOUTRACK_TOKEN="perm:your-token-here" \
YOUTRACK_DEFAULT_PROJECT="PROJ" \
npx -y @vitalyostanin/youtrack-mcp@latest
```

### Using Claude MCP CLI

Install using Claude MCP CLI:

```bash
claude mcp add --scope user \
--env YOUTRACK_URL='https://youtrack.example.com' \
--env YOUTRACK_TOKEN='perm:my-token' \
youtrack-mcp -- npx -y @vitalyostanin/youtrack-mcp@latest
```

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
Add to `~/.code/config.toml`:
```toml
[mcp_servers.youtrack-mcp]
command = "npx"
args = ["-y", "@vitalyostanin/youtrack-mcp@latest"]

[mcp_servers.youtrack-mcp.env]
YOUTRACK_URL = "https://youtrack.example.com"
YOUTRACK_TOKEN = "perm:your-token-here"
```

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
      "args": ["-y", "@vitalyostanin/youtrack-mcp@latest"],
      "env": {
        "YOUTRACK_URL": "https://youtrack.example.com",
        "YOUTRACK_TOKEN": "perm:your-token-here"
      }
    }
  }
}
```

**Note:** This configuration uses npx to run the published package. For local development, use `"command": "node"` with `"args": ["/absolute/path/to/youtrack-mcp/dist/index.js"]`. The `YOUTRACK_TIMEZONE`, `YOUTRACK_HOLIDAYS`, `YOUTRACK_PRE_HOLIDAYS`, and `YOUTRACK_USER_ALIASES` environment variables are optional.



## Configuration for VS Code Cline

To use this MCP server with [Cline](https://github.com/cline/cline) extension in VS Code:

1. Open VS Code with Cline extension installed
2. Click the MCP Servers icon in Cline's top navigation
3. Select the "Configure" tab and click "Configure MCP Servers"
4. Add the following configuration to `cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "youtrack-mcp": {
      "command": "npx",
      "args": ["-y", "@vitalyostanin/youtrack-mcp@latest"],
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



### File Storage Parameters

Many tools support optional file storage parameters for handling large datasets:

- `saveToFile` — boolean, saves results to a JSON file instead of returning directly (useful for large datasets)
- `filePath` — string, custom file path (optional, auto-generated if not provided, directory created if needed)
- `format` — string, output format when saving to file: `jsonl` (JSON Lines) or `json` (JSON array format). Default is `jsonl`
- `overwrite` — boolean, allow overwriting existing files when using explicit filePath. Default is `false`

When `saveToFile` is `true`, tools return metadata about the saved file instead of the full data.

### Service

| Tool | Description | Main Parameters |
| --- | --- | --- |
| `service_info` | Check YouTrack availability and current user | — |

### Issues

| Tool | Description | Main Parameters |
| --- | --- | --- |
| `issue_lookup` | Get information about YouTrack issue. Note: Returns predefined fields including timestamps (created, updated) and basic info - id, idReadable, summary, description, wikifiedDescription, usesMarkdown, created, updated, project (id, shortName, name), parent (id, idReadable), assignee (id, login, name), reporter (id, login, name), updater (id, login, name). By default, custom fields are not included. Use briefOutput=false to get all customFields including State. | `issueId` — issue code (e.g., PROJ-123); `briefOutput` — optional boolean (default `true`) |
| `issues_lookup` | Get information about multiple YouTrack issues (batch mode, max 50). Note: Returns predefined fields including timestamps (created, updated) and basic info - id, idReadable, summary, description, wikifiedDescription, usesMarkdown, created, updated, project (id, shortName, name), parent (id, idReadable), assignee (id, login, name), reporter (id, login, name), updater (id, login, name). By default, custom fields are not included. Use briefOutput=false to get all customFields including State. | `issueIds[]` — array of issue codes (e.g., ['PROJ-123', 'PROJ-124']), max 50; `briefOutput` — optional boolean (default `true`) |
| `issue_details` | Issue details with brief/full modes | `issueId` — issue code; `briefOutput` — optional boolean (default `true`). Brief: predefined fields only. Full (`false`): adds `customFields` including `State`; `saveToFile`, `filePath`, `format`, `overwrite` — file storage options |
| `issues_details` | Detailed information about multiple issues (batch mode, max 50). Brief (default): predefined fields only. Full (`briefOutput=false`): adds `customFields` for each issue | `issueIds[]` — array of issue codes, max 50; `briefOutput` — optional boolean (default `true`); `saveToFile`, `filePath`, `format`, `overwrite` — file storage options |
| `issue_comments` | Issue comments | `issueId` — issue code; `saveToFile`, `filePath`, `format`, `overwrite` — file storage options |
| `issues_comments` | Comments for multiple issues (batch mode, max 50) | `issueIds[]` — array of issue codes, max 50; `briefOutput` — optional boolean (default `true`); `saveToFile`, `filePath`, `format`, `overwrite` — file storage options |
| `issue_create` | Create issue | `projectId`, `summary`, optional `description`, `parentIssueId`, `assigneeLogin`, `stateName`, `usesMarkdown`, `links` (array of link objects) |
| `issue_update` | Update existing issue | `issueId`, optionally `summary`, `description`, `parentIssueId` (empty string clears parent), `usesMarkdown` |
| `issue_assign` | Assign issue to user | `issueId`, `assigneeLogin` (login or `me`) |
| `issue_comment_create` | Add comment to issue | `issueId`, `text` — comment text, optionally `usesMarkdown` |
| `issue_comment_update` | Update existing comment | `issueId`, `commentId`, optionally `text`, `usesMarkdown`, `muteUpdateNotifications` |
| `issue_activities` | Get issue change history | `issueId` — issue code, optionally `author` (login), `startDate` (YYYY-MM-DD, timestamp, or Date), `endDate`, `categories` (comma-separated: `CustomFieldCategory` for field changes, `CommentsCategory` for comments, `AttachmentsCategory` for attachments, `LinksCategory` for links, `VcsChangeActivityCategory` for VCS changes, `WorkItemsActivityCategory` for work items), `limit` (max 200), `skip` for pagination; `saveToFile`, `filePath`, `format`, `overwrite` — file storage options. Returns activity items with timestamps (ISO datetime), authors, categories, and change details (added/removed values). Useful for tracking field modifications, reviewing comment history, and analyzing collaboration patterns |
| `issue_change_state` | Change issue state/status through workflow transitions | `issueId` — issue code, `stateName` — target state name (e.g., 'In Progress', 'Open', 'Fixed', 'Verified'). Case-insensitive. Automatically discovers available transitions and validates requested state change. Returns information about previous state, new state, and transition used. Use for moving issues through workflow states |
| `issue_attachments_list` | Get list of attachments | `issueId` — issue code; `saveToFile`, `filePath`, `format`, `overwrite` — file storage options |
| `issue_attachment_get` | Get attachment info | `issueId`, `attachmentId`; `saveToFile`, `filePath`, `format`, `overwrite` — file storage options |
| `issue_attachment_download` | Get download URL for attachment or download file directly to local filesystem | `issueId`, `attachmentId` — returns signed download URL when downloadToFile=false; `downloadToFile` — boolean, download file directly to local system (default: false); `downloadPath` — custom path to save file (auto-generated if not provided); `overwrite` — allow overwriting existing files (default: false, throws error if file exists); `saveToFile`, `filePath`, `format`, `overwrite` — file storage options for metadata |
| `issue_attachment_upload` | Upload files to issue | `issueId`, `filePaths[]` — array of file paths (max 10), optionally `muteUpdateNotifications` |
| `issue_attachment_delete` | Delete attachment (requires confirmation) | `issueId`, `attachmentId`, `confirmation` (must be `true`) |

### Issue Links

| Tool | Description | Main Parameters |
| --- | --- | --- |
| `issue_links` | List links for an issue (relates to, duplicate, parent/child). Returns link id, direction, linkType, and counterpart issue brief | `issueId` — issue code |
| `issue_link_types` | List available link types | — |
| `issue_link_add` | Create a link between two issues | `sourceId`, `targetId`, `linkType` (name or id), optionally `direction` (`outbound` or `inbound`) |
| `issue_link_delete` | Delete a link by id for a specific issue | `issueId` — issue code, `linkId` — link id to delete |

### Issues Status

| Tool | Description | Main Parameters |
| --- | --- | --- |
| `issue_status` | Get status of a YouTrack issue. Returns the State of the issue. | `issueId` — issue code (e.g., PROJ-123) |
| `issues_status` | Get status of multiple YouTrack issues (batch mode, max 50). Returns the State of each issue. | `issueIds[]` — array of issue codes (e.g., ['PROJ-123', 'PROJ-124']), max 50 |

### Issue Stars

| Tool | Description | Main Parameters |
| --- | --- | --- |
| `issue_star` | Add star to issue for current user | `issueId` — issue code (e.g., PROJ-123). Idempotent operation - returns success even if already starred |
| `issue_unstar` | Remove star from issue for current user | `issueId` — issue code. Idempotent operation - returns success even if not currently starred |
| `issues_star_batch` | Add stars to multiple issues (batch mode, max 50) | `issueIds[]` — array of issue codes (max 50). Returns object with `successful` and `failed` arrays. Processes with concurrency limit (10 concurrent requests) |
| `issues_unstar_batch` | Remove stars from multiple issues (batch mode, max 50) | `issueIds[]` — array of issue codes (max 50). Returns object with `successful` and `failed` arrays. Processes with concurrency limit (10 concurrent requests) |
| `issues_starred_list` | Get all starred issues for current user | Optionally `limit` (default 50, max 200), `skip` for pagination. Returns array of starred issues with basic information (id, idReadable, summary, project, parent, assignee) without description fields |

### Work Items

| Tool | Description | Main Parameters |
| --- | --- | --- |
| `workitems_list` | Get work items for current or specified user | Optionally `issueId`, `author`, `startDate`, `endDate`, `allUsers`; `saveToFile`, `filePath`, `format`, `overwrite` — file storage options |
| `workitems_all_users` | Get work items for all users | Optionally `issueId`, `startDate`, `endDate`; `saveToFile`, `filePath`, `format`, `overwrite` — file storage options |
| `workitems_for_users` | Get work items for selected users | `users[]`, optionally `issueId`, `startDate`, `endDate`; `saveToFile`, `filePath`, `format`, `overwrite` — file storage options |
| `workitems_recent` | Get recent work items sorted by update time (newest first) | Optionally `users[]` (defaults to current user), `limit` (default 50, max 200); `saveToFile`, `filePath`, `format`, `overwrite` — file storage options |
| `workitem_create` | Create work item entry | `issueId`, `date`, `minutes`, optionally `summary`, `description`, `usesMarkdown` |
| `workitem_create_idempotent` | Create work item without duplicates (by description and date) | `issueId`, `date`, `minutes`, `description`, optionally `usesMarkdown` |
| `workitem_update` | Update work item (recreate) | `issueId`, `workItemId`, optionally `date`, `minutes`, `summary`, `description`, `usesMarkdown` |
| `workitem_delete` | Delete work item | `issueId`, `workItemId` |
| `workitems_create_period` | Batch create for date range | `issueId`, `startDate`, `endDate`, `minutes`, optionally `summary`, `description`, `usesMarkdown`, `excludeWeekends`, `excludeHolidays`, `holidays[]`, `preHolidays[]` |
| `workitems_report_summary` | Summary report for work items | Common parameters: `author`, `issueId`, `startDate`, `endDate`, `expectedDailyMinutes`, `excludeWeekends`, `excludeHolidays`, `holidays[]`, `preHolidays[]`, `allUsers`; `saveToFile`, `filePath`, `format`, `overwrite` — file storage options |
| `workitems_report_invalid` | Days with deviation from expected hours | Same parameters as summary; `saveToFile`, `filePath`, `format`, `overwrite` — file storage options |
| `workitems_report_users` | Work items report for list of users | `users[]` + common report parameters; `saveToFile`, `filePath`, `format`, `overwrite` — file storage options |
| `workitems_report` | Report structure (compatibility with older clients) | Optionally `author`, `issueId`, `startDate`, `endDate`, `expectedDailyMinutes`, `excludeWeekends`, `excludeHolidays`, `holidays[]`, `preHolidays[]`, `allUsers`; `saveToFile`, `filePath`, `format`, `overwrite` — file storage options |

### Users and Projects

| Tool | Description | Main Parameters |
| --- | --- | --- |
| `users_list` | List all YouTrack users | `saveToFile`, `filePath`, `format`, `overwrite` — file storage options |
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
| `article_search` | Search articles in knowledge base | `query`, optionally `projectId`, `parentArticleId`, `limit`, `returnRendered`; `saveToFile`, `filePath`, `format`, `overwrite` — file storage options |
| `articles_search` | Full-text search across YouTrack knowledge base articles by title and content. Returns `webUrl` for direct access. | `query`, `limit`, `skip`, optionally `projectId`, `parentArticleId`; `saveToFile`, `filePath`, `format`, `overwrite` — file storage options |
| `issues_search` | Full-text search across YouTrack issues by summary, description, and comments. If `query` is not provided or empty, all issues will be returned. Supports filtering by projects, assignee, reporter, state, and type. | `query` (optional), `limit`, `skip`, `countOnly` (optional), `projects` (optional), `assignee` (optional), `reporter` (optional), `state` (optional), `type` (optional); `saveToFile`, `filePath`, `format`, `overwrite` — file storage options |

### Search

| Tool | Description | Main Parameters |
| --- | --- | --- |
| `articles_search` | Full-text search across YouTrack knowledge base articles by title and content. Returns `webUrl` for direct access | `query` (min 2 chars), `limit` (default 50, max 200), `skip`, optionally `projectId`, `parentArticleId` |
| `issues_search` | Full-text search across YouTrack issues by summary, description, and comments. If `query` is not provided or empty, all issues will be returned. Supports filtering by projects, assignee, reporter, state, and type | `query` (optional), `limit` (default 50, max 200), `skip`, `countOnly` (optional), `projects` (optional), `assignee` (optional), `reporter` (optional), `state` (optional), `type` (optional) |

### Activity Feed

| Tool | Description | Main Parameters |
| --- | --- | --- |
| `users_activity` | Author-centric activity feed backed by `/api/activities`. **Use for:** auditing a teammate's updates, gathering comment/state changes across many issues, and reviewing deployment timelines. Returns normalized entries with ISO timestamps, optional issue references, and `added`/`removed` payloads. Always follow up by re-fetching the affected issue or work-item to confirm the latest state. Supported categories: `CustomFieldCategory` (field changes), `CommentsCategory` (comments), `AttachmentsCategory` (file events), `LinksCategory` (issue links), `VcsChangeActivityCategory` (VCS changes), `WorkItemsActivityCategory` (work items). | `author` *(required)* — login such as `vyt`; `categories` *(required)* — comma-separated list built from the supported categories above; optional `start` / `end` (ISO string, timestamp in ms, or `Date`) to bound the range, `reverse` (boolean) to switch to chronological order, `limit` (default 100, max 200), `skip` (pagination offset), `fields` (advanced override of response fields); `saveToFile`, `filePath`, `format`, `overwrite` — file storage options. |
| `issues_list` | List issues across projects with filtering and sorting | Filters: `projectIds`, `createdAfter/Before`, `updatedAfter/Before`, `statuses`, `assigneeLogin`, `types`; Sorting: `sortField`, `sortDirection`; Pagination: `limit`, `skip`; Output mode: `briefOutput`; `saveToFile`, `filePath`, `format`, `overwrite` — file storage options |
| `issues_count` | Count issues using same filters as `issues_list`, returns per-project breakdown | Same filters as above, optional `top` to cap manual aggregation when many projects are involved; `saveToFile`, `filePath`, `format`, `overwrite` — file storage options |

## Important Notes

### Destructive Operations

Some operations cannot be undone and require explicit confirmation:

- **`issue_attachment_delete`** - Requires `confirmation: true` parameter. Deleted attachments cannot be recovered.
**issue_create parameters:**

- `parentIssueId` — resolves against `YOUTRACK_DEFAULT_PROJECT` when no project prefix is provided (e.g., `123` → `BC-123` if default project is `BC`).
- `links[]` — optional array describing additional links to create after the issue is saved. Each item supports:
  - `linkType` — name or id of the link type (e.g., `Subtask`, `Relates`).
  - `targetId` — issue id or readable id. Plain numbers are resolved with the default project, matching `resolveIssueId` behaviour.
  - `direction` — optional (`"outbound"` by default). Use `"inbound"` to flip direction for non-symmetric link types.
  - `sourceId` — optional. When omitted, the new issue is treated as the source. Specify to create links from an existing issue to the new one (useful for complex chains).
- After creation the tool automatically refreshes the issue and attempts to reopen link caches; always re-fetch links with `issue_links` to confirm the final state.
