import "server-only";

import type { Db } from "@/db";
import type { User } from "@/types/user";
import { assertGithubIdentity } from "@/lib/authz-shared";
import { getUserToken } from "@/lib/token";
import { createOctokitInstance } from "@/lib/utils/octokit";

const requireGithubUserToken = async (
  db: Db,
  user: Pick<User, "id" | "githubUsername">,
  identityErrorMessage = "Only GitHub users can perform this action.",
) => {
  assertGithubIdentity(user, identityErrorMessage);
  return getUserToken(db, user.id);
};

const requireGithubRepoWriteAccess = async (
  db: Db,
  user: Pick<User, "id" | "githubUsername">,
  owner: string,
  repo: string,
  identityErrorMessage = "Only GitHub users can perform this action.",
) => {
  const token = await requireGithubUserToken(db, user, identityErrorMessage);
  const octokit = createOctokitInstance(token);
  const response = await octokit.rest.repos.get({ owner, repo });

  if (!response.data.permissions?.push) {
    throw new Error(`You do not have write access to "${owner}/${repo}".`);
  }

  const repoAccess = {
    repoId: response.data.id,
    ownerId: response.data.owner.id,
    ownerLogin: response.data.owner.login,
    repoName: response.data.name,
    ownerType: response.data.owner.type === "User" ? "user" : "org",
  };

  return { token, repoAccess };
};

export { requireGithubUserToken, requireGithubRepoWriteAccess };
