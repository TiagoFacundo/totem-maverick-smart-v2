# Totem Maverick Smart — Análise de Status da Implementação

**Projeto:** Totem Maverick Smart  
**Base analisada:** versão do projeto com página `/docs`, interface de totem, simulador REST e agente Raspberry Pi  
**Classificação geral:** **base de desenvolvimento e homologação**, ainda não liberada para operação comercial.

## Resumo executivo

O Totem Maverick Smart possui uma **base funcional de ponta a ponta para desenvolvimento**: a interface touchscreen de 7 polegadas está implementada, os fluxos de QR Code, Face ID e cartão existem, há um contrato REST simulável, o agente de Raspberry Pi foi preparado para controlar a solenoide com fail-safe e a documentação técnica está disponível tanto no repositório quanto na rota `/docs`. A última execução local confirmou checagem TypeScript e **28 testes em 9 arquivos de teste**.[1] [2]

O principal ponto de atenção é a diferença entre **fluxo implementado** e **operação real**. Wallet, biometria, PIN, pagamentos por cartão, catálogo, estoque, banco operacional e instalação física ainda usam simulação, dados fixos ou preparação de código. Portanto, o sistema já é adequado para demonstrar a experiência e homologar contratos e hardware em bancada, mas exige integrações e validações adicionais antes de atender clientes.

> **Conclusão:** a experiência de totem e o núcleo de segurança operacional estão construídos; o próximo ciclo deve concentrar-se em integrar os serviços centrais reais e homologar o conjunto elétrico e hidráulico.

## Painel de situação

| Frente | Situação | Evidência | Leitura de prontidão |
|---|---|---|---|
| Interface de totem | Implementada | Telas IDLE, Face ID, senha, cartão, dispensação, finalização, offline e erro | Pronta para demonstração e ajustes visuais |
| Fluxo Face ID | Implementado com simulador | Reconhecimento, PIN `250712` de teste, sessão e limites autorizados | Requer biometria e Wallet reais |
| QR Code da Wallet | Implementado como fluxo de contrato | Nonce, validade temporal, autorização e polling | Requer assinatura, uso único e vínculo à Wallet produtiva |
| Cartão | Parcial | Tela de coleta e caminho de sessão | Não é meio de pagamento real |
| API de dispensação | Implementada como simulador | Headers, idempotência, sessão, comando e encerramento | Requer servidor central persistente |
| Raspberry Pi/solenoide | Código implementado | GPIO, fluxo, limites, fail-safe e fila local | Requer montagem, calibração e homologação elétrica |
| Segurança e resiliência | Parcialmente implementadas | Retry, filas, limites, E-stop lógico e desligamento seguro | Requer credenciais fortes, observabilidade e E-stop físico homologado |
| Testes e documentação | Implementados | 28 testes locais, documentação técnica e página `/docs` | Ainda requer testes integrados com componentes reais |

## O que já foi implementado

### Experiência de autoatendimento

A aplicação React fornece um fluxo touchscreen compacto para display vertical de 7 polegadas. A tela inicial apresenta o produto de demonstração, métricas, PDV, conectividade, QR Code e os caminhos de Face ID e cartão. A máquina de estados contempla também telas de atendimento em curso, encerramento, indisponibilidade de rede e erro de segurança.[3]

O antigo passo intermediário de confirmação foi removido do totem. O dispositivo aguarda a autorização do servidor e inicia a dispensação quando recebe `start_pour`, sem criar uma etapa local que duplique a decisão da Wallet ou do back-end.[3] [4]

| Fluxo | Comportamento atual |
|---|---|
| QR Code | Gera nonce rotativo; na simulação de leitura solicita autorização e aguarda comando autorizado do servidor |
| Face ID | Captura facial simulada, reconhecimento, senha, validação de cliente/limites e abertura da tela **Servindo seu chopp** |
| Senha inválida | Mantém a tela de senha e exibe mensagem de orientação; não retorna ao IDLE |
| Face ID não reconhecido | Não exibe a senha e reinicia o fluxo de forma segura |
| Cartão | Coleta dados cadastrais e usa o fluxo de sessão existente, sem cobrança real |
| Dispensação | Mostra sessão, volume, valor e limites; encerra ao atingir limite físico, financeiro ou de tempo |

### Face ID, senha e retirada da bebida

