import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cookies, headers } from "next/headers";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "";
  const isShareOrReviewRoute =
    pathname.startsWith("/s/") ||
    pathname.startsWith("/review") ||
    pathname.startsWith("/r/");

  const cookieStore = await cookies();
  const theme = isShareOrReviewRoute
    ? "blue"
    : cookieStore.get("playhead_theme")?.value || "blue";

  return (
    <html lang="en" data-theme={theme} className={`dark ${inter.variable}`} suppressHydrationWarning>
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

