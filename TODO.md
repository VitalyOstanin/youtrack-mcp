# Pending Work for Feature Parity with work-tools

- [ ] Expand `YoutrackClient` with create/update/delete operations:
  - Issues: create, update, assign, fetch comments.
  - Work items: create, update (delete+recreate), delete, batch create, reports.
  - Articles: list, get, create, update.
- [ ] Wire new MCP tools exposing the client methods (issue/task ops, work item CRUD and reports, knowledge base articles).
- [ ] Update `src/tools/workitem-tools.ts`, `src/tools/issue-tools.ts`, and add article tool registration using zod schemas (no `.shape` on refined schemas).
- [ ] Regenerate README section with all implemented tools and their parameters once features are present.
- [ ] Run `npm run build` and `npx eslint .` to confirm the expanded toolset compiles and passes lint.
