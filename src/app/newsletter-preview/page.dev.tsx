/**
 * Development-only design preview.
 *
 * Renders the three supplied sample newsletters from fixture data so the layout
 * can be compared against `Sample/CY-11 Newsletter.jpg` and the two `.pptx`
 * templates without a database or a sign-in. It sits OUTSIDE the `(app)` route
 * group deliberately, so it does not go through the auth gate — which is safe
 * only because it renders hard-coded fixtures and touches no real data.
 *
 * `notFound()` in production keeps it off the deployed tool entirely.
 */

import { notFound } from "next/navigation";
import { NewsletterExport } from "@/features/newsletters/components/newsletter-export";
import { SAMPLE_VIEWS } from "@/features/newsletters/sample-views";

export const metadata = { title: "Newsletter design preview" };

export default function NewsletterPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main style={{ padding: 24, background: "#f4f4f5", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
        Newsletter design preview
      </h1>
      <p style={{ fontSize: 13, color: "#52525b", marginBottom: 20 }}>
        Fixture data only. Compare against the files in <code>Sample/</code>.
      </p>

      {SAMPLE_VIEWS.map(({ label, view }) => (
        <section key={label} style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: "#3f3f46" }}>
            {label}
          </h2>
          <NewsletterExport view={view} />
        </section>
      ))}
    </main>
  );
}
