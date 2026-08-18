import type { Metadata } from "next";
import { ToastViewport } from "@/components/ui/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "ObjektConnect",
  description: "Vernetzt. Effizient. Zuverlässig.",
  icons: {
    icon: "/favicon.ico"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>
        {children}
        <ToastViewport />
      </body>
    </html>
  );
}
