"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Building2,
  CalendarDays,
  ChartColumn,
  CircuitBoard,
  ClipboardCheck,
  FileText,
  Home,
  Inbox,
  MessageSquare,
  ReceiptText,
  Settings,
  Ticket,
  UserRound,
  Users,
  Wrench,
  type LucideIcon
} from "lucide-react";
import type { NavIconName } from "@/lib/constants";
import { cn } from "@/lib/utils";

const iconMap: Record<NavIconName, LucideIcon> = {
  bell: Bell,
  building: Building2,
  calendar: CalendarDays,
  chart: ChartColumn,
  clipboard: ClipboardCheck,
  file: FileText,
  home: Home,
  inbox: Inbox,
  message: MessageSquare,
  receipt: ReceiptText,
  asset: CircuitBoard,
  settings: Settings,
  ticket: Ticket,
  user: UserRound,
  users: Users,
  wrench: Wrench
};

export function NavLink({
  href,
  label,
  icon,
  badge
}: {
  href: string;
  label: string;
  icon: NavIconName;
  badge?: number;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  const Icon = iconMap[icon];

  return (
    <Link
      href={href}
      className={cn(
        "focus-ring flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-white hover:text-primary",
        active && "bg-white text-primary shadow-sm"
      )}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
      {badge ? (
        <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-white">{badge}</span>
      ) : null}
    </Link>
  );
}
