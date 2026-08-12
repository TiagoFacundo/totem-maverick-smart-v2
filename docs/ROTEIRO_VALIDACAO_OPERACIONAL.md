# Roteiro de Validação Operacional — Totem Maverick

## Objetivo

Este roteiro valida a interface do Totem Maverick, o contrato REST da torneira e os comportamentos de proteção previstos para uma integração com Raspberry Pi. Ele deve ser executado em ambiente de homologação antes da conexão com relé, solenoide, sensor de fluxo, Wallet e serviço biométrico de produção.

## Pré-requisitos de homologação

| Item | Condição esperada |
|---|---|
| Identidade do dispositivo | O Totem utiliza um `X-Totem-ID` permitido, por exemplo `TOTEM_001`. |
| Identidade da torneira | O Pi é configurado com `TAP_ID` autorizado, por exemplo `TORNEIRA_01`. |
| Rede | O navegador do totem e o Pi conseguem alcançar o servidor pela conexão protegida do ambiente de homologação. |
| Hardware | O relé inicia desligado e o solenoide permanece fechado por padrão. |
| Wallet e biometria | Os serviços reais estão conectados apenas após a troca dos endpoints de simulador por validações autenticadas do servidor central. |

## Roteiro funcional

| Etapa | Ação | Resultado esperado |
|---|---|---|
| 1. Inicialização | Abrir o Totem | A tela `idle` mostra a marca Maverick, QR Code, indicadores de conectividade e ações de autenticação. |
| 2. QR da Wallet | Escolher **Ler QR da Wallet**, permitir câmera e enquadrar um QR válido | A câmera lê o código, envia `qr_payload`, `nonce` e `timestamp`; após autorização, o totem avança para produtos. |
| 3. PIN e Face ID | Selecionar **Digitar senha**, inserir PIN e validar o rosto | O PIN e a imagem são enviados somente ao backend de autorização; sucesso avança, falha mantém o usuário na etapa de identidade. |
| 4. Produto | Selecionar uma bebida | O card selecionado fica explícito e o preço por 100 ml permanece legível. |
| 5. Volume | Selecionar 200, 300, 400 ou 500 ml | O total é recalculado com precisão em centavos e apresentado antes da confirmação. |
| 6. Confirmação | Manter o botão pressionado | A autorização só ocorre após a conclusão do hold de 1,3 segundo; toque breve não dispara a venda. |
| 7. Autorização | Verificar `POST /open` e o polling de `GET /command` | Ambos incluem o cabeçalho do totem; o comando retorna sessão, produto, limite de volume e limite financeiro. |
| 8. Dispensação | Segurar e soltar o controle de servir | O volume e o valor progridem enquanto o controle estiver pressionado; o limite máximo encerra automaticamente. |
| 9. Encerramento | Soltar o controle ou atingir o limite | O totem envia `POST /finished` com volume, valor e uma `Idempotency-Key` estável para a sessão. |
| 10. Emergência | Acionar a parada de emergência em qualquer etapa | O relé deve desligar, a sessão passa a erro e nenhuma nova dispensação é permitida sem retorno ao início. |

## Roteiro de resiliência e segurança

| Cenário | Procedimento | Resultado esperado |
|---|---|---|
| Cabeçalho ausente | Consultar uma rota de torneira sem `X-Totem-ID` | O servidor retorna `401 MISSING_TOTEM_ID`. |
| Idempotência | Reenviar o mesmo `POST /open` com a mesma chave | O servidor devolve a resposta original e marca `Idempotency-Replayed: true`, sem criar nova sessão. |
| Falha de rede | Derrubar a rede antes do fechamento | O totem vai para `offline`, bloqueia nova venda e guarda localmente apenas o payload operacional pendente de `finished`. |
| Retorno de rede | Restabelecer conectividade | A fila local de encerramentos é reenviada; a interface volta a `idle` somente após restabelecer comunicação. |
| Falha de sensor ou do Pi | Simular falha durante a dispensação | O Pi fecha o relé por fail-safe e publica o encerramento com status `error`. |
| QR vencido | Usar timestamp fora da janela de dois minutos | O servidor recusa a autorização com `INVALID_OR_EXPIRED_QR`. |

## Critérios de aceite

O ciclo é aceito quando a máquina de estados não permite pular diretamente de `idle` para `pouring`; cada `POST` possui `Idempotency-Key`; cada rota operacional recebe `X-Totem-ID`; a dispensação é limitada por volume e valor autorizados; e a condição sem comunicação mantém a saída física fechada. Para operação comercial, a homologação também deve confirmar assinatura criptográfica do QR, autenticação mútua entre Pi e servidor, credenciais rotativas, auditoria persistente, fluxo de saldo Wallet e motor biométrico homologado.