O caminho de sucesso do Face ID foi refinado para evitar o retorno indevido ao início. Após reconhecimento e PIN aprovado, o totem exige uma resposta de autorização com `session_id`, identificação do cliente, `max_value_cents` e `max_volume_ml`. Em seguida, solicita a abertura idempotente e entra diretamente na tela **Servindo seu chopp**, usando a sessão oficial devolvida pelo servidor.[3] [4]

O PIN `250712` é deliberadamente uma credencial de desenvolvimento do simulador. Ele permite testar o encadeamento da interface, mas não representa um mecanismo de autenticação utilizável em produção.[5]

### Contrato REST e controles de comunicação

O cliente REST aplica `X-Totem-ID` em chamadas operacionais, cria `Idempotency-Key` nos `POST`, tenta novamente requisições com espera de 0, 2, 4 e 8 segundos e mantém uma fila local de `finished` quando ocorre indisponibilidade de rede.[6] O simulador cobre autorização por Face ID e QR, abertura, fechamento, telemetria, parada de emergência, comando de dispensação e conclusão da sessão.[5]

| Controle existente | Benefício prático | Limite atual |
|---|---|---|
| Idempotência | Reduz duplicidade em abertura, fechamento e encerramento | Cache do simulador está em memória |
| Polling de comando | Mantém o totem e o Pi alinhados com o servidor | Exige API central estável e observável |
| Fila de `finished` | Preserva o encerramento após queda de rede | Requer reconciliação e auditoria no servidor real |
| Limite de volume/valor | Restringe o serviço às permissões da sessão | Depende de dados confiáveis vindos do back-end |
| E-stop lógico | Interrompe o ciclo via API | Não substitui o botão físico normalmente fechado |

### Agente físico no Raspberry Pi

O agente Python de solenoide é separado do processo web e já contém a lógica necessária para uma bancada: parte com relé desligado, consulta `/command`, acompanha pulsos de vazão, calcula volume e valor e fecha o relé antes de qualquer comunicação externa no encerramento.[7]

As condições de fechamento já previstas incluem limite de volume, limite financeiro, timeout, E-stop, retirada de comando, troca de sessão, falhas repetidas de polling e indisponibilidade no envio de `finished`. Encerramentos não entregues são preservados localmente para reenvio.[7]

### Qualidade, documentação e rastreabilidade

O projeto possui cobertura de contrato REST, idempotência, cliente de comunicação, fila de finalizações, interface, regressões de Face ID, QR Code, cartão e rota `/docs`. A verificação atual é `pnpm check && pnpm test`, com 28 testes aprovados em 9 arquivos.[1] [2]

Além do arquivo técnico consolidado, a rota `/docs` oferece acesso navegável à documentação de arquitetura, segurança, operações e limitações. A página foi verificada em desktop e em viewport vertical compacto.[8] [9]

## O que falta para operar de verdade

As pendências abaixo não são apenas melhorias; as classificadas como **bloqueadoras** precisam ser resolvidas antes da disponibilização ao público.

| Prioridade | Pendência | Motivo | Resultado esperado |
|---|---|---|---|
| Bloqueadora | Servidor central persistente | O simulador mantém sessão e idempotência em memória | Sessões, saldo, auditoria e chaves em banco durável |
| Bloqueadora | Wallet e PIN reais | O PIN atual é fixo e exclusivo de teste | Autorização autenticada, expiração e débito final na Wallet |
| Bloqueadora | Biometria real | A captura e o token facial atuais são simulados | SDK biométrico, prova de vida, consentimento e tratamento seguro de dados |
| Bloqueadora | Homologação elétrica | Código não substitui a proteção física | Relé/driver isolado, fusível, fonte correta, aterramento e E-stop NC testados |
| Bloqueadora | Calibração do sensor de fluxo | O valor de pulsos por litro é apenas um padrão configurável | Volume físico cobrado compatível com volume entregue |
| Alta | Produto, preço e estoque do servidor | Produto e PDV estão fixos na interface | Catálogo ativo, preço versionado, reserva e baixa conciliada |
| Alta | Integração de cartão | O formulário atual não realiza pagamento | PSP/adquirente, tokenização, antifraude e conformidade aplicável |
| Alta | Segurança de dispositivo e API | `X-Totem-ID` sozinho não é credencial suficiente | Credenciais rotacionáveis, assinatura por dispositivo ou mTLS |
| Alta | Observabilidade operacional | Não há painel/alerta central de produção | Logs, métricas, alarmes e trilha de auditoria por sessão |
| Média | Painel administrativo | Operação depende de código/configuração manual | Gestão de produtos, preços, torneiras, telemetria e sessões |
| Média | Reconciliação de filas | `finished` pode ficar pendente no navegador/Pi | Serviço de reconciliação, reprocessamento e alertas |

