# TODO

Known work that is understood but not scheduled yet. Items are removed once
they land; each one states the current behaviour, why it matters, and what a
fix has to cover.

## Contents

- [`getIssuesDetailsLight` drops missing ids silently](#getissuesdetailslight-drops-missing-ids-silently)

## `getIssuesDetailsLight` drops missing ids silently

`getIssuesDetailsLight` in [src/youtrack-client/batch.ts](src/youtrack-client/batch.ts)
returns `YoutrackIssueDetails[]` and has no channel for per-id errors, unlike
`getIssues`, `getIssuesDetails` and `getIssuesState`, which all report absent
ids through `errors`. An id that cannot be resolved simply does not appear in
the result, and the caller has no way to tell a shortened list from a complete
one.

The single caller is the user activity flow in
[src/youtrack-client/issue-search.ts](src/youtrack-client/issue-search.ts),
which passes the full candidate set. There the ids come from a preceding
search, so they normally exist — which is exactly why a silent drop would go
unnoticed if it ever happened.

A fix has to decide what the method should return: either widen the result to
carry `errors` the way the other batch methods do, or keep the light signature
and document that the caller must compare the returned ids against the
requested ones. Whichever is chosen, the same question applies to
`getMultipleIssuesCommentsLight`, which swallows per-issue failures by design
(`// Silently ignore errors in light mode`).
