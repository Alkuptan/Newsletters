"use client";

/**
 * The covering email for one unit, ready to send.
 *
 * The tool composes it; a person sends it. Every field is here to be copied into
 * Outlook alongside the JPG and the PDF from the export buttons above — there is
 * no mail transport in this tool, on purpose (docs/PROJECT.md).
 *
 * The body is editable HERE but not saved: a per-unit sentence is often worth
 * adding, and storing it would quietly turn the shared wording into 317 separate
 * drafts nobody maintains. Edit, copy, send.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PreparedMail } from "@/lib/newsletter/mail";

function CopyButton({
  label,
  value,
  disabled,
}: {
  label: string;
  value: string;
  disabled?: boolean;
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={disabled || value.length === 0}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast.success(`${label} copied.`);
        } catch {
          // Clipboard access can be refused (an insecure origin, a locked-down
          // browser). Saying so beats a button that silently does nothing.
          toast.error("The browser would not let me copy. Select the text and copy it manually.");
        }
      }}
    >
      Copy {label.toLowerCase()}
    </Button>
  );
}

/** One addressee line, with the reason it might be empty spelled out. */
function AddressLine({
  label,
  addresses,
  emptyMeans,
}: {
  label: string;
  addresses: readonly string[];
  emptyMeans: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">{label}</span>
        <CopyButton label={label} value={addresses.join("; ")} />
      </div>
      {addresses.length > 0 ? (
        <p className="bg-muted rounded-md p-2 text-xs break-all">{addresses.join("; ")}</p>
      ) : (
        <p className="text-xs text-amber-600 dark:text-amber-500">{emptyMeans}</p>
      )}
    </div>
  );
}

export function UnitMailPanel({
  mail,
  unitName,
  pmName,
}: {
  mail: PreparedMail;
  unitName: string;
  pmName: string | null;
}) {
  const [body, setBody] = useState(mail.body);

  const everything = [
    `Subject: ${mail.subject}`,
    `To: ${mail.to.join("; ")}`,
    `Cc: ${mail.cc.join("; ")}`,
    "",
    body,
  ].join("\n");

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-xs">
        Copy these into a new Outlook message, then attach the JPG and the PDF from the export
        buttons above. The tool does not send email itself.
      </p>

      {mail.unknown.length > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          The wording uses {mail.unknown.join(", ")}, which the tool does not recognise — it will be
          sent exactly as written. Fix it on the Email screen.
        </p>
      )}

      {mail.rejected.length > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          The sheet has {mail.rejected.join(", ")} in this unit&apos;s client email column, which is
          not a valid address, so it is left out of the To line.
        </p>
      )}

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium">Subject</span>
          <CopyButton label="Subject" value={mail.subject} />
        </div>
        <p className="bg-muted rounded-md p-2 text-xs">{mail.subject}</p>
      </div>

      <AddressLine
        label="To"
        addresses={mail.to}
        emptyMeans={
          "No client email for this unit. Add a Client Email column to the sheet, or address it yourself."
        }
      />

      <AddressLine
        label="Cc"
        addresses={mail.cc}
        emptyMeans="Nobody is copied yet. Set that up on the Email screen."
      />

      {mail.pmRuleMissing && pmName && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          {pmName} has no CC rule, so this unit only copies the standing list. Add a rule on the
          Email screen.
        </p>
      )}

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium">Message</span>
          <div className="flex gap-2">
            {body !== mail.body && (
              <Button size="sm" variant="ghost" onClick={() => setBody(mail.body)}>
                Undo my edits
              </Button>
            )}
            <CopyButton label="Message" value={body} />
          </div>
        </div>
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={9}
          className="text-xs"
          aria-label={`Covering message for ${unitName}`}
        />
        <p className="text-muted-foreground text-xs">
          Edits here are for this message only and are not saved.
        </p>
      </div>

      <CopyButton label="Everything" value={everything} />
    </div>
  );
}
