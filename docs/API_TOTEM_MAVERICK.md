# Totem Maverick Smart — Arquitetura e Contrato de Integração

## Visão operacional

O Totem Maverick foi estruturado como uma interface touchscreen de ponta e uma camada de integração REST. A interface conduz o cliente por um ciclo explícito de estados, enquanto a liberação física deve ser comandada e medida pelo Raspberry Pi. A camada REST presente nesta versão é um **simulador de contrato**, apropriado para desenvolvimento, validação de interface e testes integrados. A persistência definitiva de clientes, Wallet, credenciais, transações e sessões de venda continua pertencendo ao Servidor Maverick Smart.

| Camada | Responsabilidade | Persistência em produção |
|---|---|---|
| Interface touchscreen | QR Code, Face ID, PIN, escolha de produto, volume, confirmação e feedback operacional | Apenas estado efêmero e fila local de `finished` pendente |
| Raspberry Pi | Polling do comando, acionamento de solenoide, leitura do sensor e fail-safe fechado | Configuração local, logs e fila de encerramentos pendentes |
| Servidor Maverick | Autorização da Wallet, prevenção de duplicidade, auditoria, estoque e fechamento financeiro | Fonte de verdade central |
| Wallet | Identidade e saldo do cliente | Serviço da Wallet, nunca o Totem |

## Máquina de estados

| Estado | Entrada válida | Saídas válidas | Comportamento de segurança |
|---|---|---|---|
| `idle` | Inicialização ou sessão concluída | `authenticating`, `offline`, `error` | Exibe QR com nonce rotativo; não permite dispensação |
| `authenticating` | QR, PIN ou Face ID | `product_selection`, `offline`, `error` | Imagem facial é enviada e descartada; não é persistida |
| `product_selection` | Identidade aprovada | `cup_selection`, `idle` | Exibe somente produtos habilitados |
| `cup_selection` | Produto escolhido | `confirming` | Valor é calculado pelo preço recebido do produto |
| `confirming` | Copo escolhido | `authorized`, `offline`, `error` | Exige pressionar e segurar por 1,3 segundo |
| `authorized` | Abertura aceita pelo servidor | `pouring` | Torneira continua fechada até a sequência autorizada |
| `pouring` | Usuário segura o controle de servir | `finishing`, `offline`, `error` | Limite de volume encerra a operação automaticamente |
| `finishing` | Usuário solta ou alcança limite | `completed`, `offline`, `error` | Dispara `POST /finished` com chave idempotente |
| `offline` | Falha de rede | `idle`, `error` | Impede novas vendas; encerra o relé por fail-safe |
| `error` | Parada de emergência ou erro crítico | `idle`, `offline` | Mantém relé desligado e bloqueia novos comandos |

## Endpoints REST expostos

| Método e rota | Uso | Headers obrigatórios |
|---|---|---|
| `GET /api/public/tap/health` | Verificação simples da API | `X-Totem-ID` quando identificado |
| `GET /api/public/tap/:tapId/status` | Estado atual da torneira | `X-Totem-ID` |
| `GET /api/public/tap/:tapId/command` | Polling do Pi e da tela durante a dispensação | `X-Totem-ID` |
| `POST /api/public/tap/:tapId/open` | Criação da sessão autorizada | `X-Totem-ID`, `Idempotency-Key` |
| `POST /api/public/tap/:tapId/close` | Bloqueio normal da torneira | `X-Totem-ID`, `Idempotency-Key` |
| `POST /api/public/tap/:tapId/finished` | Resultado final ou erro de dispensação | `X-Totem-ID`, `Idempotency-Key` |
| `POST /api/public/tap/:tapId/heartbeat` | Telemetria e disponibilidade | `X-Totem-ID`, `Idempotency-Key` |
| `POST /api/public/tap/:tapId/emergency-stop` | Corte imediato por segurança | `X-Totem-ID`, `Idempotency-Key` |
| `POST /api/public/tap/:tapId/authorize/face` | Integração de PIN e imagem facial com a Wallet | `X-Totem-ID`, `Idempotency-Key` |
| `POST /api/public/tap/:tapId/authorize/qr` | Valida o QR Code de autorização da Wallet, nonce e tempo de expiração | `X-Totem-ID`, `Idempotency-Key` |

Cada `POST` é protegido por uma chave de idempotência. O cliente adota quatro tentativas com atrasos exponenciais de 0, 2, 4 e 8 segundos. Se o encerramento não puder ser entregue, a interface registra somente o payload operacional mínimo no `localStorage` e tenta reenviá-lo quando a conexão retorna. Em um Raspberry Pi de produção, esta fila deve ser implementada em SQLite local e sincronizada com o Servidor Maverick.

## Segurança e limites do simulador

A imagem facial é capturada somente para compor o payload de integração e é descartada após a tentativa. A câmera também lê QR Codes exibidos pela Wallet; no simulador, a rota valida formato, nonce e janela de tempo, mas a assinatura criptográfica do QR e a associação com o usuário precisam ser verificadas no servidor central. Esta implementação não contém motor biométrico, adquirente de cartão, saldo real da Wallet ou driver GPIO. No modo de desenvolvimento, o endpoint de Face ID usa o PIN `250712` apenas para permitir a validação visual ponta a ponta; ele deve ser substituído pela chamada autenticada ao serviço central antes de qualquer operação real. O Pi deve manter a saída do solenoide em estado fechado se perder conectividade, se o sensor falhar ou se receber uma parada de emergência.
