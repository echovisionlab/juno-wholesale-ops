import type { Metadata } from "next";
import { ColorSchemeScript } from "@mantine/core";
import "@mantine/core/styles.css";
import "./globals.css";
import { Providers } from "./providers";
import { fontStylesheetUrl } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "Juno Wholesale Ops",
  description: "Juno wholesale catalog ingestion and read-only stock observation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ColorSchemeScript defaultColorScheme="light" suppressHydrationWarning type="text/javascript" />
        {fontStylesheetUrl ? <link rel="stylesheet" href={fontStylesheetUrl} /> : null}
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
