/**
 * Pins the Gantt geometry.
 *
 * This function is the contract between the on-screen preview and the PowerPoint
 * exporter — both call it, so if it changes, both move together. These tests
 * exist to make sure it only changes deliberately.
 */

import { describe, expect, it } from "vitest";
import { GANTT_LINE_HEIGHT, layoutGantt } from "@/lib/newsletter/gantt-geometry";
import { LAYOUT, withScheduleBlocks } from "@/lib/newsletter/layout";
import type { GanttRow } from "@/lib/newsletter/view-model";

const d = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

/** Cyan 11's real schedule, transcribed from the supplied slide. */
const CY_11_ROWS: GanttRow[] = [
  {
    label: "Unit Extension",
    activities: [
      { name: "Mobilization", start: d("2026-03-30"), finish: d("2026-04-28"), tone: "normal" },
      { name: "Handing Over", start: d("2026-09-18"), finish: d("2026-09-24"), tone: "normal" },
    ],
  },
];

const PANEL_WIDTH = LAYOUT.right.width;

describe("the month ruler", () => {
  it("runs one month past the last activity, as the templates do", () => {
    // Activities span March to September; Cyan 11's own ruler shows Mar–Oct.
    const chart = layoutGantt(CY_11_ROWS, PANEL_WIDTH)!;
    expect(chart.columns.map((c) => c.label)).toEqual([
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
    ]);
    expect(chart.year).toBe(2026);
  });

  it("gives every month an equal column and fills the chart exactly", () => {
    const chart = layoutGantt(CY_11_ROWS, PANEL_WIDTH)!;
    const widths = new Set(chart.columns.map((c) => Math.round(c.width * 100)));
    expect(widths.size).toBe(1);

    const last = chart.columns[chart.columns.length - 1];
    expect(last.x + last.width - chart.chartLeft).toBeCloseTo(chart.chartWidth, 5);
  });

  it("starts the chart clear of the scope-of-work band", () => {
    const chart = layoutGantt(CY_11_ROWS, PANEL_WIDTH)!;
    expect(chart.chartLeft).toBeGreaterThan(LAYOUT.withSchedule.band.width);
  });
});

describe("bar placement", () => {
  it("places a bar by how far into its month it starts", () => {
    const chart = layoutGantt(CY_11_ROWS, PANEL_WIDTH)!;
    const [mobilization] = chart.rows[0].activities;
    const columnWidth = chart.columns[0].width;

    // 30 March is 29/31 of the way through March.
    const expected = chart.chartLeft + (29 / 31) * columnWidth;
    expect(mobilization.barX).toBeCloseTo(expected, 5);
  });

  it("keeps a short activity visible instead of drawing a hairline", () => {
    const chart = layoutGantt(CY_11_ROWS, PANEL_WIDTH)!;
    const handingOver = chart.rows[0].activities[1];
    expect(handingOver.barWidth).toBeGreaterThanOrEqual(10);
  });

  it("never lets a bar or its name escape the panel", () => {
    const chart = layoutGantt(CY_11_ROWS, PANEL_WIDTH)!;
    for (const activity of chart.rows[0].activities) {
      expect(activity.barX + activity.barWidth).toBeLessThanOrEqual(PANEL_WIDTH);
      expect(activity.nameX + activity.nameWidth).toBeLessThanOrEqual(PANEL_WIDTH);
    }
  });

  it("always leaves room for a date label, even for a bar starting on day one", () => {
    // Without a minimum the label collapses to nothing and silently disappears,
    // which is exactly what happened to Phase 4 Villa 2B's first bar.
    const chart = layoutGantt(
      [
        {
          label: "SOG",
          activities: [
            {
              name: "Mobilization",
              start: d("2026-02-01"),
              finish: d("2026-02-20"),
              tone: "normal",
            },
          ],
        },
      ],
      PANEL_WIDTH,
    )!;
    expect(chart.rows[0].activities[0].labelWidth).toBeGreaterThan(0);
  });

  it("reads the range label from the activity's real dates", () => {
    const chart = layoutGantt(CY_11_ROWS, PANEL_WIDTH)!;
    expect(chart.rows[0].activities[0].rangeLabel).toBe("Mar 30 - Apr 28");
  });
});

