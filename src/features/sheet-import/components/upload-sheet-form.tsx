"use client";

/**
 * The upload screen.
 *
 * The workbook is read HERE, in the browser: a 1.5 MB `.xlsm` never crosses the
 * wire and the server never parses a spreadsheet. The owner sees what was read
 * before anything is saved, then confirms.
 */

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ParsedSheet } from "@/lib/follow-up-sheet/parse";
import { importFollowUpSheet } from "../actions";
import type { ImportSummary } from "../schema";
import { toImportPayload } from "../to-wire";

type Stage = "idle" | "reading" | "ready" | "saving" | "done";

export function UploadSheetForm() {
  const [stage, setStage] = useState<Stage>("idle");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  async function readFile(file: File) {
    setStage("reading");
    setProblem(null);
    setParsed(null);
    setSummary(null);
    setFileName(file.name);
    try {
      // Loaded on demand: the spreadsheet reader is large and only this screen
      // needs it.
      const { parseFollowUpSheet } = await import("@/lib/follow-up-sheet/parse");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = parseFollowUpSheet(bytes);
      setParsed(result);
      setStage("ready");
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : "That file could not be read. Is it the follow-up sheet?",
      );
      setStage("idle");
    }
  }

  async function save() {
    if (!parsed) return;
    setStage("saving");
    const result = await importFollowUpSheet(toImportPayload(parsed, fileName));
    if (!result.ok) {
      setProblem(result.error);
      setStage("ready");
      toast.error(result.error);
      return;
    }
    setSummary(result.data);
    setStage("done");
    toast.success("The sheet was read and every unit is up to date.");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload the follow-up sheet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Refresh the Power Query in <em>Follow-up sheet (Don&apos;t Delete).xlsm</em>, save it,
            then choose it here. Your ticked quotations, unit names, photos and schedules are
            kept — only the figures from the sheet are refreshed.
          </p>
          <div className="space-y-2">
            <Label htmlFor="sheet">Follow-up sheet</Label>
            <Input
              id="sheet"
              type="file"
              accept=".xlsm,.xlsx"
              disabled={stage === "reading" || stage === "saving"}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
              }}
            />
          </div>
          {stage === "reading" && (
            <p className="text-muted-foreground text-sm">Reading the sheet…</p>
          )}
        </CardContent>
      </Card>

      {problem && (
        <Alert variant="destructive">
          <AlertTitle>That did not work</AlertTitle>
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}

      {parsed && stage !== "done" && (
        <Card>
          <CardHeader>
            <CardTitle>What I found</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Tab read</dt>
                <dd className="font-medium">{parsed.sheetName}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Quotations</dt>
                <dd className="font-medium">{parsed.accepted.length}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Rows I could not use</dt>
                <dd className="font-medium">{parsed.rejected.length}</dd>
              </div>
            </dl>

            {parsed.rejected.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Rows I could not use</p>
                <ul className="text-muted-foreground max-h-40 space-y-1 overflow-y-auto text-sm">
                  {parsed.rejected.slice(0, 30).map((row) => (
                    <li key={row.excelRow}>
                      Row {row.excelRow}: {row.reason}
                    </li>
                  ))}
                </ul>
                {parsed.rejected.length > 30 && (
                  <p className="text-muted-foreground text-xs">
                    …and {parsed.rejected.length - 30} more.
                  </p>
                )}
              </div>
            )}

            {parsed.zoneAliases.length > 0 && (
              <Alert>
                <AlertTitle>Some zones are spelled more than one way</AlertTitle>
                <AlertDescription>
                  <p className="mb-2">
                    I will treat each of these as one zone. If any pair is really two different
                    places, fix the spelling in the sheet and upload again.
                  </p>
                  <ul className="space-y-1 text-sm">
                    {parsed.zoneAliases.map((alias) => (
                      <li key={alias.zoneKey}>{alias.spellings.join("  ·  ")}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <Button onClick={() => void save()} disabled={stage === "saving"}>
              {stage === "saving" ? "Saving…" : `Use these ${parsed.accepted.length} quotations`}
            </Button>
          </CardContent>
        </Card>
      )}

      {summary && (
        <Card>
          <CardHeader>
            <CardTitle>Done</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="space-y-1">
              <li>{summary.unitsCreated} units added</li>
              <li>{summary.unitsUpdated} units refreshed</li>
              <li>{summary.quotationsCreated} quotations added</li>
              <li>{summary.quotationsUpdated} quotations refreshed</li>
              {summary.rowsRejected > 0 && <li>{summary.rowsRejected} rows skipped</li>}
            </ul>
            {summary.quotationsMissing > 0 && (
              <Alert variant="destructive">
                <AlertTitle>
                  {summary.quotationsMissing} quotation
                  {summary.quotationsMissing === 1 ? " is" : "s are"} no longer in the sheet
                </AlertTitle>
                <AlertDescription>
                  {summary.quotationsMissing === 1 ? "It has" : "They have"} been taken off
                  {summary.quotationsMissing === 1 ? " its" : " their"} newsletter so a quote
                  that no longer exists cannot reach a client. Nothing was deleted — the
                  schedules and photos are kept, and each one is marked on its unit&apos;s page
                  in case it went missing by mistake.
                </AlertDescription>
              </Alert>
            )}
            <Button asChild variant="outline">
              <Link href="/units">See the units</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
