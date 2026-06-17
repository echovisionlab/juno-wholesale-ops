"use client";

import { MantineProvider } from "@mantine/core";
import type { PropsWithChildren } from "react";
import { theme } from "@/theme";

export function Providers({ children }: PropsWithChildren) {
  return (
    <MantineProvider defaultColorScheme="light" theme={theme}>
      {children}
    </MantineProvider>
  );
}
