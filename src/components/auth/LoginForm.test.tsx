/* @vitest-environment jsdom */

import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { theme } from "@/theme";
import { LoginForm } from "./LoginForm";

let root: Root;
let container: HTMLDivElement;

describe("LoginForm", () => {
  beforeEach(() => {
    setReactActEnvironment();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("uses generic sign-in copy when no login logo is configured", async () => {
    await renderLoginForm();

    expect(pageText()).toContain("Sign in");
    expect(pageText()).not.toContain("Admin sign in");
    expect(document.querySelector("img")).toBeNull();
  });

  it("renders a configured login logo in the sign-in heading position", async () => {
    await renderLoginForm("https://assets.example.test/operator-logo.svg");

    const logo = document.querySelector("img");
    expect(logo?.getAttribute("src")).toBe("https://assets.example.test/operator-logo.svg");
    expect(logo?.getAttribute("alt")).toBe("Sign in");
    expect(pageText()).not.toContain("Admin sign in");
  });
});

async function renderLoginForm(loginLogoUrl: string | null = null): Promise<void> {
  await act(async () => {
    root.render(
      <MantineProvider defaultColorScheme="light" theme={theme}>
        <LoginForm redirectTo="/" loginLogoUrl={loginLogoUrl} />
      </MantineProvider>,
    );
  });
}

function pageText(): string {
  return document.body.textContent ?? "";
}

function setReactActEnvironment(): void {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
}
