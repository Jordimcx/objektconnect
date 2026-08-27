import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ToastViewport } from "@/components/ui/toast";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap"
});

export const metadata: Metadata = {
  title: {
    default: "objekt.connect — Instandhaltung auf Autopilot",
    template: "%s · objekt.connect"
  },
  description: "Reparaturen, die sich von selbst weiterbewegen — vom ersten Schaden bis zur bestätigten Erledigung. Automatisch, nachvollziehbar, ohne App-Zwang für Mieter."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className={inter.variable}>
      <body>
        {children}
        <ToastViewport />
      </body>
    </html>
  );
}
