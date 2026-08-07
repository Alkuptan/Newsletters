# Build your own internal tool — no coding needed

This is Orascom's starter kit for building **real internal web apps by
talking to Claude**. If your team runs on a spreadsheet, a WhatsApp group,
or a stack of paper forms, you can replace it with a proper app — with
logins, roles, and its own web address — usually within a day or two.

You describe what you need in plain language. Claude asks questions, writes
down the plan, and builds it. You never write code, and you never touch a
server. And because every tool built from this kit is built the same way,
the IT development team can take yours over later and grow it — without
starting from scratch.

**Real example:** the TC&C work-request tracker was built from this kit —
requests with reference numbers, deadlines, photo attachments, an audit
trail, and a full English/Arabic interface — live on the internet, built by
conversation.

---

## What you need before starting

| You need                                      | Where to get it                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------------- |
| A Mac                                         | —                                                                                 |
| The **Claude Code** app, signed in            | ask IT if you don't have it                                                       |
| A **GitHub** account (free)                   | create it at [github.com/signup](https://github.com/signup) — use your work email |
| Membership in the Orascom GitHub organization | send your GitHub username to the dev team; you need it to see this page           |
| About an hour for the first conversation      | ☕                                                                                |

That's all — GitHub is the only account you need up front. Two more free
accounts (**Supabase** for the database, **Cloudflare** for the hosting) come
into play only when you put your tool on the internet — and if you don't
have them yet, Claude walks you through creating them right then, in a
couple of clicks each (Supabase signs up with your GitHub; Cloudflare with
your work email). Already have them? They're simply reused. You do **not**
need a company server, a budget, or anyone's permission to start.

---

## Getting started — 3 steps

### 1 · Make your own copy of this kit

On this page on GitHub, click the green **“Use this template”** button →
**“Create a new repository”**. Then:

- **Owner:** your own GitHub account
- **Name:** your tool's name, in small letters with dashes — like
  `tool-linen-tracker` or `tool-beach-permits`
- **Private** ✓

### 2 · Open it in Claude Code

Open the Claude Code app, and open (clone) the repository you just created.
If you're not sure how, tell Claude: _“help me clone my repository
tool-whatever-you-named-it”_ — it will handle it.

### 3 · Type `/kickoff` and just talk

Describe what you want to build, in your own words. Claude will interview
you — one simple question at a time, about the _things_ you track, the
_people_ who use them, and the _screens_ they need. There's nothing to
install or configure first; while you're talking, Claude quietly prepares
your computer in the background.

By the end you'll have a written plan you approved, and then a **working
app on your own machine** — with sample users you can log in as and click
around.

Have a requirements document already? Just give it to Claude at the start —
it will read it and only ask about what's missing.

---

## The five commands

These are the only commands you'll ever need. Type them in Claude Code:

| Command            | What it does                                             | When                             |
| ------------------ | -------------------------------------------------------- | -------------------------------- |
| **`/kickoff`**     | Interviews you, then builds the first working version    | Once, at the start               |
| **`/go-live`**     | Puts your tool on the internet, at its own web address   | When you're ready to share it    |
| **`/new-feature`** | Adds something new — a screen, a rule, a thing to track  | Any time after kickoff           |
| **`/fix-it`**      | Finds and fixes whatever is broken                       | When something looks wrong       |
| **`/handover`**    | Checks everything and packages the tool for the dev team | When your tool has proven itself |

Anything else — “change this label”, “show me the requests screen”, “who
can delete things?” — just ask Claude in normal words.

---

## Running it yourself (when Claude isn't available)

Your tool doesn't need Claude to run — Claude builds it; the tool itself is
just a program on your machine (and, once live, a website that stays up on
its own). If you hit your Claude usage limit and want to open the local
version yourself: open **Terminal**, go to your tool's folder, and run these
three commands, one at a time:

```
open -a Docker
pnpm exec supabase start
pnpm dev
```

Wait for Docker (the whale icon) to finish starting before the second
command — if it complains, just run it again. Then open
**http://localhost:3000** in your browser and log in as usual. To stop:
press `Ctrl+C` in the Terminal. ("Already running" messages are fine —
it means that part was still on.)

---

## Good to know (the honest small print)

- **It runs on free accounts.** Free has three quirks, and Claude handles
  all of them: **inviting colleagues** works through a personal sign-in
  link Claude gives you to forward (normal email invites come later, when
  the dev team connects company email); the **database takes a nap** if
  nobody uses the tool for about a week (data is safe — `/fix-it` wakes it
  up); and there are generous but real **size limits** (a small team's tool
  won't come near them).
- **You approve before anything is built.** Claude writes the plan down and
  reads it back. Nothing gets built that isn't in the plan you said yes to.
- **Some ideas belong with the dev team instead.** If your tool needs
  payments, customer (non-employee) users, or connections into company
  systems, Claude will say so and help you write it up for the dev team —
  usually the rest of your idea can still be built now, with that one part
  parked for later.
- **Graduation is the goal, not a failure.** When your tool becomes part of
  daily operations, run `/handover` — the dev team moves it onto company
  accounts and takes over the care and feeding. Because it was built from
  this kit, that's an afternoon's work for them, not a rebuild.

---

## For developers

Everything technical lives in the docs: architecture and conventions in
[`docs/template/RULES.md`](docs/template/RULES.md), approved patterns in
[`docs/template/RECIPES.md`](docs/template/RECIPES.md), the graduation +
company-account migration checklist in
[`docs/template/HANDOFF.md`](docs/template/HANDOFF.md), and template
maintenance rules (including the hard budgets that keep this kit small) in
[`CONTRIBUTING.md`](CONTRIBUTING.md).

**Stack:** Next.js (App Router) + TypeScript strict · Supabase (Auth +
Postgres, RLS-first) · shadcn/ui + Tailwind v4 · Cloudflare Workers via
OpenNext · Vitest + Playwright. Version: see `TEMPLATE_VERSION` and
[`docs/template/CHANGELOG.md`](docs/template/CHANGELOG.md).
