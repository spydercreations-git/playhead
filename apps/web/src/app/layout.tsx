import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { ThemeProvider } from "@/lib/theme";
import { AppShell } from "@/components/layout/app-shell";
import { ToastContainer } from "@/components/ui/toast";
import { ContextMenuProvider } from "@/components/ui/menu";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Playhead by Idyll Productions",
  description:
    "Unified cloud storage, Frame.io-style review and Monday-style project tracking for video agencies.",
  icons: {
    icon: "/playhead-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${inter.variable}`} suppressHydrationWarning>
      <body className={`${inter.className} bg-background text-foreground antialiased`} suppressHydrationWarning>
        <Providers>
          <ThemeProvider>
            <ContextMenuProvider>
              <AppShell>{children}</AppShell>
              <ToastContainer />
            </ContextMenuProvider>
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}

