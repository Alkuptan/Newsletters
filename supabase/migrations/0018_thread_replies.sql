-- 0018 — the anchor that makes each newsletter a real reply
--
-- Until now every newsletter started its own email thread. The client received
-- fifty separate messages rather than one growing conversation, and neither side
-- could see what was said last cycle.
--
-- What makes a reply a reply is `In-Reply-To` / `References` carrying the
-- previous message's `Message-ID`. That id exists only after Exchange has
-- actually sent something, which is why this could not be done from the tool
-- alone — see `docs/PROJECT.md`, "Classic Outlook's offline file", for the three
-- attempts that failed first, including the VBA macro.
--
-- So the id is captured outside the tool and parked here, one per unit.
--
-- `thread_message_at` earns its place: an anchor is only as good as it is
-- recent, and without the date there is no way to tell a live thread from one
-- anchored to a message sent eighteen months ago. It is the first thing to look
-- at when a unit stops threading.
--
-- Both nullable and additive, so every existing row stays valid and a unit with
-- no anchor simply behaves as it does today — a new thread, which is safe.
-- RLS unchanged and already in force on `units` from 0006 (`can_read_unit` /
-- `can_write_unit`).

alter table public.units
  add column thread_message_id text
    check (
      thread_message_id is null
      -- Shape-checked at the boundary, not just where it is written. A value
      -- that is not <token@token> cannot thread, and one containing a newline
      -- would inject a header into the message file. The tool validates it
      -- again before writing it out; neither check is the only one.
      or (
        thread_message_id ~ '^<[^<>[:space:]]+@[^<>[:space:]]+>$'
        and char_length(thread_message_id) <= 998
      )
    );

comment on column public.units.thread_message_id is
  'Message-ID of this unit''s last newsletter, so the next one replies into the same thread. NULL starts a new thread.';

alter table public.units
  add column thread_message_at timestamptz;

comment on column public.units.thread_message_at is
  'When the anchored message was sent. A stale date is why a unit quietly stops threading.';
