# Agente GPIO — Raspberry Pi

O arquivo `solenoid_agent.py` é o código que comanda o **relé da solenoide**. Ele consulta `GET /api/public/tap/:tapId/command` a cada 0,5 segundo; somente liga o relé ao receber `start_pour`; e o desliga antes de qualquer notificação de encerramento. Ele também corta a saída por volume, valor, timeout, comando de emergência, três falhas consecutivas de rede e sinais de desligamento do sistema.

> **Não conecte a bobina da solenoide ao Raspberry Pi.** Use um módulo de relé ou driver isolado, dimensionado para a tensão e a corrente da válvula, com fonte própria e proteção adequada. O GPIO fornece somente sinal lógico.

## Circuito de segurança obrigatório

O corte de emergência deve ser **físico**, normalmente fechado e instalado em série com a alimentação da válvula ou com o sinal de habilitação do driver. Assim, ao pressionar o botão, romper um cabo ou desligar o Pi, a válvula fica sem energia e fecha, independentemente do software. A topologia de controle recomendada é: `GPIO → entrada isolada do relé/driver → contato do relé + botão E-stop NC → fonte da válvula → solenoide`. Confirme com um profissional habilitado a compatibilidade de tensão, corrente, fusível, aterramento e proteção contra transientes para a válvula instalada.

## Instalação no Raspberry Pi

| Etapa | Comando ou ação |
|---|---|
| Dependência GPIO | `sudo apt install python3-gpiozero` |
| Diretório | `sudo install -d -o maverick -g maverick /opt/maverick-tap /var/lib/maverick-tap` |
| Código | Copiar `solenoid_agent.py` para `/opt/maverick-tap/` e tornar executável com `chmod 750`. |
| Configuração | Copiar `solenoid.env.example` para `/etc/maverick-tap/solenoid.env`, ajustar URL, GPIO, lógica do relé e calibração do sensor. |
| Serviço | Copiar `maverick-solenoid.service` para `/etc/systemd/system/`, executar `sudo systemctl daemon-reload` e `sudo systemctl enable --now maverick-solenoid`. |

Antes de conectar a bebida, valide o relé sem carga, confirme que `RELAY_ACTIVE_HIGH` corresponde ao módulo instalado e calibre `FLOW_PULSES_PER_LITER` com um volume conhecido. A condição segura é sempre **solenoide fechada** quando o agente não estiver executando, perde o comando, não consegue consultar o servidor ou recebe parada de emergência.

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

Para habilitar também o Chromium em modo kiosk:

```bash
sudo raspberry_pi/install.sh --enable --kiosk
```

O instalador preserva arquivos de configuração existentes. Para uma instalação a partir de um build já gerado, use `--skip-build` e disponibilize um diretório de repositório contendo `dist/index.js`:

```bash
sudo MAVERICK_REPO_DIR=/caminho/do/projeto raspberry_pi/install.sh --skip-build
```

Opções úteis:

- `--dry-run`: exibe os comandos planejados sem alterar o sistema;
- `--enable`: habilita e inicia o serviço da aplicação e o agente GPIO;
- `--kiosk`: habilita o navegador em tela cheia;
- `--skip-build`: não reinstala dependências nem executa o build.

Depois da instalação, siga o [guia completo de testes](../docs/GUIA_INSTALACAO_TESTE_RASPBERRY_PI.md). O modo `MAVERICK_TEST_MODE` deve ser usado primeiro sem carga hidráulica. A solenoide somente deve ser conectada depois da validação do relé/driver, fusível, alimentação dedicada e botão de emergência físico.
