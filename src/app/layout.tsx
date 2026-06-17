import type { Metadata } from "next";
import { ColorSchemeScript } from "@mantine/core";
import "@mantine/core/styles.css";
import "./globals.css";
import { Providers } from "./providers";
import { fontStylesheetUrl } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "Juno Wholesale Ops",
  description: "Juno wholesale catalog ingestion and purchasing operations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <ColorSchemeScript defaultColorScheme="light" />
        {fontStylesheetUrl ? <link rel="stylesheet" href={fontStylesheetUrl} /> : null}
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
