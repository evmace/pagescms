import { getRequestContext } from "@/lib/request-context";

const handler = async (request: Request) => {
  const { auth } = getRequestContext();
  return auth.handler(request);
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
