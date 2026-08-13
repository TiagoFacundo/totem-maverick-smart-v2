import { AlertTriangle, ArrowLeft, BookOpenText, CheckCircle2, CircuitBoard, CloudCog, Cpu, Fingerprint, KeyRound, Radio, ShieldCheck, Smartphone, TestTube2, Wrench } from "lucide-react";
import { Link } from "wouter";

const endpoints = [
  ["GET", "/health", "Disponibilidade do serviço"],
  ["GET", "/:tapId/status", "Estado, sessão e relé"],
  ["GET", "/:tapId/command", "Polling de start_pour e emergency_stop"],
  ["POST", "/:tapId/open", "Cria sessão autorizada com limites"],
  ["POST", "/:tapId/finished", "Registra medição e encerra a sessão"],
  ["POST", "/:tapId/authorize/face", "Reconhecimento e PIN da Wallet"],
  ["POST", "/:tapId/authorize/qr", "Autorização por QR Code"],
];

const states = [
  ["IDLE", "Produto, PDV, QR Code e métodos de entrada."],
  ["FACE ID", "Captura, reconhecimento facial e senha da Wallet."],
  ["SERVINDO", "Sessão oficial, volume, valor e limite autorizado."],
  ["CONCLUÍDA", "Resumo final e retorno programado ao início."],
  ["OFFLINE / ERRO", "Bloqueio da operação e retorno seguro."],
];

const safetyControls = [
  "X-Totem-ID e Idempotency-Key obrigatórios nos comandos protegidos.",
  "Retry do navegador em 0, 2, 4 e 8 segundos para chamadas REST.",
  "Fila local de finished no navegador e no Raspberry Pi em caso de rede indisponível.",
  "Relé desligado antes de qualquer comunicação de encerramento.",
  "Corte por volume, valor, timeout, perda de comando, E-stop e falhas consecutivas de polling.",
];

function SectionTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return <header className="docs-section-title"><span>{eyebrow}</span><h2>{title}</h2>{children}</header>;
}

