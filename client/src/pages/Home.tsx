import { QRCodeSVG } from "qrcode.react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Beer,
  Camera,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  GlassWater,
  KeyRound,
  LockKeyhole,
  Power,
  Radio,
  RefreshCw,
  ScanFace,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wifi,
  WifiOff,
  Wine,
} from "lucide-react";
import {
  CUP_SIZES,
  PRODUCTS,
  TAP_ID,
  TOTEM_ID,
  calculateValueCents,
  canTransition,
  createNonce,
  createSessionId,
  formatCurrency,
  type Product,
  type TotemState,
} from "../../../shared/totem";
import { flushPendingFinished, queuePendingFinished, tapApi } from "@/lib/tapApi";

type AuthMode = "wallet" | "pin" | "face";
type StatusKind = "online" | "offline";

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-mark ${compact ? "scale-90 origin-left" : ""}`} aria-label="Maverick Smart Chopp">
      <div className="relative grid h-10 w-10 place-items-center border border-[#e9bd57]/70 bg-[#0e4850] shadow-[inset_0_0_18px_rgba(58,213,190,.35)]">
        <Beer className="h-5 w-5 text-[#f0c761]" strokeWidth={1.8} />
        <span className="absolute -bottom-1 h-1 w-1 rounded-full bg-[#54ddb8]" />
      </div>
      <div>
        <div className={`brand-title ${compact ? "text-lg" : "text-xl"}`}>MAVERICK</div>
        <div className="mt-1 text-[9px] font-bold tracking-[.28em] text-[#79cdbc]">SMART CHOPP</div>
      </div>
    </div>
  );
}

function TopBar({ connection, onEmergency }: { connection: StatusKind; onEmergency: () => void }) {
  const online = connection === "online";
  return (
    <header className="flex items-center justify-between gap-3 px-5 py-5 md:px-9 md:py-7">
      <BrandMark compact />
      <div className="flex items-center gap-2">
        <div className={`hidden items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold tracking-wide sm:flex ${online ? "border-[#4de1b7]/30 bg-[#0b4f49]/50 text-[#99f2d9]" : "border-red-300/25 bg-red-950/35 text-red-200"}`}>
          {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {online ? "SISTEMA ONLINE" : "SEM CONEXÃO"}
        </div>
        <button onClick={onEmergency} className="grid h-10 w-10 place-items-center rounded-full border border-red-300/25 bg-red-950/30 text-red-200 transition hover:bg-red-900/50 active:scale-95" aria-label="Parada de emergência">
          <Power className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

function ScreenHeading({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return (
    <div className="space-y-3 text-center">
      {eyebrow && <p className="text-xs font-bold tracking-[.2em] text-[#d7ad54]">{eyebrow}</p>}
      <h1 className="font-[Playfair_Display] text-4xl font-extrabold leading-[1.03] tracking-tight text-[#f8f4e9] sm:text-5xl">{title}</h1>
      {description && <p className="mx-auto max-w-xl text-base leading-relaxed text-[#c7d9d4] md:text-lg">{description}</p>}
    </div>
  );
}

function HoldConfirmButton({ onComplete, disabled }: { onComplete: () => void; disabled?: boolean }) {
  const [progress, setProgress] = useState(0);
  const frame = useRef<number | null>(null);
  const startedAt = useRef(0);
  const completed = useRef(false);

  const stop = () => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (!completed.current) setProgress(0);
  };
  const start = () => {
    if (disabled || frame.current) return;
    completed.current = false;
    startedAt.current = performance.now();
    const tick = (time: number) => {
      const next = Math.min(100, ((time - startedAt.current) / 1300) * 100);
      setProgress(next);
      if (next >= 100) {
        completed.current = true;
        frame.current = null;
        onComplete();
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => stop(), []);

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={event => { if (event.key === " " || event.key === "Enter") start(); }}
      onKeyUp={stop}
      className="gold-button relative flex h-[76px] w-full items-center justify-center overflow-hidden rounded-2xl px-6 text-lg font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="absolute inset-y-0 left-0 bg-[#0f514d]/25 transition-none" style={{ width: `${progress}%` }} />
      <span className="relative flex items-center gap-3"><LockKeyhole className="h-5 w-5" />{progress > 0 ? `Mantenha pressionado · ${Math.ceil(progress)}%` : "Pressione e segure para confirmar"}</span>
    </button>
  );
}

function CupIllustration({ level = 0 }: { level?: number }) {
  return (
    <div className="relative mx-auto h-56 w-40 overflow-hidden rounded-b-[2.4rem] border-x-2 border-b-2 border-white/55 bg-white/5 shadow-[inset_0_0_28px_rgba(255,255,255,.1),0_22px_42px_rgba(0,0,0,.2)]">
      <div className="absolute left-3 right-3 top-3 h-3 rounded-full border border-white/25 bg-white/15" />
      <div className="pour-fill absolute inset-x-0 bottom-0" style={{ height: `${Math.max(level, 4)}%` }} />
      <div className="absolute inset-x-0 top-[52%] border-t border-dashed border-white/25" />
      <div className="absolute inset-x-0 top-[25%] border-t border-dashed border-white/15" />
    </div>
  );
}

function QRIdle({ qrValue, onWallet, onFace, onPin, onRefresh }: { qrValue: string; onWallet: () => void; onFace: () => void; onPin: () => void; onRefresh: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-5 pb-8 pt-4 md:px-9">
      <div className="grid w-full items-center gap-8 lg:grid-cols-[1.05fr_.95fr] lg:gap-16">
        <div className="space-y-7 text-center lg:text-left">
          <div className="mx-auto w-fit lg:mx-0"><div className="animate-status h-3 w-3 rounded-full bg-[#5eebbd]" /></div>
          <ScreenHeading eyebrow="AUTOATENDIMENTO INTELIGENTE" title="O seu chopp, do seu jeito." description="Aponte a câmera da Wallet para o QR Code e autorize uma experiência gelada, rápida e segura." />
          <div className="flex flex-wrap justify-center gap-3 lg:justify-start">
            <button onClick={onWallet} className="gold-button flex items-center gap-2 rounded-xl px-5 py-3 font-extrabold"><Camera className="h-4 w-4" /> Ler QR da Wallet</button>
            <button onClick={onFace} className="outline-button flex items-center gap-2 rounded-xl px-5 py-3 font-bold"><ScanFace className="h-4 w-4 text-[#66e8be]" /> Usar Face ID</button>
            <button onClick={onPin} className="outline-button flex items-center gap-2 rounded-xl px-5 py-3 font-bold"><KeyRound className="h-4 w-4 text-[#e5be64]" /> Digitar senha</button>
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-[#a9c4bd] lg:justify-start"><ShieldCheck className="h-4 w-4 text-[#6ee5bd]" /> Transação protegida pela Wallet Maverick</div>
        </div>
        <div className="screen-card mx-auto w-full max-w-[390px] rounded-[2.25rem] p-5 sm:p-7">
          <div className="mb-4 flex items-center justify-between"><span className="text-xs font-bold tracking-[.16em] text-[#d9b45c]">ESCANEIE PARA COMEÇAR</span><button onClick={onRefresh} className="rounded-full p-2 text-[#bad8d0] hover:bg-white/8" aria-label="Atualizar QR Code"><RefreshCw className="h-4 w-4" /></button></div>
          <div className="relative grid aspect-square place-items-center rounded-[1.4rem] bg-[#faf8f0] p-5 shadow-[0_20px_35px_rgba(0,0,0,.3)]">
            <QRCodeSVG value={qrValue} size={260} level="H" includeMargin={false} fgColor="#0b2930" />
            <div className="absolute grid h-12 w-12 place-items-center rounded-lg border-2 border-[#e5bf61] bg-[#0d444b] shadow-lg"><Beer className="h-5 w-5 text-[#efd071]" /></div>
          </div>
          <div className="mt-5 flex items-center justify-center gap-2 text-sm text-[#c4dad2]"><Smartphone className="h-4 w-4 text-[#e7bd59]" /> Abra a Wallet e escaneie o código</div>
        </div>
      </div>
      <p className="mt-8 text-center text-xs tracking-wide text-[#769a92]">TORNEIRA {TAP_ID} · TOTEM {TOTEM_ID}</p>
    </main>
  );
}

function WalletQRScan({ videoRef, scanning, message, onStart, onBack }: { videoRef: React.RefObject<HTMLVideoElement | null>; scanning: boolean; message: string | null; onStart: () => void; onBack: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-5 pb-8">
      <button onClick={onBack} className="outline-button mb-5 self-start rounded-xl p-3" aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></button>
      <ScreenHeading eyebrow="WALLET MAVERICK" title="Aproxime o QR Code" description="Posicione o QR Code exibido na sua Wallet dentro da moldura. A leitura confirma o nonce e a validade da sessão." />
      <div className="scan-frame mt-7 aspect-[4/3] w-full max-w-lg overflow-hidden rounded-[2rem] bg-[#061e23]">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover opacity-90" />
        {!scanning && <button onClick={onStart} className="outline-button absolute inset-0 m-auto h-fit w-fit rounded-xl px-5 py-3 font-bold"><Camera className="mr-2 inline h-4 w-4" /> Ativar câmera</button>}
        <div className="pointer-events-none absolute inset-[16%] rounded-2xl border-2 border-dashed border-[#75f5c7]/75" />
      </div>
      {message && <p className="mt-5 flex items-center gap-2 text-center text-sm text-[#cae0d9]"><RefreshCw className="h-4 w-4 animate-spin text-[#e8c565]" /> {message}</p>}
      <button onClick={onStart} disabled={scanning} className="gold-button mt-6 w-full max-w-lg rounded-2xl py-5 text-lg font-extrabold disabled:opacity-55">{scanning ? "Lendo QR Code..." : "Iniciar leitura"}</button>
    </main>
  );
}

function PinPad({ pin, setPin, onBack, onContinue, error }: { pin: string; setPin: (value: string) => void; onBack: () => void; onContinue: () => void; error?: string }) {
  const add = (digit: string) => setPin(pin.length < 4 ? `${pin}${digit}` : pin);
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-5 pb-8">
      <button onClick={onBack} className="outline-button mb-7 self-start rounded-xl p-3" aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></button>
      <ScreenHeading eyebrow="IDENTIFICAÇÃO SEGURA" title="Digite sua senha" description="Use o PIN da sua Wallet. Em seguida, confirmaremos sua identidade pela câmera." />
      <div className="mt-8 flex w-full justify-center gap-3 rounded-2xl border border-[#e7bd5c]/25 bg-[#b37b1c]/15 px-6 py-5">
        {[0, 1, 2, 3].map(index => <span key={index} className={`grid h-4 w-4 place-items-center rounded-full border ${pin.length > index ? "border-[#f5d77f] bg-[#f5d77f]" : "border-[#8ba9a1]"}`} />)}
      </div>
      {error && <p className="mt-3 flex items-center gap-2 text-sm text-red-200"><CircleAlert className="h-4 w-4" /> {error}</p>}
      <div className="mt-7 grid w-full grid-cols-3 gap-3 sm:gap-4">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "←", "0", "✓"].map(key => (
          <button key={key} onClick={() => key === "←" ? setPin(pin.slice(0, -1)) : key === "✓" ? onContinue() : add(key)} className={`keypad-button aspect-square rounded-full text-3xl font-semibold text-white ${key === "✓" ? "bg-[#d09b2a]" : ""}`} aria-label={key === "←" ? "Apagar" : key === "✓" ? "Continuar" : `Tecla ${key}`}>{key}</button>
        ))}
      </div>
      <button onClick={onContinue} disabled={pin.length !== 4} className="gold-button mt-7 w-full rounded-2xl py-5 text-lg font-extrabold disabled:opacity-40">Continuar para validação facial</button>
    </main>
  );
}

function FaceValidation({ onBack, onValidate, scanning, result, startCamera, videoRef, cameraError }: { onBack: () => void; onValidate: () => void; scanning: boolean; result: "success" | "failed" | null; startCamera: () => void; videoRef: React.RefObject<HTMLVideoElement | null>; cameraError: string | null }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-5 pb-8">
      <button onClick={onBack} className="outline-button mb-5 self-start rounded-xl p-3" aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></button>
      <ScreenHeading eyebrow="CONFIRMAÇÃO DE IDENTIDADE" title={result === "success" ? "Identidade confirmada" : result === "failed" ? "Não foi possível confirmar" : "Posicione seu rosto"} description={result === "success" ? "Tudo certo. Agora escolha a bebida para continuar." : result === "failed" ? "Aproxime-se da câmera, evite contraluz e tente novamente." : "Centralize seu rosto na moldura. Não salvamos a imagem após a validação."} />
      <div className={`scan-frame mt-7 grid aspect-[4/3] w-full max-w-lg place-items-center overflow-hidden rounded-[2rem] bg-[#061e23] ${result === "success" ? "border-[#6ef2c5]" : result === "failed" ? "border-red-400" : ""}`}>
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover opacity-80" />
        {!scanning && !result && <button onClick={startCamera} className="outline-button absolute rounded-xl px-5 py-3 font-bold"><Camera className="mr-2 inline h-4 w-4" /> Ativar câmera</button>}
        {cameraError && <div className="absolute inset-x-5 bottom-5 rounded-xl bg-red-950/80 p-3 text-center text-sm text-red-100">{cameraError}</div>}
        {!scanning && !result && <div className="absolute pointer-events-none inset-[12%] rounded-[35%] border-2 border-[#3beab1]/60" />}
        {scanning && <div className="absolute inset-0 grid place-items-center bg-[#06242a]/40"><ScanFace className="h-16 w-16 animate-pulse text-[#74f4c7]" /></div>}
        {result === "success" && <div className="absolute inset-0 grid place-items-center bg-[#073d35]/70"><CircleCheck className="h-20 w-20 text-[#84f4cb]" /></div>}
        {result === "failed" && <div className="absolute inset-0 grid place-items-center bg-red-950/65"><CircleX className="h-20 w-20 text-red-200" /></div>}
      </div>
      <div className="mt-6 w-full max-w-lg">
        {result === "success" ? <button onClick={onValidate} className="gold-button w-full rounded-2xl py-5 text-lg font-extrabold">Continuar <ChevronRight className="ml-1 inline h-5 w-5" /></button> : <button onClick={onValidate} disabled={scanning} className="gold-button w-full rounded-2xl py-5 text-lg font-extrabold disabled:opacity-55">{scanning ? "Validando identidade..." : result === "failed" ? "Tentar novamente" : "Confirmar identidade"}</button>}
      </div>
    </main>
  );
}

