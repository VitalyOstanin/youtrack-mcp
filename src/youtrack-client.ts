import axios from "axios";
import type {
  YoutrackConfig,
  YoutrackIssue,
  YoutrackIssueDetails,
  YoutrackProject,
  YoutrackUser,
  YoutrackWorkItem,
} from "./types.js";

const defaultFields = {
  issue: "id,idReadable,summary,description,project(id,shortName,name),assignee(id,login,name)",
  issueDetails:
    "id,idReadable,summary,description,created,updated,resolved,project(id,shortName,name),parent(idReadable),assignee(id,login,name),reporter(id,login,name),updater(id,login,name)",
  workItems:
    "id,date,duration(minutes),text,description,issue(idReadable),author(id,login,name,email)",
  users: "id,login,name,fullName,email",
  projects: "id,shortName,name",
} as const;

export class YoutrackClient {
  private readonly http: ReturnType<typeof axios.create>;

  constructor(config: YoutrackConfig) {
    this.http = axios.create({
      baseURL: config.baseUrl,
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/json",
      },
    });

    this.http.interceptors.response.use(
      (response) => response,
      (error) => {
        const message = error.response?.data?.error_description ??
          error.response?.data?.message ??
          error.message ??
          "Unknown error";

        throw new Error(`YouTrack API error: ${message}`);
      },
    );
  }

  async getCurrentUser(): Promise<YoutrackUser> {
    const response = await this.http.get<YoutrackUser>("/api/users/me", {
      params: { fields: "id,login,name,fullName,email" },
    });

    return response.data;
  }

  async getUserByLogin(login: string): Promise<YoutrackUser | null> {
    const response = await this.http.get<YoutrackUser[]>("/api/users", {
      params: {
        fields: defaultFields.users,
        query: `login: {${login}}`,
        top: 1,
      },
    });

    return response.data.at(0) ?? null;
  }

  async getIssue(idReadable: string): Promise<YoutrackIssue> {
    const response = await this.http.get<YoutrackIssue>(`/api/issues/${idReadable}`, {
      params: {
        fields: defaultFields.issue,
      },
    });

    return response.data;
  }

  async getIssueDetails(idReadable: string): Promise<YoutrackIssueDetails> {
    const response = await this.http.get<YoutrackIssueDetails>(`/api/issues/${idReadable}`, {
      params: {
        fields: defaultFields.issueDetails,
      },
    });

    return response.data;
  }

  async searchProjects(): Promise<YoutrackProject[]> {
    const response = await this.http.get<YoutrackProject[]>("/api/admin/projects", {
      params: {
        fields: defaultFields.projects,
        top: 200,
      },
    });

    return response.data;
  }

  async listWorkItems(params: {
    author?: string;
    startDate?: string;
    endDate?: string;
    issueId?: string;
    top?: number;
  } = {}): Promise<YoutrackWorkItem[]> {
    const { author, startDate, endDate, issueId, top } = params;
    const response = await this.http.get<YoutrackWorkItem[]>("/api/workItems", {
      params: {
        top: top ?? 100,
        author,
        startDate,
        endDate,
        issueId,
        fields: defaultFields.workItems,
      },
    });

    return response.data;
  }
}
