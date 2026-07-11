import { createHttpError } from "@/lib/api-error";
import { getConfig } from "@/lib/config-store";
import { getGithubId } from "@/lib/github-account";
import { checkRepoAccess } from "@/lib/github-cache-permissions";
import { requireApiUserSession } from "@/lib/session-server";
import { getToken } from "@/lib/token";
import type { Db } from "@/db";
import type { Auth } from "@/lib/auth";
import type { Config } from "@/types/config";
import type { User } from "@/types/user";

type RepoRef = {
  owner: string;
  repo: string;
  branch: string;
};

type RepoReadContext = {
  user: User;
  token: string;
  config: Config;
};

const getRepoReadContext = async (
  db: Db,
  auth: Auth,
  { owner, repo, branch }: RepoRef,
): Promise<RepoReadContext> => {
  const sessionResult = await requireApiUserSession(auth);
  if ("response" in sessionResult) {
    throw createHttpError("Not signed in.", sessionResult.response?.status ?? 401);
  }

  const user = sessionResult.user as User;
  const { token, source } = await getToken(db, user, owner, repo);
  if (!token) throw createHttpError("Token not found", 401);

  const githubId = await getGithubId(db, user.id);
  if (githubId && source === "user") {
    const hasAccess = await checkRepoAccess(db, token, owner, repo, githubId);
    if (!hasAccess) throw createHttpError(`No access to repository ${owner}/${repo}.`, 403);
  }

  const config = await getConfig(db, owner, repo, branch, {
    getToken: async () => token,
  });
  if (!config) throw createHttpError(`Configuration not found for ${owner}/${repo}/${branch}.`, 404);

  return { user, token, config };
};

export { getRepoReadContext };
