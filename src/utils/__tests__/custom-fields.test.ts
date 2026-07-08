import { describe, expect, it } from "vitest";

import {
  buildIssueCustomFieldsPayload,
  extractCustomFieldInputsFromParent,
  mapProjectCustomFieldDefinitions,
  mergeCustomFieldInputs,
  resolveIssueFieldTypeFromProjectDefinition,
} from "../custom-fields.js";
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
});
