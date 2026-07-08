import { describe, expect, it } from "vitest";

import {
  buildIssueCustomFieldPayload,
  buildIssueCustomFieldsPayload,
  extractCustomFieldInputsFromParent,
  mapProjectCustomFieldDefinitions,
  mergeCustomFieldInputs,
  resolveIssueFieldTypeFromProjectDefinition,
} from "../custom-fields.js";
import { YoutrackClientError } from "../../youtrack-client/base.js";
import { YOUTRACK_ENTITY_TYPE, type YoutrackCustomField } from "../../types.js";

describe("custom-fields utils", () => {
  it("builds single and multi enum payloads", () => {
    const definitions = mapProjectCustomFieldDefinitions([
      {
        id: "1",
        $type: "EnumProjectCustomField",
        field: { name: "Priority", fieldType: { valueType: "enum", isMultiValue: false } },
      },
      {
        id: "2",
        $type: "EnumProjectCustomField",
        field: { name: "Stream", fieldType: { valueType: "enum", isMultiValue: true } },
      },
    ]);
    const payload = buildIssueCustomFieldsPayload(
      [
        { name: "Priority", value: "Normal" },
        { name: "Stream", value: ["Кор"] },
      ],
      definitions,
    );

    expect(payload).toEqual([
      {
        name: "Priority",
        $type: YOUTRACK_ENTITY_TYPE.singleEnumField,
        value: { name: "Normal" },
      },
      {
        name: "Stream",
        $type: YOUTRACK_ENTITY_TYPE.multiEnumField,
        value: [{ name: "Кор" }],
      },
    ]);
  });

  it("extracts inherited values from parent custom fields", () => {
    const inherited = extractCustomFieldInputsFromParent([
      {
        id: "1",
        name: "Stream",
        $type: YOUTRACK_ENTITY_TYPE.multiEnumField,
        value: [{ name: "Кор" }] as unknown as YoutrackCustomField["value"],
      },
      {
        id: "2",
        name: "State",
        $type: YOUTRACK_ENTITY_TYPE.stateField,
        value: { name: "Open" },
      },
      {
        id: "3",
        name: "Priority",
        $type: YOUTRACK_ENTITY_TYPE.singleEnumField,
        value: { name: "Normal" },
      },
    ]);

    expect(inherited).toEqual([
      { name: "Stream", value: "Кор" },
      { name: "Priority", value: "Normal" },
    ]);
  });

  it("merges inherited and explicit custom fields with explicit precedence", () => {
    const merged = mergeCustomFieldInputs(
      [
        { name: "Stream", value: "Кор" },
        { name: "Priority", value: "Normal" },
      ],
      [{ name: "Priority", value: "Major" }],
    );

    expect(merged).toEqual([
      { name: "Stream", value: "Кор" },
      { name: "Priority", value: "Major" },
    ]);
  });

  it("resolves multi enum project field type", () => {
    expect(
      resolveIssueFieldTypeFromProjectDefinition({
        $type: "EnumProjectCustomField",
        field: { fieldType: { valueType: "enum", isMultiValue: true } },
      }),
    ).toBe(YOUTRACK_ENTITY_TYPE.multiEnumField);
  });

  it("resolves numeric, period, date, and text field types by valueType", () => {
    expect(
      resolveIssueFieldTypeFromProjectDefinition({
        field: { fieldType: { valueType: "integer" } },
      }),
    ).toBe(YOUTRACK_ENTITY_TYPE.simpleField);
    expect(
      resolveIssueFieldTypeFromProjectDefinition({
        field: { fieldType: { valueType: "period" } },
      }),
    ).toBe(YOUTRACK_ENTITY_TYPE.periodField);
    expect(
      resolveIssueFieldTypeFromProjectDefinition({
        field: { fieldType: { valueType: "date" } },
      }),
    ).toBe(YOUTRACK_ENTITY_TYPE.dateField);
    expect(
      resolveIssueFieldTypeFromProjectDefinition({
        field: { fieldType: { valueType: "text" } },
      }),
    ).toBe(YOUTRACK_ENTITY_TYPE.textField);
  });

  it("throws YoutrackClientError for unrecognized field types", () => {
    expect(() =>
      resolveIssueFieldTypeFromProjectDefinition({
        field: { fieldType: { valueType: "unknown-type" } },
      }),
    ).toThrow(YoutrackClientError);
  });

  it("builds payloads for text, simple, period, and date field types", () => {
    expect(
      buildIssueCustomFieldPayload("Notes", YOUTRACK_ENTITY_TYPE.textField, ["hello"]),
    ).toEqual({
      name: "Notes",
      $type: YOUTRACK_ENTITY_TYPE.textField,
      value: "hello",
    });
    expect(
      buildIssueCustomFieldPayload("Story Points", YOUTRACK_ENTITY_TYPE.simpleField, ["5"]),
    ).toEqual({
      name: "Story Points",
      $type: YOUTRACK_ENTITY_TYPE.simpleField,
      value: 5,
    });
    expect(
      buildIssueCustomFieldPayload("Estimation", YOUTRACK_ENTITY_TYPE.periodField, ["120"]),
    ).toEqual({
      name: "Estimation",
      $type: YOUTRACK_ENTITY_TYPE.periodField,
      value: { minutes: 120 },
    });
    expect(
      buildIssueCustomFieldPayload("Due Date", YOUTRACK_ENTITY_TYPE.dateField, ["1719878400000"]),
    ).toEqual({
      name: "Due Date",
      $type: YOUTRACK_ENTITY_TYPE.dateField,
      value: 1719878400000,
    });
  });

  it("throws YoutrackClientError when custom field value is empty", () => {
    expect(() =>
      buildIssueCustomFieldPayload("Priority", YOUTRACK_ENTITY_TYPE.singleEnumField, []),
    ).toThrow(YoutrackClientError);
  });
});
