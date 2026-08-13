import "server-only";

/**
 * Reads for the covering email: its wording, and who is copied.
 *
 * RLS lets anyone signed in read both — composing a message on a unit page needs
 * them — while only an admin may change them (migration 0015).
 */

import { createClient } from "@/lib/supabase/server";
import { DEFAULT_IMAGE_WIDTH_PX } from "@/lib/newsletter/eml";

export interface MailSettings {
  subjectTemplate: string;
  bodyTemplate: string;
  alwaysCc: string[];
  /** Caps the newsletter picture's width in the email body, in pixels. */
  imageWidthPx: number;
  /**
   * Appended to the prepared message.
   *
   * Outlook signs a message it composes, not one it opens from a file, so a
   * prepared draft arrives unsigned unless the signature travels with it.
   */
  signature: string;
}

export interface PmRoutingRule {
  id: string;
  pmName: string;
  ccEmails: string[];
}

/**
 * The wording and the standing CC list.
 *
 * Migration 0015 inserts the single row, so the fallback below is belt and braces
 * rather than a real path — but a missing row must not stop a unit page rendering.
 */
export async function getMailSettings(): Promise<MailSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mail_settings")
    .select("subject_template, body_template, always_cc, image_width_px, signature_html")
    .maybeSingle();
  if (error) throw error;

  return {
    subjectTemplate: data?.subject_template ?? "{unit} Newsletter",
    bodyTemplate:
      data?.body_template ??
      "Dear {client},\n\nKindly find attached the latest newsletter as of {date}.",
    alwaysCc: data?.always_cc ?? [],
    imageWidthPx: data?.image_width_px ?? DEFAULT_IMAGE_WIDTH_PX,
    signature: data?.signature_html ?? "",
  };
}

/** Every per-PM CC rule, ordered so the editor's list does not jump about. */
export async function listPmRouting(): Promise<PmRoutingRule[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pm_mail_routing")
    .select("id, pm_name, cc_emails")
    .order("pm_name");
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    pmName: row.pm_name,
    ccEmails: row.cc_emails ?? [],
  }));
}

/**
 * Which PM names the sheet actually uses, so rules can be offered rather than typed.
 *
 * Comes from the units themselves: a rule for a name that appears nowhere routes
 * nothing, and a PM with units and no rule is the case worth pointing out.
 */
export async function pmNamesInUse(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("units")
    .select("assigned_pm")
    .not("assigned_pm", "is", null);
  if (error) throw error;

  const seen = new Map<string, string>();
  for (const row of data ?? []) {
    const name = row.assigned_pm?.trim();
    if (!name) continue;
    // First spelling wins, so the list is stable rather than whichever row landed last.
    const key = name.toLocaleLowerCase();
    if (!seen.has(key)) seen.set(key, name);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
