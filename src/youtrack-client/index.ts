import { YoutrackClientBase } from "./base.js";
import { withActivities } from "./activities.js";
import { withArticles } from "./articles.js";
import { withAttachments } from "./attachments.js";
import { withIssueBatch } from "./batch.js";
import { withComments } from "./comments.js";
import { withIssueCore } from "./core.js";
import { withIssueSearch } from "./issue-search.js";
import { withIssueLinks } from "./links.js";
import { withIssueState } from "./state.js";
import { withStars } from "./stars.js";
import { withUsersProjects } from "./users-projects.js";
import { withWorkItems } from "./workitems.js";

export { YoutrackClientError } from "./base.js";

export class YoutrackClient extends withWorkItems(
  withIssueSearch(
    withActivities(
      withIssueBatch(
        withComments(
          withArticles(
            withAttachments(
              withIssueCore(
                withIssueLinks(withIssueState(withStars(withUsersProjects(YoutrackClientBase)))),
              ),
            ),
          ),
        ),
      ),
    ),
  ),
) {}