function ProductSelection({ selected, setSelected, onContinue, onBack }: { selected: Product; setSelected: (product: Product) => void; onContinue: () => void; onBack: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 pb-8 md:px-9">
      <button onClick={onBack} className="outline-button mb-7 w-fit rounded-xl p-3" aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></button>
      <ScreenHeading eyebrow="PASSO 1 DE 3" title="Escolha sua bebida" description="Selecione uma opção disponível nesta torneira." />
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {PRODUCTS.map((product, index) => <button key={product.id} onClick={() => setSelected(product)} className={`option-card relative overflow-hidden rounded-[1.7rem] p-5 text-left ${selected.id === product.id ? "selected" : ""}`} style={{ animationDelay: `${index * 60}ms` }}>
          <div className="absolute -right-9 -top-9 h-28 w-28 rounded-full opacity-25 blur-2xl" style={{ background: product.accent }} />
          <div className="relative flex items-center justify-between"><div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/15 bg-white/7" style={{ color: product.accent }}><Wine className="h-6 w-6" /></div>{selected.id === product.id && <BadgeCheck className="h-6 w-6 text-[#e9c15c]" />}</div>
          <h2 className="relative mt-7 text-2xl font-bold text-[#f7f4ec]">{product.name}</h2><p className="relative mt-2 min-h-14 text-sm leading-relaxed text-[#bdd2cc]">{product.description}</p>
          <div className="relative mt-6 flex items-center justify-between border-t border-white/10 pt-4"><span className="text-xs font-bold tracking-wide text-[#8fb8ad]">POR 100 ML</span><span className="text-xl font-extrabold text-[#eed27a]">{formatCurrency(product.pricePer100mlCents)}</span></div>
        </button>)}
      </div>
      <button onClick={onContinue} className="gold-button mx-auto mt-8 w-full max-w-md rounded-2xl py-5 text-lg font-extrabold">Escolher tamanho <ChevronRight className="ml-1 inline h-5 w-5" /></button>
    </main>
  );
}

function CupSelection({ product, cupSize, setCupSize, onContinue, onBack }: { product: Product; cupSize: number; setCupSize: (size: number) => void; onContinue: () => void; onBack: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-5 pb-8 md:px-9">
      <button onClick={onBack} className="outline-button mb-7 w-fit rounded-xl p-3" aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></button>
      <ScreenHeading eyebrow="PASSO 2 DE 3" title="Qual tamanho vai hoje?" description={`${product.name} · ${formatCurrency(product.pricePer100mlCents)} por 100 ml`} />
      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {CUP_SIZES.map((size, index) => <button key={size} onClick={() => setCupSize(size)} className={`option-card group rounded-[1.7rem] p-4 text-center ${cupSize === size ? "selected" : ""}`}>
          <div className="mx-auto flex h-24 items-end justify-center"><div className="relative w-12 rounded-b-xl border-x border-b border-white/60 bg-white/8" style={{ height: `${42 + index * 12}px` }}><div className="absolute inset-x-0 bottom-0 rounded-b-xl bg-[#e6b74a]/80" style={{ height: "72%" }} /></div></div>
          <div className="mt-4 text-2xl font-extrabold text-[#f7f3e6]">{size}<span className="ml-1 text-base font-semibold text-[#9ac7bb]">ml</span></div><div className="mt-1 text-sm font-bold text-[#e8c766]">{formatCurrency(calculateValueCents(size, product.pricePer100mlCents))}</div>
        </button>)}
      </div>
      <div className="screen-card mx-auto mt-7 flex w-full max-w-md items-center justify-between rounded-2xl px-5 py-4"><div><p className="text-xs font-bold tracking-wide text-[#91b9ae]">VALOR A DEBITAR</p><p className="mt-1 text-lg font-semibold">{cupSize} ml de {product.name}</p></div><p className="text-2xl font-extrabold text-[#efcf70]">{formatCurrency(calculateValueCents(cupSize, product.pricePer100mlCents))}</p></div>
      <button onClick={onContinue} className="gold-button mx-auto mt-6 w-full max-w-md rounded-2xl py-5 text-lg font-extrabold">Revisar pedido <ChevronRight className="ml-1 inline h-5 w-5" /></button>
    </main>
  );
}

function PurchaseConfirmation({ product, cupSize, onBack, onConfirm, loading }: { product: Product; cupSize: number; onBack: () => void; onConfirm: () => void; loading: boolean }) {
  const total = calculateValueCents(cupSize, product.pricePer100mlCents);
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 pb-8">
      <button onClick={onBack} className="outline-button mb-7 w-fit rounded-xl p-3" aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></button>
      <ScreenHeading eyebrow="PASSO 3 DE 3" title="Revise seu pedido" description="A confirmação exige que você mantenha o botão pressionado, evitando acionamentos acidentais." />
      <section className="screen-card mt-8 rounded-[2rem] p-6">
        <div className="flex items-center gap-4 border-b border-white/10 pb-5"><div className="grid h-16 w-16 place-items-center rounded-2xl bg-[#0e5350] text-[#dfb95a]"><GlassWater className="h-8 w-8" /></div><div><p className="text-xl font-bold">{product.name}</p><p className="text-sm text-[#b8d0c9]">{product.style} · {product.abv} ABV</p></div></div>
        <dl className="mt-5 space-y-4"><div className="flex items-center justify-between"><dt className="text-[#a8c2ba]">Volume selecionado</dt><dd className="font-bold">{cupSize} ml</dd></div><div className="flex items-center justify-between"><dt className="text-[#a8c2ba]">Preço por 100 ml</dt><dd className="font-bold">{formatCurrency(product.pricePer100mlCents)}</dd></div><div className="flex items-center justify-between border-t border-white/10 pt-4 text-xl"><dt className="font-bold">Total na Wallet</dt><dd className="font-extrabold text-[#f0ce70]">{formatCurrency(total)}</dd></div></dl>
      </section>
      <div className="mt-6"><HoldConfirmButton onComplete={onConfirm} disabled={loading} /></div>
      {loading && <p className="mt-4 text-center text-sm text-[#a9d6c8]"><Radio className="mr-2 inline h-4 w-4 animate-pulse" /> Solicitando autorização da torneira...</p>}
    </main>
  );
}

