/**
 * The site photos.
 *
 * Two along the bottom in the Gantt layout; the whole right-hand side in the
 * no-schedule layout, where the grid adapts to how many photos the owner ticked
 * so there is never an empty box.
 */

import { PALETTE, photoGridShape } from "@/lib/newsletter/layout";
import type { NewsletterTheme } from "@/lib/newsletter/theme";
import type { NewsletterPhoto } from "@/lib/newsletter/view-model";

export function PhotoGrid({
  photos,
  x,
  y,
  width,
  height,
  gap,
  /** Fixed 2-across for the Gantt layout; adaptive for the photo layout. */
  columns,
  /** The dashed column divider — the photo layout has one, the Gantt layout not. */
  showDivider = false,
  theme,
}: {
  photos: readonly NewsletterPhoto[];
  x: number;
  y: number;
  width: number;
  height: number;
  gap: number;
  columns?: number;
  showDivider?: boolean;
  theme: NewsletterTheme;
}) {
  const shape = photoGridShape(photos.length);
  const cols = columns ?? shape.columns;
  const rows = Math.max(1, Math.ceil(photos.length / cols));

  if (photos.length === 0) {
    return (
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          width,
          height,
          border: `1px dashed ${PALETTE.ringTrack}`,
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: theme.text.metricLabel,
          color: theme.colours.greyDark,
        }}
      >
        No photos chosen yet
      </div>
    );
  }

  const cellWidth = (width - gap * (cols - 1)) / cols;
  const cellHeight = (height - gap * (rows - 1)) / rows;

  return (
    <div style={{ position: "absolute", left: x, top: y, width, height }}>
      {/* The dashed divider between the two photo columns, as in the supplied
          Photos Template. Only when there genuinely are two columns. */}
      {showDivider && cols === 2 && (
        <div
          style={{
            position: "absolute",
            left: cellWidth + gap / 2 - 0.5,
            top: 0,
            height,
            borderLeft: `1px dashed ${theme.colours.greyDark}`,
          }}
        />
      )}
      {photos.map((photo, index) => {
        const column = index % cols;
        const row = Math.floor(index / cols);
        return (
          // eslint-disable-next-line @next/next/no-img-element -- see stage-track.tsx
          <img
            key={`${photo.url}-${index}`}
            src={photo.url}
            alt={photo.description}
            style={{
              position: "absolute",
              left: column * (cellWidth + gap),
              top: row * (cellHeight + gap),
              width: cellWidth,
              height: cellHeight,
              // Fill the slot and crop rather than letterbox — a site photo
              // with grey bars around it looks like a mistake to a client.
              objectFit: "cover",
              borderRadius: 4,
              display: "block",
            }}
          />
        );
      })}
    </div>
  );
}
