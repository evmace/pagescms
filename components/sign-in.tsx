"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import localFont from "next/font/local";
import { signIn } from "@/lib/auth-client";
import { getAuthCallbackURL, getSafeRedirect } from "@/lib/auth-redirect";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const standard = localFont({
  src: [
    { path: "../public/fonts/Standard-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/Standard-Regular.woff", weight: "400", style: "normal" },
  ],
  variable: "--font-standard",
  display: "swap",
});

export function SignIn() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const searchParams = useSearchParams();
  const error = searchParams.get("error") || "";
  const redirectParam = searchParams.get("redirect") || "";
  const safeRedirect = getSafeRedirect(redirectParam);
  const callbackURL = getAuthCallbackURL(safeRedirect);
  const errorCallbackURL =
    safeRedirect === "/"
      ? "/sign-in"
      : `/sign-in?redirect=${encodeURIComponent(safeRedirect)}`;

  const getErrorMessage = (value: string) => {
    if (value.toLowerCase() !== "unable_to_get_user_info") return value;
    return [
      "GitHub denied profile access. Re-authorize Pages CMS in GitHub Settings > Applications > Authorized GitHub Apps / Authorized OAuth Apps, then try again.",
      "https://github.com/settings/applications",
    ].join(" ");
  };

  useEffect(() => {
    if (error) toast.error(getErrorMessage(error), { duration: 12000 });
  }, [error]);

  const handleGithubSignIn = async () => {
    setIsSubmitting(true);
    try {
      const result = await signIn.social({
        provider: "github",
        callbackURL,
        errorCallbackURL,
        disableRedirect: true,
      });
      if (result.error?.message) {
        toast.error(result.error.message);
        setIsSubmitting(false);
        return;
      }

      if (result.data?.url) {
        window.location.assign(result.data.url);
        return;
      }

      setIsSubmitting(false);
      toast.error("Could not start GitHub sign-in. Please try again.");
    } catch (error: any) {
      toast.error(error?.message || "Could not start GitHub sign-in.");
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={cn(standard.variable, "min-h-screen flex flex-col bg-white text-black")}
      style={{ fontFamily: "var(--font-standard), -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif" }}
    >
      <nav className="flex items-center justify-between px-6 py-7 sm:px-10 border-b border-black">
        <span className="text-base uppercase tracking-[0.08em]">Erik Mace</span>
        <span className="text-[0.6875rem] uppercase tracking-[0.1em]" style={{ color: "#0000ff" }}>
          Studio Admin
        </span>
      </nav>

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-[360px]">
          <button
            type="button"
            onClick={handleGithubSignIn}
            disabled={isSubmitting}
            className="w-full border border-black bg-black text-white text-[0.8125rem] uppercase tracking-[0.06em] py-4 px-5 transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {isSubmitting ? "Signing In…" : "Sign In"}
          </button>
        </div>
      </main>

      <footer className="flex items-center justify-between px-6 py-7 sm:px-10 border-t border-black">
        <span className="text-xs">
          &copy; {new Date().getFullYear()} Erik Mace. All rights reserved.
        </span>
        <a
          href="https://erikmace.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs hover:opacity-70"
        >
          erikmace.com
        </a>
      </footer>
    </div>
  );
}
