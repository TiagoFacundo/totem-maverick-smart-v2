import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const agentPath = resolve(process.cwd(), "raspberry_pi/solenoid_agent.py");

describe("agente de solenoide do Raspberry Pi", () => {
  it("declara as proteções fail-safe necessárias antes do acionamento físico", () => {
    const source = readFileSync(agentPath, "utf-8");
    expect(source).toContain("initial_value=False");
    expect(source).toContain("self.solenoid.off()");
    expect(source).toContain('"COMMAND_POLL_FAILED"');
    expect(source).toContain('"EMERGENCY_STOP"');
    expect(source).toContain('"COMMAND_WITHDRAWN"');
    expect(source).toContain("MAX_POUR_SECONDS");
    expect(source).toContain("/finished");
  });
});