function Pouring({ product, cupSize, poured, isPouring, onStart, onStop, onEmergency }: { product: Product; cupSize: number; poured: number; isPouring: boolean; onStart: (event: ReactPointerEvent<HTMLButtonElement>) => void; onStop: () => void; onEmergency: () => void }) {
  const percentage = Math.min(100, (poured / cupSize) * 100);
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-5 pb-8 md:px-9">
      <div className="grid items-center gap-8 lg:grid-cols-[.85fr_1.15fr]">
        <div className="order-2 text-center lg:order-1 lg:text-left"><p className="text-xs font-bold tracking-[.2em] text-[#e5bc59]">DISPENSAÇÃO EM ANDAMENTO</p><h1 className="mt-3 font-[Playfair_Display] text-5xl font-extrabold text-[#f8f4e9]">Sirva no seu ritmo.</h1><p className="mt-4 text-lg leading-relaxed text-[#c6d9d3]">Segure o botão enquanto quiser servir. O sistema encerra automaticamente no limite autorizado.</p>
          <div className="mt-6 grid grid-cols-2 gap-3"><div className="screen-card rounded-2xl p-4"><p className="text-xs font-bold tracking-wide text-[#8db6aa]">SERVIDO</p><p className="mt-1 text-3xl font-extrabold">{Math.round(poured)}<span className="ml-1 text-base text-[#a9c7bc]">ml</span></p></div><div className="screen-card rounded-2xl p-4"><p className="text-xs font-bold tracking-wide text-[#8db6aa]">VALOR ATUAL</p><p className="mt-1 text-3xl font-extrabold text-[#efca68]">{formatCurrency(calculateValueCents(poured, product.pricePer100mlCents))}</p></div></div>
        </div>
        <div className="order-1 flex flex-col items-center lg:order-2"><div className="relative"><div className="absolute -top-4 left-1/2 flex -translate-x-1/2 gap-3"><i className="steam h-5 w-1 rounded-full bg-white/45" /><i className="steam h-6 w-1 rounded-full bg-white/35" /><i className="steam h-4 w-1 rounded-full bg-white/45" /></div><CupIllustration level={percentage} /></div>
          <div className="mt-5 w-full max-w-sm"><div className="h-3 overflow-hidden rounded-full border border-white/20 bg-black/30"><div className="h-full rounded-full bg-gradient-to-r from-[#bf8119] via-[#f0c453] to-[#fff1b2] transition-all duration-150" style={{ width: `${percentage}%` }} /></div><div className="mt-2 flex justify-between text-xs font-bold tracking-wide text-[#9ec6bb]"><span>{Math.round(percentage)}% COMPLETO</span><span>{Math.max(0, cupSize - Math.round(poured))} ML RESTANTES</span></div></div>
          <button onPointerDown={onStart} onPointerUp={onStop} onPointerLeave={onStop} onPointerCancel={onStop} className={`mt-7 flex h-28 w-28 items-center justify-center rounded-full border-4 text-center text-sm font-extrabold tracking-wide transition duration-150 active:scale-95 ${isPouring ? "border-[#fff0b0] bg-[#c98e22] text-[#112c2f] shadow-[0_0_0_12px_rgba(236,186,76,.15),0_0_46px_rgba(231,176,51,.55)]" : "border-[#6eedc2] bg-[#0d5c53] text-[#e6faf2] shadow-[0_0_0_12px_rgba(74,220,171,.12)]"}`}>{isPouring ? "SOLTE\nPARA PARAR" : "SEGURE\nPARA SERVIR"}</button>
          <button onClick={onEmergency} className="mt-5 flex items-center gap-2 text-sm font-bold text-red-200 hover:text-red-100"><AlertTriangle className="h-4 w-4" /> Parada de emergência</button>
        </div>
      </div>
    </main>
  );
}

