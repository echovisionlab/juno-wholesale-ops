"use client";

import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import type { PropsWithChildren } from "react";
import { theme } from "@/theme";

export function Providers({ children }: PropsWithChildren) {
  return (
    <MantineProvider defaultColorScheme="light" theme={theme}>
      <Notifications position="top-right" />
      {children}
    </MantineProvider>
  );
}
