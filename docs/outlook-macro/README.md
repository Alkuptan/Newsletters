# Sending each newsletter as a reply in the same thread

> **How this fits with the rest — read this first.**
>
> Since 13 September 2026 the tool writes the real reply headers into the message
> file, so **for a unit the tool has an anchor for, double-clicking the file is
> already a genuine reply.** Nothing here is needed for those.
>
> Two things you do need to know, both proven by a real send:
>
> - **Open the file with classic Outlook, not new Outlook.** Classic sends the
>   file as written. New Outlook rebuilds the message in its own editor and the
>   reply headers go with the old one, so it starts a new thread every time.
> - **A unit with no anchor cannot thread on double-click**, because there is
>   nothing for the tool to point at. That is what `ReplyIntoSelectedThread`
>   below is for.
>
> So the day-to-day shape is:
>
> 1. Double-click the file. If the tool has an anchor, it continues the thread.
> 2. If it does not, find the unit's conversation yourself, click any message in
>    it, and press **Add newsletter to this thread**.
> 3. **Doing that once fixes the unit for good** — the reply lands in the thread
>    with PMOTeam copied, so the tool can take that message as the unit's anchor
>    and the next cycle threads on double-click.
>
> `SendNewsletterInThread` (the searching one) is the older approach and is kept
> because it needs no anchor at all. It depends on Outlook's offline file holding
> your recent Sent Items, which is exactly what failed here — see
> `docs/PROJECT.md`.

The tool builds a finished message — addressed, written, newsletter in the body,
PDF attached — and you press Send. Out of the box each one is a **new** email, so
a unit's newsletters sit in the same conversation but are not a real reply chain.

This macro turns each one into a genuine reply to the previous newsletter for that
unit. It **never sends anything**: it opens the draft and you press Send.

Classic Outlook only — the new Outlook cannot run macros.

---

## Once: install the macro

1. Open **classic Outlook** (the one with a **File** menu).
2. Press **Alt + F11**. The macro editor opens.
3. **File → Import File…**, choose `NewsletterThread.bas` from this folder.
4. It appears in the left panel under **Modules** as `NewsletterThread`.
5. Press **Ctrl + S**, then close the editor.

## Once: put it on a button

So you are not hunting through menus every day.

1. In Outlook: **File → Options → Customize Ribbon**.
2. Select the **Home** tab on the right, click **New Group**, and rename it
   _Newsletters_.
3. Set **Choose commands from** to **Macros**.
4. Select **`NewsletterThread.ReplyIntoSelectedThread`**, click **Add**, then
   **Rename…** it to _Add newsletter to this thread_. This is the one you will
   use.
5. Optionally add `NewsletterThread.SendNewsletterInThread` the same way, named
   _Send newsletter in thread_ — the older one that searches for the thread
   instead of you picking it.
6. **OK**.

## Every time

1. In the tool, open the unit and press **Open in Outlook, ready to send**.
   The message file lands in your Downloads folder.
2. **Open it** (with classic Outlook). The unit page tells you, before you press
   the button, whether this one will continue the thread or start a new one.
3. **If it continued the thread** — read it, press Send, done. You never touch
   the macro.
4. **If it started a new one** — close that draft without sending. In Outlook,
   search for the unit and click any message in its conversation. Then press
   **Add newsletter to this thread**.
5. A box shows you both subjects — the newsletter to send, and the conversation
   you picked — and says in as many words if they are not the same unit. Check
   it, say Yes.
6. The draft opens: this cycle's wording and newsletter at the top, the previous
   newsletters quoted underneath, the client on To and your CC list filled in.
7. Read it. Press **Send**.

Step 4 is a one-off per unit. Once that reply is sent, the tool can pick it up as
the unit's anchor, and from the next cycle that unit goes through step 3 instead.

### Nothing gets attached one at a time

The picture and the PDF come across with the wording in a single action — that is
the whole point of the button. You never paste the newsletter into the body or
drag the PDF in yourself.

You do not need to open the downloaded file yourself: the macro picks up the
newest one on its own. Send one unit at a time — if you download three before
sending, the macro only sees the newest.

The first time a unit goes out there is nothing to reply to, so the macro opens it
as a normal new message. Every cycle after that continues the thread.

---

## Keeping the new Outlook as your default

You do not have to change your default mail app for any of this. The macro reads
the file straight from Downloads, so **new Outlook stays your default and nothing
about your day changes.**

Worth doing anyway, so double-clicking a message file goes to the right place
(and as a fallback for when you are not using the macro):

1. In File Explorer, find a downloaded `… Newsletter.eml`.
2. Right-click → **Open with** → **Choose another app**.
3. Pick **Outlook (classic)**. If it is not listed: **More apps** → **Look for
   another app on this PC**, then browse to
   `C:\Program Files\Microsoft Office\root\Office16\OUTLOOK.EXE`
   (try `C:\Program Files (x86)\…` if that path does not exist).