describe("stacking several quotations", () => {
  it("gives each quotation its own band and stacks them without overlap", () => {
    const chart = layoutGantt(
      [
        { label: "SOG", activities: CY_11_ROWS[0].activities.slice(0, 1) },
        { label: "Landscape", activities: CY_11_ROWS[0].activities },
      ],
      PANEL_WIDTH,
    )!;

    expect(chart.rows).toHaveLength(2);
    // Rows stack without overlapping. The first does not start at 0 because a
    // short block is centred in the panel.
    expect(chart.rows[1].y).toBeCloseTo(chart.rows[0].y + chart.rows[0].height, 5);
    // The quotation with more bars gets the taller band.
    expect(chart.rows[1].height).toBeGreaterThan(chart.rows[0].height);
    expect(chart.panelHeight).toBeGreaterThanOrEqual(chart.rows[0].height + chart.rows[1].height);
  });
});

describe("the panel's height", () => {
  const MAX = LAYOUT.withSchedule.ganttPanel.maxHeight;

  /** A schedule of `n` identical bars. */
  const barsOf = (n: number): GanttRow[] => [
    {
      label: "Unit Extension",
      activities: Array.from({ length: n }, (_, i) => ({
        name: `Activity ${i + 1}`,
        start: d("2026-03-01"),
        finish: d("2026-03-20"),
        tone: "normal" as const,
      })),
    },
  ];

  it("grows with the bars instead of always filling the page", () => {
    const three = layoutGantt(barsOf(3), PANEL_WIDTH)!;
    const eight = layoutGantt(barsOf(8), PANEL_WIDTH)!;
    expect(three.panelHeight).toBeLessThan(eight.panelHeight);
  });

  it("never grows past the maximum, however long the schedule", () => {
    for (const n of [9, 12, 20, 40]) {
      expect(layoutGantt(barsOf(n), PANEL_WIDTH)!.panelHeight).toBeLessThanOrEqual(MAX);
    }
  });

  it("keeps three bars close together rather than flinging them apart", () => {
    const three = layoutGantt(barsOf(3), PANEL_WIDTH)!;
    const gap = three.rows[0].activities[1].barY - three.rows[0].activities[0].barY;
    // Comfortable, not cavernous: a bar's own height plus a little.
    expect(gap).toBeLessThanOrEqual(three.rows[0].activities[0].barHeight + 12);
  });

  it("squeezes the spacing only when the schedule is too long to fit", () => {
    const roomy = layoutGantt(barsOf(3), PANEL_WIDTH)!;
    const tight = layoutGantt(barsOf(20), PANEL_WIDTH)!;
    const gapOf = (c: typeof roomy) => c.rows[0].activities[1].barY - c.rows[0].activities[0].barY;
    expect(gapOf(tight)).toBeLessThan(gapOf(roomy));
  });

  it("keeps every bar inside the panel even with a very long schedule", () => {
    const chart = layoutGantt(barsOf(20), PANEL_WIDTH)!;
    for (const activity of chart.rows[0].activities) {
      expect(activity.barY + activity.barHeight).toBeLessThanOrEqual(chart.panelHeight + 1);
    }
  });

  it("pulls the stage track and photos up when the schedule is short", () => {
    // A short Gantt should buy taller photos, not leave a hole.
    const short = withScheduleBlocks(layoutGantt(barsOf(3), PANEL_WIDTH)!.panelHeight);
    const long = withScheduleBlocks(layoutGantt(barsOf(12), PANEL_WIDTH)!.panelHeight);
    expect(short.stageTrackY).toBeLessThan(long.stageTrackY);
    expect(short.photosHeight).toBeGreaterThan(long.photosHeight);
    // And nothing runs into the footer.
    expect(short.photosY + short.photosHeight).toBeLessThanOrEqual(LAYOUT.footer.y);
    expect(long.photosY + long.photosHeight).toBeLessThanOrEqual(LAYOUT.footer.y);
  });
});

