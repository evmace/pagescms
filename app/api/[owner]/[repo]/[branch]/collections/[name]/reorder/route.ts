export const maxDuration = 30;

import { createOctokitInstance } from "@/lib/utils/octokit";
import { getFieldByPath, getSchemaByName } from "@/lib/schema";
import { getRepoReadContext } from "@/lib/api-repo-context";
import { parse, stringify } from "@/lib/serialization";
import { getFileExtension, getParentPath, normalizePath } from "@/lib/utils/file";
import { getBranchHeadSha, setBranchHeadSha, updateMultipleFilesCache } from "@/lib/github-cache-file";
import { buildCommitTokens, resolveCommitIdentity, resolveCommitMessage } from "@/lib/commit-message";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { getRequestContext } from "@/lib/request-context";

/**
 * Reorders a group of sibling collection entries by writing new sequential
 * values to a numeric field, in one atomic commit.
 *
 * POST /api/[owner]/[repo]/[branch]/collections/[name]/reorder
 *
 * Requires authentication. Requires `view.reorder` to be configured for the
 * collection, naming the field that stores position. `paths` must be a
 * single sibling group (same `view.nestBy` value, or all lacking one) -- the
 * caller is responsible for scoping the request to one group; this route
 * rejects a request that mixes groups.
 */

