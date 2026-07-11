import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { SignIn } from "@/components/sign-in";
import { getSafeRedirect } from "@/lib/auth-redirect";
import { getRequestContext } from "@/lib/request-context";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const requestHeaders = await headers();
  const resolvedSearchParams = await searchParams;
  const { auth } = getRequestContext();
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });
  const safeRedirect = getSafeRedirect(resolvedSearchParams.redirect);
  if (session?.user) return redirect(safeRedirect === "/sign-in" ? "/" : safeRedirect);

	return (
    <SignIn/>
  );
}
