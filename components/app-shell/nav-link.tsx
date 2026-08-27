"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { springSmooth } from "@/lib/motion";
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
  badge,
  scope = "desktop"
}: {
  href: string;
  label: string;
  icon: NavIconName;
  badge?: number;
  scope?: "desktop" | "mobile";
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  const Icon = iconMap[icon];

  return (
    <Link
      href={href}
      className={cn(
        "focus-ring relative flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition-colors duration-150",
        active ? "text-primary" : "text-slate-600 hover:text-primary"
      )}
    >
      {active ? (
        <motion.span
          layoutId={`nav-active-pill-${scope}`}
          className="absolute inset-0 rounded-md bg-white shadow-sm"
          transition={springSmooth}
        />
      ) : null}
      <Icon className="relative z-10 h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="relative z-10 truncate">{label}</span>
      {badge ? (
        <span className="relative z-10 ml-auto rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-white">{badge}</span>
      ) : null}
    </Link>
  );
}
