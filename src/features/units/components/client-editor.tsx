"use client";

/**
 * Who the newsletter names, and what each person is called.
 *
 * A unit can be owned by several people. The sheet holds them in one cell; this
 * is where the owner picks which of them the page names and sets each title. The
 * choices are stored against the NAME, so the next sheet refresh cannot revert
 * them — see `src/lib/newsletter/clients.ts`.
 *
 * The addresses are shown but not editable here: they are sheet data, like the
 * names, and the tool never writes them back. They are displayed because a typo
 * in the sheet is otherwise invisible until an email bounces.
 */

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CLIENT_TITLES,
  clientLabel,
  clientLineFor,
  parseClientEmails,
  resolveClients,
  type ClientTitle,
} from "@/lib/newsletter/clients";
import { setUnitClients } from "../actions";

/** The dropdown needs a value for "no title", and "" is not selectable in Radix. */
const NO_TITLE = "none";

export function ClientEditor({
  unitId,
  /** The raw `Client Name` cell, exactly as the sheet holds it. */
  rawNames,
  /** The raw `Client Email` cell, exactly as the sheet holds it. */
  rawEmails,
  storedTitles,
  storedShown,
  canEdit,
}: {
  unitId: string;
  rawNames: string | null;
  rawEmails: string | null;
  storedTitles: Record<string, string>;
  storedShown: string[] | null;
  canEdit: boolean;
}) {
  const initial = resolveClients(rawNames, { titles: storedTitles, shown: storedShown });

  const [titles, setTitles] = useState<Record<string, ClientTitle | null>>(() =>
    Object.fromEntries(initial.map((c) => [c.name, c.title])),
  );
  const [shown, setShown] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(initial.map((c) => [c.name, c.shown])),
  );
  const [pending, startTransition] = useTransition();

  /*
    Derived from the sheet's names each render, so a re-import that adds a client
    shows the new person immediately rather than after a save. State holds only
    the owner's decisions, keyed by name.
  */
  const clients = initial.map((c) => {
    const title = titles[c.name] ?? null;
    return { ...c, title, shown: shown[c.name] ?? c.shown, label: clientLabel(c.name, title) };
  });
  const line = clientLineFor(clients);
  const emails = parseClientEmails(rawEmails);

  if (clients.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No client on this unit yet. Add a <strong>Client Name</strong> column to the sheet, or type
        the name in the field above — separate several people with a semicolon, like{" "}
        <code className="text-xs">Mona Ibrahim; Youssef Hakim</code>.
      </p>
    );
  }

  function save() {
    startTransition(async () => {
      const chosen = clients.filter((c) => c.shown).map((c) => c.name);
      const titleEntries = clients
        .filter((c) => c.title !== null)
        .map((c) => [c.name, c.title as ClientTitle] as const);

      const result = await setUnitClients({
        id: unitId,
        titles: Object.fromEntries(titleEntries),
        shown: chosen,
      });
      if (result.ok) toast.success("Saved. This is how the newsletter will name them.");
      else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {clients.map((client) => (
          <li key={client.name} className="flex items-center gap-2">
            <Checkbox
              checked={client.shown}
              disabled={!canEdit || pending}
              // Radix renders a button, so a wrapping label would not forward the
              // click and cannot nest one. An explicit name is the accessible fix.
              aria-label={`Show ${client.name} on the newsletter`}
              onCheckedChange={(value) =>
                setShown((prev) => ({ ...prev, [client.name]: value === true }))
              }
            />
            <Select
              value={client.title ?? NO_TITLE}
              disabled={!canEdit || pending}
              onValueChange={(value) =>
                setTitles((prev) => ({
                  ...prev,
                  [client.name]: value === NO_TITLE ? null : (value as ClientTitle),
                }))
              }
            >
              <SelectTrigger className="w-24" aria-label={`Title for ${client.name}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TITLE}>None</SelectItem>
                {CLIENT_TITLES.map((title) => (
                  <SelectItem key={title} value={title}>
                    {title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span
              className={client.shown ? "text-sm" : "text-muted-foreground text-sm line-through"}
            >
              {client.name}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-sm">
        <span className="text-muted-foreground">On the newsletter: </span>
        {line ? <strong>{line}</strong> : <em className="text-muted-foreground">no client line</em>}
      </p>

      {emails.valid.length > 0 && (
        <p className="text-muted-foreground text-xs">
          Client emails from the sheet: {emails.valid.join(", ")}
        </p>
      )}
      {emails.rejected.length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Not a valid email address, so it will be left out: {emails.rejected.join(", ")}
        </p>
      )}

      {canEdit && (
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save who is named"}
        </Button>
      )}
    </div>
  );
}