describe("covering the dates the card advertises", () => {
  it("does not hide a month between the card's Start and Finish dates", () => {
    // Ancient Hill 56: the schedule ends 15 Aug but the card says Finish 17 Sep.
    // A ruler stopping in August invites the obvious question.
    const rows: GanttRow[] = [
      {
        label: "SOG",
        activities: [
          { name: "Mobilization", start: d("2026-06-16"), finish: d("2026-07-05"), tone: "normal" },
          {
            name: "Slab on Grade",
            start: d("2026-07-29"),
            finish: d("2026-08-15"),
            tone: "normal",
          },
        ],
      },
    ];
    const withoutRange = layoutGantt(rows, PANEL_WIDTH)!;
    expect(withoutRange.columns.map((c) => c.label)).toEqual(["Jun", "Jul", "Aug"]);

    const withRange = layoutGantt(rows, PANEL_WIDTH, undefined, {
      start: d("2026-06-16"),
      finish: d("2026-09-17"),
    })!;
    expect(withRange.columns.map((c) => c.label)).toEqual(["Jun", "Jul", "Aug", "Sep"]);
  });

  it("labels every column — none is left blank", () => {
    const chart = layoutGantt(CY_11_ROWS, PANEL_WIDTH)!;
    for (const column of chart.columns) {
      expect(column.label).toMatch(/^[A-Z][a-z]{2}$/);
      expect(column.width).toBeGreaterThan(0);
    }
  });
});

describe("the trailing month", () => {
  it("is added when the last bar ends near a month's end, so its label has room", () => {
    // Cyan 11 finishes 24 September; its own newsletter's ruler runs to October.
    const chart = layoutGantt(CY_11_ROWS, PANEL_WIDTH)!;
    expect(chart.columns[chart.columns.length - 1].label).toBe("Oct");
  });

  it("is left off when the last bar ends early, so the chart is not padded with a blank column", () => {
    // Ancient Hill 56's SOG schedule ends 15 August — mid-month, so there is
    // already room for the label and a whole extra column would just squeeze
    // the bars into the left of the chart.
    const chart = layoutGantt(
      [
        {
          label: "SOG",
          activities: [
            {
              name: "Mobilization",
              start: d("2026-06-16"),
              finish: d("2026-07-05"),
              tone: "normal",
            },
            {
              name: "Slab on Grade",
              start: d("2026-07-29"),
              finish: d("2026-08-15"),
              tone: "normal",
            },
          ],
        },
      ],
      PANEL_WIDTH,
    )!;
    expect(chart.columns.map((c) => c.label)).toEqual(["Jun", "Jul", "Aug"]);
  });
});

describe("no schedule", () => {
  it("returns nothing to draw, which selects the photo layout", () => {
    expect(layoutGantt([], PANEL_WIDTH)).toBeNull();
    expect(layoutGantt([{ label: "SOG", activities: [] }], PANEL_WIDTH)).toBeNull();
  });
});

/**
 * The crowding rules.
 *
 * A long schedule used to draw its bars and labels through each other: the bar
 * height was floored at 6px and the label scale at 0.7 regardless of how much
 * room each bar actually had, so past about thirty bars both were larger than
 * the slot they sat in. The slot is now the single constraint both are cut
 * from, and these pin that.
 */
describe("a schedule too long for the panel", () => {
  const manyBars = (n: number): GanttRow[] => [
    {
      label: "Unit Extension",
      activities: Array.from({ length: n }, (_, i) => ({
        name: `Activity ${i + 1}`,
        start: d("2026-03-01"),
        finish: d("2026-03-20"),
        tone: "normal" as const,
      })),
    },
  ];

  // Deliberately absurd counts as well as realistic ones: the guarantee is that
  // there is no bar count at which the chart starts drawing over itself.
  const COUNTS = [1, 2, 5, 10, 12, 15, 20, 25, 30, 40, 60, 100];

  it("never lets one bar reach into the next", () => {
    for (const n of COUNTS) {
      const activities = layoutGantt(manyBars(n), PANEL_WIDTH)!.rows[0].activities;
      for (let i = 1; i < activities.length; i++) {
        const previousBottom = activities[i - 1].barY + activities[i - 1].barHeight;
        expect(activities[i].barY).toBeGreaterThanOrEqual(previousBottom);
      }
    }
  });

  it("never lets one label reach into the next", () => {
    for (const n of COUNTS) {
      const activities = layoutGantt(manyBars(n), PANEL_WIDTH)!.rows[0].activities;
      for (let i = 1; i < activities.length; i++) {
        const previousBottom = activities[i - 1].textY + activities[i - 1].textHeight;
        expect(activities[i].textY).toBeGreaterThanOrEqual(previousBottom - 0.001);
      }
    }
  });

  it("keeps a label inside the slot it was fitted to, at any size the owner picks", () => {
    // The fitting has to use the sizes the chart is DRAWN at. Against the
    // defaults, a Design screen set to 16pt would overflow again.
    for (const size of [8, 9, 10, 14, 16, 22]) {
      for (const n of COUNTS) {
        const chart = layoutGantt(manyBars(n), PANEL_WIDTH, undefined, undefined, {
          label: size,
          name: size,
        })!;
        const slot = chart.rows[0].activities[0].textHeight;
        const lineHeight = size * chart.textScale * GANTT_LINE_HEIGHT;
        expect(lineHeight).toBeLessThanOrEqual(slot + 0.001);
      }
    }
  });

  it("stops the labels wrapping once two lines no longer fit", () => {
    // A wrapped label is twice its own line height; below that it lands on the
    // bar above, which is the crowding this module exists to prevent.
    expect(layoutGantt(manyBars(3), PANEL_WIDTH)!.rows[0].activities[0].labelNoWrap).toBe(true);
    expect(layoutGantt(manyBars(40), PANEL_WIDTH)!.rows[0].activities[0].labelNoWrap).toBe(true);
  });

  it("says when a schedule has outgrown a comfortable layout", () => {
    expect(layoutGantt(manyBars(3), PANEL_WIDTH)!.crowded).toBe(false);
    expect(layoutGantt(manyBars(100), PANEL_WIDTH)!.crowded).toBe(true);
  });
});

