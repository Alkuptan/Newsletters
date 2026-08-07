# DECISIONS.md — ADR log

> One entry per non-obvious choice: every added dependency, every deviation
> from RULES.md, every "we picked A over B". Format: What / Why / Forecloses.

## 0001 — Scaffolded from internal-tool-template v1

- **What:** Project created from the org template (Next.js + Supabase RLS-first
  - Cloudflare Workers, feature-slice architecture).
- **Why:** Paved road — same stack and patterns as the org's flagship internal
  tools, so the dev team can take over without a rewrite.
- **Forecloses:** Swapping core stack pieces (ORM, deploy target, UI kit)
  without a dev-team decision.
