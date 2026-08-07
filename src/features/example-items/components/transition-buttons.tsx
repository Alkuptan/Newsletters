"use client";

// Teaches: derive UI from the domain model — one button per LEGAL next status
// straight from TRANSITIONS, so the UI can never offer a move the server
// would reject (and adding a status updates this component for free).

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { transitionItem } from "../actions";
import type { ItemStatus } from "../schema";
import { STATUS_LABELS, TRANSITIONS } from "../status-machine";

export function TransitionButtons({ id, status }: { id: string; status: ItemStatus }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function move(to: ItemStatus) {
    startTransition(async () => {
      const result = await transitionItem({ id, to });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {TRANSITIONS[status].map((to) => (
        <Button key={to} variant="outline" size="sm" disabled={isPending} onClick={() => move(to)}>
          Move to {STATUS_LABELS[to]}
        </Button>
      ))}
    </div>
  );
}
