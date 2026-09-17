# 006 — Choose the POC the newsletter shows

## Why

The progress figure on the newsletter is money-weighted from each ticked
quotation's `Progress` column in the sheet. That is the right default and it is
often not what the owner would tell the client: the sheet lags the site, a
quotation can be ticked at 100% while a snag list is open, and one badly-kept
row drags a whole unit's figure.

Asked for on 17 September 2026: be able to write a POC per unit, **see it next
to the sheet's figure**, and choose which one the newsletter shows.

## Shape, and why it copies something that already exists

This is the same problem as Area of Concern, which already works this way:
the sheet supplies a value, the owner can take charge of it, both are visible,
and the divergence is shown rather than quietly kept. So `poc_override` follows
`concerns_override` deliberately — same storage shape, same "follow the sheet /
use mine" choice, same warning when the sheet moves on afterwards.

Saving matches the Design screen instead of the Save button next to it: the
owner asked for autosave on 12 August, and a Save button next to a live preview
is what caused "my changes are ignored". Debounced 900ms, same as
`design-editor.tsx`.

## The decision worth stating

**The verdict follows the chosen figure.** Ahead / on track / behind is computed
from progress against elapsed time, so leaving the verdict on the sheet's figure
while the dial shows the owner's would put a number and a contradiction of it
side by side on the same card.

**Completion does not.** `isComplete` stays derived from the quotations, because
"nothing left to do" is a fact about the work, not a presentation choice —
and it drives whether a unit needs photos, appears in the dashboard's Complete
count, and prints COMPLETED instead of a verdict. An owner who wants a unit
called complete ticks the quotations; typing 100 in a box does not.

## Steps

- [ ] `0019_poc_override.sql` — `units.poc_override numeric(5,2)`, `CHECK`
      0–100, nullable, NULL meaning "follow the sheet". RLS unchanged.
- [ ] `aggregate.ts` — third argument, an options object carrying
      `pocOverridePercent`. Optional, so the shape of all four call sites is
      unchanged until each is passed the value.
- [ ] Pass it at **all four** call sites, not just the newsletter: the unit list,
      the dashboard and What-changed all show progress, and a list that
      disagrees with the newsletter it links to is worse than no override.
- [ ] `setUnitPoc` action, canonical envelope.
- [ ] `poc-editor.tsx` in the unit page's left pane — both figures, the choice,
      autosave.
- [ ] Tests: the override replaces the figure, drives the verdict, does not fake
      completion, and is rejected outside 0–100.

## Not in scope

Per-quotation overrides. The newsletter shows one figure and that is what this
changes. Overriding each quotation's progress separately would also change the
money weighting, which is a different feature and a more dangerous one — it
would silently alter what "62%" means rather than replacing it visibly.
