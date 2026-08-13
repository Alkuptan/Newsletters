# Sending each newsletter as a reply in the same thread

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
4. Select `NewsletterThread.SendNewsletterInThread`, click **Add**, then
   **Rename…** it to _Send newsletter in thread_.
5. **OK**.

## Every time

1. In the tool, open the unit and press **Open in Outlook, ready to send**.
   The message file lands in your Downloads folder.
2. In classic Outlook, click **Send newsletter in thread**.
3. The draft opens — this cycle's wording and newsletter at the top, the previous
   newsletters quoted underneath, the client on To and your CC list filled in.
4. Read it. Press **Send**.

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
- **A very large mailbox.** The macro looks through the 3,000 most recent Sent
  Items for the previous newsletter. If a unit has not been sent in a very long
  time it may not be found, and you get a new message rather than a reply.

## Two signatures, if you are not careful

The tool can hold your sign-off (Email screen → **Your sign-off**), because Outlook
does not add a signature to a message it merely OPENS from a file.

The macro is different: it replies to a real message, and Outlook adds your reply
signature to that itself. So with both filled in you would get two.

Pick one:

- **using the macro** — leave the tool's sign-off empty and let Outlook sign it;
- **opening the file directly**, no macro — fill the tool's sign-off in, since
  nothing else will.

## A note on security

Your macro setting is **Enable all macros**, which is what lets this run. It also
means any macro file that reaches your computer can run, so treat macro files the
way you treat programs: only run ones you know the origin of. If your IT ever
tightens that setting, this macro stops working and everything else in the tool
carries on as normal — you lose the reply chain, not the sending.
