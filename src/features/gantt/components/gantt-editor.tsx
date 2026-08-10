"use client";

/**
 * Build a quotation's Gantt schedule by hand, once — then it is saved, comes
 * back every cycle, and can be changed whenever the schedule moves.
 *
 * The activity list is plain local state rather than a form library: rows are
 * added, removed and reordered, which is exactly the case a field array makes
 * awkward. Validation uses the SAME Zod schema the server action uses, so the
 * message the owner sees is the message the server would have given.
 */

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LAYOUT } from "@/lib/newsletter/layout";
import { shiftActivityDates } from "@/lib/newsletter/schedule-shift";
import { deleteGanttSchedule, saveGanttSchedule } from "../actions";
import { saveGanttScheduleSchema, type GanttTone } from "../schema";

/**
 * How many bars the chart shows at its comfortable spacing. Derived from the
 * layout rather than guessed, so it follows if the panel's size changes.
 */
const COMFORTABLE_BARS = Math.floor(
  (LAYOUT.withSchedule.ganttPanel.maxHeight - 16) /
    (LAYOUT.withSchedule.barHeight + 11),
);

interface ActivityDraft {
  name: string;
  startDate: string;
  finishDate: string;
  tone: GanttTone;
}

/** A schedule from another unit with the same scope of work. */
export interface ReusableOption {
  quotationId: string;
  quoteNumber: string;
  scopeOfWork: string;
  unitDisplayName: string;
  rowLabel: string;
  activities: ActivityDraft[];
}

export interface GanttEditorProps {
  quotationId: string;
  quoteNumber: string;
  /** Falls back to this when the band label is left blank. */
  scopeOfWork: string;
  initialRowLabel: string;
  initialActivities: ActivityDraft[];
  /** The quotation's own dates, used to seed a first bar worth editing. */
  plannedStartDate: string | null;
  maxContractualDate: string | null;
  hasSchedule: boolean;
  /** Schedules on other units doing the same kind of work. */
  reusable?: ReusableOption[];
}

