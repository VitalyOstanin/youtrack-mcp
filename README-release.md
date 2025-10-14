# Release Procedure

This document outlines the complete release procedure for the YouTrack MCP project. Follow these steps in order to ensure a clean, validated release.

## Table of Contents

- [Overview](#overview)
- [Pre-Release Checklist](#pre-release-checklist)
  - [1. Version Update](#1-version-update)
  - [2. Lock File Update](#2-lock-file-update)
  - [3. Documentation Updates](#3-documentation-updates)
  - [4. Build Validation](#4-build-validation)
  - [5. Linter Validation](#5-linter-validation)
  - [6. Final Code Review](#6-final-code-review)
  - [7. Git Status Check](#7-git-status-check)
- [Release Execution](#release-execution)
  - [Automated Release via GitHub Actions](#automated-release-via-github-actions)
  - [Prerequisites](#prerequisites)
  - [Release Steps](#release-steps)
  - [Monitor Release Progress](#monitor-release-progress)
  - [What GitHub Actions Does](#what-github-actions-does)
- [Post-Release Verification](#post-release-verification)

## Overview

The YouTrack MCP project uses **automated CI/CD via GitHub Actions** for releases:

- **CI Workflow**: Automatically runs tests, linting, and builds on every push and PR
- **Publish Workflow**: Automatically publishes to npm and creates GitHub Release when you push a version tag

**Quick Release (TL;DR):**
```bash
npm version patch              # Update version, create commit & tag
git push --follow-tags        # Push to GitHub → triggers automated release
```

For detailed instructions and prerequisites, continue reading below.

## Pre-Release Checklist

### 1. Version Update

**Verify that `package.json` version has been incremented:**

```bash
# Check current version
grep '"version"' package.json
```

Version should follow [Semantic Versioning](https://semver.org/):
- **MAJOR** (x.0.0): Breaking changes or major feature additions
- **MINOR** (0.x.0): New features, backward-compatible
- **PATCH** (0.0.x): Bug fixes, backward-compatible

**Update version manually if needed:**

```bash
# For patch release
npm version patch --no-git-tag-version

# For minor release
npm version minor --no-git-tag-version

# For major release
npm version major --no-git-tag-version
```

### 2. Lock File Update

**Ensure `package-lock.json` is synchronized:**

```bash
# Update lockfile after any package.json changes
npm install

# Verify no unexpected changes
git diff package-lock.json
```

The lockfile must reflect the exact dependency tree. Never commit a stale lockfile.

### 3. Documentation Updates

**Update all relevant documentation files:**

#### CHANGELOG Updates

```bash
# Check if CHANGELOG files exist
ls -1 CHANGELOG*.md 2>/dev/null || echo "No changelog files found"
```

If CHANGELOG files exist, ensure they include:
- New version number and release date
- All new features, fixes, and breaking changes
- Links to related issues/MRs

**Example CHANGELOG entry:**

```markdown
## [0.2.0] - 2025-10-14

### Added
- Issue attachment support (#15)
- Improved markdown support (#12)

### Fixed
- Issue search performance (#18)

### Changed
- Improved error messages for API failures
```

#### README Updates

```bash
# Verify README files are up-to-date
ls -1 README*.md
```

Ensure both `README.md` (English) and `README-ru.md` (Russian) reflect:
- New features and tools
- Updated usage examples
- Changed configuration requirements
- Version compatibility notes

### 4. Build Validation

**Run full TypeScript build:**

```bash
npm run build
```

Build must complete without errors. Check for:
- TypeScript compilation errors
- Type checking failures
- Missing dependencies

**Expected output:**
```
[no output on success]
```

Any errors must be fixed before proceeding.

### 5. Linter Validation

**Run ESLint checks:**

```bash
npx eslint .
```

All files must pass linting. For auto-fixable issues:

```bash
npx eslint . --fix
```

**Expected output:**
```
[no output on clean run]
```

### 6. Final Code Review

**Perform a comprehensive code review:**

- [ ] Review all changes since last release
- [ ] Verify no debugging code (console.log, debugger statements)
- [ ] Check for TODOs or FIXMEs that should be addressed
- [ ] Ensure code follows project style guidelines (AGENTS.md)
- [ ] Validate error handling and edge cases
- [ ] Confirm API compatibility (no breaking changes without version bump)

```bash
# Review all changes since last tag
git log $(git describe --tags --abbrev=0)..HEAD --oneline

# Check for debugging artifacts
git grep -n "console\.log\|debugger" src/
```

### 7. Git Status Check

**Ensure all changes are committed:**

```bash
# Check working directory status
git status
```

**Expected output:**
```
On branch master
nothing to commit, working tree clean
```

If there are uncommitted changes:

```bash
# Stage all changes
git add .

# Create commit with descriptive message
git commit -m "chore: prepare release v0.x.x"
```

## Release Execution

Once all checklist items are completed:

### Automated Release via GitHub Actions

This project uses GitHub Actions for automated CI/CD. The release process is fully automated when you create a version tag.

#### Prerequisites

**One-time setup:** Configure NPM_TOKEN in GitHub repository secrets:

1. Generate npm Access Token:
   - Go to [npmjs.com](https://www.npmjs.com/) and log in
   - Navigate to **Access Tokens** in your account settings
   - Click **Generate New Token** → **Classic Token**
   - Select **Automation** type (for CI/CD)
   - Copy the generated token

2. Add Secret to GitHub:
   - Go to your GitHub repository: https://github.com/VitalyOstanin/youtrack-mcp
   - Navigate to **Settings** → **Secrets and variables** → **Actions**
   - Click **New repository secret**
   - Name: `NPM_TOKEN`
   - Value: Paste your npm token
   - Click **Add secret**

#### Release Steps

```bash
# 1. Update version and create git tag
npm version patch   # for 0.1.0 → 0.1.1 (bug fixes)
# or
npm version minor   # for 0.1.0 → 0.2.0 (new features)
# or
npm version major   # for 0.1.0 → 1.0.0 (breaking changes)

# Note: npm version automatically:
# - Updates package.json and package-lock.json
# - Creates a git commit (e.g., "0.1.1")
# - Creates a git tag (e.g., "v0.1.1")

# 2. Push commit and tags to GitHub
git push --follow-tags

# 3. GitHub Actions will automatically:
#    ✓ Run CI tests (Node.js 20.x, 22.x)
#    ✓ Build the project
#    ✓ Publish to npm with provenance
#    ✓ Create GitHub Release with installation instructions
```

#### Monitor Release Progress

1. **Check GitHub Actions workflow:**
   - Go to: https://github.com/VitalyOstanin/youtrack-mcp/actions
   - Look for "Publish to npm" workflow run
   - Verify all steps completed successfully

2. **View created release:**
   - Go to: https://github.com/VitalyOstanin/youtrack-mcp/releases
   - Verify release was created with correct version tag
   - Check release notes and installation instructions

#### What GitHub Actions Does

The automated workflow (`.github/workflows/publish.yml`) performs:

1. **Environment Setup**
   - Checkout repository code
   - Setup Node.js 20.x with npm cache
   - Install dependencies with `npm ci`

2. **Build & Validation**
   - Build project with `npm run build`
   - Verify package contents with `npm pack --dry-run`
   - Ensure all required files are included

3. **Publishing**
   - Publish to npm with `--provenance` flag (cryptographic signature)
   - Use `--access public` for scoped package visibility

4. **GitHub Release Creation**
   - Create GitHub Release automatically
   - Include installation instructions
   - Link to package on npmjs.com

## Post-Release Verification

After publishing, verify the release was successful:

### 1. Verify GitHub Actions Workflow

```bash
# Check latest workflow run status via GitHub CLI (optional)
gh run list --workflow=publish.yml --limit 1

# Or visit in browser:
# https://github.com/VitalyOstanin/youtrack-mcp/actions/workflows/publish.yml
```

**Expected workflow status:** ✅ All steps completed successfully

### 2. Verify npm Package

```bash
# Check published version
npm view @vitalyostanin/youtrack-mcp version

# Expected output: 0.x.x (matching your release tag)

# View full package info
npm view @vitalyostanin/youtrack-mcp

# Check package provenance (cryptographic signature)
npm view @vitalyostanin/youtrack-mcp --json | grep -i provenance
```

### 3. Test Installation

```bash
# Test fresh installation (in a temporary directory)
cd $(mktemp -d)
npx @vitalyostanin/youtrack-mcp@latest

# Expected: Server should start and show service info
```

### 4. Verify GitHub Release

```bash
# Visit releases page
# https://github.com/VitalyOstanin/youtrack-mcp/releases/latest

# Or check via GitHub CLI
gh release view v0.x.x
```

**Verify:**
- ✅ Release is published (not draft)
- ✅ Release notes are properly formatted
- ✅ Installation instructions are present
- ✅ Tag matches package version

---

**Note:** Always follow this procedure completely. Skipping steps may result in broken releases, dependency conflicts, or user issues.
