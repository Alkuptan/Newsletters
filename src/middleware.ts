// middleware.ts, NOT proxy.ts: Next 16's proxy.ts runs Node-only and is
// currently broken on @opennextjs/cloudflare (opennextjs-cloudflare#962,
// workers-sdk#13755). Revisit when those close.
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