4. Tick **Always use this app to open .eml files**, then **OK**.

That changes the handler for `.eml` files only. Your default mail app — what
opens when you click an email link anywhere in Windows — is untouched.

---

## If it opens a new message instead of a reply

This is the one thing that has actually gone wrong, so it now explains itself.

**Run `NewsletterThreadCheck`.** Add it to the ribbon the same way as the send
button, or run it from the macro list (**Alt + F8**). It reports, in one box:
the file it found, the subject it will look for, how many Sent Items folders it
searched, how many messages carry that subject, and — when it finds none — the
recent newsletter subjects it _can_ see.

**The usual cause is the subject line.** Outlook has no other way to know two
emails belong together, and the macro finds last cycle's newsletter by searching
for the same subject. So the subject must be **identical every cycle**. If the
tool's Mail settings put the edition date in it — `{unit} Newsletter — {date}` —
then every cycle is a different subject, nothing ever matches, and every
newsletter opens as a new message. `{client}`, `{firstname}` and `{pm}` do the
same thing whenever those change.

The tool now warns about this on the Mail settings screen. The fix is to move
the changing part into the message and leave the subject as `{unit} Newsletter`.

Two other causes the check will show up:

- **A unit's display name was corrected** after the first newsletter went out.
  The subject changed with it, so the thread starts again from that cycle. It
  will hold together from then on.
- **Sent mail filed in a second mailbox.** The macro now searches every account's
  Sent Items, not just the default one; the check reports how many it searched.
  If that number is 0, Outlook is not showing this profile any sent mail at all.

## If something looks wrong

This macro was written carefully but **could not be tested from where it was
written**, because it needs a real Outlook and a real mailbox. If the first run
misbehaves, the useful things to report are:

- the exact wording of any error box, and the line it stops on if the editor
  highlights one;
- whether the draft opened as a **reply** (previous newsletters quoted below) or
  as a new message;
- whether the newsletter picture is **in the body** or arrived as a paperclip
  attachment;
- whether the PDF is attached;
- whether To and Cc are right.

Two known things to watch:

- **The picture arriving as an attachment instead of inline.** The macro sets the
  property that puts it in the body; some Outlook versions need the draft saved
  before that sticks, which the macro does, but it is the most likely thing to
  need adjusting.
- **Sent mail that is not in Outlook's local copy.** This is the one that has
  actually bitten, and no amount of macro correctness fixes it. The macro asks
  the local store for the previous newsletter; if Outlook's offline file has
  stopped syncing, last cycle's newsletter is not in there to find, and every
  unit opens as a new message.

  Measured on the owner's PC on 10 September 2026: Sent Items held 1,934 items
  and **nothing at all after 28 March 2026**, while the Inbox stopped at
  1 August 2026 — two folders frozen at two different dates, on a 38 GB offline
  file that Outlook had itself recorded as corrupt. The search worked perfectly
  and found 1,328 newsletters; they were all a year and a half old.

  So before blaming the macro, check that Outlook is showing today's mail.
  `NewsletterThreadCheck` reports the date of the message it would reply to —
  if that date is months old, the store is the problem, not the subject line.
  See `docs/PROJECT.md`, "Classic Outlook's offline file".

An earlier version of this file said the macro examined "the 3,000 most recent
Sent Items". It no longer does — it asks the store to do the matching, which is
indexed and has no cap. The note was left behind when the code changed.

## Signatures — set this up once, or you get none or two

Two facts, the first one measured on a real send:

- **Opening the file adds NO signature.** A test newsletter sent from classic
  Outlook on 13 September ended "Kind Regards," and then nothing. Outlook signs a
  message it composes, not one it opens from a file.
- **The macro replies to a real message**, and Outlook adds your reply signature
  to that itself.

Earlier this file said to pick one route and configure for it. That no longer
works, because you now use both: double-click for units with an anchor, the
button for the rest. Configured for one, the other is wrong.

**So do it this way, and both routes come out identical:**

1. Fill in the tool's sign-off — Email screen → **Your sign-off**. This is what
   actually signs the newsletter, and without it clients get unsigned mail.
2. Turn Outlook's automatic reply signature off — **File → Options → Mail →
   Signatures…**, and set **Replies/forwards** to **(none)**.

Step 2 only affects replies. Your signature on a brand-new email you write
yourself is untouched.

Skip step 1 and the double-clicked ones go out unsigned. Skip step 2 and the ones
through the button carry two.

## A note on security

Your macro setting is **Enable all macros**, which is what lets this run. It also
means any macro file that reaches your computer can run, so treat macro files the
way you treat programs: only run ones you know the origin of. If your IT ever
tightens that setting, this macro stops working and everything else in the tool
carries on as normal — you lose the reply chain, not the sending.
