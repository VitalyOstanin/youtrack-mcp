import type {
  YoutrackProject,
  YoutrackProjectListPayload,
  YoutrackUser,
  YoutrackUserListPayload,
} from "../types.js";

import {
  type Constructor,
  DEFAULT_PAGE_SIZE,
  type YoutrackClientBase,
  YoutrackClientError,
  defaultFields,
} from "./base.js";

/**
 * Public surface of the users + projects domain. The "internal" helpers
 * (`findProject`, `resolveAssignee`, ...) appear here as well: TypeScript
 * mixins cannot keep them `protected` once the anonymous class is exposed
 * through an exported function (TS4094). Other domain mixins still depend on
 * them, so they have to be reachable on the assembled `YoutrackClient` type.
 * They are not part of the tool surface; only the client itself calls them.
 */
export interface UsersProjectsMixin {
  getCurrentUser: () => Promise<YoutrackUser>;
  getUserByLogin: (login: string) => Promise<YoutrackUser | null>;
  listUsers: (pagination?: { limit?: number | undefined; skip?: number | undefined }) => Promise<YoutrackUserListPayload>;
  listProjects: (pagination?: { limit?: number | undefined; skip?: number | undefined }) => Promise<YoutrackProjectListPayload>;
  getProjectByShortName: (shortName: string) => Promise<YoutrackProject | null>;
  // Internal helpers used by other mixins:
  fetchAllProjects: () => Promise<YoutrackProjectListPayload>;
  getProjectById: (projectId: string) => Promise<YoutrackProject | null>;
  cacheProject: (project: YoutrackProject) => void;
  findProject: (identifier: string) => Promise<YoutrackProject | null>;
  resolveAssignee: (login: string) => Promise<YoutrackUser>;
}

export function withUsersProjects<TBase extends Constructor<YoutrackClientBase>>(
  Base: TBase,
): TBase & Constructor<UsersProjectsMixin> {
  return class WithUsersProjects extends Base {
    async getCurrentUser(): Promise<YoutrackUser> {
      if (this.cachedCurrentUser) {
        return this.cachedCurrentUser;
      }

      try {
        const response = await this.http.get<YoutrackUser>("/api/users/me", {
          params: { fields: defaultFields.users },
        });
        const user = response.data;

        this.cachedCurrentUser = user;
        this.usersByLogin.set(user.login, user);

        return user;
      } catch (error) {
        throw this.normalizeError(error);
      }
    }

    async getUserByLogin(login: string): Promise<YoutrackUser | null> {
      if (this.usersByLogin.has(login)) {
        return this.usersByLogin.get(login) ?? null;
      }

      try {
        const response = await this.http.get<YoutrackUser[]>("/api/users", {
          params: {
            fields: defaultFields.users,
            query: `login: {${login}}`,
            top: 1,
          },
        });
        const user = response.data.at(0) ?? null;

        if (user) {
          this.usersByLogin.set(user.login, user);
        }

        return user;
      } catch (error) {
        throw this.normalizeError(error);
      }
    }

    async listUsers(pagination: { limit?: number | undefined; skip?: number | undefined } = {}): Promise<YoutrackUserListPayload> {
      try {
        const response = await this.http.get<YoutrackUser[]>("/api/users", {
          params: {
            fields: defaultFields.users,
            $top: pagination.limit ?? DEFAULT_PAGE_SIZE,
            ...(pagination.skip !== undefined ? { $skip: pagination.skip } : {}),
          },
        });

        response.data.forEach((user) => {
          this.usersByLogin.set(user.login, user);
        });

        return { users: response.data };
      } catch (error) {
        throw this.normalizeError(error);
      }
    }

    async listProjects(pagination: { limit?: number | undefined; skip?: number | undefined } = {}): Promise<YoutrackProjectListPayload> {
      // Single-page request when limit/skip is set explicitly. No caching, no
      // single-flight: the caller asked for a specific window.
      if (!(pagination.limit === undefined && pagination.skip === undefined)) {
        try {
          const response = await this.http.get<YoutrackProject[]>("/api/admin/projects", {
            params: {
              fields: defaultFields.projects,
              $top: pagination.limit ?? DEFAULT_PAGE_SIZE,
              ...(pagination.skip !== undefined ? { $skip: pagination.skip } : {}),
            },
          });

          response.data.forEach((project) => { this.cacheProject(project); });

          return { projects: response.data };
        } catch (error) {
          throw this.normalizeError(error);
        }
      }

      // Auto-paginated path: serve from cache when populated; otherwise share
      // one in-flight fetch among parallel callers.
      if (this.projectsByShortName.size > 0) {
        return { projects: Array.from(this.projectsByShortName.values()) };
      }

      this.listProjectsInFlight ??= this.fetchAllProjects().finally(() => {
        this.listProjectsInFlight = undefined;
      });

      return this.listProjectsInFlight;
    }

    async fetchAllProjects(): Promise<YoutrackProjectListPayload> {
      try {
        const projects: YoutrackProject[] = [];
        let skip = 0;

        for (;;) {
          const page = await this.http.get<YoutrackProject[]>("/api/admin/projects", {
            params: {
              fields: defaultFields.projects,
              $top: DEFAULT_PAGE_SIZE,
              $skip: skip,
            },
          });

          projects.push(...page.data);

          if (page.data.length < DEFAULT_PAGE_SIZE) break;

          skip += page.data.length;
        }

        projects.forEach((project) => { this.cacheProject(project); });

        return { projects };
      } catch (error) {
        throw this.normalizeError(error);
      }
    }

    async getProjectByShortName(shortName: string): Promise<YoutrackProject | null> {
      if (this.projectsByShortName.has(shortName)) {
        return this.projectsByShortName.get(shortName) ?? null;
      }

      const { projects } = await this.listProjects();
      const project = projects.find((candidate) => candidate.shortName === shortName) ?? null;

      if (project) {
        this.cacheProject(project);
      }

      return project;
    }

    async getProjectById(projectId: string): Promise<YoutrackProject | null> {
      const cached = this.projectsById.get(projectId);

      if (cached) {
        return cached;
      }

      const { projects } = await this.listProjects();
      const project = projects.find((candidate) => candidate.id === projectId) ?? null;

      return project;
    }

    cacheProject(project: YoutrackProject): void {
      if (project.shortName) {
        this.projectsByShortName.set(project.shortName, project);
      }

      if (project.id) {
        this.projectsById.set(project.id, project);
      }
    }

    async findProject(identifier: string): Promise<YoutrackProject | null> {
      const byId = await this.getProjectById(identifier);

      if (byId) {
        return byId;
      }

      const byShortName = await this.getProjectByShortName(identifier);

      return byShortName;
    }

    async resolveAssignee(login: string): Promise<YoutrackUser> {
      if (login === "me") {
        return await this.getCurrentUser();
      }

      const user = await this.getUserByLogin(login);

      if (user) {
        return user;
      }

      throw new YoutrackClientError(`User with login '${login}' not found`);
    }
  };
}
