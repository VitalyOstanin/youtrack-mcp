import {
  YOUTRACK_ENTITY_TYPE,
  type IssueChangeStateInput,
  type IssueChangeStatePayload,
  type IssueError,
  type IssueStatePayload,
  type YoutrackCustomField,
  type YoutrackIssueDetails,
  type YoutrackStateField,
} from "../types.js";

import {
  CUSTOM_FIELDS_STATE_FETCH,
  type Constructor,
  type YoutrackClientBase,
  YoutrackClientError,
  encId,
} from "./base.js";

export interface IssueStateMixin {
  getIssueState: (issueId: string) => Promise<IssueStatePayload>;
  getIssuesState: (issueIds: string[]) => Promise<{ states: IssueStatePayload[]; errors?: IssueError[] }>;
  getIssueCustomFields: (issueId: string) => Promise<YoutrackCustomField[]>;
  changeIssueState: (input: IssueChangeStateInput) => Promise<IssueChangeStatePayload>;
}

export function withIssueState<TBase extends Constructor<YoutrackClientBase>>(
  Base: TBase,
): TBase & Constructor<IssueStateMixin> {
  return class WithIssueState extends Base {
    /**
     * Lightweight state lookup. Returns only the State custom field with
     * id/name/presentation. Avoids fetching the full custom-field set or
     * possibleEvents — useful for batch state checks.
     */
    async getIssueState(issueId: string): Promise<IssueStatePayload> {
      const resolvedId = this.resolveIssueId(issueId);

      try {
        const fields = "id,idReadable,customFields(id,name,value(id,name,presentation),$type)";
        const response = await this.http.get<YoutrackIssueDetails>(`/api/issues/${encId(resolvedId)}`, {
          params: { fields },
        });
        const stateField = response.data.customFields?.find(
          (f) => f.$type === YOUTRACK_ENTITY_TYPE.stateField || f.$type === YOUTRACK_ENTITY_TYPE.stateMachineField || f.name === "State",
        );
        const value = stateField?.value as { id?: string; name?: string; presentation?: string } | undefined;

        return {
          issueId: response.data.idReadable,
          state: value
            ? { id: value.id, name: value.name, presentation: value.presentation }
            : null,
        };
      } catch (error) {
        throw this.normalizeError(error);
      }
    }

    /**
     * Batch state lookup. Issues a single search query (`issue id: A B C`) and
     * extracts the State custom field for each match. Issues that aren't found
     * are reported in `errors`.
     */
    async getIssuesState(issueIds: string[]): Promise<{ states: IssueStatePayload[]; errors?: IssueError[] }> {
      if (!issueIds.length) {
        return { states: [] };
      }

      const resolvedIds = issueIds.map((id) => this.resolveIssueId(id));
      const query = `issue id: ${resolvedIds.join(" ")}`;
      const fields = "id,idReadable,customFields(id,name,value(id,name,presentation),$type)";

      try {
        const foundIssues = await this.getWithFlexibleTop<YoutrackIssueDetails[]>("/api/issues", {
          fields,
          query,
          $top: resolvedIds.length,
        });
        const foundIds = new Set(foundIssues.map((issue) => issue.idReadable));
        const errors: IssueError[] = [];

        for (const issueId of resolvedIds) {
          if (!foundIds.has(issueId)) {
            errors.push({ issueId, error: `Issue '${issueId}' not found` });
          }
        }

        const states: IssueStatePayload[] = foundIssues.map((issue) => {
          const stateField = issue.customFields?.find(
            (f) => f.$type === YOUTRACK_ENTITY_TYPE.stateField || f.$type === YOUTRACK_ENTITY_TYPE.stateMachineField || f.name === "State",
          );
          const value = stateField?.value as { id?: string; name?: string; presentation?: string } | undefined;

          return {
            issueId: issue.idReadable,
            state: value
              ? { id: value.id, name: value.name, presentation: value.presentation }
              : null,
          };
        });

        return errors.length ? { states, errors } : { states };
      } catch (error) {
        throw this.normalizeError(error);
      }
    }

    async getIssueCustomFields(issueId: string): Promise<YoutrackCustomField[]> {
      try {
        const response = await this.http.get<YoutrackCustomField[]>(`/api/issues/${encId(issueId)}/customFields`, {
          params: {
            fields: CUSTOM_FIELDS_STATE_FETCH,
          },
        });
        const customFields = response.data;

        return customFields;
      } catch (error) {
        throw this.normalizeError(error);
      }
    }

    async changeIssueState(input: IssueChangeStateInput): Promise<IssueChangeStatePayload> {
      const resolvedId = this.resolveIssueId(input.issueId);

      try {
        const customFields = await this.getIssueCustomFields(resolvedId);
        const stateField = customFields.find(
          (field) =>
            (field.$type === YOUTRACK_ENTITY_TYPE.stateMachineField || field.$type === YOUTRACK_ENTITY_TYPE.stateField) &&
            field.name === "State",
        );

        if (!stateField) {
          throw new YoutrackClientError("State field not found for this issue");
        }

        const previousState = stateField.value?.presentation ?? stateField.value?.name ?? "Unknown";

        if (stateField.$type === YOUTRACK_ENTITY_TYPE.stateMachineField) {
          const stateMachineField = stateField as YoutrackStateField;

          if (stateMachineField.possibleEvents.length === 0) {
            throw new YoutrackClientError("No state transitions available for this issue");
          }

          const targetStateLower = input.stateName.toLowerCase();
          const matchingEvent = stateMachineField.possibleEvents.find(
            (event) =>
              event.presentation.toLowerCase() === targetStateLower || event.id.toLowerCase() === targetStateLower,
          );

          if (!matchingEvent) {
            const availableStates = stateMachineField.possibleEvents.map((e) => e.presentation).join(", ");

            throw new YoutrackClientError(
              `State transition to '${input.stateName}' is not available. Available transitions: ${availableStates}`,
            );
          }

          const body = {
            event: {
              id: matchingEvent.id,
              presentation: matchingEvent.presentation,
              $type: YOUTRACK_ENTITY_TYPE.event,
            },
          };

          await this.http.post(`/api/issues/${encId(resolvedId)}/fields/${encId(stateField.id)}`, body);

          const payload = {
            issueId: resolvedId,
            previousState,
            newState: matchingEvent.presentation,
            transitionUsed: matchingEvent.id,
          };

          return payload;
        }

        if (stateField.$type === YOUTRACK_ENTITY_TYPE.stateField) {
          // Set state by name; YouTrack rejects invalid state names with 400/422.
          const body = {
            customFields: [
              {
                name: "State",
                $type: YOUTRACK_ENTITY_TYPE.stateField,
                value: {
                  name: input.stateName,
                  $type: YOUTRACK_ENTITY_TYPE.stateBundleElement,
                },
              },
            ],
          };

          try {
            await this.http.post(`/api/issues/${encId(resolvedId)}`, body);
          } catch (error) {
            const normalized = this.normalizeError(error);

            if (normalized.status === 400 || normalized.status === 422) {
              const enhancedError = new YoutrackClientError(
                `Failed to set state to '${input.stateName}'. The state may not exist for this project. Original error: ${normalized.message}`,
                normalized.status,
                normalized.details,
              );

              throw enhancedError;
            }

            throw normalized;
          }

          const payload = {
            issueId: resolvedId,
            previousState,
            newState: input.stateName,
          };

          return payload;
        }

        throw new YoutrackClientError(`Unsupported state field type: ${stateField.$type}`);
      } catch (error) {
        throw this.normalizeError(error);
      }
    }
  };
}