function Completed({ product, poured, onReset }: { product: Product; poured: number; onReset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-5 pb-8 text-center">
      <div className="grid h-24 w-24 place-items-center rounded-full border border-[#83f0c8]/35 bg-[#0f695d]/50 text-[#8cf1c9] shadow-[0_0_0_13px_rgba(66,230,173,.08)]"><Check className="h-12 w-12" /></div>
      <p className="mt-9 text-xs font-bold tracking-[.2em] text-[#e8c265]">TUDO CERTO</p><h1 className="mt-3 font-[Playfair_Display] text-5xl font-extrabold text-[#f8f4e9]">Aproveite o seu chopp.</h1><p className="mt-4 text-lg text-[#c4d9d2]">{Math.round(poured)} ml de {product.name} foram registrados na sua Wallet.</p>
      <div className="screen-card mt-8 w-full rounded-2xl p-5"><p className="text-sm text-[#9ebdb5]">Valor debitado</p><p className="mt-1 text-3xl font-extrabold text-[#edcb70]">{formatCurrency(calculateValueCents(poured, product.pricePer100mlCents))}</p></div>
      <button onClick={onReset} className="gold-button mt-8 w-full rounded-2xl py-5 text-lg font-extrabold">Nova compra</button>
    </main>
  );
}

function StateNotice({ offline, onRetry, onReset }: { offline: boolean; onRetry: () => void; onReset: () => void }) {
  return <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-5 pb-8 text-center"><div className={`grid h-24 w-24 place-items-center rounded-full border ${offline ? "border-[#efc46d]/35 bg-[#8c5a16]/25 text-[#f7ce77]" : "border-red-300/35 bg-red-950/35 text-red-200"}`}>{offline ? <WifiOff className="h-11 w-11" /> : <CircleX className="h-11 w-11" />}</div><h1 className="mt-8 font-[Playfair_Display] text-5xl font-extrabold">{offline ? "Estamos sem conexão." : "Atendimento interrompido."}</h1><p className="mt-4 max-w-md text-lg leading-relaxed text-[#c4d8d2]">{offline ? "Por segurança, novas dispensações ficam bloqueadas até que a comunicação com o servidor seja restabelecida." : "A torneira foi bloqueada por segurança. Nenhum novo acionamento será feito nesta sessão."}</p><div className="mt-8 flex w-full flex-col gap-3 sm:flex-row"><button onClick={onReset} className="outline-button flex-1 rounded-2xl py-4 font-bold">Voltar ao início</button><button onClick={onRetry} className="gold-button flex-1 rounded-2xl py-4 font-extrabold">{offline ? "Tentar reconectar" : "Restabelecer totem"}</button></div></main>;
}

export default function Home() {
  const [state, setState] = useState<TotemState>("idle");
  const [authMode, setAuthMode] = useState<AuthMode>("wallet");
  const [connection, setConnection] = useState<StatusKind>(navigator.onLine ? "online" : "offline");
  const [nonce, setNonce] = useState(() => createNonce());
  const [pin, setPin] = useState("");
  const [authError, setAuthError] = useState<string | undefined>();
  const [faceResult, setFaceResult] = useState<"success" | "failed" | null>(null);
  const [scanning, setScanning] = useState(false);
  const [product, setProduct] = useState(PRODUCTS[0]);
  const [cupSize, setCupSize] = useState<number>(300);
  const [sessionId, setSessionId] = useState("");
  const [authorizing, setAuthorizing] = useState(false);
  const [poured, setPoured] = useState(0);
  const [isPouring, setIsPouring] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const qrVideoRef = useRef<HTMLVideoElement | null>(null);
  const qrScannerControls = useRef<IScannerControls | null>(null);
  const [qrScanning, setQrScanning] = useState(false);
  const [qrScanMessage, setQrScanMessage] = useState<string | null>(null);
  const closing = useRef(false);

  const qrValue = useMemo(() => `maverick://tap/${TAP_ID}?totem=${TOTEM_ID}&nonce=${nonce}&t=${Math.floor(Date.now() / 1000)}`, [nonce]);
  const total = calculateValueCents(cupSize, product.pricePer100mlCents);

  const move = (next: TotemState) => {
    if (canTransition(state, next)) setState(next);
  };
  const stopCamera = () => { cameraStream.current?.getTracks().forEach(track => track.stop()); cameraStream.current = null; };
  const stopQrScanner = () => { qrScannerControls.current?.stop(); qrScannerControls.current = null; setQrScanning(false); };
  const reset = () => { stopCamera(); stopQrScanner(); setState("idle"); setPin(""); setAuthError(undefined); setFaceResult(null); setPoured(0); setIsPouring(false); setSessionId(""); setAuthorizing(false); closing.current = false; setQrScanMessage(null); setNonce(createNonce()); };
  const refreshQr = () => setNonce(createNonce());

  useEffect(() => {
    const online = () => { setConnection("online"); if (state === "offline") setState("idle"); flushPendingFinished(); };
    const offline = () => { setConnection("offline"); if (state !== "idle" && state !== "completed" && state !== "error") setState("offline"); };
    window.addEventListener("online", online); window.addEventListener("offline", offline);
    flushPendingFinished();
    const heartbeat = window.setInterval(() => { if (navigator.onLine) tapApi.heartbeat().catch(() => undefined); }, 30000);
    const refresh = window.setInterval(refreshQr, 25000);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); window.clearInterval(heartbeat); window.clearInterval(refresh); stopCamera(); stopQrScanner(); };
  }, []);

  useEffect(() => {
    if (state !== "pouring") return;
    const poll = window.setInterval(async () => {
      try {
        const command = await tapApi.getCommand();
        if (command.command?.type === "emergency_stop" || command.status === "offline") {
          setIsPouring(false); setState(command.status === "offline" ? "offline" : "error");
        }
      } catch { setConnection("offline"); setIsPouring(false); setState("offline"); }
    }, 1500);
    return () => window.clearInterval(poll);
  }, [state]);

  useEffect(() => {
    if (state !== "pouring" || !isPouring) return;
    const stream = window.setInterval(() => setPoured(current => Math.min(cupSize, current + 3.6)), 100);
    return () => window.clearInterval(stream);
  }, [state, isPouring, cupSize]);

  const finishPour = async (errorCode?: string) => {
    if (closing.current || !sessionId) return;
    closing.current = true;
    setIsPouring(false);
    if (!errorCode) setState("finishing");
    const key = `${sessionId}-finished`;
    const payload = { session_id: sessionId, status: errorCode ? "error" : "finished", error_code: errorCode, volume_poured_ml: Math.round(poured), value_cents: calculateValueCents(poured, product.pricePer100mlCents), started_at: Math.floor(Date.now() / 1000), finished_at: Math.floor(Date.now() / 1000), metadata: { flow_rate_ml_per_sec: 36, simulator: true } };
    try { await tapApi.finished(payload, key); setState(errorCode ? "error" : "completed"); }
    catch { queuePendingFinished(payload, key); setState("offline"); }
    finally { closing.current = false; }
  };

  useEffect(() => { if (state === "pouring" && poured >= cupSize) finishPour(); }, [poured, cupSize, state]);

  const startCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) { setCameraError("Esta tela não tem acesso à câmera. Você pode testar o fluxo no simulador."); return; }
    try { const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 540 } }, audio: false }); cameraStream.current = stream; if (videoRef.current) videoRef.current.srcObject = stream; }
    catch { setCameraError("Não foi possível acessar a câmera. Verifique a permissão do navegador."); }
  };

  const toFace = () => { setAuthMode("face"); setPin(""); setAuthError(undefined); move("authenticating"); window.setTimeout(startCamera, 100); };
  const toWalletQr = () => { setAuthMode("wallet"); setAuthError(undefined); setQrScanMessage(null); move("authenticating"); };
  const startWalletQrScan = async () => {
    if (qrScanning || !qrVideoRef.current) return;
    setQrScanMessage(null);
    setQrScanning(true);
    const reader = new BrowserQRCodeReader();
    try {
      qrScannerControls.current = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } }, audio: false }, qrVideoRef.current, async (result) => {
        if (!result) return;
        stopQrScanner();
        setQrScanMessage("Validando autorização da Wallet...");
        try {
          const response = await tapApi.authorizeQr({ qr_payload: result.getText(), nonce, timestamp: Math.floor(Date.now() / 1000) });
          if (!response.authorized) { setQrScanMessage("O QR Code não é válido ou expirou. Tente novamente."); return; }
          setQrScanMessage(null);
          move("product_selection");
        } catch { setQrScanMessage("Não foi possível validar a Wallet. Verifique a conexão e tente novamente."); }
      });
    } catch { setQrScanning(false); setQrScanMessage("Não foi possível acessar a câmera. Verifique a permissão do navegador."); }
  };
  const validateFace = async () => {
    if (faceResult === "success") { stopCamera(); setFaceResult(null); move("product_selection"); return; }
    setScanning(true); setAuthError(undefined);
    const canvas = document.createElement("canvas"); canvas.width = videoRef.current?.videoWidth || 640; canvas.height = videoRef.current?.videoHeight || 480;
    const context = canvas.getContext("2d"); if (context && videoRef.current) context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const faceImage = context ? canvas.toDataURL("image/jpeg", .72) : "data:image/jpeg;base64,simulator";
    try {
      const response = await tapApi.authorizeFace({ pin: pin || "1234", face_image_base64: faceImage, nonce, timestamp: Math.floor(Date.now() / 1000) });
      setFaceResult(response.authorized ? "success" : "failed");
    } catch { setFaceResult("failed"); setConnection("offline"); }
    finally { setScanning(false); }
  };
  const continuePin = () => { if (pin.length !== 4) { setAuthError("Digite os quatro dígitos da sua senha."); return; } toFace(); };
  const authorizePurchase = async () => {
    setAuthorizing(true); const id = createSessionId(); setSessionId(id);
    try { await tapApi.open({ session_id: id, command: "open", max_volume_ml: cupSize, max_value_cents: total, timeout_sec: 60, product: { name: product.name, price_per_100ml_cents: product.pricePer100mlCents }, requested_at: Math.floor(Date.now() / 1000) }, `${id}-open`); move("authorized"); window.setTimeout(() => setState("pouring"), 750); }
    catch { setConnection("offline"); setState("offline"); }
    finally { setAuthorizing(false); }
  };
  const emergency = async () => { setIsPouring(false); try { await tapApi.emergencyStop(); } catch {} if (state === "pouring") finishPour("EMERGENCY_STOP"); else setState("error"); };
  const reconnect = async () => { try { await tapApi.getStatus(); setConnection("online"); reset(); } catch { setConnection("offline"); } };

  return <div className="maverick-shell flex min-h-screen flex-col"><TopBar connection={connection} onEmergency={emergency} />
    {state === "idle" && <QRIdle qrValue={qrValue} onRefresh={refreshQr} onWallet={toWalletQr} onFace={toFace} onPin={() => { setAuthMode("pin"); setAuthError(undefined); move("authenticating"); }} />}
    {state === "authenticating" && authMode === "wallet" && <WalletQRScan videoRef={qrVideoRef} scanning={qrScanning} message={qrScanMessage} onStart={startWalletQrScan} onBack={reset} />}
    {state === "authenticating" && authMode === "pin" && <PinPad pin={pin} setPin={setPin} error={authError} onBack={reset} onContinue={continuePin} />}
    {state === "authenticating" && authMode === "face" && <FaceValidation videoRef={videoRef} cameraError={cameraError} scanning={scanning} result={faceResult} startCamera={startCamera} onBack={reset} onValidate={validateFace} />}
    {state === "product_selection" && <ProductSelection selected={product} setSelected={setProduct} onBack={reset} onContinue={() => move("cup_selection")} />}
    {state === "cup_selection" && <CupSelection product={product} cupSize={cupSize} setCupSize={setCupSize} onBack={() => move("product_selection")} onContinue={() => move("confirming")} />}
    {state === "confirming" && <PurchaseConfirmation product={product} cupSize={cupSize} onBack={() => move("cup_selection")} onConfirm={authorizePurchase} loading={authorizing} />}
    {state === "authorized" && <main className="mx-auto flex flex-1 flex-col items-center justify-center px-5 text-center"><div className="grid h-20 w-20 place-items-center rounded-full bg-[#0e6258] text-[#81f3ca] animate-pulse"><ShieldCheck className="h-10 w-10" /></div><h1 className="mt-7 font-[Playfair_Display] text-5xl font-extrabold">Pronto para servir.</h1><p className="mt-4 text-lg text-[#c3d9d2]">Sua Wallet autorizou {formatCurrency(total)}. Prepare o copo.</p></main>}
    {state === "pouring" && <Pouring product={product} cupSize={cupSize} poured={poured} isPouring={isPouring} onStart={() => setIsPouring(true)} onStop={() => setIsPouring(false)} onEmergency={emergency} />}
    {state === "finishing" && <main className="mx-auto flex flex-1 flex-col items-center justify-center px-5 text-center"><RefreshCw className="h-12 w-12 animate-spin text-[#e8c464]" /><h1 className="mt-6 font-[Playfair_Display] text-4xl font-extrabold">Registrando sua dosagem...</h1><p className="mt-3 text-[#bfd5cd]">Aguarde só um instante.</p></main>}
    {state === "completed" && <Completed product={product} poured={poured} onReset={reset} />}
    {state === "offline" && <StateNotice offline onRetry={reconnect} onReset={reset} />}
    {state === "error" && <StateNotice offline={false} onRetry={reset} onReset={reset} />}
    <footer className="px-5 pb-5 text-center text-[10px] font-bold tracking-[.15em] text-[#5f887e]">MAVERICK SMART TAP · DISPENSAÇÃO CONTROLADA</footer>
  </div>;
}