/**
 * The labels sit ON their bars.
 *
 * Both renderers used to nudge the text up from the bar's top by a fixed amount
 * — `-3` in the preview, `-4` in the exporter — which was tuned for a
 * full-height bar. The text rode high even at the default size, drifted further
 * as the bars thinned, and the two disagreed with each other by a pixel.
 */
describe("labels against their bars", () => {
  it("centres the label box on the bar, at every bar height", () => {
    for (const n of [1, 3, 12, 20, 40]) {
      const chart = layoutGantt(
        [
          {
            label: "Unit Extension",
            activities: Array.from({ length: n }, (_, i) => ({
              name: `Activity ${i + 1}`,
              start: d("2026-03-01"),
              finish: d("2026-04-20"),
              tone: "normal" as const,
            })),
          },
        ],
        PANEL_WIDTH,
      )!;
      for (const activity of chart.rows[0].activities) {
        expect(activity.textY + activity.textHeight / 2).toBeCloseTo(activity.barCentreY, 6);
        expect(activity.barCentreY).toBeCloseTo(activity.barY + activity.barHeight / 2, 6);
      }
    }
  });

  it("never draws the date label underneath the bar it labels", () => {
    // A bar starting on day one of the first month has no room before it. The
    // label box used to be given a 34px minimum, which put the date on top of
    // the bar rather than beside it.
    const chart = layoutGantt(
      [
        {
          label: "SOG",
          activities: [
            {
              name: "Mobilization",
              start: d("2026-02-01"),
              finish: d("2026-02-20"),
              tone: "normal",
            },
          ],
        },
      ],
      PANEL_WIDTH,
    )!;
    const activity = chart.rows[0].activities[0];
    expect(activity.labelWidth).toBeGreaterThan(0);
    // Beside the bar on one side or the other, never across it.
    const clearBefore = activity.labelX + activity.labelWidth <= activity.barX;
    const clearAfter = activity.labelX >= activity.barX + activity.barWidth;
    expect(clearBefore || clearAfter).toBe(true);
  });

  it("moves the date to the right of a bar that starts too early to leave room", () => {
    // Phase 4 Villa 2B's first bar: the scope band is immediately to its left,
    // so a right-aligned date was drawn over the band.
    const early = layoutGantt(
      [
        {
          label: "SOG",
          activities: [
            {
              name: "Mobilization",
              start: d("2026-02-01"),
              finish: d("2026-03-20"),
              tone: "normal",
            },
          ],
        },
      ],
      PANEL_WIDTH,
    )!.rows[0].activities[0];
    expect(early.labelAfterBar).toBe(true);
    expect(early.labelX).toBeGreaterThanOrEqual(early.barX + early.barWidth);
    // And the name is pushed clear of the date rather than printed on top of it.
    expect(early.nameX).toBeGreaterThanOrEqual(early.labelX + early.labelWidth);

    // A bar starting later keeps its date in the usual place, before the bar.
    const late = layoutGantt(CY_11_ROWS, PANEL_WIDTH)!.rows[0].activities[1];
    expect(late.labelAfterBar).toBe(false);
    expect(late.labelX + late.labelWidth).toBeLessThanOrEqual(late.barX);
  });
});
