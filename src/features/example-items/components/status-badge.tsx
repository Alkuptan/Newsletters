// Teaches: map domain values to UI variants in ONE lookup table — no if/else
// chains in JSX, and Record<ItemStatus, ...> breaks the build if a new status
// forgets to pick its look. No "use client": this is pure presentation, so it
// works in Server Components and inside client components alike.
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import type { ItemStatus } from "../schema";
import { STATUS_LABELS } from "../status-machine";

const STATUS_VARIANTS: Record<ItemStatus, React.ComponentProps<typeof Badge>["variant"]> = {
  open: "outline",
  in_progress: "secondary",
  done: "default",
};

export function StatusBadge({ status }: { status: ItemStatus }) {
  return <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>;
}