export default function Docs() {
  return <main className="docs-page">
    <div className="docs-topbar">
      <Link href="/" className="docs-back"><ArrowLeft /> Voltar ao totem</Link>
      <div className="docs-version"><span /> Documentação técnica · v1.0.0</div>
    </div>

    <section className="docs-hero" aria-labelledby="docs-title">
      <div className="docs-hero-mark"><BookOpenText /></div>
      <p className="docs-eyebrow">MAVERICK SMART TAP</p>
      <h1 id="docs-title">Documentação técnica</h1>
      <p>Guia consolidado da interface de autoatendimento, contrato de integração, controle físico de dispensação e proteções operacionais implementadas.</p>
      <div className="docs-chip-row"><span>React + TypeScript</span><span>Express REST</span><span>Raspberry Pi</span><span>27 testes aprovados</span></div>
    </section>

    <nav className="docs-nav" aria-label="Índice da documentação">
      <a href="#arquitetura">Arquitetura</a><a href="#fluxos">Fluxos</a><a href="#api">API REST</a><a href="#seguranca">Segurança</a><a href="#operacao">Operação</a><a href="#limites">Limitações</a>
    </nav>

    <section className="docs-section" id="arquitetura">
      <SectionTitle eyebrow="01 · VISÃO GERAL" title="Arquitetura por responsabilidade"><p>O totem apresenta os fluxos, o servidor autoriza a sessão e o Raspberry Pi controla fisicamente a válvula. A Wallet, a biometria, estoque e pagamento definitivos pertencem ao backend central.</p></SectionTitle>
      <div className="docs-architecture">
        <article><Smartphone /><strong>Totem touchscreen</strong><p>Interface vertical de 7", QR Code, Face ID, senha, cartão, sessão e estados de rede.</p></article>
        <article><CloudCog /><strong>Servidor Maverick</strong><p>Contrato REST, sessão, limites, comandos, idempotência e telemetria.</p></article>
        <article><CircuitBoard /><strong>Raspberry Pi</strong><p>Polling, GPIO, sensor de fluxo, limites físicos e envio idempotente de encerramento.</p></article>
      </div>
      <div className="docs-flowline" aria-label="Fluxo de arquitetura"><span>Cliente</span><i>→</i><span>Totem</span><i>→</i><span>Servidor</span><i>→</i><span>Pi / relé</span><i>→</i><span>Solenoide</span></div>
    </section>

    <section className="docs-section docs-panel" id="fluxos">
      <SectionTitle eyebrow="02 · EXPERIÊNCIA" title="Estados e fluxos do totem"><p>A confirmação intermediária foi removida: o totem aguarda a autorização do servidor e só inicia a retirada após existir uma sessão autorizada.</p></SectionTitle>
      <div className="docs-state-grid">
        {states.map(([name, description], index) => <article key={name}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{name}</h3><p>{description}</p></div></article>)}
      </div>
      <div className="docs-flow-columns">
        <article><Fingerprint /><h3>Face ID → retirada</h3><ol><li>O totem envia a captura com nonce.</li><li>O servidor confirma a identidade e emite `face_token`.</li><li>O usuário informa a senha Wallet.</li><li>O servidor devolve `session_id`, cliente e limites.</li><li>O totem abre a sessão e vai para <strong>Servindo seu chopp</strong>.</li></ol></article>
        <article><KeyRound /><h3>QR Code e cartão</h3><p>O QR Code é rotativo e recebe autorização pelo servidor. O cartão mantém sua tela de cadastro e solicitação de sessão existente. Os dois caminhos preservam o contrato de abertura e o polling de comando.</p></article>
      </div>
    </section>

    <section className="docs-section" id="api">
      <SectionTitle eyebrow="03 · INTEGRAÇÃO" title="Contrato REST do Totem"><p>As operações da torneira são protegidas por identificação do totem. Todo `POST` requer uma chave de idempotência; a resposta repetida é reutilizada pelo servidor.</p></SectionTitle>
      <div className="docs-api-notice"><Radio /><p><strong>Comando de dispensação:</strong> o servidor publica `start_pour` com sessão, volume máximo, valor máximo e produto. O Raspberry Pi só liga o relé após receber esse comando.</p></div>
      <div className="docs-table-wrap"><table><thead><tr><th>Método</th><th>Rota</th><th>Finalidade</th></tr></thead><tbody>{endpoints.map(([method, route, purpose]) => <tr key={`${method}-${route}`}><td><code className={`method-${method.toLowerCase()}`}>{method}</code></td><td><code>/api/public/tap{route}</code></td><td>{purpose}</td></tr>)}</tbody></table></div>
      <div className="docs-code"><span>Exemplo de resposta autorizada</span><pre>{`{
  "type": "start_pour",
  "session_id": "wallet-...",
  "max_volume_ml": 1000,
  "max_value_cents": 10000
}`}</pre></div>
    </section>

    <section className="docs-section docs-panel" id="seguranca">
      <SectionTitle eyebrow="04 · CONTROLES" title="Segurança e resiliência"><p>As proteções de software evitam continuidade indevida de dispensação, mas não substituem o circuito elétrico de segurança.</p></SectionTitle>
      <div className="docs-safety"><div className="docs-safety-icon"><ShieldCheck /></div><ul>{safetyControls.map(item => <li key={item}><CheckCircle2 />{item}</li>)}</ul></div>
      <blockquote><AlertTriangle /> A válvula nunca deve ser alimentada diretamente pelo GPIO. O circuito deve usar relé ou driver adequado, fonte própria e botão E-stop físico normalmente fechado.</blockquote>
    </section>

    <section className="docs-section" id="operacao">
      <SectionTitle eyebrow="05 · CAMADA FÍSICA" title="Raspberry Pi e operação de bancada"><p>O agente Python inicia com o relé desligado, consulta o comando a cada 0,5 s e mede a vazão por pulsos do sensor.</p></SectionTitle>
      <div className="docs-operation-grid">
        <article><Cpu /><h3>Configuração</h3><p>GPIO de relé 17, sensor 27, 450 pulsos/L e timeout de 90 s são padrões configuráveis por variáveis de ambiente.</p></article>
        <article><Wrench /><h3>Instalação</h3><p>Instale `gpiozero`, configure o arquivo de ambiente e habilite o serviço `maverick-solenoid` pelo systemd.</p></article>
        <article><TestTube2 /><h3>Calibração</h3><p>Valide relé sem carga e calibre `FLOW_PULSES_PER_LITER` com volume conhecido antes de conectar bebida.</p></article>
      </div>
    </section>

    <section className="docs-section docs-limits" id="limites">
      <SectionTitle eyebrow="06 · HOMOLOGAÇÃO" title="Limitações atuais e próximos passos"><p>A aplicação está pronta para desenvolvimento e validação de contrato. Os itens abaixo devem ser concluídos para uso comercial.</p></SectionTitle>
      <div className="docs-limit-grid"><article><h3>Wallet e biometria</h3><p>O Face ID e o PIN `250712` são simulados. Integre câmera, prova de vida, serviço biométrico e Wallet real.</p></article><article><h3>Pagamento e catálogo</h3><p>Cartão, estoque, preço e PDV ainda precisam de backends produtivos, tokenização e regras financeiras centrais.</p></article><article><h3>Segurança física</h3><p>Homologue elétrica, fonte, relé, E-stop, sensor e cenários de falha com profissional habilitado.</p></article></div>
      <footer className="docs-footer"><BookOpenText /><p>Versão canônica detalhada: <code>docs/DOCUMENTACAO_TECNICA_COMPLETA.md</code>.</p></footer>
    </section>
  </main>;
}
