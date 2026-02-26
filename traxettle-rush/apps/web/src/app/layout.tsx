import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";

import { TraxettleThemeProvider, ToastProvider } from "@traxettle/ui";
import type { TraxettleThemeName } from "@traxettle/ui";
import StyledComponentsRegistry from "../lib/StyledComponentsRegistry";
import { WebAppShell } from "../components/WebAppShell";

async function readThemeCookie(): Promise<TraxettleThemeName | undefined> {
  const cookieStore = await cookies();
  const value = cookieStore.get('traxettle.theme')?.value as TraxettleThemeName | undefined;
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
  title: "Traxettle - Expense Splitting Made Simple",
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
          <TraxettleThemeProvider defaultTheme={defaultTheme}>
            <ToastProvider>
              <WebAppShell>{children}</WebAppShell>
            </ToastProvider>
          </TraxettleThemeProvider>
        </StyledComponentsRegistry>
      </body>
    </html>
  );
}
