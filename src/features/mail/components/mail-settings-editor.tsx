"use client";

/**
 * The covering email everyone shares, and who gets copied.
 *
 * Two separate things on one screen because they are always set up together:
 * the wording (with the placeholders the tool fills per unit), and the CC rules —
 * a standing list for every unit, plus one rule per project manager for their own
 * units.
 *
 * Admin-only to change. A viewer or a project manager sees the same screen
 * read-only, because knowing who is copied matters even if you cannot edit it.
 */

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAIL_PLACEHOLDERS, fillTemplate, unknownPlaceholders } from "@/lib/newsletter/mail";
import { deletePmRouting, saveMailSettings, savePmRouting } from "../actions";
import { saveMailSettingsSchema, savePmRoutingSchema, splitAddresses } from "../schema";
import type { MailSettings, PmRoutingRule } from "../queries";

/** An example unit, so the preview shows a sentence rather than placeholders. */
const EXAMPLE = {
  clientLine: "Mr. Gasser El Sayed Ibrahim",
  unitName: "Ancient Hill 56",
  editionDate: new Date(2026, 5, 14),
  pmName: "Nouran Amer",
};

export function MailSettingsEditor({
  settings,
  routing,
  /** PM names the sheet actually uses, so a rule can be added without typing. */
  pmNames,
  canEdit,
}: {
  settings: MailSettings;
  routing: PmRoutingRule[];
  pmNames: string[];
  canEdit: boolean;
}) {
  const [subject, setSubject] = useState(settings.subjectTemplate);
  const [body, setBody] = useState(settings.bodyTemplate);
  const [alwaysCc, setAlwaysCc] = useState(settings.alwaysCc.join("\n"));
  const [imageWidth, setImageWidth] = useState(String(settings.imageWidthPx));
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [newPm, setNewPm] = useState("");
  const [newCc, setNewCc] = useState("");

  const unknown = [...new Set([...unknownPlaceholders(subject), ...unknownPlaceholders(body)])];
  // Shown at half scale: the preview box is narrower than a real reading pane.
  const previewWidth = Math.max(80, (Number(imageWidth) || 500) / 2);
  const withoutRules = pmNames.filter(
    (name) =>
      !routing.some(
        (rule) => rule.pmName.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
      ),
  );

  function saveWording() {
    setProblem(null);
    const payload = {
      subjectTemplate: subject,
      bodyTemplate: body,
      alwaysCc: splitAddresses(alwaysCc),
      imageWidthPx: Number(imageWidth),
    };
    const check = saveMailSettingsSchema.safeParse(payload);
    if (!check.success) {
      setProblem(check.error.issues[0]?.message ?? "Something is not right.");
      return;
    }
    startTransition(async () => {
      const result = await saveMailSettings(payload);
      if (!result.ok) {
        setProblem(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Saved. Every unit's email uses this wording now.");
    });
  }

  function addRule() {
    setProblem(null);
    const payload = { pmName: newPm, ccEmails: splitAddresses(newCc) };
    const check = savePmRoutingSchema.safeParse(payload);
    if (!check.success) {
      setProblem(check.error.issues[0]?.message ?? "Something is not right.");
      return;
    }
    startTransition(async () => {
      const result = await savePmRouting(payload);
      if (!result.ok) {
        setProblem(result.error);
        toast.error(result.error);
        return;
      }
      setNewPm("");
      setNewCc("");
      toast.success(`Saved. ${payload.pmName}'s units will copy those people.`);
    });
  }

  function removeRule(rule: PmRoutingRule) {
    startTransition(async () => {
      const result = await deletePmRouting({ id: rule.id });
      if (result.ok) toast.success(`${rule.pmName}'s rule removed.`);
      else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-8">
      {problem && <p className="text-destructive text-sm">{problem}</p>}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">The wording</h2>
          <p className="text-muted-foreground text-xs">
            The tool fills these in per unit:{" "}
            {MAIL_PLACEHOLDERS.map((p) => `${p.token} — ${p.describes}`).join(" · ")}
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="mail-subject" className="text-xs">
            Subject
          </Label>
          <Input
            id="mail-subject"
            value={subject}
            disabled={!canEdit || pending}
            onChange={(event) => setSubject(event.target.value)}
            className="h-8"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="mail-body" className="text-xs">
            Message
          </Label>
          <Textarea
            id="mail-body"
            value={body}
            rows={10}
            disabled={!canEdit || pending}
            onChange={(event) => setBody(event.target.value)}
            className="text-sm"
          />
        </div>

        {unknown.length > 0 && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {unknown.join(", ")} {unknown.length === 1 ? "is not something" : "are not things"} the
            tool fills in, so {unknown.length === 1 ? "it" : "they"} will be sent exactly as
            written. Did you mean one of the placeholders above?
          </p>
        )}

        <div className="space-y-1">
          <p className="text-xs font-medium">How it reads for a real unit</p>
          <div className="bg-muted space-y-2 rounded-md p-3 text-xs">
            <p className="font-medium">{fillTemplate(subject, EXAMPLE)}</p>
            {/*
              Split on the marker so the preview shows the picture's PLACE
              rather than the word "{newsletter}", which is what a client would
              otherwise be shown.
            */}
            {fillTemplate(body, EXAMPLE)
              .split("{newsletter}")
              .map((chunk, index) => (
                <div key={index}>
                  {index > 0 && (
                    <div
                      className="text-muted-foreground mb-2 flex items-center justify-center rounded border border-dashed"
                      style={{ width: previewWidth, maxWidth: "100%", height: previewWidth / 3 }}
                    >
                      the newsletter, {imageWidth}px wide
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{chunk.trim()}</p>
                </div>
              ))}
            {!body.includes("{newsletter}") && (
              <div
                className="text-muted-foreground flex items-center justify-center rounded border border-dashed"
                style={{ width: previewWidth, maxWidth: "100%", height: previewWidth / 3 }}
              >
                the newsletter, {imageWidth}px wide — at the end
              </div>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="mail-image-width" className="text-xs">
            How wide the newsletter is in the email
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="mail-image-width"
              type="number"
              min={200}
              max={1400}
              step={50}
              value={imageWidth}
              disabled={!canEdit || pending}
              onChange={(event) => setImageWidth(event.target.value)}
              className="h-8 w-28"
            />
            <span className="text-muted-foreground text-xs">pixels wide</span>
          </div>
          <p className="text-muted-foreground text-xs">
            500 is about half a normal reading pane. It is a maximum, so a narrow window shrinks it
            further rather than cutting it off. Only affects the picture in the email — the attached
            PDF and the JPG are always full size.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="mail-always-cc" className="text-xs">
            Copied on every unit
          </Label>
          <Textarea
            id="mail-always-cc"
            value={alwaysCc}
            rows={4}
            placeholder={"pmo@elgouna.com\ntown.projects@elgouna.com"}
            disabled={!canEdit || pending}
            onChange={(event) => setAlwaysCc(event.target.value)}
            className="text-sm"
          />
          <p className="text-muted-foreground text-xs">
            One address per line. These are copied whoever the project manager is.
          </p>
        </div>

        {canEdit && (
          <Button size="sm" onClick={saveWording} disabled={pending}>
            {pending ? "Saving…" : "Save the wording"}
          </Button>
        )}
      </section>

      <section className="space-y-3 border-t pt-6">
        <div>
          <h2 className="text-sm font-semibold">Copied per project manager</h2>
          <p className="text-muted-foreground text-xs">
            For each manager, who to copy on their own units — usually themself and their manager.
          </p>
        </div>

        {routing.length === 0 ? (
          <p className="text-muted-foreground text-sm">No rules yet.</p>
        ) : (
          <ul className="space-y-2">
            {routing.map((rule) => (
              <li key={rule.id} className="flex items-start justify-between gap-3 border-b pb-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{rule.pmName}</p>
                  <p className="text-muted-foreground text-xs break-all">
                    {rule.ccEmails.length > 0 ? rule.ccEmails.join("; ") : "nobody"}
                  </p>
                </div>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => removeRule(rule)}
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {withoutRules.length > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            {withoutRules.length === 1
              ? "One project manager has units but no rule"
              : `${withoutRules.length} project managers have units but no rule`}
            , so their units only copy the standing list: {withoutRules.slice(0, 6).join(", ")}
            {withoutRules.length > 6 ? ` and ${withoutRules.length - 6} more` : ""}.
          </p>
        )}

        {canEdit && (
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-xs font-medium">Add or change a rule</p>
            <div className="space-y-1">
              <Label htmlFor="mail-pm" className="text-xs">
                Project manager
              </Label>
              <Input
                id="mail-pm"
                value={newPm}
                list="mail-pm-names"
                placeholder="As the sheet spells the name"
                disabled={pending}
                onChange={(event) => setNewPm(event.target.value)}
                className="h-8"
              />
              {/* The sheet's own spellings, so a rule cannot miss by a typo. */}
              <datalist id="mail-pm-names">
                {pmNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1">
              <Label htmlFor="mail-pm-cc" className="text-xs">
                Copy these people
              </Label>
              <Textarea
                id="mail-pm-cc"
                value={newCc}
                rows={3}
                placeholder={"nouran.amer@elgouna.com\nher.manager@elgouna.com"}
                disabled={pending}
                onChange={(event) => setNewCc(event.target.value)}
                className="text-sm"
              />
            </div>
            <Button size="sm" onClick={addRule} disabled={pending || newPm.trim().length === 0}>
              {pending ? "Saving…" : "Save this rule"}
            </Button>
            <p className="text-muted-foreground text-xs">
              Saving a name that already has a rule replaces it.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
