-- 0017 — pausing a unit, and the sender's signature
--
-- Two unrelated additions, both asked for on 12 August 2026.
--
-- 1. `units.paused_until` — "not this week, look at it again after this date".
--    A date rather than a boolean because "paused" with no end is how a unit gets
--    forgotten: the pause expires by itself and the unit reappears in the work
--    list without anyone having to remember it. NULL means not paused, and a date
--    in the past is simply over.
--
-- 2. `mail_settings.signature_html` — Outlook adds a signature to a message IT
--    composes, but not to a message file it merely opens, so a prepared draft
--    arrives without one. Holding the signature here puts it in the message.
--    Stored per-tool rather than per-person: one person sends these today, and a
--    per-user signature is a bigger change than the problem warrants.
--
-- Both additive and nullable, so every existing row stays valid. RLS unchanged
-- and already in force: `units` from 0006 (`can_read_unit` / `can_write_unit`),
-- `mail_settings` from 0015 (everyone reads, admins write).

alter table public.units
  add column paused_until date;

comment on column public.units.paused_until is
  'Skip this unit until this date. NULL means not paused; a past date has expired.';

create index units_paused_until_idx on public.units (paused_until)
  where paused_until is not null;

alter table public.mail_settings
  add column signature_html text
    check (signature_html is null or char_length(signature_html) <= 4000);

comment on column public.mail_settings.signature_html is
  'Appended to the prepared message, because Outlook does not add a signature to a file it opens.';

-- ---------------------------------------------------------------------------
-- The greeting now uses the client's title and FIRST name
--
-- "Dear Mr. Gasser," rather than "Dear Mr. Gasser El Sayed Ibrahim,". A targeted
-- replacement of the greeting line only: anything else in the wording is the
-- owner's and is left exactly as it is.
-- ---------------------------------------------------------------------------

alter table public.mail_settings
  alter column body_template set default
$default$Dear {firstname},

Kindly find attached the latest newsletter as of {date}.

{newsletter}

Should you have any questions or require further clarification, please do not hesitate to reach out to us.

Thank you for your continued trust and understanding.$default$;

update public.mail_settings
   set body_template = replace(body_template, 'Dear {client},', 'Dear {firstname},')
 where position('Dear {client},' in body_template) > 0;
