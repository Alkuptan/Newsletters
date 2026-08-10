/**
 * The three supplied sample newsletters, as view models.
 *
 * These exist so the design can be checked against `Sample/CY-11 Newsletter.jpg`
 * and the two `.pptx` templates without a database, and so the exporters have
 * something realistic to be tested against. Figures come from the real rows in
 * `Sample/Follow-up sheet (Don't Delete).xlsm`; the Gantt activities and photos
 * are transcribed from the supplied slides.
 *
 * Not shipped to users — the /newsletter-preview route is development-only.
 */

import {
  buildNewsletterView,
  type GanttActivity,
  type NewsletterView,
} from "@/lib/newsletter/view-model";
import type { QuotationFigures } from "@/lib/newsletter/types";

const d = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

function activity(
  name: string,
  start: string,
  finish: string,
  tone: GanttActivity["tone"] = "normal",
): GanttActivity {
  return { name, start: d(start), finish: d(finish), tone };
}

const CY_11_QUOTE: QuotationFigures = {
  quoteNumber: "20411",
  invoiceValue: 1_940_879.63,
  scopeOfWork: "Unit Extension",
  progress: 0.85,
  plannedStartDate: d("2026-04-29"),
  maxContractualDate: d("2026-09-26"),
  projectStatus: "In Progress",
  assignedPm: "Mariam Sobhy",
  notes: null,
};

const PH4_QUOTE: QuotationFigures = {
  quoteNumber: "20408",
  invoiceValue: 9_391_861.96,
  scopeOfWork: "Unit Extensions",
  progress: 0.9,
  plannedStartDate: d("2026-03-18"),
  maxContractualDate: d("2026-09-14"),
  projectStatus: "In Progress ",
  assignedPm: "Heba Kamal",
  notes: null,
};

const AH_56_QUOTES: QuotationFigures[] = [
  {
    quoteNumber: "20415",
    invoiceValue: 1_270_456.64,
    scopeOfWork: "SOG",
    progress: 0.03,
    plannedStartDate: d("2026-06-16"),
    maxContractualDate: d("2026-08-15"),
    projectStatus: "Hold",
    assignedPm: "Omar Sherif",
    notes:
      "Unit Handover to client 30 March 2026, Mobilization 30 Days, Planned Start Date 30 April 2026",
  },
  {
    quoteNumber: "20423",
    invoiceValue: 154_030.98,
    scopeOfWork: "Landscape",
    progress: 0,
    plannedStartDate: d("2026-07-29"),
    maxContractualDate: d("2026-09-17"),
    projectStatus: "Hold",
    assignedPm: "Omar Sherif",
    notes:
      "Landscape Works To start later after 60 days as a sequence of works with Swimming Pool Works",
  },
];

/** Cyan 11 — the Gantt layout with two photos. */
export const CY_11_VIEW: NewsletterView = buildNewsletterView({
  unit: { displayName: "Cyan 11", clientName: "Mr. Samir Abdel Rahman Farouk" },
  quotations: [CY_11_QUOTE],
  ganttRows: [
    {
      label: "Unit Extension",
      activities: [
        activity("Mobilization", "2026-03-30", "2026-04-28"),
        activity("Scaffolding/Dismantling and Demolishing Works", "2026-04-29", "2026-05-26"),
        activity("Excavation and Foundation", "2026-05-27", "2026-06-23"),
        activity("Concrete Works", "2026-06-24", "2026-07-21"),
        activity("Block Works", "2026-07-22", "2026-08-20"),
        activity("External Paint and Plaster Works", "2026-08-21", "2026-09-17"),
        activity("Handing Over", "2026-09-18", "2026-09-24"),
      ],
    },
  ],
  photos: [
    { url: "/dev-samples/cy11-a.jpg", description: "Unit extension under construction" },
    { url: "/dev-samples/cy11-b.jpg", description: "Scaffolding on the villa's south elevation" },
  ],
  footerLabel: "Bi-Weekly Newsletter",
  footerDate: d("2026-07-08"),
});

/** Phase 4 Villa 2B — the Gantt layout with an orange attention bar. */
export const PH4_VIEW: NewsletterView = buildNewsletterView({
  unit: { displayName: "Phase 4 Villa 2B", clientName: "Mr. Youssef Nabil Hakim" },
  quotations: [PH4_QUOTE],
  ganttRows: [
    {
      label: "Unit Extension",
      activities: [
        activity("Mobilization", "2026-02-16", "2026-03-17"),
        activity("Pending Neighbour consent", "2026-03-18", "2026-04-01", "attention"),
        activity(
          "Earth Works ( Excavation, Backfilling, Soil replacement, ETC )",
          "2026-04-02",
          "2026-04-30",
        ),
        activity("Scaffolding/Dismantling and Demolishing Works", "2026-05-01", "2026-05-28"),
        activity("Concrete Works", "2026-05-29", "2026-07-09"),
        activity("Block Works", "2026-07-10", "2026-08-08"),
        activity("External Paint and Plaster Works", "2026-08-09", "2026-09-19"),
        activity("Handing Over", "2026-09-20", "2026-09-26"),
      ],
    },
  ],
  photos: [
    { url: "/dev-samples/ah56-1.jpg", description: "Villa front elevation" },
    { url: "/dev-samples/ah56-2.jpg", description: "Internal demolition works" },
  ],
  footerLabel: "Bi-Weekly Newsletter",
  footerDate: d("2026-08-03"),
});

