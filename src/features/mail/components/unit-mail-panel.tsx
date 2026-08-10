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

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PreparedMail } from "@/lib/newsletter/mail";
import type { NewsletterView } from "@/lib/newsletter/view-model";
import { mailtoLink, outlookWebComposeLink, type SendHistory } from "@/lib/newsletter/outlook";
import { setUnitSent } from "@/features/units/patch-actions";

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

function formatSent(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function UnitMailPanel({
  mail,
  view,
  unitId,
  unitName,
  pmName,
  editionId,
  sentThisCycle,
  history,
  canEdit,
}: {
  mail: PreparedMail;
  /** The rendered newsletter's data, for the picture and the PDF. */
  view: NewsletterView;
  unitId: string;
  unitName: string;
  pmName: string | null;
  /** Null when no cycle is open, in which case there is nothing to tick. */
  editionId: string | null;
  sentThisCycle: boolean;
  history: SendHistory;
  canEdit: boolean;
}) {
  const [body, setBody] = useState(mail.body);
  const [sent, setSent] = useState(sentThisCycle);
  const [pending, startTransition] = useTransition();

  const compose = { to: mail.to, cc: mail.cc, subject: mail.subject, body };
  const outlook = outlookWebComposeLink(compose);
  const mailto = mailtoLink(compose);

  const [building, setBuilding] = useState(false);

  /**
   * Build the message file from the newsletter as it is rendered right now.
   *
   * The rendered newsletter lives in a sibling component, so it is found by the
   * attribute the exporters and the e2e tests already use rather than by
   * threading a ref through the page. The alternative — moving the export
   * plumbing in here — would separate the message from the wording being edited
   * a few lines above, which is the thing that has to stay together.
   */
  async function openOutlookMessage() {
    const element = document.querySelector<HTMLElement>("[data-newsletter-canvas]");
    if (!element) {
      toast.error("The newsletter is not on screen yet. Give it a moment and try again.");
      return;
    }
    setBuilding(true);
    try {
      const { exportNewsletterEml } = await import("@/lib/newsletter/raster");
      await exportNewsletterEml(element, view, compose);
      toast.success("Message downloaded. Open it and Outlook will show it ready to send.");
    } catch (error) {
      // Rendering can fail on a photo that will not load; saying which step broke
      // is more use than a silent no-op on a button that looked like it worked.
      toast.error(
        `Could not build the message: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    } finally {
      setBuilding(false);
    }
  }

  function markSent(next: boolean) {
    if (!editionId) return;
    startTransition(async () => {
      const result = await setUnitSent({ unitId, editionId, sent: next });
      if (result.ok) {
        setSent(next);
        toast.success(next ? "Recorded as sent for this cycle." : "No longer marked as sent.");
      } else {
        toast.error(result.error);
      }
    });
  }

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
        Check it here, then open it in Outlook and press Send. The tool prepares the message; you
        send it, from your own mailbox.
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

      <div className="space-y-2 border-t pt-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={building} onClick={openOutlookMessage}>
            {building ? "Building the message…" : "Open in Outlook, ready to send"}
          </Button>
          <Button size="sm" variant="outline" asChild>
            {/*
              Outlook on the WEB. Carries the addresses and the text but no files —
              no URL can. Kept alongside the message file for the case where the
              machine has no Outlook installed to open a .eml with.
            */}
            <a href={outlook.url} target="_blank" rel="noopener noreferrer">
              Outlook on the web (no attachments)
            </a>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={mailto.url}>Mail program</a>
          </Button>
          <CopyButton label="Everything" value={everything} />
        </div>

        <p className="text-muted-foreground text-xs">
          The first button builds the message. Outlook shows it as a draft — addressed, written, the
          newsletter in the body, the PDF attached — and you press Send. It goes from your own
          mailbox, with your signature.
        </p>

        <details className="text-xs">
          <summary className="text-muted-foreground cursor-pointer">
            Make it open Outlook straight away (one-time browser setting)
          </summary>
          {/*
            A web page cannot start a program on the computer — no browser allows
            it, and that is a security boundary rather than something to code
            around. What CAN be done is tell the browser to open this KIND of file
            automatically once it has been downloaded, after which the button and
            the Outlook draft feel like one action.
          */}
          <div className="text-muted-foreground mt-2 space-y-1.5">
            <p>
              A web page is not allowed to start a program on your computer, so the message has to
              arrive as a download first. Your browser can be told to open it automatically:
            </p>
            <ol className="ml-4 list-decimal space-y-1">
              <li>Press the button above once. The message appears in the downloads bar.</li>
              <li>
                Click the small arrow or <strong>…</strong> next to it and choose{" "}
                <strong>Always open files of this type</strong> (Edge may word it{" "}
                <strong>Always open with system app</strong>).
              </li>
              <li>From then on, pressing the button opens the Outlook draft by itself.</li>
            </ol>
            <p>You only do this once, on each computer you use.</p>
          </div>
        </details>

        {outlook.truncated && (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            The message is too long for the web link, so that one opens shortened. The message file
            is unaffected.
          </p>
        )}
      </div>

      <div className="space-y-2 border-t pt-3">
        {history.count === 0 ? (
          <p className="text-muted-foreground text-xs">This unit has never been sent.</p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Sent {history.count} {history.count === 1 ? "time" : "times"}
            {history.first && ` — first on ${formatSent(history.first)}`}
            {history.last && history.count > 1 && `, latest on ${formatSent(history.last)}`}.
          </p>
        )}

        {canEdit && editionId && (
          <Button
            size="sm"
            variant={sent ? "outline" : "default"}
            disabled={pending}
            onClick={() => markSent(!sent)}
          >
            {pending ? "Saving…" : sent ? "Sent this cycle — undo" : "I have sent this one"}
          </Button>
        )}
        {!editionId && (
          <p className="text-muted-foreground text-xs">
            Start a cycle to record what has been sent.
          </p>
        )}
      </div>
    </div>
  );
}
