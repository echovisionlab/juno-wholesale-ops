import type { Preview } from "@storybook/nextjs-vite";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "../src/app/globals.css";
import { theme } from "../src/theme";

const preview: Preview = {
  decorators: [
    (Story) => (
      <MantineProvider defaultColorScheme="light" theme={theme}>
        <Story />
      </MantineProvider>
    ),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: "fullscreen",
  },
};

export default preview;
