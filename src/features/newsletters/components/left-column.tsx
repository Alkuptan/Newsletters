/**
 * The left column of the newsletter — identical in both layouts.
 *
 * Unit name and client, the PM / references / summary block, the quotation
 * amount, the start and finish calendar cards, the Status pill, the duration,
 * the Area of Concern box, the Actual Progress dial and the Elapsed Time ring.
 *
 * Every size, colour and visibility comes from the resolved theme rather than
 * from constants, and every position comes from the stacked column — so the owner
 * can adjust the design without a box landing on top of its neighbour
 * (docs/SPEC.md, "Template editor").
 */

import { formatCardDay, formatCardMonthYear } from "@/lib/newsletter/dates";
import { PALETTE } from "@/lib/newsletter/layout";
import type { LeftColumnLayout, NewsletterTheme } from "@/lib/newsletter/theme";
import type { NewsletterView } from "@/lib/newsletter/view-model";

/** Egyptian pounds, grouped, no decimals — "1,940,880 LE". */
function formatMoney(amount: number): string {
  return `${amount.toLocaleString("en-US")} LE`;
}

function Panel({
  x,
  y,
  width,
  height,
  background,
  radius = 8,
  border,
  children,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  background: string;
  radius?: number;
  border?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        height,
        background,
        borderRadius: radius,
        border,
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
}

/** One of the two peach calendar cards. */
function CalendarCard({
  x,
  date,
  label,
  theme,
  column,
}: {
  x: number;
  date: Date | null;
  label: string;
  theme: NewsletterTheme;
  column: LeftColumnLayout;
}) {
  const { cardRow } = column;
  return (
    <div style={{ position: "absolute", left: x, top: cardRow.y, width: cardRow.cardWidth }}>
      {/* The day and month sit INSIDE the calendar outline, below its header
          band — the same arrangement as the supplied templates. */}
      <div
        style={{
          height: 52,
          background: theme.colours.orangePale,
          borderRadius: 8,
          position: "relative",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- see stage-track.tsx */}
        <img
          src="/newsletter/icon-calendar.png"
          alt=""
          width={46}
          height={46}
          style={{ position: "absolute", top: 3, left: "50%", marginLeft: -23 }}
        />
        <div
          style={{
            position: "absolute",
            top: 19,
            left: 0,
            width: "100%",
            textAlign: "center",
            fontSize: theme.text.cardDay,
            fontWeight: 700,
            color: PALETTE.text,
            lineHeight: 1,
          }}
        >
          {date ? formatCardDay(date) : "—"}
        </div>
        <div
          style={{
            position: "absolute",
            top: 34,
            left: 0,
            width: "100%",
            textAlign: "center",
            fontSize: theme.text.cardMonth,
            color: PALETTE.text,
          }}
        >
          {date ? formatCardMonthYear(date) : ""}
        </div>
      </div>
      <div
        style={{
          marginTop: 4,
          textAlign: "center",
          fontSize: theme.text.cardLabel,
          fontWeight: 600,
          color: PALETTE.text,
        }}
      >
        {label}
      </div>
    </div>
  );
}

/** The Actual Progress dial: clock artwork with the percentage over it. */
function ProgressDial({
  percent,
  theme,
  column,
}: {
  percent: number;
  theme: NewsletterTheme;
  column: LeftColumnLayout;
}) {
  const { colA, metricsRow } = column;
  return (
    <Panel
      x={colA.x}
      y={metricsRow.y}
      width={colA.width}
      height={metricsRow.height}
      background={PALETTE.white}
      border={`1px solid ${PALETTE.ringTrack}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- see stage-track.tsx */}
      <img
        src="/newsletter/icon-progress-clock.svg"
        alt=""
        width={78}
        height={86}
        style={{ position: "absolute", left: 14, top: 12 }}
      />
      {/* Overlaps the clock's lower right, as in the templates. */}
      <div
        style={{
          position: "absolute",
          right: 12,
          bottom: 32,
          fontSize: theme.text.progressValue,
          fontWeight: 700,
          color: theme.colours.orange,
          lineHeight: 1,
        }}
      >
        {percent}%
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 10,
          textAlign: "center",
          fontSize: theme.text.metricLabel,
          fontWeight: 700,
          color: PALETTE.text,
        }}
      >
        Actual Progress
      </div>
    </Panel>
  );
}

/**
 * The Elapsed Time ring: days elapsed in the middle, the ring filled to the
 * share of the duration that has gone.
 */
function ElapsedRing({
  days,
  percent,
  overrunDays,
  durationDays,
  theme,
  column,
}: {
  days: number;
  percent: number;
  overrunDays: number;
  durationDays: number | null;
  theme: NewsletterTheme;
  column: LeftColumnLayout;
}) {
  const { colB, metricsRow } = column;
  // Bigger and thinner than the original: easier to read across a room, and the
  // thin band keeps the number the thing your eye lands on.
  const size = 104;
  const thickness = 7;

  /**
   * Past the finish date the ring RESTARTS from zero in red, filling again as
   * each overdue day passes. A ring that simply sat full said "finished" when it
   * meant "late", which is the opposite of the truth.
   */
  const overdue = overrunDays > 0;
  const sweep = overdue
    ? durationDays && durationDays > 0
      ? Math.min(100, (overrunDays / durationDays) * 100)
      : 100
    : percent;
  const arcColour = overdue ? theme.colours.elapsedOverrun : theme.colours.elapsedRing;

  return (
    <Panel
      x={colB.x}
      y={metricsRow.y}
      width={colB.width}
      height={metricsRow.height}
      background={PALETTE.white}
      border={`1px solid ${PALETTE.ringTrack}`}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          marginLeft: -size / 2,
          top: 12,
          width: size,
          height: size,
          borderRadius: "50%",
          // A conic gradient is the cheapest ring that rasterises identically
          // in the on-screen preview and in the exported bitmap.
          background: `conic-gradient(${arcColour} ${sweep}%, ${PALETTE.ringTrack} 0)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: size - thickness * 2,
            height: size - thickness * 2,
            borderRadius: "50%",
            background: PALETTE.white,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: theme.text.elapsedValue,
            fontWeight: 700,
            color: overdue ? theme.colours.elapsedOverrun : theme.colours.orange,
          }}
        >
          {/* The samples show a two-digit count, so a unit that has not started
              reads "00" rather than a bare "0". Overdue shows the days over. */}
          {overdue ? `+${overrunDays}` : String(days).padStart(2, "0")}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 8,
          textAlign: "center",
          fontSize: theme.text.metricLabel,
          fontWeight: 700,
          color: overdue ? theme.colours.elapsedOverrun : PALETTE.text,
        }}
      >
        {overdue ? "Days Overdue" : "Elapsed Time"}
      </div>
    </Panel>
  );
}

