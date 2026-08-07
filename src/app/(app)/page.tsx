import Link from "next/link";
import { requireSessionPage } from "@/lib/supabase/dal";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Route groups don't affect URLs, so (app)/page.tsx serves "/" — inside the
// auth-gated shell. currentUser() is cached per request, so this second
// lookup after the layout gate costs nothing.
export default async function HomePage() {
  const user = await requireSessionPage();
  const firstName = user.full_name.split(" ")[0] || user.full_name;

  return (
    <>
      <PageHeader title={`Hello, ${firstName}`} description="Welcome back." />
      <Card>
        <CardHeader>
          <CardTitle>This is a template</CardTitle>
          <CardDescription>
            This app was scaffolded from internal-tool-template and hasn&apos;t been turned into a
            real tool yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p>
            The{" "}
            <Link href="/example-items" className="font-medium underline underline-offset-4">
              Example Items
            </Link>{" "}
            page is the reference feature — every new feature copies its shapes (schema, queries,
            actions, components).
          </p>
          <p>
            To replace it with your real tool, open this project in Claude Code and run{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">/kickoff</code>.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
