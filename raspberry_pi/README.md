# Agente GPIO — Raspberry Pi

O arquivo `solenoid_agent.py` é o código que comanda o **relé da solenoide**. Ele consulta `GET /api/public/tap/:tapId/command` a cada 0,5 segundo; somente liga o relé ao receber `start_pour`; e o desliga antes de qualquer notificação de encerramento. Ele também corta a saída por volume, valor, timeout, comando de emergência, três falhas consecutivas de rede e sinais de desligamento do sistema.

> **Não conecte a bobina da solenoide ao Raspberry Pi.** Use um módulo de relé ou driver isolado, dimensionado para a tensão e a corrente da válvula, com fonte própria e proteção adequada. O GPIO fornece somente sinal lógico.

## Circuito de segurança obrigatório

O corte de emergência deve ser **físico**, normalmente fechado e instalado em série com a alimentação da válvula ou com o sinal de habilitação do driver. Assim, ao pressionar o botão, romper um cabo ou desligar o Pi, a válvula fica sem energia e fecha, independentemente do software. A topologia de controle recomendada é: `GPIO → entrada isolada do relé/driver → contato do relé + botão E-stop NC → fonte da válvula → solenoide`. Confirme com um profissional habilitado a compatibilidade de tensão, corrente, fusível, aterramento e proteção contra transientes para a válvula instalada.

## Instalação no Raspberry Pi

| Etapa | Comando ou ação |
|---|---|
| Dependência GPIO | `sudo apt install python3-gpiozero python3-lgpio` |
| Diretório | `sudo install -d -o maverick -g maverick /opt/maverick-tap /var/lib/maverick-tap` |
| Código | Copiar `solenoid_agent.py` para `/opt/maverick-tap/` e tornar executável com `chmod 750`. |
| Configuração | Copiar `solenoid.env.example` para `/etc/maverick-tap/solenoid.env`, ajustar URL, GPIO, lógica do relé e calibração do sensor. |
| Serviço | Copiar `maverick-solenoid.service` para `/etc/systemd/system/`, executar `sudo systemctl daemon-reload` e `sudo systemctl enable --now maverick-solenoid`. |

Antes de conectar a bebida, valide o relé sem carga, confirme que `RELAY_ACTIVE_HIGH` corresponde ao módulo instalado e calibre `FLOW_PULSES_PER_LITER` com um volume conhecido. A condição segura é sempre **solenoide fechada** quando o agente não estiver executando, perde o comando, não consegue consultar o servidor ou recebe parada de emergência.

## Controle de vazão e modo de teste

O controle de vazão físico fica ativo com `MAVERICK_TEST_MODE=false`: o sensor ligado ao GPIO27 conta os pulsos, `FLOW_PULSES_PER_LITER` converte os pulsos em mililitros e o agente encerra a operação por ausência de fluxo inicial, parada do fluxo, limite de volume, limite financeiro ou timeout. O relé só é energizado depois de `start_pour` com autorização explícita. Use `RELAY_ACTIVE_HIGH=false` para o padrão de módulos ativos em nível baixo, confirmando a polaridade no teste sem carga.

## Modo de teste da Etapa 1

O teste usa o mesmo `TapAgent`, os mesmos limites, temporizadores, cálculo e fila de encerramento do modo físico. Em uma bancada sem sensor, configure `MAVERICK_TEST_MODE=true` e `TEST_PULSES_PER_SEC=8`; o servidor ainda precisa fornecer uma autorização `start_pour`. Para validar o cenário “não iniciado”, mantenha `TEST_PULSES_PER_SEC=0`: após `NO_FLOW_START_SECONDS=10` a válvula será desligada e o encerramento será registrado como `not_started`. O agente sempre prioriza o desligamento do relé antes de qualquer comunicação.

## Instalador automático

A partir da raiz do repositório, o instalador prepara o Raspberry Pi OS, cria o usuário `maverick`, instala as dependências, compila a aplicação, instala o agente GPIO, cria os arquivos de ambiente e registra os serviços `systemd`:

```bash
chmod 750 raspberry_pi/install.sh
sudo raspberry_pi/install.sh
```

Por segurança, o comando acima **não inicia os serviços**. Depois de revisar a configuração:

```bash
sudo nano /etc/maverick-tap/solenoid.env
sudo nano /etc/maverick-totem/totem.env
sudo systemctl status maverick-totem.service maverick-solenoid.service --no-pager
```

Para habilitar a aplicação e o agente:

```bash
sudo raspberry_pi/install.sh --enable
```

Para habilitar também o aplicativo local em tela cheia:

```bash
sudo raspberry_pi/install.sh --enable --kiosk
```

O modo `--kiosk` não abre um site público nem exige navegação manual: o serviço inicia a interface local em `127.0.0.1:3000` usando uma janela de aplicativo sem abas, barra de endereço ou controles do navegador, ocupando toda a tela do totem. A internet é usada somente pelas chamadas da aplicação para a API de autorização, heartbeat e telemetria.

## Logitech Brio 500 e captura facial

Conecte a Logitech Brio 500 a uma porta USB 3.0 do Raspberry Pi e confirme que ela aparece no sistema:

```bash
lsusb | grep -i -E 'logitech|brio'
v4l2-ctl --list-devices
```

Na tela **FACE ID**, o aplicativo solicita permissão de câmera, mostra a prévia da Brio 500, captura um quadro JPEG somente quando o operador toca em **Capturar e reconhecer** e envia o campo `face_image_base64` para `POST /api/public/tap/TORNEIRA_01/authorize/face`. A prévia é encerrada ao sair da tela e o stream não é mantido em segundo plano.

> A captura está implementada no totem, mas a decisão biométrica continua sendo feita pelo servidor central. O endpoint deve devolver `recognized`, `face_token` e `user_id`; sem esses dados o totem não libera a etapa de senha nem a solenoide. A imagem facial não deve ser armazenada localmente.

Para testar a permissão da câmera, reinicie o kiosk após conectar a Brio:

```bash
sudo systemctl restart maverick-totem-kiosk
```

Não conecte a câmera a um hub USB sem alimentação suficiente. Para uso comercial, valide consentimento, retenção, criptografia e base legal do tratamento biométrico com o responsável técnico/jurídico.

O instalador preserva arquivos de configuração existentes. Para uma instalação a partir de um build já gerado, use `--skip-build` e disponibilize um diretório de repositório contendo `dist/index.js`:

```bash
sudo MAVERICK_REPO_DIR=/caminho/do/projeto raspberry_pi/install.sh --skip-build
```

Opções úteis:

- `--dry-run`: exibe os comandos planejados sem alterar o sistema;
- `--enable`: habilita e inicia o serviço da aplicação e o agente GPIO;
- `--kiosk`: habilita o aplicativo local em tela cheia, sem abas ou barra de endereço;
- `--skip-build`: não reinstala dependências nem executa o build.

Depois da instalação, siga o [guia completo de testes](../docs/GUIA_INSTALACAO_TESTE_RASPBERRY_PI.md). O modo `MAVERICK_TEST_MODE` deve ser usado primeiro sem carga hidráulica. A solenoide somente deve ser conectada depois da validação do relé/driver, fusível, alimentação dedicada e botão de emergência físico.