export function LeftColumn({
  view,
  theme,
  column,
}: {
  view: NewsletterView;
  theme: NewsletterTheme;
  column: LeftColumnLayout;
}) {
  const { colA, colB, cardRow, statusRow, concern } = column;
  const secondCardX = colA.x + 8 + cardRow.cardWidth + cardRow.chevronWidth + 8;
  const { fields } = theme;

  return (
    <>
      {/* Unit name and client. */}
      <Panel
        x={column.x}
        y={column.unitHeader.y}
        width={column.width}
        height={column.unitHeader.height}
        background={theme.colours.greyHeader}
      >
        <div style={{ padding: "12px 20px" }}>
          <div
            style={{
              fontSize: theme.text.unitName,
              fontWeight: 700,
              color: PALETTE.white,
              lineHeight: 1.15,
            }}
          >
            {view.displayName}
          </div>
          {fields.clientName && (
            <div style={{ fontSize: theme.text.clientName, color: PALETTE.white, marginTop: 3 }}>
              {view.clientName ?? ""}
            </div>
          )}
        </div>
      </Panel>

      {/* Project manager, quotation references, project summary. */}
      <Panel
        x={column.x}
        y={column.infoBox.y}
        width={column.width}
        height={column.infoBox.height}
        background={theme.colours.greyBox}
      >
        <div
          style={{
            padding: "12px 18px",
            fontSize: theme.text.infoLine,
            color: PALETTE.text,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {fields.projectManager && (
            <div>
              <strong>Project Manager:</strong> {view.projectManager ?? "—"}
            </div>
          )}
          {fields.quotationReferences && (
            <div>
              <strong>Quotation References:</strong> {view.quoteReferences}
              {view.quoteReferences ? "." : ""}
            </div>
          )}
          {fields.projectSummary && (
            <div>
              <strong>Project Summary:</strong> {view.projectSummary}
              {view.projectSummary ? "." : ""}
            </div>
          )}
        </div>
      </Panel>

      {/* Quotation amount. */}
      <Panel
        x={column.x}
        y={column.amountBox.y}
        width={column.width}
        height={column.amountBox.height}
        background={PALETTE.greyPanel}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- see stage-track.tsx */}
        <img
          src="/newsletter/icon-coins.png"
          alt=""
          width={34}
          height={34}
          style={{ position: "absolute", left: 14, top: 8 }}
        />
        <div
          style={{
            position: "absolute",
            left: 60,
            top: 0,
            height: "100%",
            display: "flex",
            alignItems: "center",
            fontSize: theme.text.amount,
            fontWeight: 700,
            color: PALETTE.text,
          }}
        >
          Quotation Amount: {formatMoney(view.quotationAmount)}
        </div>
      </Panel>

      {/* Start → Finish calendar cards. */}
      <CalendarCard
        x={colA.x + 8}
        date={view.startDate}
        label="Start Date"
        theme={theme}
        column={column}
      />
      <div
        style={{
          position: "absolute",
          left: colA.x + 8 + cardRow.cardWidth + 2,
          top: cardRow.y + 16,
          width: cardRow.chevronWidth,
          textAlign: "center",
          // Tied to the day number so the arrow keeps pace if the cards are resized.
          fontSize: theme.text.cardDay + 1,
          color: PALETTE.text,
        }}
      >
        ❯
      </div>
      <CalendarCard
        x={secondCardX}
        date={view.finishDate}
        label="Finish Date"
        theme={theme}
        column={column}
      />

      {/* Status pill. */}
      <Panel
        x={colA.x + 8}
        y={statusRow.y}
        width={cardRow.cardWidth}
        height={statusRow.height}
        background={theme.colours.orangePale}
      >
        <div
          style={{
            textAlign: "center",
            fontSize: theme.text.statusHeading,
            fontWeight: 700,
            color: PALETTE.text,
            paddingTop: 10,
          }}
        >
          Status
        </div>
        <div
          style={{
            margin: "8px 6px 0",
            background: PALETTE.white,
            border: `1.5px solid ${theme.colours.orange}`,
            borderRadius: 14,
            textAlign: "center",
            padding: "5px 0",
            fontSize: theme.text.statusPill,
            fontWeight: 700,
            color: PALETTE.text,
            whiteSpace: "nowrap",
          }}
        >
          {view.verdict ?? "—"}
        </div>
      </Panel>

      {/* Duration. */}
      <Panel
        x={secondCardX}
        y={statusRow.y}
        width={cardRow.cardWidth}
        height={statusRow.height}
        background={theme.colours.orangePale}
      >
        <div
          style={{
            textAlign: "center",
            fontSize: theme.text.durationHeading,
            fontWeight: 700,
            color: PALETTE.text,
            paddingTop: 8,
          }}
        >
          Duration
        </div>
        <div
          style={{
            textAlign: "center",
            fontSize: theme.text.durationValue,
            fontWeight: 700,
            color: PALETTE.text,
            lineHeight: 1.1,
          }}
        >
          {view.durationDays ?? "—"}
        </div>
        <div
          style={{ textAlign: "center", fontSize: theme.text.durationUnit, color: PALETTE.text }}
        >
          Calendar Days
        </div>
      </Panel>

      {/* Area of Concern. */}
      {fields.areaOfConcern && (
        <Panel
          x={colB.x}
          y={concern.y}
          width={colB.width}
          height={concern.height}
          background={PALETTE.white}
          border={`1px solid ${PALETTE.ringTrack}`}
        >
          <div
            style={{
              textAlign: "center",
              fontSize: theme.text.concernHeading,
              fontWeight: 700,
              color: PALETTE.text,
              padding: "10px 0 6px",
            }}
          >
            Area of Concern
          </div>
          <ul
            style={{
              margin: 0,
              padding: "0 10px 0 20px",
              fontSize: theme.text.concernBullet,
              lineHeight: 1.35,
              color: PALETTE.text,
              listStyleType: "'-  '",
            }}
          >
            {view.concerns.map((concernText) => (
              <li key={concernText} style={{ marginBottom: 5 }}>
                {concernText}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <ProgressDial percent={view.progressPercent} theme={theme} column={column} />
      <ElapsedRing
        days={view.elapsedDays}
        percent={view.elapsedPercent}
        overrunDays={view.overrunDays}
        durationDays={view.durationDays}
        theme={theme}
        column={column}
      />
    </>
  );
}
