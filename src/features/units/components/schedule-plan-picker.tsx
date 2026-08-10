"use client";

/**
 * Is this unit meant to have a timeline?
 *
 * A decision the tool cannot work out for itself. Without it, "no schedule" and
 * "deliberately no schedule" are the same thing, and across 152 units that makes
 * "what still needs building" unanswerable.
 *
 * Once a timeline exists the question is settled, so the picker steps aside and
 * simply says so.
 */

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setSchedulePlan } from "../schedule-plan-actions";

type Plan = "photos_only" | "timeline" | null;

const CHOICES: { value: Plan; label: string; hint: string }[] = [
  { value: null, label: "Not decided", hint: "Shows up as still needing a look." },
  { value: "timeline", label: "Needs a timeline", hint: "Listed until one is built." },
  { value: "photos_only", label: "Photos only", hint: "Never asked about again." },
];

export function SchedulePlanPicker({
  unitId,
  plan: initialPlan,
  schedulesBuilt,
  canEdit,
}: {
  unitId: string;
  plan: Plan;
  schedulesBuilt: number;
  canEdit: boolean;
}) {
  const [plan, setPlan] = useState<Plan>(initialPlan);
  const [pending, startTransition] = useTransition();

  if (schedulesBuilt > 0) {
    return (
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Timeline</h2>
        <p className="text-muted-foreground text-xs">
          {schedulesBuilt === 1
            ? "One quotation has a timeline"
            : `${schedulesBuilt} quotations have a timeline`}
          , so this unit uses the Gantt layout.
        </p>
      </div>
    );
  }

  function choose(next: Plan) {
    const previous = plan;
    setPlan(next);
    startTransition(async () => {
      const result = await setSchedulePlan({ unitId, plan: next });
      if (!result.ok) {
        setPlan(previous);
        toast.error(result.error);
        return;
      }
      toast.success(
        next === "photos_only"
          ? "Marked photos only — it will not be listed as missing a timeline."
          : next === "timeline"
            ? "Listed as needing a timeline."
            : "Back to undecided.",
      );
    });
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold">Timeline</h2>
      <p className="text-muted-foreground text-xs">
        No timeline built yet. Which is it?
      </p>
      <div className="flex flex-col gap-1">
        {CHOICES.map((choice) => (
          <label
            key={String(choice.value)}
            className="hover:bg-muted/50 flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-sm"
          >
            <input
              type="radio"
              name={`schedule-plan-${unitId}`}
              className="mt-1"
              checked={plan === choice.value}
              disabled={!canEdit || pending}
              onChange={() => choose(choice.value)}
            />
            <span>
              {choice.label}
              <span className="text-muted-foreground block text-xs">{choice.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
