# 005 — Make each newsletter a real reply, with no macro

## Why

Every newsletter opens a new email thread. The client gets fifty separate
messages instead of one growing conversation, and nobody can see what was said
last time.

Three attempts at this have failed, and it is worth being clear why, because it
shapes the design:

1. `Thread-Topic` alone only makes Outlook _group_ the messages. Grouping is not
   a reply chain, and it does not survive the client's own mail app.
2. The VBA macro (`docs/outlook-macro/`) replies to the previous message found in
   Sent Items. It was never installed, it cannot be triggered by double-clicking
   the file, and — decisively — classic Outlook's offline file on the owner's PC
   stopped syncing in March 2026, so there is nothing in Sent Items to find. See
   `docs/PROJECT.md`, "Classic Outlook's offline file".
3. New Outlook, which the owner now uses by default, cannot run macros at all.

## What actually makes a reply

`In-Reply-To` and `References`, carrying the previous message's `Message-ID`.
Every mail client threads on these; it is the mechanism the macro was reaching
for indirectly by calling `ReplyAll`.

The obstacle was always getting that id: it exists only after Exchange has sent
something, and reading it back needs Graph.

**That obstacle is gone.** The Microsoft 365 connector is authorised for this
account, and `PMOTeam@elgouna.com` is CC'd on every newsletter — so this mailbox
already holds a copy of each one, with its `internetMessageId`. It reads
Microsoft's servers, not the damaged local file.

## Shape

The tool stores the last newsletter's `Message-ID` per unit and writes the two
headers into the `.eml`. The owner then does exactly what they do today — open
the file, press Send — and it lands in the thread. No macro, no classic Outlook,
works from any machine.

## Order of work, and why this order

The make-or-break unknown is whether **Outlook carries those two headers from a
file through to sending**. It could not be tested earlier because the attempt
wedged on the damaged store. Backfilling 344 units before knowing the answer
would be wasted work, so:

1. **The mechanism** — migration, header building, wiring, tests. Durable
   regardless of how the ids arrive.
2. **One real unit, end to end** — fill in a single unit's id, build the file,
   the owner sends it to themselves, and the received copy is read back through
   the connector to confirm `References` survived.
3. **The backfill**, only once step 2 passes.

## Steps

- [ ] `0018_thread_replies.sql` — `units.thread_message_id`,
      `units.thread_message_at` (how old the anchor is), RLS unchanged.
- [ ] `eml.ts` — `inReplyTo` on `EmlMessage`; emit `In-Reply-To` and
      `References`. A `Message-ID` is **validated, not escaped**: anything that
      is not `<token@token>` is dropped rather than written, because a malformed
      one silently breaks threading and a crafted one injects a header.
- [ ] Wire `raster.ts` → `unit-mail-panel.tsx` → `units/[id]/page.tsx`.
- [ ] Unit tests for the header and for every way the id can be wrong.
- [ ] `scripts/import-thread-ids.mjs` — reads a JSON file of
      `{subject, messageId, sentAt}`, matches to units, dry by default, `--apply`
      / `--cloud` like `import-timelines.mjs`.

## The matching rule, decided up front

Unit display names do not match email subjects exactly — the live data has
`Ancient Hill 15A 0` and `Ancient Hill 73C A`, and the subjects include a typo
(`Phase 5 Villa 12 Newletter`) and inconsistent case (`Phase 4 villa 9`).

Fuzzy matching is **not** acceptable here: `Ancient Sands 192A` and
`192B` are different clients, and attaching one's thread to the other sends a
paying customer someone else's conversation. So the importer matches exactly,
case-insensitively, after trimming — and **names what it could not match rather
than guessing**, the same discipline `import-timelines.mjs` used. Unmatched
units simply keep starting new threads, which is today's behaviour and is safe.

## Not in scope

Sending from the tool. The owner still presses Send. The connector's `Mail.Send`
scope belongs to a chat session, not to the deployed Worker, and nothing here
changes that boundary.
