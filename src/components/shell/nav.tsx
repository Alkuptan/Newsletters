"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/components/shell/nav-config";
// Type-only import from the generated types file — client components must
// never import @/lib/supabase/dal (server-only), so Role comes from here.
import type { Enums } from "@/lib/supabase/database.types";

/**
 * Desktop sidebar nav. The role prop is computed server-side in the layout —
 * client components receive the role, they never derive it.
 */
export function Nav({ role }: { role: Enums<"app_role"> }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || role === "admin");

  return (
    <nav className="flex flex-col gap-1 p-3">
      {items.map((item) => {
        // Exact match for "/" (it prefixes everything), prefix match otherwise
        // so nested routes like /admin/users/… keep their section highlighted.
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
