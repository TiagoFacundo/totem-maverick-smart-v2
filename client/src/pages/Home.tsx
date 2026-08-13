import { QRCodeSVG } from "qrcode.react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleAlert, CreditCard, Fingerprint, Gift, Radio, Wifi, WifiOff } from "lucide-react";
import { TAP_ID, TOTEM_ID, calculateValueCents, createNonce, createSessionId, formatCurrency } from "../../../shared/totem";
import { flushPendingFinished, queuePendingFinished, tapApi } from "@/lib/tapApi";
import { getIdlePourTransition, requestAuthorizedPour, authorizeFaceThenRequestPour, authorizeWalletQrThenRequestPour } from "@/lib/totemAuthorization";

const LOGO_URL = "/manus-storage/maverick-reference-logo_09b4ddb1.png";
const PRODUCT = { name: "Heineken Lager", style: "Lager Pilsen", brand: "Heineken", pricePer100mlCents: 349, abv: "5,0%", ibu: "5,5", pricePerLiter: "R$ 34,90" };

type Screen = "idle" | "face" | "card" | "pouring" | "completed" | "offline" | "error";

export function Header({ offline = false }: { offline?: boolean }) {
  return <header className="ref-header"><img className="ref-logo" src={LOGO_URL} alt="Maverick Smart Tap" /><div className={offline ? "connection offline" : "connection"}>{offline ? <WifiOff /> : <Wifi />}</div></header>;
}

function Footer() {
  return <footer className="ref-footer">Maverick Smart Tap · {TOTEM_ID} · {TAP_ID}</footer>;
}

