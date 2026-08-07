import { Home, ListTodo, Settings, Users, type LucideIcon } from "lucide-react";

/** Shell-wide constants. Rename the tool here — nowhere else. */
export const SHELL_CONFIG = {
  toolName: "Internal Tool",
} as const;

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Hidden from non-admins. The server still enforces the role — this only trims the menu. */
  adminOnly?: boolean;
};

// Adding a page = one entry here + one route folder under src/app/(app)/.
// Desktop sidebar and mobile bottom bar both render from this single list.
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/example-items", label: "Example Items", icon: ListTodo },
  { href: "/admin/users", label: "Users", icon: Users, adminOnly: true },
  { href: "/settings", label: "Settings", icon: Settings },
];