export async function POST(
  request: Request,
  context: { params: Promise<{ owner: string, repo: string, branch: string, name: string }> }
) {
  try {
    const params = await context.params;
    const { db, auth } = getRequestContext();
    const { user, token, config } = await getRepoReadContext(db, auth, params);

    const schema = getSchemaByName(config.object, params.name);
    if (!schema) throw createHttpError(`Schema not found for ${params.name}.`, 404);
    if (schema.type !== "collection") throw createHttpError(`"${params.name}" isn't a collection.`, 400);

    const reorderFieldName: string | undefined = schema.view?.reorder;
    if (!reorderFieldName) throw createHttpError(`Reordering isn't enabled for "${params.name}".`, 400);

    const reorderField = getFieldByPath(schema.fields, reorderFieldName);
    if (!reorderField || reorderField.type !== "number") {
      throw createHttpError(`Reorder field "${reorderFieldName}" not found or isn't a number field.`, 400);
    }

    const data: any = await request.json();
    if (!Array.isArray(data.paths) || data.paths.length === 0) {
      throw createHttpError(`"paths" is required and must be a non-empty array.`, 400);
    }
    if (data.paths.length > 500) {
      throw createHttpError(`Too many entries to reorder at once (max 500).`, 400);
    }

    const normalizedPaths: string[] = data.paths.map((p: string) => normalizePath(p));
    if (new Set(normalizedPaths).size !== normalizedPaths.length) {
      throw createHttpError(`"paths" contains duplicates.`, 400);
    }

    for (const p of normalizedPaths) {
      if (!p.startsWith(schema.path)) throw createHttpError(`Invalid path "${p}" for collection "${params.name}".`, 400);
      if (schema.subfolders === false && getParentPath(p) !== schema.path) {
        throw createHttpError(`Subfolders are not allowed for collection "${params.name}".`, 400);
      }
      if (getFileExtension(p) !== (schema.extension ?? "")) {
        throw createHttpError(`Invalid extension for "${p}".`, 400);
      }
    }

    const octokit = createOctokitInstance(token);
    const currentSha = await getBranchHeadSha(params.owner, params.repo, params.branch, token);

    const { data: treeData } = await octokit.rest.git.getTree({
      owner: params.owner,
      repo: params.repo,
      tree_sha: currentSha,
      recursive: "true",
    });

    const blobShaByPath = new Map<string, string>();
    for (const item of treeData.tree) {
      if (item.type === "blob" && item.path && item.sha) blobShaByPath.set(item.path, item.sha);
    }
    for (const p of normalizedPaths) {
      if (!blobShaByPath.has(p)) throw createHttpError(`"${p}" no longer exists -- refresh and try again.`, 404);
    }

    // Fetch + parse every entry so we can (a) verify they share one sibling
    // group and (b) preserve every other field when rewriting `order`.
    const nestByField: string | undefined = schema.view?.nestBy;
    const parsedByPath = new Map<string, Record<string, any>>();
    let groupKey: unknown = undefined;
    let groupKeySeen = false;

    for (const p of normalizedPaths) {
      const { data: blobData } = await octokit.rest.git.getBlob({
        owner: params.owner,
        repo: params.repo,
        file_sha: blobShaByPath.get(p)!,
      });
      const raw = Buffer.from(blobData.content, "base64").toString("utf-8");
      const parsed = parse(raw, { format: schema.format, delimiters: schema.delimiters });
      parsedByPath.set(p, parsed);

      if (nestByField) {
        const value = parsed[nestByField] ?? null;
        if (!groupKeySeen) {
          groupKey = value;
          groupKeySeen = true;
        } else if (groupKey !== value) {
          throw createHttpError(`These entries aren't all in the same group -- refresh and try again.`, 400);
        }
      }
    }

    const newTreeEntries = treeData.tree
      .filter((item) => item.type !== "tree")
      .map((item) => ({
        path: item.path!,
        mode: item.mode as "100644" | "100755" | "040000" | "160000" | "120000",
        type: item.type as "commit" | "tree" | "blob",
        sha: item.sha!,
      }));
    const treeIndexByPath = new Map(newTreeEntries.map((entry, index) => [entry.path, index]));

    const changed: Array<{ path: string; sha: string; order: number }> = [];

    for (let i = 0; i < normalizedPaths.length; i++) {
      const p = normalizedPaths[i];
      const newOrder = i + 1;
      const parsed = parsedByPath.get(p)!;
      if (parsed[reorderFieldName] === newOrder) continue;

      const updatedContent = stringify(
        { ...parsed, [reorderFieldName]: newOrder },
        { format: schema.format, delimiters: schema.delimiters },
      );
      const { data: newBlob } = await octokit.rest.git.createBlob({
        owner: params.owner,
        repo: params.repo,
        content: updatedContent,
        encoding: "utf-8",
      });

      const treeIndex = treeIndexByPath.get(p);
      if (treeIndex !== undefined) newTreeEntries[treeIndex] = { ...newTreeEntries[treeIndex], sha: newBlob.sha };
      changed.push({ path: p, sha: newBlob.sha, order: newOrder });
    }

    if (changed.length === 0) {
      return Response.json({ status: "success", data: { commitSha: null, updated: [] } });
    }

    const commitIdentity = resolveCommitIdentity({
      configObject: config.object,
      identityOverride: schema?.commit?.identity,
    });
    const committer = commitIdentity === "user" && user.email
      ? { name: user.name?.trim() || user.email, email: user.email }
      : undefined;

    const { data: newTreeData } = await octokit.rest.git.createTree({
      owner: params.owner,
      repo: params.repo,
      tree: newTreeEntries,
    });

    const { data: commitData } = await octokit.rest.git.createCommit({
      owner: params.owner,
      repo: params.repo,
      message: resolveCommitMessage({
        configObject: config.object,
        templatesOverride: schema?.commit?.templates,
        action: "reorder",
        tokens: buildCommitTokens({
          action: "reorder",
          owner: params.owner,
          repo: params.repo,
          branch: params.branch,
          contentName: params.name,
          user: user.email || user.name || String(user.id || ""),
          userName: committer?.name,
          userEmail: committer?.email,
        }),
      }),
      tree: newTreeData.sha,
      parents: [currentSha],
      committer,
    });

    try {
      await octokit.rest.git.updateRef({
        owner: params.owner,
        repo: params.repo,
        ref: `heads/${params.branch}`,
        sha: commitData.sha,
      });
    } catch (error: any) {
      if (error.status === 422) {
        throw createHttpError(`This list changed since you loaded it -- refresh and try again.`, 409);
      }
      throw error;
    }

    setBranchHeadSha(params.owner, params.repo, params.branch, commitData.sha);

    await updateMultipleFilesCache(
      db,
      params.owner,
      params.repo,
      params.branch,
      [],
      changed.map((c) => ({ path: c.path, sha: c.sha })),
      [],
      token,
      { sha: commitData.sha, timestamp: Date.now() },
    );

    return Response.json({
      status: "success",
      data: {
        commitSha: commitData.sha,
        updated: changed.map((c) => ({ path: c.path, order: c.order })),
      },
    });
  } catch (error: any) {
    console.error(error);
    return toErrorResponse(error);
  }
}
