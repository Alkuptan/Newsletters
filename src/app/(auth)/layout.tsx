/**
 * Minimal centered layout for the signed-out pages — deliberately NOT the app
 * shell (no nav to leak, nothing to gate). The auth gate lives in
 * (app)/layout.tsx; these pages must render for anonymous visitors.
 * The app-wide <Toaster> is mounted once in the root layout.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center bg-muted px-4">
      <p className="pt-10 text-xs font-medium tracking-wide text-muted-foreground">
        Internal Tools · Orascom
      </p>
      <main className="flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</main>
    </div>
  );
}
