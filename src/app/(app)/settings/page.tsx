import { requireSessionPage } from "@/lib/supabase/dal";
import { ProfileForm } from "@/features/settings/components/profile-form";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function SettingsPage() {
  const user = await requireSessionPage();

  return (
    <>
      <PageHeader title="Settings" description="Your profile and account." />
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Email and role are managed by an admin on the Users page.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ProfileForm initialFullName={user.full_name} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" value={user.email} disabled className="max-w-sm" />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Role</Label>
            <Badge variant="secondary" className="capitalize">
              {user.role}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
