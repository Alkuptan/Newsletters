/**
 * JPG and PDF export.
 *
 * Both are produced by rasterising the rendered newsletter in the BROWSER, so
 * what the owner approved on screen is exactly what leaves the tool — and so no
 * headless browser is needed on the server, which the Cloudflare Worker free
 * tier could not run anyway.
 *
 * BROWSER ONLY. Import with a dynamic `import()` from a client component.
 */

import { SLIDE_HEIGHT_PX, SLIDE_WIDTH_PX, pxToInches } from "./layout";
import { formatFooterDate } from "./dates";
import type { NewsletterTheme } from "./theme";
import type { NewsletterView } from "./view-model";

/**
 * How much bigger than the 1280 × 720 stage the exported bitmap is.
 *
 * 2.5× gives 3200 × 1800 — enough to print an A4 landscape page at roughly
 * 240 dpi, and enough that the small Gantt labels stay readable when someone
 * zooms in. Higher costs memory on a laptop for no visible gain.
 */
const EXPORT_SCALE = 2.5;

/** A filename safe on Windows, without an extension. */
function baseFileName(view: NewsletterView): string {
  const safe = view.displayName.replace(/[\\/:*?"<>|]/g, "-");
  return `${safe} - ${formatFooterDate(view.footerDate)}`;
}

function triggerDownload(href: string, fileName: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Rasterise the newsletter to a JPEG data URL.
 *
 * `width`/`height` are pinned to the stage rather than read from the element so
 * a preview that happens to be CSS-scaled still exports at full size.
 */
async function toJpegDataUrl(element: HTMLElement): Promise<string> {
  const { domToJpeg } = await import("modern-screenshot");
  return domToJpeg(element, {
    width: SLIDE_WIDTH_PX,
    height: SLIDE_HEIGHT_PX,
    scale: EXPORT_SCALE,
    quality: 0.94,
    // JPEG has no transparency; without this, anything not painted comes out
    // black rather than white.
    backgroundColor: "#FFFFFF",
  });
}

/** Download the newsletter as a JPG. */
export async function exportNewsletterJpg(
  element: HTMLElement,
  view: NewsletterView,
): Promise<void> {
  const dataUrl = await toJpegDataUrl(element);
  triggerDownload(dataUrl, `${baseFileName(view)}.jpg`);
}

/**
 * Download the newsletter as a one-page PDF.
 *
 * The page is exactly the slide's 13.333 × 7.5 inches, so the newsletter fills
 * it edge to edge with no margins to trim and no scaling surprises.
 */
export async function exportNewsletterPdf(
  element: HTMLElement,
  view: NewsletterView,
): Promise<void> {
  const [dataUrl, { jsPDF }] = await Promise.all([toJpegDataUrl(element), import("jspdf")]);

  const widthInches = pxToInches(SLIDE_WIDTH_PX);
  const heightInches = pxToInches(SLIDE_HEIGHT_PX);

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "in",
    format: [widthInches, heightInches],
    compress: true,
  });
  pdf.addImage(dataUrl, "JPEG", 0, 0, widthInches, heightInches);
  pdf.save(`${baseFileName(view)}.pdf`);
}

/**
 * Redraw a JPEG data URL at a smaller width.
 *
 * The export is 3200px wide, which is right for the PDF and far too big for a
 * message body: Outlook draws an image at its natural size regardless of CSS, so
 * a huge picture stays huge. Scaling the actual pixels is the only fix that holds
 * in every mail client, and it makes the email several times smaller.
 *
 * Drawn at twice the display width so it still looks sharp on a high-resolution
 * screen, and never scaled UP.
 */
async function downscaleJpeg(dataUrl: string, displayWidth: number): Promise<string> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();

  const wanted = Math.min(image.naturalWidth, Math.round(displayWidth * 2));
  if (wanted >= image.naturalWidth) return dataUrl;

  const canvas = document.createElement("canvas");
  canvas.width = wanted;
  canvas.height = Math.round((image.naturalHeight * wanted) / image.naturalWidth);
  const context = canvas.getContext("2d");
  if (!context) return dataUrl;

  // Smoothing matters at this ratio: without it the Gantt labels alias badly.
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

/** Base64 in chunks: `String.fromCharCode(...bytes)` overflows the stack on a 5 MB PDF. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let at = 0; at < bytes.length; at += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
  }
  return btoa(binary);
}

/**
 * Download a ready-to-send Outlook message: newsletter in the body, PDF attached.
 *
 * This is the one route that carries the files. A compose link cannot — see
 * `src/lib/newsletter/eml.ts`, which explains the format and the `X-Unsent`
 * header that makes Outlook open it as a draft with a Send button rather than as
 * a read-only received message.
 *
 * The JPEG is rendered once and used twice: shown in the body, and as the single
 * page of the PDF. So the picture in the email and the attachment cannot disagree.
 */
export async function exportNewsletterEml(
  element: HTMLElement,
  view: NewsletterView,
  message: {
    to: readonly string[];
    cc: readonly string[];
    subject: string;
    body: string;
    imageWidthPx?: number;
  },
): Promise<void> {
  const [{ buildEml, emlFileName }, dataUrl, { jsPDF }] = await Promise.all([
    import("./eml"),
    toJpegDataUrl(element),
    import("jspdf"),
  ]);

  // The body gets a scaled copy; the PDF below keeps the full-size render.
  const bodyDataUrl = await downscaleJpeg(dataUrl, message.imageWidthPx ?? 500);
  const jpegBase64 = bodyDataUrl.slice(bodyDataUrl.indexOf(",") + 1);

  const widthInches = pxToInches(SLIDE_WIDTH_PX);
  const heightInches = pxToInches(SLIDE_HEIGHT_PX);
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "in",
    format: [widthInches, heightInches],
    compress: true,
  });
  pdf.addImage(dataUrl, "JPEG", 0, 0, widthInches, heightInches);
  const pdfBase64 = bytesToBase64(new Uint8Array(pdf.output("arraybuffer")));

  // What the owner's own emails call them, so nothing looks unfamiliar to a client.
  const base = `${view.displayName.replace(/[\\/:*?"<>|]/g, "-")} Newsletter`;

  const eml = buildEml({
    to: message.to,
    cc: message.cc,
    subject: message.subject,
    body: message.body,
    inline: {
      filename: `${base}.jpg`,
      mimeType: "image/jpeg",
      base64: jpegBase64,
      contentId: "newsletter",
    },
    attachments: [{ filename: `${base}.pdf`, mimeType: "application/pdf", base64: pdfBase64 }],
    imageWidthPx: message.imageWidthPx,
  });

  const url = URL.createObjectURL(new Blob([eml], { type: "message/rfc822" }));
  triggerDownload(url, emlFileName(base));
  // Revoked on a delay: revoking immediately cancels the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * A cycle PDF, built one page at a time.
 *
 * A builder rather than a function taking every element, because the caller only
 * keeps a handful of newsletters mounted at once — a hundred of them in the DOM
 * together is what makes a laptop crawl. Pages are added as they are rendered
 * and the elements are then free to be unmounted.
 */
