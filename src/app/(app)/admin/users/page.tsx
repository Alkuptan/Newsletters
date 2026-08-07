import { requireRolePage } from "@/lib/supabase/dal";
import { listProfiles } from "@/features/admin-users/queries";
import { UsersTable } from "@/features/admin-users/components/users-table";
import { InviteUserDialog } from "@/features/admin-users/components/invite-user-dialog";
import { PageHeader } from "@/components/shell/page-header";

// Defense in depth, four layers — keep ALL of them:
//   1. the (app) layout gate AUTHENTICATES (signed in at all?)
//   2. THIS page AUTHORIZES (admin role, or redirect home)
//   3. every action re-checks with requireRole("admin")
//   4. RLS backstops in the database
export default async function AdminUsersPage() {
  const admin = await requireRolePage("admin");
  const profiles = await listProfiles();

  return (
    <>
      <PageHeader title="Users" description="Invite teammates and manage roles and access.">
        <InviteUserDialog />
      </PageHeader>
      <UsersTable profiles={profiles} currentUserId={admin.id} />
    </>
  );
}
