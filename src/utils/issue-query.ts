import { toIsoDateString, validateDateRange } from "./date.js";
import type { IssueCountInput, IssueListInput, IssueProjectCount } from "../types.js";

export interface IssueQueryBuildResult {
  query: string;
  resolvedProjects?: Array<IssueProjectCount & { originalId: string }>;
}

export async function buildIssueQuery(
  input: IssueCountInput | IssueListInput,
  resolveProject: (projectId: string) => Promise<{ id?: string; shortName?: string; name?: string } | null>,
): Promise<IssueQueryBuildResult> {
  const {
    projectIds,
    createdAfter,
    createdBefore,
    updatedAfter,
    updatedBefore,
    statuses,
    assigneeLogin,
    types,
  } = input;

  if (createdAfter && createdBefore) {
    validateDateRange(createdAfter, createdBefore);
  }

  if (updatedAfter && updatedBefore) {
    validateDateRange(updatedAfter, updatedBefore);
  }

  const filters: string[] = [];
  let resolvedProjects: Array<IssueProjectCount & { originalId: string }> | undefined;

  if (projectIds && projectIds.length > 0) {
    resolvedProjects = [];

    const projectFilterParts = await Promise.all(
      projectIds.map(async (projectId) => {
        const project = await resolveProject(projectId);

        if (project?.shortName) {
          resolvedProjects!.push({
            originalId: projectId,
            projectId: project.id ?? projectId,
            projectShortName: project.shortName,
            projectName: project.name,
            requestedId: projectId,
            count: 0,
          } as IssueProjectCount & { originalId: string });

          return `project: {${project.shortName}}`;
        }

        resolvedProjects!.push({
          originalId: projectId,
          projectId,
          requestedId: projectId,
          count: 0,
        } as IssueProjectCount & { originalId: string });

        return `project: {${projectId}}`;
      }),
    );
    const projectFilter = projectFilterParts.join(" or ");

    filters.push(projectFilterParts.length > 1 ? `(${projectFilter})` : projectFilter);
  }

  if (createdAfter || createdBefore) {
    if (createdAfter && createdBefore) {
      // Both after and before dates specified - use range with YouTrack date syntax
      const startDate = toIsoDateString(createdAfter);
      const endDate = toIsoDateString(createdBefore);

      filters.push(`created: ${startDate} .. ${endDate}`);
    } else if (createdAfter) {
      // Only after date specified - get issues from that date to now
      const startDate = toIsoDateString(createdAfter);

      filters.push(`created: ${startDate} .. now`);
    } else if (createdBefore) {
      // Only before date specified - use range from beginning of time to the specified date
      const endDate = toIsoDateString(createdBefore);

      filters.push(`created: 1970-01-01 .. ${endDate}`);
    }
  }

  if (updatedAfter || updatedBefore) {
    if (updatedAfter && updatedBefore) {
      // Both after and before dates specified - use range with YouTrack date syntax
      const startDate = toIsoDateString(updatedAfter);
      const endDate = toIsoDateString(updatedBefore);

      filters.push(`updated: ${startDate} .. ${endDate}`);
    } else if (updatedAfter) {
      // Only after date specified - get issues updated from that date to now
      const startDate = toIsoDateString(updatedAfter);

      filters.push(`updated: ${startDate} .. now`);
    } else if (updatedBefore) {
      // Only before date specified - use range from beginning of time to the specified date
      const endDate = toIsoDateString(updatedBefore);

      filters.push(`updated: 1970-01-01 .. ${endDate}`);
    }
  }

  if (statuses && statuses.length > 0) {
    const statusFilter = statuses.map((status) => `State: {${status}}`).join(" or ");

    filters.push(statuses.length > 1 ? `(${statusFilter})` : statusFilter);
  }

  if (assigneeLogin) {
    const normalizedAssignee = assigneeLogin.trim();
    const assigneeFilter = normalizedAssignee.toLowerCase() === "me"
      ? "Assignee: me"
      : `Assignee: {${normalizedAssignee}}`;

    filters.push(assigneeFilter);
  }

  if (types && types.length > 0) {
    const typeFilter = types.map((type) => `Type: {${type}}`).join(" or ");

    filters.push(types.length > 1 ? `(${typeFilter})` : typeFilter);
  }

  return {
    query: filters.join(" and "),
    resolvedProjects,
  };
}
