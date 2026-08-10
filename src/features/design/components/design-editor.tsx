"use client";

/**
 * Adjust the newsletter's design, with the newsletter itself alongside so every
 * change is visible immediately.
 *
 * Used twice: for a master (applies to every newsletter of that layout) and for a
 * single unit (applies to that unit from then on). The controls are identical; only
 * what the Save button writes differs.
 *
 * Numbers in fields, not dragging — see docs/SPEC.md for why.
 */

import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NewsletterCanvas } from "@/features/newsletters/components/newsletter-canvas";
import {
  BOX_HEIGHT_DEFAULTS,
  COLOUR_DEFAULTS,
  FIELD_DEFAULTS,
  TEXT_DEFAULTS,
  boxRange,
  hasOwnDesign,
  leftColumnFits,
  resolveTheme,
  textRange,
  GAP_DEFAULTS,
  gapRange,
  type BoxKey,
  type ColourKey,
  type FieldKey,
  type GapKey,
  type TextSizeKey,
  type ThemeOverrides,
} from "@/lib/newsletter/theme";
import type { NewsletterView } from "@/lib/newsletter/view-model";

/** Text sizes grouped the way someone looking at the page would group them. */
const TEXT_GROUPS: { title: string; keys: TextSizeKey[] }[] = [
  { title: "Unit header", keys: ["unitName", "clientName"] },
  { title: "Details block", keys: ["infoLine", "amount"] },
  { title: "Date cards", keys: ["cardDay", "cardMonth", "cardLabel"] },
  {
    title: "Status and Duration",
    keys: ["statusHeading", "statusPill", "durationHeading", "durationValue", "durationUnit"],
  },
  { title: "Area of Concern", keys: ["concernHeading", "concernBullet"] },
  { title: "Progress and Elapsed", keys: ["progressValue", "elapsedValue", "metricLabel"] },
  {
    title: "Time schedule",
    keys: ["ganttYear", "ganttMonth", "ganttBand", "ganttBarLabel", "ganttBarName"],
  },
  { title: "Stage track and footer", keys: ["stageLabel", "footer"] },
];

const TEXT_LABELS: Record<TextSizeKey, string> = {
  unitName: "Unit name",
  clientName: "Client",
  infoLine: "PM / references / summary",
  amount: "Quotation amount",
  cardDay: "Day number",
  cardMonth: "Month under it",
  cardLabel: "“Start Date” / “Finish Date”",
  statusHeading: "“Status”",
  statusPill: "AHEAD / ON TRACK / BEHIND",
  durationHeading: "“Duration”",
  durationValue: "Number of days",
  durationUnit: "“Calendar Days”",
  concernHeading: "“Area of Concern”",
  concernBullet: "Bullets",
  progressValue: "Progress percentage",
  elapsedValue: "Days elapsed",
  metricLabel: "Labels under both",
  ganttYear: "Year",
  ganttMonth: "Month names",
  ganttBand: "Scope band",
  ganttBarLabel: "Bar dates",
  ganttBarName: "Bar names",
  stageLabel: "Stage names",
  footer: "Footer",
};

const BOX_LABELS: Record<BoxKey, string> = {
  unitHeader: "Unit header",
  infoBox: "Details block",
  amountBox: "Quotation amount",
  concern: "Area of Concern",
  metricsRow: "Progress and Elapsed",
  logoBox: "Logo box",
  timelinePanel: "Timeline height (max)",
};

const GAP_LABELS: Record<GapKey, string> = {
  belowUnitHeader: "Under the unit header",
  belowInfoBox: "Under the details block",
  belowAmountBox: "Under the quotation amount",
  belowCardRow: "Under the date cards",
  aboveMetrics: "Above Progress and Elapsed",
  belowLogo: "Under the logo",
};

const FIELD_LABELS: Record<FieldKey, string> = {
  clientName: "Client name",
  projectManager: "Project manager",
  quotationReferences: "Quotation references",
  projectSummary: "Project summary",
  areaOfConcern: "Area of Concern box",
};

