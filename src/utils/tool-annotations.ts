// Reusable MCP ToolAnnotations presets. These describe the side-effect profile
// of a tool so an MCP host can reason about confirmation flows, caching, and
// safe parallelism without reading the implementation.
//
// All YouTrack tools ultimately talk to a remote YouTrack instance, so
// openWorldHint is true everywhere — the result depends on external state and
// is therefore not memoizable.

import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

// Read-only: GET-style tools, no observable server-side change. Idempotent by
// definition.
export const READ_ONLY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

// Service-info-style read-only tool that does NOT depend on external state
// beyond a single sanity-check round-trip (auth ping). For tools that report
// process configuration, openWorldHint=false signals "this answer doesn't
// depend on the YouTrack catalogue and is reproducible across runs".
export const READ_ONLY_LOCAL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

// Mutates server state but a repeat call with the same parameters is a no-op
// (assign-already-assigned, change-state-to-current, star-already-starred,
// upsert/PATCH semantics).
export const WRITE_IDEMPOTENT_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

// Mutates server state and a repeat call creates a duplicate
// (issue_create, comment_create, attachment_upload, link_add, workitem_create).
export const WRITE_CREATE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

// Removes data from the server (delete attachment, delete link, delete
// workitem). idempotentHint=false because a second delete on a missing target
// returns 404, not success.
export const DESTRUCTIVE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};