export function GanttEditor({
  quotationId,
  quoteNumber,
  scopeOfWork,
  initialRowLabel,
  initialActivities,
  plannedStartDate,
  maxContractualDate,
  hasSchedule,
  reusable = [],
}: GanttEditorProps) {
  const [open, setOpen] = useState(false);
  const [rowLabel, setRowLabel] = useState(initialRowLabel || scopeOfWork);
  const [activities, setActivities] = useState<ActivityDraft[]>(initialActivities);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Copying a schedule from another unit.
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyFrom, setCopyFrom] = useState(reusable[0]?.quotationId ?? "");
  // Default to this quotation's own planned start — usually exactly right.
  const [copyStart, setCopyStart] = useState(plannedStartDate ?? "");

  function applyCopy() {
    const source = reusable.find((option) => option.quotationId === copyFrom);
    if (!source) return;
    if (!copyStart) {
      setProblem("Choose the date this unit's work starts.");
      return;
    }
    setProblem(null);
    // Every date moves by the same offset, so activity lengths and the gaps
    // between them survive the copy. Everything stays editable afterwards.
    setActivities(shiftActivityDates(source.activities, copyStart));
    setRowLabel(source.rowLabel || scopeOfWork);
    setCopyOpen(false);
    toast.success(
      `Copied ${source.activities.length} bars from ${source.unitDisplayName} and moved them to start ${copyStart}. Adjust anything that does not fit, then save.`,
    );
  }

  function addActivity() {
    // Seed from the previous bar's finish, or from the quotation's own dates —
    // an empty form is far more work than one row to edit.
    const last = activities[activities.length - 1];
    const start = last?.finishDate ?? plannedStartDate ?? "";
    const finish = last?.finishDate ?? maxContractualDate ?? start;
    setActivities((current) => [
      ...current,
      { name: "", startDate: start, finishDate: finish, tone: "normal" },
    ]);
  }

  function update(index: number, patch: Partial<ActivityDraft>) {
    setActivities((current) =>
      current.map((activity, i) => (i === index ? { ...activity, ...patch } : activity)),
    );
  }

  function remove(index: number) {
    setActivities((current) => current.filter((_, i) => i !== index));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= activities.length) return;
    setActivities((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function save() {
    setProblem(null);
    const payload = { quotationId, rowLabel, activities };
    // Check with the shared schema first so the owner gets the message straight
    // away rather than after a round trip.
    const check = saveGanttScheduleSchema.safeParse(payload);
    if (!check.success) {
      const message = check.error.issues[0]?.message ?? "Something in the schedule is not right.";
      setProblem(message);
      return;
    }

    startTransition(async () => {
      const result = await saveGanttSchedule(payload);
      if (!result.ok) {
        setProblem(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(
        activities.length === 0
          ? `Quotation ${quoteNumber} now has no schedule, so this unit uses the photo layout.`
          : `Schedule saved for quotation ${quoteNumber}.`,
      );
    });
  }

  function clearSchedule() {
    startTransition(async () => {
      const result = await deleteGanttSchedule({ quotationId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setActivities([]);
      toast.success(`Schedule removed from quotation ${quoteNumber}.`);
    });
  }

  if (!open) {
    return (
      <div className="space-y-1">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          {hasSchedule
            ? `Edit schedule (${initialActivities.length} bars)`
            : `Build a time schedule for ${quoteNumber}`}
        </Button>
        {/* Worth knowing before opening the editor: there is something to copy. */}
        {!hasSchedule && reusable.length > 0 && (
          <p className="text-muted-foreground text-xs">
            {reusable.length} existing {scopeOfWork || "similar"} schedule
            {reusable.length === 1 ? "" : "s"} can be copied and re-dated.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Schedule for {quoteNumber}</p>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>

      {/* Reuse a schedule from another unit doing the same kind of work. */}
      {reusable.length > 0 && !copyOpen && (
        <Button variant="secondary" size="sm" onClick={() => setCopyOpen(true)}>
          <Copy className="mr-1 h-3.5 w-3.5" />
          Copy a {scopeOfWork || "similar"} schedule ({reusable.length} available)
        </Button>
      )}

      {copyOpen && (
        <div className="bg-muted/40 space-y-2 rounded border p-2">
          <p className="text-xs font-medium">Copy a schedule and move it to this unit&apos;s dates</p>
          <div className="space-y-1">
            <Label htmlFor={`copy-src-${quotationId}`} className="text-xs">
              Copy from
            </Label>
            <select
              id={`copy-src-${quotationId}`}
              value={copyFrom}
              onChange={(event) => setCopyFrom(event.target.value)}
              className="border-input bg-background h-8 w-full rounded-md border px-2 text-sm"
            >
              {reusable.map((option) => (
                <option key={option.quotationId} value={option.quotationId}>
                  {option.unitDisplayName} — {option.scopeOfWork} ({option.activities.length} bars)
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`copy-start-${quotationId}`} className="text-xs">
              Start this unit&apos;s work on
            </Label>
            <Input
              id={`copy-start-${quotationId}`}
              type="date"
              value={copyStart}
              onChange={(event) => setCopyStart(event.target.value)}
              className="h-8 w-[9.5rem]"
            />
          </div>
          <p className="text-muted-foreground text-xs">
            Every activity keeps its length and its gap, so only the dates move. You can change
            anything afterwards.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={applyCopy}>
              Copy and re-date
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCopyOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor={`label-${quotationId}`} className="text-xs">
          Band label
        </Label>
        <Input
          id={`label-${quotationId}`}
          value={rowLabel}
          onChange={(event) => setRowLabel(event.target.value)}
          placeholder={scopeOfWork}
        />
      </div>

      {activities.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          No bars yet. This unit will use the photo layout until you add some.
        </p>
      ) : (
        <ul className="space-y-2">
          {activities.map((activity, index) => (
            <li key={index} className="space-y-1.5 rounded border p-2">
              <div className="flex items-center gap-1">
                <Input
                  value={activity.name}
                  onChange={(event) => update(index, { name: event.target.value })}
                  placeholder="Activity, e.g. Concrete Works"
                  className="h-8"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label="Move up"
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label="Move down"
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label="Remove activity"
                  onClick={() => remove(index)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="date"
                  value={activity.startDate}
                  onChange={(event) => update(index, { startDate: event.target.value })}
                  className="h-8 w-[9.5rem]"
                  aria-label="Start date"
                />
                <span className="text-muted-foreground text-xs">to</span>
                <Input
                  type="date"
                  value={activity.finishDate}
                  onChange={(event) => update(index, { finishDate: event.target.value })}
                  className="h-8 w-[9.5rem]"
                  aria-label="Finish date"
                />
                <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                  <Checkbox
                    checked={activity.tone === "attention"}
                    onCheckedChange={(checked) =>
                      update(index, { tone: checked === true ? "attention" : "normal" })
                    }
                  />
                  {/* The orange bar in the samples, e.g. "Pending Neighbour consent". */}
                  Needs attention
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Past this the bars have to thin out to stay inside the chart. Better
          said here than discovered on an exported slide. */}
      {activities.length > COMFORTABLE_BARS && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {activities.length} bars is more than the chart shows comfortably — above{" "}
          {COMFORTABLE_BARS} they get thinner and harder to read. Consider combining some.
        </p>
      )}

      {problem && <p className="text-destructive text-xs">{problem}</p>}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={addActivity}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add activity
        </Button>
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save schedule"}
        </Button>
        {hasSchedule && (
          <Button variant="ghost" size="sm" onClick={clearSchedule} disabled={pending}>
            Remove schedule
          </Button>
        )}
      </div>
    </div>
  );
}
