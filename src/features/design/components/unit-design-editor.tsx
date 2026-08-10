"use client";

/**
 * One unit's own design.
 *
 * Collapsed until asked for, because most units should simply follow their master —
 * and the badge is what tells the owner when one does not.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  TEMPLATE_KIND_LABELS,
  type TemplateKind,
  type ThemeOverrides,
} from "@/lib/newsletter/theme";
import type { NewsletterView } from "@/lib/newsletter/view-model";
import { saveUnitDesign } from "../actions";
import { DesignEditor } from "./design-editor";

export function UnitDesignEditor({
  unitId,
  unitDesign,
  masterOverrides,
  templateKind,
  view,
  hasOwn,
  canEdit,
}: {
  unitId: string;
  unitDesign: ThemeOverrides;
  /** The master this unit follows — applied under its own changes. */
  masterOverrides: ThemeOverrides;
  templateKind: TemplateKind;
  view: NewsletterView;
  hasOwn: boolean;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Design</h2>
        <p className="text-muted-foreground text-xs">
          {hasOwn ? (
            <>
              This unit has its <strong>own layout changes</strong>, so it does not
              follow the {TEMPLATE_KIND_LABELS[templateKind]} master.
            </>
          ) : (
            <>Following the {TEMPLATE_KIND_LABELS[templateKind]} master.</>
          )}
        </p>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          {hasOwn ? "See or undo this unit's changes" : "Change just this unit"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">This unit&apos;s design</h2>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Changes here apply to this unit only, on top of the{" "}
        {TEMPLATE_KIND_LABELS[templateKind]} master — and stay with it next cycle.
      </p>
      <DesignEditor
        initial={unitDesign}
        masterOverrides={masterOverrides}
        view={view}
        scopeLabel="This unit's design"
        canEdit={canEdit}
        onSave={async (overrides) => {
          const result = await saveUnitDesign({ unitId, overrides });
          return result.ok ? { ok: true } : { ok: false, error: result.error };
        }}
      />
    </div>
  );
}