function ProductHeader() {
  return <div className="product-heading"><span>MAVERICK SMART TAP</span><h1>{PRODUCT.name}</h1><p>{PRODUCT.style}</p></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

export function Idle({ qrValue, seconds, onFace, onCard, onDev }: { qrValue: string; seconds: number; onFace: () => void; onCard: () => void; onDev: () => void }) {
  return <main className="ref-content ref-idle">
    <ProductHeader />
    <section className="brand-panel"><div className="brand-placeholder">★<span>Heineken</span></div><div><span>Marca</span><strong>{PRODUCT.brand}</strong></div><Gift className="brand-gift" /></section>
    <section className="metrics-grid"><Metric label="Preço por Litro" value={PRODUCT.pricePerLiter} /><Metric label="Preço por 100ml" value={formatCurrency(PRODUCT.pricePer100mlCents)} /><Metric label="ABV" value={PRODUCT.abv} /><Metric label="IBU" value={PRODUCT.ibu} /></section>
    <div className="pdv-panel"><span>PDV</span><strong>Toca do Tatu - Moema</strong></div>
    <div className="qr-zone"><div className="qr-frame"><QRCodeSVG value={qrValue} size={154} level="H" includeMargin={false} fgColor="#06232a" /></div><span>Atualiza em {seconds}s</span></div>
    <div className="action-grid"><button data-touch-target="48" className="teal-action" onClick={onFace}><Fingerprint /> USAR FACE ID</button><button data-touch-target="48" className="teal-action" onClick={onCard}><CreditCard /> COMPRAR COM CARTÃO</button></div>
    <button data-touch-target="48" className="dev-action" onClick={onDev}>[DEV] SIMULAR ESCANEAMENTO</button>
  </main>;
}

export function Face({ active, onActivate, onCancel }: { active: boolean; onActivate: () => void; onCancel: () => void }) {
  return <main className="ref-centered"><div className="eyebrow">FACE ID</div><h1>Captura facial</h1><button data-touch-target="150" className={`face-orbit ${active ? "active" : ""}`} onClick={onActivate} aria-label="Iniciar captura facial"><Fingerprint /></button><p>{active ? "Validando identidade..." : "Posicione seu rosto dentro do círculo"}</p><button data-touch-target="48" className="danger-button" onClick={onCancel}>Cancelar</button></main>;
}

export function CardDetails({ name, cpf, birth, setName, setCpf, setBirth, onCancel, onContinue }: { name: string; cpf: string; birth: string; setName: (value: string) => void; setCpf: (value: string) => void; setBirth: (value: string) => void; onCancel: () => void; onContinue: () => void }) {
  return <main className="ref-centered ref-form"><div className="eyebrow">COMPRA COM CARTÃO</div><h1>Seus dados</h1><div className="fields"><input data-touch-target="48" value={name} onChange={event => setName(event.target.value)} placeholder="Nome completo" autoComplete="name" /><input data-touch-target="48" value={cpf} onChange={event => setCpf(event.target.value)} placeholder="CPF" inputMode="numeric" /><input data-touch-target="48" value={birth} onChange={event => setBirth(event.target.value)} placeholder="Data de nascimento (DD/MM/AAAA)" inputMode="numeric" /></div><div className="form-actions"><button data-touch-target="48" className="neutral-button" onClick={onCancel}>Cancelar</button><button data-touch-target="48" className="teal-action" disabled={!name || cpf.replace(/\D/g, "").length < 11 || birth.length < 8} onClick={onContinue}>Continuar</button></div></main>;
}

export function Pouring({ sessionId, poured, onFinish, onEmergency }: { sessionId: string; poured: number; onFinish: () => void; onEmergency: () => void }) {
  return <main className="ref-centered ref-pouring"><div className="eyebrow">SESSÃO ATIVA</div><h1>Servindo seu chopp</h1><p className="session-code">#{sessionId.slice(0, 8)}</p><div className="session-values"><Metric label="Volume" value={`${Math.round(poured)} ml`} /><Metric label="Total" value={formatCurrency(calculateValueCents(poured, PRODUCT.pricePer100mlCents))} /></div><div className="limit-line"><span>Limite autorizado</span><strong>R$ 50,00</strong></div><button data-touch-target="48" className="danger-button" onClick={onFinish}>Encerrar agora</button><button data-touch-target="48" className="flow-status" onClick={onEmergency}><Radio /> Fluxo ativo</button></main>;
}

function Completed({ poured }: { poured: number }) {
  return <main className="ref-centered"><div className="success-orbit"><Check /></div><h1>Sessão encerrada</h1><p>Aproveite seu chopp!</p><div className="session-values"><Metric label="Volume servido" value={`${Math.round(poured)} ml`} /><Metric label="Total debitado" value={formatCurrency(calculateValueCents(poured, PRODUCT.pricePer100mlCents))} /></div><span className="returning">Voltando à tela inicial...</span></main>;
}

export function Notice({ state, onReset }: { state: "offline" | "error"; onReset: () => void }) {
  const offline = state === "offline";
  return <main className="ref-centered"><CircleAlert className="notice-icon" /><h1>{offline ? "Sem conexão" : "Sessão interrompida"}</h1><p>{offline ? "O totem está bloqueado até que a comunicação seja restabelecida." : "A torneira foi bloqueada por segurança."}</p><button data-touch-target="48" className="danger-button" onClick={onReset}>Voltar ao início</button></main>;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("idle");
  const [nonce, setNonce] = useState(createNonce);
  const [seconds, setSeconds] = useState(30);
  const [faceActive, setFaceActive] = useState(false);
  const [name, setName] = useState(""); const [cpf, setCpf] = useState(""); const [birth, setBirth] = useState("");
  const [sessionId, setSessionId] = useState(""); const [poured, setPoured] = useState(0);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const finishing = useRef(false);
  const qrValue = useMemo(() => `maverick://tap/${TAP_ID}?totem=${TOTEM_ID}&nonce=${nonce}&t=${Math.floor(Date.now() / 1000)}`, [nonce]);

  const reset = () => { finishing.current = false; setScreen("idle"); setNonce(createNonce()); setSeconds(30); setPoured(0); setSessionId(""); setFaceActive(false); };
  useEffect(() => { const id = window.setInterval(() => setSeconds(current => { if (current <= 1) { setNonce(createNonce()); return 30; } return current - 1; }), 1000); return () => window.clearInterval(id); }, []);
  useEffect(() => { const online = () => { setIsOnline(true); flushPendingFinished(); if (screen === "offline") reset(); }; const offline = () => { setIsOnline(false); if (!["idle", "completed", "error"].includes(screen)) setScreen("offline"); }; window.addEventListener("online", online); window.addEventListener("offline", offline); flushPendingFinished(); return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); }; }, [screen]);
  useEffect(() => {
    if (screen !== "idle") return;
    const pollAuthorization = () => tapApi.getCommand().then(command => {
      const transition = getIdlePourTransition(command);
      if (transition) {
        setSessionId(transition.sessionId);
        setPoured(0);
        setScreen(transition.screen);
      }
    }).catch(() => setIsOnline(false));
    pollAuthorization();
    const poll = window.setInterval(pollAuthorization, 1500);
    return () => window.clearInterval(poll);
  }, [screen]);
  useEffect(() => { if (screen !== "pouring") return; const poll = window.setInterval(() => tapApi.getCommand().then(command => { if (command.command?.type === "emergency_stop") setScreen("error"); }).catch(() => setScreen("offline")), 1500); return () => window.clearInterval(poll); }, [screen]);
  useEffect(() => { if (screen !== "pouring") return; const flow = window.setInterval(() => setPoured(current => Math.min(450, current + 1.5)), 200); return () => window.clearInterval(flow); }, [screen]);
  useEffect(() => { if (screen !== "completed") return; const id = window.setTimeout(reset, 4000); return () => window.clearTimeout(id); }, [screen]);

  const requestServerAuthorization = async () => { const id = createSessionId(); try { await requestAuthorizedPour(tapApi, id, PRODUCT); reset(); } catch { setScreen("offline"); } };
  const activateFace = async () => { if (faceActive) return; setFaceActive(true); try { const authorized = await authorizeFaceThenRequestPour(tapApi, { pin: "1234", face_image_base64: "simulator", nonce, timestamp: Math.floor(Date.now() / 1000) }, requestServerAuthorization); if (!authorized) reset(); } catch { setScreen("offline"); } };
  const activateWalletQr = async () => { try { const authorized = await authorizeWalletQrThenRequestPour(tapApi, { qr_payload: qrValue, nonce, timestamp: Math.floor(Date.now() / 1000) }, requestServerAuthorization); if (!authorized) reset(); } catch { setScreen("offline"); } };
  const finish = async (error = false) => { if (finishing.current || !sessionId) return; finishing.current = true; const payload = { session_id: sessionId, status: error ? "error" : "finished", volume_poured_ml: Math.round(poured), value_cents: calculateValueCents(poured, PRODUCT.pricePer100mlCents) }; const key = `${sessionId}-finished`; try { await tapApi.finished(payload, key); setScreen(error ? "error" : "completed"); } catch { queuePendingFinished(payload, key); setScreen("offline"); } finally { finishing.current = false; } };
  const emergency = async () => { try { await tapApi.emergencyStop(); } catch { /* proteção local continua ativa */ } finish(true); };

  return <div className="kiosk-app"><div className="kiosk-stage"><Header offline={!isOnline || screen === "offline"} />
    {screen === "idle" && <Idle qrValue={qrValue} seconds={seconds} onFace={() => setScreen("face")} onCard={() => setScreen("card")} onDev={activateWalletQr} />}
    {screen === "face" && <Face active={faceActive} onActivate={activateFace} onCancel={reset} />}
    {screen === "card" && <CardDetails name={name} cpf={cpf} birth={birth} setName={setName} setCpf={setCpf} setBirth={setBirth} onCancel={reset} onContinue={requestServerAuthorization} />}
    {screen === "pouring" && <Pouring sessionId={sessionId} poured={poured} onFinish={() => finish()} onEmergency={emergency} />}
    {screen === "completed" && <Completed poured={poured} />}
    {(screen === "offline" || screen === "error") && <Notice state={screen} onReset={reset} />}
    <Footer /></div></div>;
}
