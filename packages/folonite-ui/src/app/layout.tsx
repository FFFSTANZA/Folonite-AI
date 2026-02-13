import type React from "react";
import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Folonite",
  description: "Folonite is the container for desktop agents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`font-sans flex h-screen overflow-hidden bg-background text-foreground`}>
        <Sidebar className="hidden md:flex" />
        <div className="flex flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}
