import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";
import { ErpDataProvider } from "@/context/ErpDataContext";
import AuthGuard from "@/components/layout/AuthGuard";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "AdGen Pharmacy ERP | Clinical Billing & Inventory Suite",
  description: "Enterprise Pharmacy Management System — Billing, FEFO Batch Inventory, GST Compliance",
  icons: {
    icon: "/logo-nobg.png",
    shortcut: "/logo-nobg.png",
    apple: "/logo-nobg.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${jetbrains.variable} h-full antialiased font-sans`}
    >
      <body className="min-h-full flex flex-col bg-white text-gray-900 selection:bg-emerald-600 selection:text-white">
        <AuthProvider>
          <ErpDataProvider>
            <AuthGuard>{children}</AuthGuard>
          </ErpDataProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
