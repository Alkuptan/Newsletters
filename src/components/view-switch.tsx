"use client";

/**
 * Table or cards.
 *
 * Kept in the address bar rather than in component state, for the same reason
 * the filters and the sort are: the choice survives a reload, travels with a
 * shared link, and the server can render the right one first time instead of
 * flashing the wrong view.
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { LayoutGrid, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ViewMode = "table" | "cards";

export function ViewSwitch({ current }: { current: ViewMode }) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();

  function choose(view: ViewMode) {
    if (view === current) return;
    const query = new URLSearchParams(params.toString());
    query.set("view", view);
    router.push(`${pathname}?${query}`);
  }

  return (
    <div className="flex items-end gap-1">
      <div className="space-y-1">
        <span className="text-muted-foreground block text-xs">View</span>
        <div className="flex">
          <Button
            variant={current === "table" ? "default" : "outline"}
            size="sm"
            className="h-8 rounded-r-none"
            onClick={() => choose("table")}
            aria-pressed={current === "table"}
            title="One row per unit — dense, best for working down a list"
          >
            <Rows3 className="mr-1 h-4 w-4" />
            Table
          </Button>
          <Button
            variant={current === "cards" ? "default" : "outline"}
            size="sm"
            className="h-8 rounded-l-none border-l-0"
            onClick={() => choose("cards")}
            aria-pressed={current === "cards"}
            title="One card per unit — roomier"
          >
            <LayoutGrid className="mr-1 h-4 w-4" />
            Cards
          </Button>
        </div>
      </div>
    </div>
  );
}
