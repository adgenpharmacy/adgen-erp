import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";
import { ErpDataProvider } from "@/context/ErpDataContext";
import AuthGuard from "@/components/layout/AuthGuard";
import AppShell from "@/components/layout/AppShell";
import MaintenanceOverlay from "@/components/layout/MaintenanceOverlay";
import { ToastProvider, ConfirmProvider } from "@/components/ui";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "AdGen Pharmacy ERP | Clinical Billing & Inventory Suite",
  description: "Enterprise Pharmacy Management System — Billing, FEFO Batch Inventory, GST Compliance",
  applicationName: "AdGen ERP",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "AdGen ERP", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: "/logo-nobg.png",
    shortcut: "/logo-nobg.png",
    apple: "/logo-nobg.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#059669",
  width: "device-width",
  initialScale: 1,
  // The counter is used on tablets; allow pinch-zoom rather than locking it out.
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-canvas text-fg selection:bg-brand selection:text-brand-fg">
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              <ErpDataProvider>
                <AuthGuard>
                  <AppShell>{children}</AppShell>
                </AuthGuard>
                {/* Outside AuthGuard: it must show on the login screen too. */}
                <MaintenanceOverlay />
              </ErpDataProvider>
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
