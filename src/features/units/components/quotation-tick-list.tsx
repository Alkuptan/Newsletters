"use client";

/**
 * Choose which quotations a unit's newsletter covers.
 *
 * The tick is remembered across uploads, so next cycle only newly-arrived
 * quotations need a decision.
 */

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { setQuotationIncluded } from "../actions";

export interface TickableQuotation {
  id: string;
  quoteNumber: string;
  scopeOfWork: string;
  invoiceValue: number;
  progressPercent: number;
  projectStatus: string;
  include: boolean;
  isNew: boolean;
  /** No longer in the follow-up sheet — see migration 0011. */
  missingFromSheet: boolean;
}

export function QuotationTickList({
  quotations,
  canEdit,
}: {
  quotations: TickableQuotation[];
  canEdit: boolean;
}) {
  // Optimistic local state so the tick responds instantly; reverted if the
  // server refuses.
  const [ticks, setTicks] = useState<Record<string, boolean>>(
    Object.fromEntries(quotations.map((q) => [q.id, q.include])),
  );
  const [pending, startTransition] = useTransition();

  function toggle(quotation: TickableQuotation, next: boolean) {
    setTicks((current) => ({ ...current, [quotation.id]: next }));
    startTransition(async () => {
      const result = await setQuotationIncluded({ quotationId: quotation.id, include: next });
      if (!result.ok) {
        setTicks((current) => ({ ...current, [quotation.id]: !next }));
        toast.error(result.error);
      }
    });
  }

  const includedCount = quotations.filter((q) => ticks[q.id]).length;
  const includedValue = quotations
    .filter((q) => ticks[q.id])
    .reduce((sum, q) => sum + q.invoiceValue, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Quotations on this newsletter</h2>
        <span className="text-muted-foreground text-xs">
          {includedCount} of {quotations.length} · {Math.round(includedValue).toLocaleString("en-US")} LE
        </span>
      </div>

      <ul className="divide-y rounded-md border">
        {quotations.map((quotation) => (
          <li key={quotation.id} className="flex items-start gap-3 p-3">
            <Checkbox
              id={`q-${quotation.id}`}
              checked={ticks[quotation.id] ?? false}
              disabled={!canEdit || pending}
              onCheckedChange={(checked) => toggle(quotation, checked === true)}
              aria-label={`Include quotation ${quotation.quoteNumber}`}
            />
            <label htmlFor={`q-${quotation.id}`} className="min-w-0 flex-1 cursor-pointer">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{quotation.quoteNumber}</span>
                <span className="text-muted-foreground text-sm">{quotation.scopeOfWork}</span>
                {quotation.isNew && !quotation.missingFromSheet && (
                  <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-xs font-medium">
                    new
                  </span>
                )}
                {quotation.missingFromSheet && (
                  <span
                    className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                    title="This quotation is no longer in the follow-up sheet. It was taken off the newsletter; tick it to put it back."
                  >
                    gone from the sheet
                  </span>
                )}
              </span>
              <span className="text-muted-foreground block text-xs">
                {Math.round(quotation.invoiceValue).toLocaleString("en-US")} LE ·{" "}
                {quotation.progressPercent}% done · {quotation.projectStatus || "no status"}
              </span>
            </label>
          </li>
        ))}
      </ul>

      {!canEdit && (
        <p className="text-muted-foreground text-xs">
          You can look at this unit but not change it.
        </p>
      )}
    </div>
  );
}
