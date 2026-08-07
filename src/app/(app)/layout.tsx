import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/supabase/dal";
import { SHELL_CONFIG } from "@/components/shell/nav-config";
import { Nav } from "@/components/shell/nav";
import { MobileNav } from "@/components/shell/mobile-nav";
import { UserMenu } from "@/components/shell/user-menu";

/**
 * THE auth gate. Every route in the (app) group renders inside this layout,
 * so anonymous (and deactivated) users can never see a page here. This gate
 * only AUTHENTICATES — role checks (authorization) belong to each page and
 * its actions, with RLS as the backstop. Middleware only refreshes sessions;
 * it is not an auth layer.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b px-4 md:px-6">
        <Link href="/" className="font-heading text-base font-semibold">
          {SHELL_CONFIG.toolName}
        </Link>
        <UserMenu name={user.full_name} email={user.email} role={user.role} />
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-60 shrink-0 overflow-y-auto border-r md:block">
          {/* Role computed here, server-side; nav components only receive it. */}
          <Nav role={user.role} />
        </aside>
        <main className="flex-1 overflow-y-auto">
          {/* pb-20 keeps content clear of the fixed mobile bottom bar. */}
          <div className="mx-auto w-full max-w-6xl px-4 py-6 pb-20 md:px-6 md:pb-6">{children}</div>
        </main>
      </div>
      <MobileNav role={user.role} />
    </div>
  );
}
