# Contributing to the template

This template exists because a previous internal developer-tooling effort
(orascom-dev-agents: 33 agents, 55 commands, 71 skills, 25 hooks) died of its
own surface area. These budgets are the immune system. **Additions must
retire something.**

## Hard budgets

| Surface                          | Budget                                                    |
| -------------------------------- | --------------------------------------------------------- |
| Skills in `.claude/skills/`      | **≤ 5** (kickoff, go-live, new-feature, fix-it, handover) |
| Claude Code hooks                | **0** (husky pre-commit is the only hook of any kind)     |
| Agents / MCP servers required    | **0**                                                     |
| CLIs a user must install by hand | **0** (`/kickoff` and `/go-live` handle everything)       |
| Golden rules in RULES.md         | ≤ 12 — a rule nobody can remember is not a rule           |

## Rules of change

- The template must always be green: `pnpm verify`, `pnpm migration-lint`,
  and `pnpm build:cf` pass on every commit to `main`.
- Patterns flow **exemplar repos → template by human curation** (from
  elgouna-qa/pmu), never by pointing tooling at private repos.
- Bump `TEMPLATE_VERSION` (single integer) on every release; describe changes
  in `docs/template/CHANGELOG.md` tagged `[docs]` / `[config]` / `[code]`.
- The managed set (safe to overwrite in downstream projects):
  `docs/template/*`, `.claude/skills/*`, `.claude/settings.json`,
  `eslint.config.mjs`, `scripts/migration-lint.mjs`,
  `.github/workflows/*`. Never let project-specific content into these files.
- Downstream `src/` improvements ship as RECIPES entries, never as merges.
- Before releasing: dogfood — scaffold a project from the template and run
  `/kickoff` + `/go-live` end-to-end with no manual fixes outside the skills.

## Feedback loop

Downstream projects file issues here when a rule/recipe fails them (RULES.md
instructs Claude to do this). Triage monthly; every escalation is a template
bug: ask "what would have prevented this?" and fix the template, not the
downstream repo.
