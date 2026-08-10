"use client";

/**
 * The things the owner types once per unit, plus the commentary they revise every
 * cycle: the name and client on the grey header, which stage is lit, and the Area
 * of Concern bullets.
 *
 * Validation uses the SAME schemas the server actions use, so the sentence shown
 * here is the sentence the server would have given.
 */

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { STAGE_LABELS, STAGES, type Stage } from "@/lib/newsletter/types";
import { setUnitConcerns, updateUnit } from "../actions";
import { setConcernsSchema, updateUnitSchema } from "../schema";

export function UnitDetailsForm({
  unitId,
  displayName: initialDisplayName,
  clientName: initialClientName,
  stageOverride: initialStage,
  /** What the stage would be if left on automatic — shown so the choice is informed. */
  derivedStage,
  /** Bullets currently on the newsletter, whether typed or from the sheet. */
  concerns,
  /** True when those bullets are the owner's own, not the sheet's. */
  concernsAreOverridden,
  /** What the sheet's Notes column says right now, for comparison. */
  sheetConcerns,
  canEdit,
}: {
  unitId: string;
  displayName: string;
  clientName: string | null;
  stageOverride: Stage | null;
  derivedStage: Stage;
  concerns: string[];
  concernsAreOverridden: boolean;
  sheetConcerns: string[];
  canEdit: boolean;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [clientName, setClientName] = useState(initialClientName ?? "");
  const [stage, setStage] = useState<Stage | "">(initialStage ?? "");
  const [useSheetNotes, setUseSheetNotes] = useState(!concernsAreOverridden);
  const [concernText, setConcernText] = useState(concerns.join("\n"));
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /*
    What the owner wrote carries forward from cycle to cycle — it is more
    accurate than the sheet's Notes column, which is why it wins. But the sheet
    moving on and nobody noticing is the other half of that bargain, so the
    divergence is shown rather than silently kept.
  */
  const sheetDiffers =
    concernsAreOverridden &&
    sheetConcerns.join("|") !==
      concernText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join("|");

  function saveDetails() {
    setProblem(null);
    const payload = {
      id: unitId,
      displayName,
      clientName,
      // "" is the automatic choice, which clears the override.
      stageOverride: stage === "" ? null : stage,
    };
    const check = updateUnitSchema.safeParse(payload);
    if (!check.success) {
      setProblem(check.error.issues[0]?.message ?? "Something is not right.");
      return;
    }
    startTransition(async () => {
      const result = await updateUnit(payload);
      if (!result.ok) {
        setProblem(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Saved.");
    });
  }

  function saveConcerns() {
    setProblem(null);
    // null puts the box back to following the sheet's Notes; a list — even an
    // empty one — is the owner taking charge of it.
    const bullets = useSheetNotes
      ? null
      : concernText
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0);

    const payload = { id: unitId, concerns: bullets };
    const check = setConcernsSchema.safeParse(payload);
    if (!check.success) {
      setProblem(check.error.issues[0]?.message ?? "Something is not right.");
      return;
    }
    startTransition(async () => {
      const result = await setUnitConcerns(payload);
      if (!result.ok) {
        setProblem(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(
        useSheetNotes ? "Area of Concern now follows the sheet's notes." : "Area of Concern saved.",
      );
    });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold">Unit details</h2>

      <div className="space-y-1">
        <Label htmlFor={`name-${unitId}`} className="text-xs">
          Name on the newsletter
        </Label>
        <Input
          id={`name-${unitId}`}
          value={displayName}
          disabled={!canEdit || pending}
          onChange={(event) => setDisplayName(event.target.value)}
          className="h-8"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={`client-${unitId}`} className="text-xs">
          Client
        </Label>
        <Input
          id={`client-${unitId}`}
          value={clientName}
          placeholder="Mona Ibrahim; Youssef Hakim"
          disabled={!canEdit || pending}
          onChange={(event) => setClientName(event.target.value)}
          className="h-8"
        />
        <p className="text-muted-foreground text-xs">
          Filled from the sheet once a <strong>Client Name</strong> column is added to the query.
          Several owners: separate them with a semicolon, then choose who is named below. Titles
          belong there too, not here.
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`stage-${unitId}`} className="text-xs">
          Stage highlighted
        </Label>
        <select
          id={`stage-${unitId}`}
          value={stage}
          disabled={!canEdit || pending}
          onChange={(event) => setStage(event.target.value as Stage | "")}
          className="border-input bg-background h-8 w-full rounded-md border px-2 text-sm"
        >
          <option value="">Automatic — {STAGE_LABELS[derivedStage]}</option>
          {STAGES.map((candidate) => (
            <option key={candidate} value={candidate}>
              {STAGE_LABELS[candidate]}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs">
          Automatic follows the quotations&apos; Project Status.
        </p>
      </div>

      {canEdit && (
        <Button size="sm" onClick={saveDetails} disabled={pending}>
          {pending ? "Saving…" : "Save details"}
        </Button>
      )}

      <div className="space-y-2 border-t pt-4">
        <h2 className="text-sm font-semibold">Area of Concern</h2>
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <Checkbox
            checked={useSheetNotes}
            disabled={!canEdit || pending}
            onCheckedChange={(checked) => setUseSheetNotes(checked === true)}
          />
          Use the notes from the sheet
        </label>

        {!useSheetNotes && sheetDiffers && (
          <div className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-800 dark:bg-amber-950">
            <p className="text-amber-900 dark:text-amber-200">
              The sheet&apos;s notes now say something different. Yours is kept — this is only so
              you know.
            </p>
            {sheetConcerns.length > 0 ? (
              <ul className="text-muted-foreground list-inside list-disc">
                {sheetConcerns.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">The sheet has no notes for this unit now.</p>
            )}
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => setConcernText(sheetConcerns.join("\n"))}
              >
                Use the sheet&apos;s wording
              </Button>
            )}
          </div>
        )}

        {!useSheetNotes && (
          <div className="space-y-1">
            <Label htmlFor={`concerns-${unitId}`} className="text-xs">
              One bullet per line
            </Label>
            <Textarea
              id={`concerns-${unitId}`}
              value={concernText}
              rows={5}
              disabled={!canEdit || pending}
              onChange={(event) => setConcernText(event.target.value)}
              className="text-sm"
            />
            <p className="text-muted-foreground text-xs">
              Six bullets is about all the box holds. Leave it empty to show nothing.
            </p>
          </div>
        )}

        {canEdit && (
          <Button variant="outline" size="sm" onClick={saveConcerns} disabled={pending}>
            {pending ? "Saving…" : "Save Area of Concern"}
          </Button>
        )}
      </div>

      {problem && <p className="text-destructive text-xs">{problem}</p>}
    </div>
  );
}
