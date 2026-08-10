"use client";

/**
 * The three masters, one at a time.
 *
 * A thin client wrapper: it holds which master is being looked at and calls the
 * server action. All the controls live in `DesignEditor`, which the per-unit
 * editor uses too.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  TEMPLATE_KINDS,
  TEMPLATE_KIND_LABELS,
  type TemplateKind,
  type ThemeOverrides,
} from "@/lib/newsletter/theme";
import type { NewsletterView } from "@/lib/newsletter/view-model";
import { toast } from "sonner";
import { saveTemplateDesign } from "../actions";
import { DesignEditor } from "./design-editor";

export function MasterDesignEditor({
  overridesByKind,
  /** A real newsletter to preview each master against, where one exists. */
  previewByKind,
  canEdit,
}: {
  overridesByKind: Record<TemplateKind, ThemeOverrides>;
  previewByKind: Partial<Record<TemplateKind, NewsletterView>>;
  canEdit: boolean;
}) {
  const [kind, setKind] = useState<TemplateKind>("timeline");
  /** Bumped to remount the editor when a look is copied in over the top. */
  const [revision, setRevision] = useState(0);
  const [copied, setCopied] = useState<Record<TemplateKind, ThemeOverrides>>(overridesByKind);
  const view = previewByKind[kind];

  /**
   * Copy another master's look over this one.
   *
   * Saved immediately rather than staged: the editor is remounted with the new
   * values, and leaving it unsaved would show one thing while the database held
   * another. The receiving master can still be reset afterwards.
   */
  async function copyFrom(source: TemplateKind) {
    const overrides = copied[source];
    const result = await saveTemplateDesign({ kind, overrides });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setCopied((current) => ({ ...current, [kind]: overrides }));
    setRevision((n) => n + 1);
    toast.success(`${TEMPLATE_KIND_LABELS[kind]} now matches ${TEMPLATE_KIND_LABELS[source]}.`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TEMPLATE_KINDS.map((candidate) => (
          <Button
            key={candidate}
            variant={candidate === kind ? "default" : "outline"}
            size="sm"
            onClick={() => setKind(candidate)}
          >
            {TEMPLATE_KIND_LABELS[candidate]}
          </Button>
        ))}
      </div>

      <p className="text-muted-foreground text-sm">
        {kind === "timeline" && "Used by every unit whose ticked quotations have a time schedule."}
        {kind === "photos" && "Used by every unit whose ticked quotations have no time schedule."}
        {kind === "before_delivery" &&
          "Reserved for the Before Delivery programme, which is not built yet — changes here affect nothing today."}
      </p>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs">
            Start from another master&apos;s look:
          </span>
          {TEMPLATE_KINDS.filter((other) => other !== kind).map((other) => (
            <Button
              key={other}
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => void copyFrom(other)}
              title={`Replace this master's settings with the ${TEMPLATE_KIND_LABELS[other]} ones`}
            >
              Copy from {TEMPLATE_KIND_LABELS[other]}
            </Button>
          ))}
        </div>
      )}

      {view ? (
        <DesignEditor
          // Remounts on switch, and again when a look is copied in, so the
          // fields always show what is actually stored.
          key={`${kind}-${revision}`}
          initial={copied[kind]}
          view={view}
          scopeLabel={`${TEMPLATE_KIND_LABELS[kind]} master`}
          canEdit={canEdit}
          onSave={async (overrides) => {
            const next = overrides ?? {};
            const result = await saveTemplateDesign({
              kind,
              // Clearing a master means "exactly the original design".
              overrides: next,
            });
            if (!result.ok) return { ok: false, error: result.error };
            /*
              Keep the copy source current. Without this, "copy from X" used the
              values from when the page loaded — so saving a change to X and then
              copying it silently copied the OLD look.
            */
            setCopied((current) => ({ ...current, [kind]: next }));
            return { ok: true };
          }}
        />
      ) : (
        <p className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">
          No unit uses this layout yet, so there is nothing to preview against. Upload the follow-up
          sheet, or give a quotation a time schedule, and this master becomes editable.
        </p>
      )}
    </div>
  );
}
