import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getRepoReadContext } from "@/lib/api-repo-context";
import { getSchemaByName } from "@/lib/schema";
import { getFileExtension, normalizePath } from "@/lib/utils/file";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { getRequestContext } from "@/lib/request-context";

/**
 * Issue a scoped Vercel Blob client-upload token for a media file.
 *
 * POST /api/[owner]/[repo]/[branch]/media/upload-token
 *
 * Requires authentication. Lets the browser upload the file straight to Blob
 * storage instead of through this Next.js route, since Vercel Serverless
 * Functions cap request bodies at 4.5MB -- too small for full-res photos or
 * audio recordings once base64-encoded. The actual GitHub commit still goes
 * through POST /files/[path], which fetches the blob server-side afterward.
 */

export async function POST(
  request: Request,
  context: { params: Promise<{ owner: string, repo: string, branch: string }> }
) {
  try {
    const params = await context.params;
    const { db, auth } = getRequestContext();
    const { config } = await getRepoReadContext(db, auth, params);

    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayloadRaw) => {
        const clientPayload = clientPayloadRaw ? JSON.parse(clientPayloadRaw) : {};
        const { name } = clientPayload;

        const schema = getSchemaByName(config.object, name, "media");
        if (!schema) throw createHttpError(`Media schema not found for "${name}".`, 400);

        const normalizedPath = normalizePath(pathname);
        if (!normalizedPath.startsWith(schema.input)) {
          throw createHttpError(`Invalid path "${pathname}" for media "${name}".`, 400);
        }

        const extension = getFileExtension(normalizedPath);
        if (schema.extensions?.length > 0 && !schema.extensions.includes(extension)) {
          throw createHttpError(`Invalid extension "${extension}" for media.`, 400);
        }

        return {
          addRandomSuffix: false,
          allowOverwrite: true,
          maximumSizeInBytes: 500 * 1024 * 1024,
        };
      },
    });

    return Response.json(jsonResponse);
  } catch (error: any) {
    console.error(error);
    return toErrorResponse(error);
  }
}
