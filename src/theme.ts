"use client";

import { createTheme } from "@mantine/core";
import { appMonoFontFamily, appSansFontFamily } from "@/lib/fonts";

export const theme = createTheme({
  fontFamily: appSansFontFamily,
  fontFamilyMonospace: appMonoFontFamily,
  defaultRadius: "sm",
  primaryColor: "sage",
  colors: {
    sage: [
      "#f3f8f2",
      "#e5efe5",
      "#c9dccb",
      "#aac8af",
      "#8fb697",
      "#79aa85",
      "#6aa37a",
      "#588e67",
      "#4d7e5b",
      "#3f6d4d",
    ],
  },
  headings: {
    fontFamily: appSansFontFamily,
    fontWeight: "700",
  },
  components: {
    Badge: {
      defaultProps: {
        radius: "sm",
      },
    },
    Card: {
      defaultProps: {
        radius: "sm",
        padding: "lg",
        withBorder: true,
      },
    },
    Container: {
      defaultProps: {
        size: "xl",
      },
    },
  },
});
