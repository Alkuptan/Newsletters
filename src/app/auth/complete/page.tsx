"use client";

/**
 * Finish a sign-in whose tokens arrived in the URL fragment.
 *
 * Supabase's default recovery and invite emails go through its own `/verify`
 * endpoint, which hands the browser back:
 *
 *   /auth/callback?next=/reset-password#access_token=…&refresh_token=…
 *
 * Everything after the `#` is never sent to the server — by design, that is what
 * a fragment is. So the server-side callback sees no `code` and no `token_hash`,
 * concludes the link is broken, and bounces the person to the login page. That
 * is exactly what happened to the first invited colleague: their account was
 * confirmed, they never reached the set-password screen, and they could not get
 * back in.
 *
 * This page is the missing half. It runs in the browser, where the fragment IS
 * readable, hands the tokens to the Supabase client — which writes the session
 * cookies the server reads — and then continues to wherever the link was headed.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AuthCompletePage() {
  const router = useRouter();
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    /*
      Read straight from the address bar rather than with useSearchParams: this
      page cannot be prerendered (it exists to read a fragment that only a
      browser has), and useSearchParams would force a Suspense boundary purely
      to satisfy a build step that can never produce anything useful here.
    */
    const requested = new URLSearchParams(window.location.search).get("next") ?? "/";
    const next =
      requested.startsWith("/") && !requested.startsWith("//") && !requested.startsWith("/\\")
        ? requested
        : "/";

    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    const fragment = new URLSearchParams(hash);
    const accessToken = fragment.get("access_token");
    const refreshToken = fragment.get("refresh_token");

    // Everything that reports a problem happens inside the async work below:
    // setting state synchronously from an effect makes React re-render twice.
    void (async () => {
      if (!accessToken || !refreshToken) {
        setProblem(
          fragment.get("error_description") ??
            "That link has already been used, or it has expired.",
        );
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        setProblem(error.message);
        return;
      }
      /*
        A full navigation rather than router.replace, for two reasons: the
        session cookies were only just written in the browser, and a real load
        guarantees the server renders with them; and replacing the current entry
        drops this tokens-in-the-URL page out of history entirely, so the
        fragment is not left behind in the back button or a screenshot.
      */
      window.location.replace(next);
    })();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{problem ? "That link did not work" : "Signing you in…"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {problem ? (
          <>
            <p className="text-muted-foreground text-sm">{problem}</p>
            <Button onClick={() => router.replace("/login")}>Back to sign in</Button>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">One moment.</p>
        )}
      </CardContent>
    </Card>
  );
}
