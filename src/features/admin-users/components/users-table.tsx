"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { setUserActive, setUserRole } from "@/features/admin-users/actions";
import { DataTable } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Tables } from "@/lib/supabase/database.types";

type Profile = Tables<"profiles">;

// Fixed locale so server render and client hydration agree on the output.
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function RowActions({ profile, isSelf }: { profile: Profile; isSelf: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  function changeRole() {
    startTransition(async () => {
      const nextRole = profile.role === "admin" ? "member" : "admin";
      const result = await setUserRole({ userId: profile.id, role: nextRole });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `${profile.full_name} is now ${nextRole === "admin" ? "an admin" : "a member"}.`,
      );
    });
  }

  function changeActive(isActive: boolean) {
    startTransition(async () => {
      const result = await setUserActive({ userId: profile.id, isActive });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setConfirmDeactivate(false);
      toast.success(`${profile.full_name} ${isActive ? "reactivated" : "deactivated"}.`);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* The server guards self-changes too — disabling here is just UX. */}
          <Button variant="ghost" size="icon-sm" disabled={isSelf} aria-label="User actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={changeRole} disabled={isPending}>
            {profile.role === "admin" ? "Demote to member" : "Promote to admin"}
          </DropdownMenuItem>
          {profile.is_active ? (
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setConfirmDeactivate(true)}
              disabled={isPending}
            >
              Deactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => changeActive(true)} disabled={isPending}>
              Reactivate
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmDeactivate} onOpenChange={setConfirmDeactivate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate {profile.full_name}?</DialogTitle>
            <DialogDescription>
              They will be signed out and unable to sign in until reactivated. Nothing is deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton>
            <Button variant="destructive" onClick={() => changeActive(false)} disabled={isPending}>
              {isPending ? "Deactivating…" : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function UsersTable({
  profiles,
  currentUserId,
}: {
  profiles: Profile[];
  currentUserId: string;
}) {
  const columns = useMemo<ColumnDef<Profile>[]>(
    () => [
      {
        accessorKey: "full_name",
        header: "Name",
        cell: ({ row }) => <span className="font-medium">{row.original.full_name}</span>,
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.email}</span>,
      },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) => (
          <Badge
            variant={row.original.role === "admin" ? "default" : "secondary"}
            className="capitalize"
          >
            {row.original.role}
          </Badge>
        ),
      },
      {
        accessorKey: "is_active",
        header: "Status",
        cell: ({ row }) =>
          row.original.is_active ? (
            <Badge variant="outline">Active</Badge>
          ) : (
            <Badge variant="destructive">Deactivated</Badge>
          ),
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {dateFormat.format(new Date(row.original.created_at))}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        // Buttons, not a value — there is nothing to order by.
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <RowActions profile={row.original} isSelf={row.original.id === currentUserId} />
          </div>
        ),
      },
    ],
    [currentUserId],
  );

  return <DataTable columns={columns} data={profiles} emptyMessage="No users yet." />;
}
