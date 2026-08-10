"use client";

/**
 * Move to the next or previous unit without going back to the list.
 *
 * A patch is sixty units. Working through it by returning to the dashboard and
 * finding your place again is sixty round trips, so the neighbours travel with
 * the page.
 *
 * The order is whatever the LIST was showing, filters and all — arriving from
 * "needs a timeline" and then stepping through every unit in the programme
 * would be worse than useless.
 */

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, List } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface UnitNeighbours {
  previous: { id: string; displayName: string } | null;
  next: { id: string; displayName: string } | null;
  position: number;
  total: number;
  /** The list's own address, so "back" returns to the same filtered view. */
  listHref: string;
}

export function UnitNav({ previous, next, position, total, listHref }: UnitNeighbours) {
  const router = useRouter();

  // Alt+arrow, so the keys still work normally inside the text boxes on this page.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowLeft" && previous) {
        event.preventDefault();
        router.push(`/units/${previous.id}${search()}`);
      }
      if (event.key === "ArrowRight" && next) {
        event.preventDefault();
        router.push(`/units/${next.id}${search()}`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previous, next, router]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" asChild disabled={!previous}>
        {previous ? (
          <Link href={`/units/${previous.id}${search()}`} title={previous.displayName}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            Previous
          </Link>
        ) : (
          <span className="opacity-50">
            <ChevronLeft className="mr-1 h-4 w-4" />
            Previous
          </span>
        )}
      </Button>

      <span className="text-muted-foreground text-xs tabular-nums">
        {position} of {total}
      </span>

      <Button variant="outline" size="sm" asChild disabled={!next}>
        {next ? (
          <Link href={`/units/${next.id}${search()}`} title={next.displayName}>
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        ) : (
          <span className="opacity-50">
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </span>
        )}
      </Button>

      <Button variant="ghost" size="sm" asChild>
        <Link href={listHref}>
          <List className="mr-1 h-4 w-4" />
          Back to the list
        </Link>
      </Button>
    </div>
  );
}

/**
 * Carry the current filters onto the neighbour.
 *
 * Read from the address bar rather than passed in, so stepping through a
 * filtered run keeps the same run all the way along.
 */
function search(): string {
  if (typeof window === "undefined") return "";
  return window.location.search;
}
