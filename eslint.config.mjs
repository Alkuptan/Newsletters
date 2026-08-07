import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    ".open-next/**",
    ".wrangler/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "cloudflare-env.d.ts",
    "src/lib/supabase/database.types.ts",
  ]),

  // ── Guard rails (mechanical, do not weaken) ─────────────────────────────
  // The admin (service-role) Supabase client bypasses RLS. It may ONLY be
  // imported from feature actions and scripts/. If this rule blocks you,
  // the design is wrong — do not weaken the rule.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/features/*/actions.ts", "src/features/*/actions/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase/admin",
              message:
                "The service-role client bypasses RLS. Import it only from src/features/*/actions.ts or scripts/.",
            },
          ],
        },
      ],
    },
  },
  // Client components must never import server-only Supabase clients.
  {
    files: ["src/components/**/*.{ts,tsx}", "src/features/*/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase/server",
              message:
                "Server client in a client component. Fetch in a Server Component or call a server action instead.",
            },
            {
              name: "@/lib/supabase/admin",
              message: "The service-role client must never reach the browser.",
            },
            {
              name: "@/lib/supabase/dal",
              message: "Auth guards are server-only. Call them from pages or server actions.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
