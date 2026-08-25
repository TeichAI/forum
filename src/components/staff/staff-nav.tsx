"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, FileWarning, LayoutDashboard, MessageSquareWarning, Settings2, Tags, Users, Waypoints } from "lucide-react";
import type { ForumRole } from "@/lib/roles";

const items = [
  { href: "/staff", label: "Overview", icon: LayoutDashboard, admin: false, exact: true },
  { href: "/staff/reports", label: "Reports", icon: FileWarning, admin: false },
  { href: "/staff/members", label: "Members", icon: Users, admin: false },
  { href: "/staff/content", label: "Content", icon: MessageSquareWarning, admin: false },
  { href: "/staff/audit", label: "Audit log", icon: Activity, admin: false },
  { href: "/staff/spaces", label: "Spaces", icon: Waypoints, admin: true },
  { href: "/staff/tags", label: "Tags", icon: Tags, admin: true },
  { href: "/staff/settings/moderation", label: "Moderation presets", icon: Settings2, admin: true },
] as const;

export function StaffNav({ role }: { role: ForumRole }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Staff console" className="staff-nav">
      {items.filter((item) => !item.admin || role === "ADMIN").map((item) => {
        const active = "exact" in item && item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={active ? "staff-nav-link staff-nav-link-active" : "staff-nav-link"}>
            <Icon size={17} aria-hidden="true" /><span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