export async function createCyclePdf(): Promise<{
  addPage: (element: HTMLElement) => Promise<void>;
  save: (fileName: string) => void;
  pages: () => number;
}> {
  const { jsPDF } = await import("jspdf");
  const widthInches = pxToInches(SLIDE_WIDTH_PX);
  const heightInches = pxToInches(SLIDE_HEIGHT_PX);

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "in",
    format: [widthInches, heightInches],
    compress: true,
  });
  let count = 0;

  return {
    async addPage(element) {
      // The first page already exists; every later one has to be added.
      if (count > 0) pdf.addPage([widthInches, heightInches], "landscape");
      const dataUrl = await toJpegDataUrl(element);
      pdf.addImage(dataUrl, "JPEG", 0, 0, widthInches, heightInches);
      count += 1;
    },
    save(fileName) {
      if (count === 0) throw new Error("Nothing is ready to export.");
      pdf.save(fileName);
    },
    pages: () => count,
  };
}

/**
 * A separate PDF and image for every unit, collected as they are rendered and
 * delivered as one zip.
 *
 * The owner asked for one file per unit, named "Ancient Hill 56 newsletter" —
 * which is exactly what unzips out of this. A browser cannot hand over eighty
 * loose downloads (it blocks them after a few), so the zip is the only way to
 * deliver individually-named files in one action.
 */
export async function createPerUnitZip(): Promise<{
  add: (displayName: string, element: HTMLElement) => Promise<void>;
  finish: (zipFileName: string) => Promise<void>;
  count: () => number;
}> {
  const { jsPDF } = await import("jspdf");
  const widthInches = pxToInches(SLIDE_WIDTH_PX);
  const heightInches = pxToInches(SLIDE_HEIGHT_PX);
  const files: Record<string, Uint8Array> = {};
  let count = 0;

  return {
    async add(displayName, element) {
      const dataUrl = await toJpegDataUrl(element);
      const safe = displayName.replace(/[\/:*?"<>|]/g, "-").trim();
      const base = `${safe} newsletter`;

      // The image, straight from the same capture the PDF uses.
      files[`${base}.jpg`] = dataUrlToBytes(dataUrl);

      // A one-page PDF at exactly the slide's size.
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "in",
        format: [widthInches, heightInches],
        compress: true,
      });
      pdf.addImage(dataUrl, "JPEG", 0, 0, widthInches, heightInches);
      files[`${base}.pdf`] = new Uint8Array(pdf.output("arraybuffer"));
      count += 1;
    },

    async finish(zipFileName) {
      if (count === 0) throw new Error("Nothing is ready to export.");
      const { zip } = await import("fflate");
      const zipped = await new Promise<Uint8Array>((resolve, reject) => {
        // Level 0: the contents are already-compressed JPEG and PDF, so
        // squeezing again costs seconds and saves almost nothing.
        zip(files, { level: 0 }, (error, data) => (error ? reject(error) : resolve(data)));
      });

      const url = URL.createObjectURL(new Blob([zipped as BlobPart], { type: "application/zip" }));
      try {
        triggerDownload(url, zipFileName);
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    },

    count: () => count,
  };
}

/** The bytes behind a `data:` URL. */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** A whole cycle as ONE deck, a slide per newsletter. */
export async function exportCyclePptx(
  items: readonly { view: NewsletterView; theme?: NewsletterTheme }[],
  fileName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const { buildCyclePptx } = await import("./pptx");
  const { DEFAULT_THEME } = await import("./theme");
  const blob = await buildCyclePptx(
    items.map((item) => ({ view: item.view, theme: item.theme ?? DEFAULT_THEME })),
    onProgress,
  );
  const url = URL.createObjectURL(blob);
  try {
    triggerDownload(url, fileName);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/**
 * Download the newsletter as an editable PowerPoint slide.
 *
 * Takes the same resolved design the preview used, so the slide is what the
 * owner just approved on screen rather than the original template.
 */
export async function exportNewsletterPptx(
  view: NewsletterView,
  theme?: NewsletterTheme,
): Promise<void> {
  const { buildNewsletterPptx, pptxFileName } = await import("./pptx");
  const blob = await buildNewsletterPptx(view, theme);
  const url = URL.createObjectURL(blob);
  try {
    triggerDownload(url, pptxFileName(view));
  } finally {
    // Give the click a moment to start before revoking the object URL.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