const COLOUR_LABELS: Record<ColourKey, string> = {
  orange: "Accent (numbers, stage, status)",
  orangePale: "Date / Status / Duration cards",
  greyHeader: "Unit header",
  greyBox: "Details block",
  greyDark: "Footer bar and rings",
  ganttBar: "Schedule bars",
  ganttHeader: "Month ruler",
  ganttBand: "Scope band",
  elapsedRing: "Elapsed ring",
  elapsedOverrun: "Elapsed ring when overdue",
};

/**
 * One foldable group of settings.
 *
 * The list had grown to sixty-odd controls in a single column, which is why the
 * owner asked for this. Sections remember nothing on purpose — they reopen on
 * every visit — but a search forces every matching one open, so finding a
 * setting never means remembering which group it was in.
 *
 * Defined at module level, not inside the editor: a component created during
 * render is a NEW component every keystroke, so React throws its state away and
 * every section would snap shut as you typed.
 */
function Section({
  title,
  changedCount,
  open,
  onToggle,
  children,
  hint,
  hidden,
}: {
  title: string;
  changedCount: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  hint?: string;
  /** Nothing in here matches the search, so the heading is noise too. */
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <section className="space-y-2">
      <button
        type="button"
        className="hover:text-foreground/80 flex w-full items-center gap-2 text-left"
        onClick={onToggle}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <h2 className="text-sm font-semibold">{title}</h2>
        {changedCount > 0 && (
          <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[10px] font-medium">
            {changedCount} changed
          </span>
        )}
      </button>
      {open && (
        <>
          {children}
          {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
        </>
      )}
    </section>
  );
}

export function DesignEditor({
  /** What is stored today. */
  initial,
  /** The newsletter shown alongside. */
  view,
  /** Applied UNDER the values being edited, when editing one unit. */
  masterOverrides,
  onSave,
  /** Wording for the save button and the reset. */
  scopeLabel,
  canEdit,
}: {
  initial: ThemeOverrides;
  view: NewsletterView;
  masterOverrides?: ThemeOverrides;
  onSave: (overrides: ThemeOverrides | null) => Promise<{ ok: boolean; error?: string }>;
  scopeLabel: string;
  canEdit: boolean;
}) {
  const [overrides, setOverrides] = useState<ThemeOverrides>(initial);
  const [pending, startTransition] = useTransition();

  const theme = useMemo(
    () => resolveTheme(masterOverrides ?? null, overrides),
    [masterOverrides, overrides],
  );
  // Values under the ones being edited — what "reset this value" goes back to.
  const beneath = useMemo(() => resolveTheme(masterOverrides ?? null, null), [masterOverrides]);
  const fits = leftColumnFits(theme);
  const logoInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const searching = query.trim().length > 0;
  const changed = hasOwnDesign(overrides);

  function setText(key: TextSizeKey, value: number | null) {
    setOverrides((current) => {
      const text = { ...(current.text ?? {}) };
      if (value === null) delete text[key];
      else text[key] = value;
      return { ...current, text };
    });
  }

  function setBox(key: BoxKey, value: number | null) {
    setOverrides((current) => {
      const boxes = { ...(current.boxes ?? {}) };
      if (value === null) delete boxes[key];
      else boxes[key] = value;
      return { ...current, boxes };
    });
  }

  function setGap(key: GapKey, value: number | null) {
    setOverrides((current) => {
      const gaps = { ...(current.gaps ?? {}) };
      if (value === null) delete gaps[key];
      else gaps[key] = value;
      return { ...current, gaps };
    });
  }

  /** The logo, as a data URL. Null puts the El Gouna artwork back. */
  function setLogo(value: string | null) {
    setOverrides((current) => ({ ...current, logo: value }));
  }

  async function chooseLogo(file: File) {
    // Shrunk like any other image: a 4 MB logo would sit in the database, in
    // every export, and in the Worker's memory for no visible gain.
    const { shrinkPhoto, formatBytes } = await import("@/lib/newsletter/shrink-photo");
    const shrunk = await shrinkPhoto(file);
    if (shrunk.finalBytes > 400_000) {
      toast.error(
        `That image is ${formatBytes(shrunk.finalBytes)} even after shrinking. Please use a smaller one.`,
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result));
    reader.onerror = () => toast.error("That image could not be read.");
    reader.readAsDataURL(shrunk.file);
  }

  function setColour(key: ColourKey, value: string | null) {
    setOverrides((current) => {
      const colours = { ...(current.colours ?? {}) };
      if (value === null) delete colours[key];
      else colours[key] = value;
      return { ...current, colours };
    });
  }

  function setField(key: FieldKey, value: boolean) {
    setOverrides((current) => ({
      ...current,
      fields: { ...(current.fields ?? {}), [key]: value },
    }));
  }

  /** Scale every text size together — the quickest way to fix "all a bit small". */
  function scaleText(factor: number) {
    const { min, max } = textRange();
    setOverrides((current) => {
      const text = { ...(current.text ?? {}) };
      for (const key of Object.keys(TEXT_DEFAULTS) as TextSizeKey[]) {
        const from = text[key] ?? beneath.text[key];
        text[key] = Math.round(Math.min(max, Math.max(min, from * factor)) * 10) / 10;
      }
      return { ...current, text };
    });
  }

  function save(next: ThemeOverrides | null) {
    startTransition(async () => {
      const result = await onSave(next);
      if (!result.ok) {
        toast.error(result.error ?? "That could not be saved.");
        return;
      }
      if (next === null) setOverrides({});
      toast.success(next === null ? `${scopeLabel} back to the original.` : `${scopeLabel} saved.`);
    });
  }

  const isOpen = (title: string) => searching || !collapsed.has(title);

  function toggle(title: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  const needle = query.trim().toLowerCase();

  /** The controls each section would show for the current search. */
  const visibleText = TEXT_GROUPS.flatMap((g) => g.keys).filter((k) =>
    shows(TEXT_LABELS[k], "Text sizes"),
  );
  const visibleBoxes = (Object.keys(BOX_HEIGHT_DEFAULTS) as BoxKey[]).filter((k) =>
    shows(BOX_LABELS[k], "Box heights"),
  );
  const visibleGaps = (Object.keys(GAP_DEFAULTS) as GapKey[]).filter((k) =>
    shows(GAP_LABELS[k], "Spacing between boxes"),
  );
  const visibleFields = (Object.keys(FIELD_DEFAULTS) as FieldKey[]).filter((k) =>
    shows(FIELD_LABELS[k], "Lines shown"),
  );
  const visibleColours = (Object.keys(COLOUR_DEFAULTS) as ColourKey[]).filter((k) =>
    shows(COLOUR_LABELS[k], "Colours"),
  );

  /**
   * Does this control match what is being searched for?
   *
   * Matches the SECTION name as well as the control's own label: someone typing
   * "colour" means the Colours group, even though no individual control is
   * called that. Without this, searching for a group by name found nothing.
   */
  function shows(label: string, section?: string): boolean {
    if (!searching) return true;
    if (label.toLowerCase().includes(needle)) return true;
    return section ? section.toLowerCase().includes(needle) : false;
  }

  const numberField = (
    id: string,
    label: string,
    value: number,
    original: number,
    range: { min: number; max: number },
    onChange: (value: number | null) => void,
    isOverridden: boolean,
  ) => (
    <div key={id} className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <div className="flex items-center gap-1">
        <Input
          id={id}
          type="number"
          step="0.5"
          min={range.min}
          max={range.max}
          value={value}
          disabled={!canEdit}
          onChange={(event) => {
            const raw = event.target.value;
            onChange(raw === "" ? null : Number(raw));
          }}
          className="h-8 w-20"
        />
        {isOverridden && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            aria-label={`Reset ${label}`}
            disabled={!canEdit}
            onClick={() => onChange(null)}
            title={`Back to ${original}`}
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-2 left-2 h-4 w-4" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a setting"
              aria-label="Find a setting"
              className="h-8 w-52 pl-8"
            />
          </div>
          {searching ? (
            <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
              Clear
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setCollapsed((current) =>
                  current.size > 0
                    ? new Set()
                    : new Set([
                        "Text sizes",
                        "Box heights",
                        "Spacing between boxes",
                        "Logo",
                        "Lines shown",
                        "Colours",
                      ]),
                )
              }
            >
              {collapsed.size > 0 ? "Open all" : "Fold all"}
            </Button>
          )}
          {changed && (
            <span className="text-muted-foreground text-xs">
              {Object.values(overrides).reduce(
                (n, group) =>
                  n +
                  (group && typeof group === "object" ? Object.keys(group).length : group ? 1 : 0),
                0,
              )}{" "}
              settings changed from the original
            </span>
          )}
        </div>

        {!fits && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            These heights do not all fit the page, so they have been reduced to make room. The left
            column is nearly full by design — to make one box taller, make another shorter.
          </p>
        )}

        <Section
          title="Text sizes"
          hidden={searching && visibleText.length === 0}
          open={isOpen("Text sizes")}
          onToggle={() => toggle("Text sizes")}
          changedCount={Object.keys(overrides.text ?? {}).length}
        >
          {canEdit && !searching && (
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => scaleText(0.95)}>
                All smaller
              </Button>
              <Button variant="outline" size="sm" onClick={() => scaleText(1.05)}>
                All bigger
              </Button>
            </div>
          )}
          {TEXT_GROUPS.filter((group) =>
            group.keys.some((k) => shows(TEXT_LABELS[k], "Text sizes")),
          ).map((group) => (
            <div key={group.title} className="space-y-2 rounded-md border p-3">
              <p className="text-muted-foreground text-xs font-medium">{group.title}</p>
              <div className="flex flex-wrap gap-3">
                {group.keys
                  .filter((key) => shows(TEXT_LABELS[key], "Text sizes"))
                  .map((key) =>
                    numberField(
                      `text-${key}`,
                      TEXT_LABELS[key],
                      theme.text[key],
                      TEXT_DEFAULTS[key],
                      textRange(),
                      (value) => setText(key, value),
                      overrides.text?.[key] !== undefined,
                    ),
                  )}
              </div>
            </div>
          ))}
        </Section>

        <Section
          title="Box heights"
          hidden={searching && visibleBoxes.length === 0}
          open={isOpen("Box heights")}
          onToggle={() => toggle("Box heights")}
          changedCount={Object.keys(overrides.boxes ?? {}).length}
        >
          <div className="flex flex-wrap gap-3 rounded-md border p-3">
            {(Object.keys(BOX_HEIGHT_DEFAULTS) as BoxKey[])
              .filter((key) => shows(BOX_LABELS[key], "Box heights"))
              .map((key) =>
                numberField(
                  `box-${key}`,
                  BOX_LABELS[key],
                  theme.boxes[key],
                  BOX_HEIGHT_DEFAULTS[key],
                  boxRange(key),
                  (value) => setBox(key, value),
                  overrides.boxes?.[key] !== undefined,
                ),
              )}
          </div>
        </Section>

        <Section
          title="Spacing between boxes"
          hidden={searching && visibleGaps.length === 0}
          open={isOpen("Spacing between boxes")}
          onToggle={() => toggle("Spacing between boxes")}
          changedCount={Object.keys(overrides.gaps ?? {}).length}
          hint="“Under the logo” moves the timeline and the photos down together, so it is also how you give the logo more room."
        >
          <div className="flex flex-wrap gap-3 rounded-md border p-3">
            {(Object.keys(GAP_DEFAULTS) as GapKey[])
              .filter((key) => shows(GAP_LABELS[key], "Spacing between boxes"))
              .map((key) =>
                numberField(
                  `gap-${key}`,
                  GAP_LABELS[key],
                  theme.gaps[key],
                  GAP_DEFAULTS[key],
                  gapRange(key),
                  (value) => setGap(key, value),
                  overrides.gaps?.[key] !== undefined,
                ),
              )}
          </div>
        </Section>

        <Section
          title="Logo"
          hidden={searching && !shows("Logo")}
          open={isOpen("Logo")}
          onToggle={() => toggle("Logo")}
          changedCount={overrides.logo ? 1 : 0}
        >
          <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
            <span
              className="flex h-12 w-28 items-center justify-center rounded border bg-white p-1"
              aria-label="Current logo"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a data URL, not an asset */}
              <img
                src={theme.logo ?? "/newsletter/el-gouna-logo.png"}
                alt="Logo"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </span>
            <input
              ref={logoInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void chooseLogo(file);
                event.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!canEdit}
              onClick={() => logoInput.current?.click()}
            >
              Choose a logo
            </Button>
            {theme.logo && (
              <Button variant="ghost" size="sm" disabled={!canEdit} onClick={() => setLogo(null)}>
                Back to the El Gouna logo
              </Button>
            )}
            <span className="text-muted-foreground text-xs">
              Its proportions are never changed — it is scaled to fit the box.
            </span>
          </div>
        </Section>

        <Section
          title="Lines shown"
          hidden={searching && visibleFields.length === 0}
          open={isOpen("Lines shown")}
          onToggle={() => toggle("Lines shown")}
          changedCount={Object.keys(overrides.fields ?? {}).length}
        >
          <div className="flex flex-wrap gap-4 rounded-md border p-3">
            {(Object.keys(FIELD_DEFAULTS) as FieldKey[])
              .filter((key) => shows(FIELD_LABELS[key], "Lines shown"))
              .map((key) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 text-xs">
                  <Checkbox
                    checked={theme.fields[key]}
                    disabled={!canEdit}
                    onCheckedChange={(checked) => setField(key, checked === true)}
                  />
                  {FIELD_LABELS[key]}
                </label>
              ))}
          </div>
        </Section>

        <Section
          title="Colours"
          hidden={searching && visibleColours.length === 0}
          open={isOpen("Colours")}
          onToggle={() => toggle("Colours")}
          changedCount={Object.keys(overrides.colours ?? {}).length}
        >
          <div className="flex flex-wrap gap-3 rounded-md border p-3">
            {(Object.keys(COLOUR_DEFAULTS) as ColourKey[])
              .filter((key) => shows(COLOUR_LABELS[key], "Colours"))
              .map((key) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`colour-${key}`} className="text-xs">
                    {COLOUR_LABELS[key]}
                  </Label>
                  <div className="flex items-center gap-1">
                    <input
                      id={`colour-${key}`}
                      type="color"
                      value={theme.colours[key]}
                      disabled={!canEdit}
                      onChange={(event) => setColour(key, event.target.value.toUpperCase())}
                      className="border-input h-8 w-14 rounded border bg-transparent p-0.5"
                    />
                    {overrides.colours?.[key] !== undefined && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`Reset ${COLOUR_LABELS[key]}`}
                        onClick={() => setColour(key, null)}
                      >
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </Section>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button onClick={() => save(overrides)} disabled={pending}>
              {pending ? "Saving…" : `Save ${scopeLabel.toLowerCase()}`}
            </Button>
            <Button variant="outline" onClick={() => save(null)} disabled={pending || !changed}>
              Reset everything to the original
            </Button>
            <span className="text-muted-foreground text-xs">
              {changed ? "Changed from the original." : "Matching the original design."}
            </span>
          </div>
        )}
      </div>

      {/* The newsletter, at three-quarter size so the controls fit beside it.
          `sticky` keeps it in view while the controls scroll — otherwise every
          change had to be judged by scrolling back up. */}
      <div className="space-y-2 self-start lg:sticky lg:top-4">
        <h2 className="text-sm font-semibold">Preview</h2>
        {/* overflow hidden matters: the inner box keeps its full 1280 × 720
            layout size and is only scaled visually, so without clipping it
            overhangs its container and swallows clicks on whatever is beside it. */}
        <div
          style={{ width: 1280 * 0.68, height: 720 * 0.68, overflow: "hidden" }}
          className="bg-white shadow-sm"
        >
          <div
            style={{
              width: 1280,
              height: 720,
              transform: "scale(0.68)",
              transformOrigin: "top left",
            }}
          >
            <NewsletterCanvas view={view} theme={theme} />
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          A real unit, so you are judging the design against your own figures.
        </p>
      </div>
    </div>
  );
}
