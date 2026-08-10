-- 0016 — how wide the newsletter picture is inside the covering email
--
-- The first version showed it at up to 1000px, which the owner found far too
-- big in a reading pane. Rather than pick a new number in code, it becomes a
-- setting: this is exactly the kind of thing that gets adjusted twice more after
-- seeing it on a real screen.
--
-- 500 is the new default — half of what it was, which is what was asked for.
-- The bounds keep it sane: under 200 the Gantt labels are unreadable, over 1400
-- it forces a sideways scroll in Outlook's reading pane.
--
-- The value caps the picture (`max-width`) rather than fixing it, so a narrow
-- window still shrinks it further.
--
-- Additive with a default, so the existing row stays valid. RLS on
-- `mail_settings` is unchanged and already in force (migration 0015): everyone
-- signed in reads it, only admins write.

alter table public.mail_settings
  add column image_width_px integer not null default 500
    check (image_width_px between 200 and 1400);

comment on column public.mail_settings.image_width_px is
  'Caps the newsletter picture''s width in the covering email body, in pixels.';

-- ---------------------------------------------------------------------------
-- Where the picture sits in the message
--
-- It used to go after all the text. The owner wants it after "kindly find
-- attached" and above "should you have any questions", so the wording now
-- carries a `{newsletter}` marker saying where.
--
-- The default is updated for anyone starting fresh. The EXISTING row is only
-- rewritten if it is still character-for-character the default from 0015 —
-- deliberately not a regular expression hunting for a likely spot. The owner
-- has already written their own wording, so this will not match it, and
-- guessing where a marker belongs inside someone's text is how a migration
-- mangles the sentence a client reads. They place it themselves, which takes
-- one edit on the Email screen.
-- ---------------------------------------------------------------------------

alter table public.mail_settings
  alter column body_template set default
$default$Dear {client},

Kindly find attached the latest newsletter as of {date}.

{newsletter}

Should you have any questions or require further clarification, please do not hesitate to reach out to us.

Thank you for your continued trust and understanding.$default$;

update public.mail_settings
   set body_template =
$new$Dear {client},

Kindly find attached the latest newsletter as of {date}.

{newsletter}

Should you have any questions or require further clarification, please do not hesitate to reach out to us.

Thank you for your continued trust and understanding.$new$
 where body_template =
$old$Dear {client},

Kindly find attached the latest newsletter as of {date}.

Should you have any questions or require further clarification, please do not hesitate to reach out to us.

Thank you for your continued trust and understanding.$old$;
