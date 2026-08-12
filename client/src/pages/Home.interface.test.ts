import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CardDetails, Confirming, Face, Header, Idle, Notice, Pouring } from "./Home";

const projectRoot = process.cwd();
const homeSource = readFileSync(resolve(projectRoot, "client/src/pages/Home.tsx"), "utf8");
const cssSource = readFileSync(resolve(projectRoot, "client/src/index.css"), "utf8");

describe("interface vertical de 7 polegadas", () => {
  it("mantém regras CSS de alvo mínimo e renderiza todos os controles reconstruídos com auditoria de toque", () => {
    expect(cssSource).toContain(".teal-action,.neutral-button,.danger-button,.hold-button { min-height: 48px;");
    expect(cssSource).toContain(".fields input { height: 48px;");
    expect(cssSource).toContain(".face-orbit,.success-orbit { display: grid; width: 150px; height: 150px;");
    expect(cssSource).toContain("font-size: 11px; min-height: 48px;");

    const noop = () => undefined;
    const screens = createElement("div", null,
      createElement(Idle, { qrValue: "wallet://demo", seconds: 30, onFace: noop, onCard: noop, onDev: noop }),
      createElement(Face, { active: false, onActivate: noop, onCancel: noop }),
      createElement(CardDetails, { name: "Cliente", cpf: "12345678901", birth: "01/01/1990", setName: noop, setCpf: noop, setBirth: noop, onCancel: noop, onContinue: noop }),
      createElement(Confirming, { onConfirm: noop, onCancel: noop }),
      createElement(Pouring, { sessionId: "session-01", poured: 100, onFinish: noop, onEmergency: noop }),
      createElement(Notice, { state: "offline", onReset: noop }),
      createElement(Notice, { state: "error", onReset: noop }),
    );
    const markup = renderToStaticMarkup(screens);
    const targets = Array.from(markup.matchAll(/data-touch-target="(\d+)"/g), match => Number(match[1]));
    expect(targets).toHaveLength(16);
    expect(targets.every(target => target >= 48)).toBe(true);
  });

  it("renderiza explicitamente o indicador offline no cabeçalho do estado IDLE", () => {
    expect(homeSource).toContain("const [isOnline, setIsOnline] = useState(() => navigator.onLine);");
    expect(homeSource).toContain("const offline = () => { setIsOnline(false);");
    expect(homeSource).toContain("<Header offline={!isOnline || screen === \"offline\"} />");
    expect(renderToStaticMarkup(createElement(Header, { offline: true }))).toContain('class="connection offline"');
    expect(renderToStaticMarkup(createElement(Header, { offline: false }))).toContain('class="connection"');
  });
});
