import nock from "nock";
import { afterEach, describe, expect, it } from "vitest";

import { YoutrackClient } from "../youtrack-client.js";

const baseUrl = "https://yt.test";
const baseConfig = {
  baseUrl,
  token: "perm:test",
  defaultProject: "IOS",
  outputDir: "/tmp",
  timezone: "UTC",
};

describe("createIssue custom fields", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it("sends customFields in create payload", async () => {
    const scope = nock(baseUrl)
      .get("/api/admin/projects/77-89/customFields")
      .query(true)
      .reply(200, [
        {
          id: "1",
          $type: "EnumProjectCustomField",
          field: { name: "Stream", fieldType: { valueType: "enum", isMultiValue: true } },
        },
      ])
      .post("/api/issues", (body: { customFields?: unknown[] }) => {
        expect(body.customFields).toEqual([
          {
            name: "Stream",
            $type: "MultiEnumIssueCustomField",
            value: [{ name: "Кор" }],
          },
        ]);

        return true;
      })
      .query(true)
      .reply(200, {
        id: "92-1",
        idReadable: "IOS-1",
        summary: "child",
        project: { id: "77-89", shortName: "IOS" },
      });
    const client = new YoutrackClient(baseConfig);
    const result = await client.createIssue({
      projectId: "77-89",
      summary: "child",
      customFields: [{ name: "Stream", value: "Кор" }],
      inheritCustomFieldsFromParent: false,
    });

    expect(result.issue.idReadable).toBe("IOS-1");
    expect(scope.isDone()).toBe(true);
  });

  it("inherits custom fields from parent and creates a Subtask link", async () => {
    const scope = nock(baseUrl)
      .get("/api/issues/IOS-95664")
      .query(true)
      .reply(200, {
        id: "92-parent",
        idReadable: "IOS-95664",
        summary: "parent",
        customFields: [
          {
            id: "1",
            name: "Stream",
            $type: "MultiEnumIssueCustomField",
            value: [{ name: "Кор" }],
          },
          {
            id: "2",
            name: "State",
            $type: "StateIssueCustomField",
            value: { name: "Open" },
          },
        ],
      })
      .get("/api/admin/projects/77-89/customFields")
      .query(true)
      .reply(200, [
        {
          id: "1",
          $type: "EnumProjectCustomField",
          field: { name: "Stream", fieldType: { valueType: "enum", isMultiValue: true } },
        },
      ])
      .post("/api/issues", (body: { customFields?: unknown[]; parent?: { id: string } }) => {
        expect(body.parent).toBeUndefined();
        expect(body.customFields).toEqual([
          {
            name: "Stream",
            $type: "MultiEnumIssueCustomField",
            value: [{ name: "Кор" }],
          },
        ]);

        return true;
      })
      .query(true)
      .reply(200, {
        id: "92-2",
        idReadable: "IOS-2",
        summary: "child",
        project: { id: "77-89", shortName: "IOS" },
      })
      .post("/api/issues/IOS-95664/links")
      .query(true)
      .reply(200, {
        id: "61-3s",
        direction: "OUTWARD",
        linkType: { name: "Subtask", id: "61-3", directed: true },
        issues: [{ idReadable: "IOS-2", summary: "child" }],
      });
    const client = new YoutrackClient(baseConfig);
    const result = await client.createIssue({
      projectId: "77-89",
      summary: "child",
      parentIssueId: "IOS-95664",
    });

    expect(result.issue.idReadable).toBe("IOS-2");
    expect(scope.isDone()).toBe(true);
  });

  it("skips auto Subtask link when caller already provided one with normalized parent id", async () => {
    const scope = nock(baseUrl)
      .post("/api/issues")
      .query(true)
      .reply(200, {
        id: "92-3",
        idReadable: "IOS-3",
        summary: "child",
        project: { id: "77-89", shortName: "IOS" },
      })
      .post("/api/issues/IOS-3/links")
      .query(true)
      .reply(200, {
        id: "61-3s",
        direction: "OUTWARD",
        linkType: { name: "Subtask", id: "61-3", directed: true },
        issues: [{ idReadable: "IOS-95664", summary: "parent" }],
      });
    const client = new YoutrackClient(baseConfig);
    const result = await client.createIssue({
      projectId: "77-89",
      summary: "child",
      parentIssueId: "IOS-95664",
      inheritCustomFieldsFromParent: false,
      links: [
        {
          linkType: "Subtask",
          targetId: "95664",
          direction: "inbound",
        },
      ],
    });

    expect(result.issue.idReadable).toBe("IOS-3");
    expect(scope.isDone()).toBe(true);
  });
});
