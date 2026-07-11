import { cache } from "react";
import { headers } from "next/headers";
import type { Auth } from "@/lib/auth";

const getServerSession = cache(async (auth: Auth) => {
  return auth.api.getSession({
    headers: await headers(),
  });
});

const requireApiUserSession = async (auth: Auth) => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user) {
    return { response: new Response(null, { status: 401 }) };
  }

  return { user: session.user };
};

export { getServerSession, requireApiUserSession };
