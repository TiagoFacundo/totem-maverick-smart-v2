// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";

afterEach(() => cleanup());

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe("rota Docs", () => {
  it("renderiza a documentação técnica na rota /docs sem carregar o kiosk", () => {
    window.history.pushState({}, "", "/docs");
    render(createElement(App));

    expect(screen.getByRole("heading", { name: "Documentação técnica" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Contrato REST do Totem" })).not.toBeNull();
    expect(screen.getByText("Face ID → retirada")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /usar face id/i })).toBeNull();
  });
});
