import { YOUTRACK_ENTITY_TYPE, type YoutrackCustomField, type YoutrackCustomFieldValue } from "../types.js";

export interface CustomFieldInput {
  name: string;
  value: string | string[];
}

export interface ProjectCustomFieldDefinition {
  id: string;
  name: string;
  issueFieldType: string;
}

const INHERITED_FIELD_SKIP = new Set([
  "State",
  "Assignee",
  "Reporter",
  "Updater",
  "Timer time",
  "Spent time",
  "Days",
  "Estimation",
]);
const PROJECT_TO_ISSUE_FIELD_TYPE: Record<string, string> = {
  EnumProjectCustomField: YOUTRACK_ENTITY_TYPE.singleEnumField,
  StateProjectCustomField: YOUTRACK_ENTITY_TYPE.stateField,
  UserProjectCustomField: YOUTRACK_ENTITY_TYPE.singleUserField,
  TextProjectCustomField: "TextIssueCustomField",
  PeriodProjectCustomField: "PeriodIssueCustomField",
  DateProjectCustomField: "DateIssueCustomField",
  SimpleProjectCustomField: "SimpleIssueCustomField",
};

export function normalizeCustomFieldValues(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

export function mergeCustomFieldInputs(
  inherited: CustomFieldInput[],
  explicit: CustomFieldInput[],
): CustomFieldInput[] {
  const merged = new Map<string, CustomFieldInput>();

  for (const field of inherited) {
    merged.set(field.name, field);
  }

  for (const field of explicit) {
    merged.set(field.name, field);
  }

  return Array.from(merged.values());
}

export function extractCustomFieldInputsFromParent(
  customFields: YoutrackCustomField[] | undefined,
): CustomFieldInput[] {
  if (!customFields?.length) {
    return [];
  }

  const inputs: CustomFieldInput[] = [];

  for (const field of customFields) {
    if (INHERITED_FIELD_SKIP.has(field.name) || field.value === undefined) {
      continue;
    }

    if (field.$type === YOUTRACK_ENTITY_TYPE.singleUserField) {
      continue;
    }

    const rawValue = field.value as YoutrackCustomFieldValue | YoutrackCustomFieldValue[];

    if (Array.isArray(rawValue)) {
      const names = rawValue
        .map((item) => item.name)
        .filter((name): name is string => typeof name === "string" && name.length > 0);

      if (names.length > 0) {
        inputs.push({ name: field.name, value: names.length === 1 ? names[0]! : names });
      }

      continue;
    }

    if (typeof rawValue.name === "string" && rawValue.name.length > 0) {
      inputs.push({ name: field.name, value: rawValue.name });
    }
  }

  return inputs;
}

export function resolveIssueFieldTypeFromProjectDefinition(definition: {
  $type?: string | undefined;
  field?: {
    fieldType?: {
      valueType?: string | undefined;
      isMultiValue?: boolean | undefined;
    } | undefined;
  } | undefined;
}): string {
  const projectType = definition.$type;

  if (projectType === "EnumProjectCustomField") {
    return definition.field?.fieldType?.isMultiValue
      ? YOUTRACK_ENTITY_TYPE.multiEnumField
      : YOUTRACK_ENTITY_TYPE.singleEnumField;
  }

  if (projectType && PROJECT_TO_ISSUE_FIELD_TYPE[projectType]) {
    return PROJECT_TO_ISSUE_FIELD_TYPE[projectType];
  }

  const valueType = definition.field?.fieldType?.valueType;

  if (valueType === "enum") {
    return definition.field?.fieldType?.isMultiValue
      ? YOUTRACK_ENTITY_TYPE.multiEnumField
      : YOUTRACK_ENTITY_TYPE.singleEnumField;
  }

  if (valueType === "user") {
    return YOUTRACK_ENTITY_TYPE.singleUserField;
  }

  if (valueType === "state") {
    return YOUTRACK_ENTITY_TYPE.stateField;
  }

  return YOUTRACK_ENTITY_TYPE.singleEnumField;
}

export function mapProjectCustomFieldDefinitions(
  definitions: Array<{
    id: string;
    $type?: string | undefined;
    field?: {
      name?: string | undefined;
      fieldType?: {
        valueType?: string | undefined;
        isMultiValue?: boolean | undefined;
      } | undefined;
    } | undefined;
  }>,
): ProjectCustomFieldDefinition[] {
  return definitions
    .map((definition) => {
      const name = definition.field?.name;

      if (!name) {
        return null;
      }

      return {
        id: definition.id,
        name,
        issueFieldType: resolveIssueFieldTypeFromProjectDefinition(definition),
      };
    })
    .filter((definition): definition is ProjectCustomFieldDefinition => definition !== null);
}

export function buildIssueCustomFieldPayload(
  fieldName: string,
  issueFieldType: string,
  values: string[],
): Record<string, unknown> {
  if (values.length === 0) {
    throw new Error(`Custom field '${fieldName}' requires at least one value`);
  }

  if (issueFieldType === YOUTRACK_ENTITY_TYPE.multiEnumField) {
    return {
      name: fieldName,
      $type: issueFieldType,
      value: values.map((name) => ({ name })),
    };
  }

  if (issueFieldType === YOUTRACK_ENTITY_TYPE.singleUserField) {
    return {
      name: fieldName,
      $type: issueFieldType,
      value: { login: values[0] },
    };
  }

  if (issueFieldType === YOUTRACK_ENTITY_TYPE.stateField) {
    return {
      name: fieldName,
      $type: issueFieldType,
      value: {
        name: values[0],
        $type: YOUTRACK_ENTITY_TYPE.stateBundleElement,
      },
    };
  }

  return {
    name: fieldName,
    $type: issueFieldType,
    value: { name: values[0] },
  };
}

export function buildIssueCustomFieldsPayload(
  inputs: CustomFieldInput[],
  definitions: ProjectCustomFieldDefinition[],
): Array<Record<string, unknown>> {
  const definitionsByName = new Map(definitions.map((definition) => [definition.name, definition]));

  return inputs.map((input) => {
    const definition = definitionsByName.get(input.name);

    if (!definition) {
      const values = normalizeCustomFieldValues(input.value);
      const issueFieldType =
        values.length > 1 ? YOUTRACK_ENTITY_TYPE.multiEnumField : YOUTRACK_ENTITY_TYPE.singleEnumField;

      return buildIssueCustomFieldPayload(input.name, issueFieldType, values);
    }

    return buildIssueCustomFieldPayload(
      input.name,
      definition.issueFieldType,
      normalizeCustomFieldValues(input.value),
    );
  });
}
