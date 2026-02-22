import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";

import { SplitexThemeProvider, ToastProvider } from "@splitex/ui";
import type { SplitexThemeName } from "@splitex/ui";
import StyledComponentsRegistry from "../lib/StyledComponentsRegistry";
import { WebAppShell } from "../components/WebAppShell";

async function readThemeCookie(): Promise<SplitexThemeName | undefined> {
  const cookieStore = await cookies();
  const value = cookieStore.get('splitex.theme')?.value as SplitexThemeName | undefined;
  if (!value) return undefined;
  if (value === 'light' || value === 'dark' || value === 'ocean' || value === 'forest' || value === 'midnight') {
    return value;
  }
  return undefined;
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Splitex - Expense Splitting Made Simple",
  description: "Split expenses with friends and family",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const defaultTheme = await readThemeCookie();

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={geistSans.variable + ' ' + geistMono.variable}
      >
        <StyledComponentsRegistry>
          <SplitexThemeProvider defaultTheme={defaultTheme}>
            <ToastProvider>
              <WebAppShell>{children}</WebAppShell>
            </ToastProvider>
          </SplitexThemeProvider>
        </StyledComponentsRegistry>
      </body>
    </html>
  );
}