## Riscos atuais e como tratá-los

| Risco | Probabilidade atual | Impacto | Mitigação já existente | Medida que falta |
|---|---|---|---|---|
| Dispensação além do limite | Baixa em simulação | Alta | Limites no fluxo e encerramento fail-safe | Teste físico com volume e valor reais |
| Queda de rede | Média | Alta | Retry e fila de `finished` | Reconciliação central e alertas |
| Válvula permanecer energizada | Baixa se o agente estiver correto | Crítica | Relé desligado antes de rede, timeout e polling | E-stop físico NC homologado e teste de falha elétrica |
| Cobrança incorreta | Média | Alta | Cálculo local e limites simulados | Fonte única de preço/saldo e conciliação financeira |
| Falso positivo biométrico | Não mensurado | Alta | Nenhuma proteção biométrica real | Prova de vida, fornecedor homologado e política de exceção |
| Dados sensíveis expostos | Média | Alta | Não persistir token facial no simulador | Criptografia, retenção mínima, acesso restrito e auditoria |

## Roteiro recomendado de execução

### Fase 1 — Tornar a autorização real

Substitua o simulador de Wallet por endpoints autenticados para identificação, saldo, limite, autorização e débito final. A resposta de autorização deve continuar devolvendo sessão e limites; esse contrato já está refletido na interface. Remova o PIN fixo do código e centralize a sua validação na Wallet.

**Critério de saída:** uma sessão real autorizada pode ser criada, impedida por saldo insuficiente, debitada uma única vez e auditada após `finished`.

### Fase 2 — Tornar a dispensação física confiável

Instale o agente em Raspberry Pi, valide a polaridade do relé sem carga, calibre o sensor de fluxo com volumes conhecidos e execute testes de falha. O circuito de potência precisa de fonte adequada, proteção contra transientes, fusível e botão de emergência físico normalmente fechado; o software é camada complementar, não substituta.[7] [10]

**Critério de saída:** a válvula fecha corretamente por volume, valor, timeout, E-stop, retirada de comando, perda de rede e reinício do agente.

### Fase 3 — Integrar operação comercial

Conecte catálogo, preços, PDV e estoque ao servidor central. Em paralelo, escolha o provedor de cartão ou decida se a Wallet será o único meio de pagamento inicial. Os dados de produto devem ser versionados para que a medição seja conciliada com o preço vigente da sessão.

**Critério de saída:** preço, produto, estoque, cliente, limite, volume entregue e encerramento podem ser reconciliados por uma única sessão auditável.

### Fase 4 — Endurecer segurança e operação contínua

Introduza credenciais por equipamento, gestão de segredos, logs centralizados, métricas e alarmes. O painel administrativo deve permitir visualizar saúde de cada totem, comandos, encerramentos pendentes, leitura de fluxo e discrepâncias de cobrança.

**Critério de saída:** uma equipe operacional consegue detectar, investigar e resolver uma anomalia sem acesso manual ao código ou ao Raspberry Pi.

## Próxima decisão recomendada

A prioridade recomendada é iniciar pela **integração real da Wallet/servidor central**. Ela desbloqueia identidade, saldo, PIN, limites, sessão auditável e débito, que são as dependências de quase todos os outros itens. Em seguida, faça a homologação física do Raspberry Pi com E-stop e calibração de fluxo. O painel administrativo e a integração de cartão podem avançar em paralelo depois que o núcleo de autorização e dispensação estiver confiável.

## Referências

[1]: ../package.json "Comandos e dependências do projeto"
[2]: ../vitest.config.ts "Configuração da suíte de testes"
[3]: ../client/src/pages/Home.tsx "Máquina de estados e interface do totem"
[4]: ../client/src/lib/totemAuthorization.ts "Regras de Face ID, limites e transições"
[5]: ../server/tapApi.ts "Simulador REST e contrato de autorização"
[6]: ../client/src/lib/tapApi.ts "Cliente REST, retry e fila local"
[7]: ../raspberry_pi/solenoid_agent.py "Agente de GPIO, medição e fail-safe"
[8]: ../client/src/pages/Docs.tsx "Página de documentação na aplicação"
[9]: VALIDACAO_PAGINA_DOCS.md "Validação visual da página Docs"
[10]: CONTROLE_SOLENOIDE.md "Circuito físico e parada de emergência"
