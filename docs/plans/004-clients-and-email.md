# 004 — Several clients per unit, and the covering email

Asked for on 10 August 2026, after the owner sent a real newsletter email as an
example: name the client on the page automatically, cope with a unit having more
than one owner, let the title be edited and remembered, and prepare the email that
carries it — body, attachments, To and a Cc list that depends on the project
manager.

## What was built

**Clients (migration 0014).** `units.client_emails` is sheet data beside
`client_name`; `client_titles` and `client_shown` are the owner's decisions and the
importer never touches them. The unit page splits the sheet's cell into people,
ticks who the newsletter names, and sets a title each.

**The covering email (migration 0015).** `mail_settings` holds one shared subject
and message plus the people copied on every unit; `pm_mail_routing` holds one Cc
rule per project manager, keyed by the name **as the sheet spells it** because most
PMs in the sheet have no account here. A new Email screen maintains both; the unit
page shows the finished message with copy buttons.

## Decisions worth keeping

- **Stored against the name, not the position.** The owner's choices survive a
  Power Query refresh that reorders or re-cases the names. A newly appearing
  part-owner is never silently added to a page already curated.
- **Never split a name on a comma.** "Ibrahim, Gasser El Sayed" is one person
  written surname-first; splitting it invents a client who does not exist.
  Semicolons, slashes and newlines only.
- **A title already in the sheet is lifted out of the name.** The owner's own
  newsletters read "Mr. Gasser El Sayed Ibrahim", so leaving it in place and
  choosing a title too would print "Mr. Mr. Gasser …" to a client.
- **`client_shown = null` means undecided and shows everyone**; an empty array is
  a real decision meaning "name none of them". Two states, two meanings.
- **The tool does not send mail** — see the graduation trigger in
  `docs/PROJECT.md`. It composes; a person presses Send.
- **Per-unit edits to the message are not saved.** One maintained wording beats
  317 drafts nobody revisits.
- **Client contact data is held deliberately.** The concern was put to the owner
  and confirmed twice; recorded as DECISIONS 0015 so the next person knows it was
  a decision, not an oversight.
- **The importer's batch grouping was generalised** rather than extended. It split
  rows into two hand-written lists by whether a client name was present; a second
  optional column would have made four, and the rule it exists to protect — a
  blank cell must never wipe a stored value — is too easy to break by hand.

## How it was verified

- 278 unit tests green, including 26 on splitting and composing client names and
  17 on the email (placeholder substitution, the "Dear ," case, de-duplication
  across To and Cc, an unrecognised placeholder, a malformed address).
- Against the dev stack: two clients typed into one field appear as two people;
  ticking both prints "Mrs. Mona Ibrahim & Youssef Hakim" on the newsletter;
  unticking one removes that name; unticking both leaves no client line and the
  page still renders; every tick and title survives a reload.
- A unit given three client addresses (one malformed) produced To with the two
  valid ones, the malformed one flagged, and Cc combining the PM's rule with the
  standing list — with an address present in both appearing once.
- The least privileged seeded user (`member@dev.local`) sees the Email screen
  read-only with no save controls, and **RLS refuses the write underneath**: the
  wording was unchanged after a direct PATCH, and inserting a Cc rule returned
  `42501 new row violates row-level security policy`.

## Not done

- Sending. Deliberate — see above.
- A ready-made Outlook message (`.eml`) rather than copy buttons. Worth trying on
  the owner's own Outlook before promising it, since whether a `.eml` opens as an
  editable draft or a read-only received message varies by version.
- Reading client contacts from the internal system. Needs an Orascom IT
  credential; recorded as a graduation trigger.
