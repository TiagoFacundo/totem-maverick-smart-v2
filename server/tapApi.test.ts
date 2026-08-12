import { describe, expect, it } from "vitest";
import { calculateValueCents, canTransition } from "../shared/totem";

describe("máquina de estados do totem", () => {
  it("impede ir de idle diretamente para dispensação", () => {
    expect(canTransition("idle", "pouring")).toBe(false);
  });

  it("permite o ciclo de confirmação até a autorização", () => {
    expect(canTransition("confirming", "authorized")).toBe(true);
  });

  it("permite concluir a dispensação antes de exibir a confirmação", () => {
    expect(canTransition("pouring", "finishing")).toBe(true);
    expect(canTransition("finishing", "completed")).toBe(true);
  });
});

describe("cálculo da dosagem", () => {
  it("arredonda o valor para centavos inteiros", () => {
    expect(calculateValueCents(320, 199)).toBe(637);
  });

  it("desconsidera resíduo abaixo de 10 ml", () => {
    expect(calculateValueCents(9, 199)).toBe(0);
  });
});
