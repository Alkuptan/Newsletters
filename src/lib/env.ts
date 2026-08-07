import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Server-side env lookup that works in both runtimes:
 * - `next dev` / vitest: process.env (from .env.local)
 * - Workers runtime: the Cloudflare env (wrangler secrets / .dev.vars)
 */
export function getServerEnv(name: string): string {
  let value = process.env[name];
  if (!value) {
    try {
      value = (getCloudflareContext().env as unknown as Record<string, string | undefined>)[name];
    } catch {
      // not running inside a Cloudflare context (e.g. plain vitest)
    }
  }
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