/** Ancient Hill 56 — no time schedule, so the photo layout, and two quotations. */
export const AH_56_VIEW: NewsletterView = buildNewsletterView({
  unit: { displayName: "Ancient Hill 56", clientName: "Mr. Adel Fahmy Girgis" },
  quotations: AH_56_QUOTES,
  ganttRows: [],
  photos: [
    { url: "/dev-samples/ah56-1.jpg", description: "Site overview looking north" },
    { url: "/dev-samples/ah56-2.jpg", description: "Levelling along the boundary wall" },
    { url: "/dev-samples/ah56-3.jpg", description: "Excavation for the slab on grade" },
    { url: "/dev-samples/ah56-4.jpg", description: "Blockwork to the outdoor room" },
    { url: "/dev-samples/cy11-a.jpg", description: "Rear garden before landscaping" },
    { url: "/dev-samples/cy11-b.jpg", description: "Scaffolding to the side elevation" },
  ],
  footerLabel: "Bi-Weekly Newsletter",
  footerDate: d("2026-06-14"),
});

/**
 * The same unit read months after its finish date.
 *
 * Nothing supplied looked like this, but overrunning is the case the owner most
 * needs to see on a page: the elapsed ring restarts from zero in red and counts
 * days OVER, rather than sitting full and saying nothing.
 */
export const OVERDUE_VIEW: NewsletterView = buildNewsletterView({
  unit: { displayName: "Ancient Hill 56", clientName: "Mr. Adel Fahmy Girgis" },
  quotations: AH_56_QUOTES,
  ganttRows: [],
  photos: [
    { url: "/dev-samples/ah56-1.jpg", description: "Site overview looking north" },
    { url: "/dev-samples/ah56-2.jpg", description: "Levelling along the boundary wall" },
  ],
  footerLabel: "Bi-Weekly Newsletter",
  footerDate: d("2026-12-01"),
});

/**
 * A schedule far longer than the panel can comfortably hold.
 *
 * The owner's instruction: past the timeline's ceiling the BARS and their labels
 * shrink, and the photos keep their size. This is the case that proves it.
 */
export const CROWDED_VIEW: NewsletterView = buildNewsletterView({
  unit: { displayName: "Cyan 11", clientName: "Mr. Samir Abdel Rahman Farouk" },
  quotations: [CY_11_QUOTE],
  ganttRows: [
    {
      label: "Unit Extension",
      activities: [
        activity("Mobilization", "2026-03-30", "2026-04-18"),
        activity("Site Clearance", "2026-04-19", "2026-05-02"),
        activity("Scaffolding", "2026-05-03", "2026-05-16"),
        activity("Demolition", "2026-05-17", "2026-05-30"),
        activity("Excavation", "2026-05-31", "2026-06-13"),
        activity("Foundation", "2026-06-14", "2026-06-27"),
        activity("Concrete Works", "2026-06-28", "2026-07-11"),
        activity("Block Works", "2026-07-12", "2026-07-25"),
        activity("Plaster", "2026-07-26", "2026-08-08"),
        activity("Pending Client Approval", "2026-08-09", "2026-08-22", "attention"),
        activity("External Paint", "2026-08-23", "2026-09-05"),
        activity("Joinery", "2026-09-06", "2026-09-12"),
        activity("Snagging", "2026-09-13", "2026-09-19"),
        activity("Handing Over", "2026-09-20", "2026-09-26"),
      ],
    },
  ],
  photos: [
    { url: "/dev-samples/cy11-a.jpg", description: "Unit extension under construction" },
    { url: "/dev-samples/cy11-b.jpg", description: "Scaffolding on the south elevation" },
  ],
  footerLabel: "Bi-Weekly Newsletter",
  footerDate: d("2026-07-08"),
});

export const SAMPLE_VIEWS: { label: string; view: NewsletterView }[] = [
  { label: "Cyan 11 — Gantt layout, 2 photos", view: CY_11_VIEW },
  { label: "Phase 4 Villa 2B — Gantt with an attention bar", view: PH4_VIEW },
  { label: "Ancient Hill 56 — no schedule, 6 photos, 2 quotations", view: AH_56_VIEW },
  { label: "Overrunning — the elapsed ring counts days over, in red", view: OVERDUE_VIEW },
  { label: "A crowded schedule — bars and labels shrink, photos do not", view: CROWDED_VIEW },
];
