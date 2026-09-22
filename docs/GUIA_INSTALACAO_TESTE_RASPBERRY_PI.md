# Guia de instalação e testes — Totem Maverick Smart V2

Este guia descreve como instalar e validar a Etapa 1 do Totem V2 em um Raspberry Pi com Raspberry Pi OS. O procedimento deve ser executado em três níveis: **software sem hardware**, **bancada sem carga hidráulica** e **bancada com sensor e válvula**.

> **Regra de segurança:** nunca conecte a solenoide de 12 V diretamente a um GPIO do Raspberry Pi. O GPIO deve acionar apenas a entrada de um módulo de relé ou driver/MOSFET apropriado, com fonte dedicada, proteção contra transientes e botão de emergência físico normalmente fechado.

## 1. Materiais necessários

Utilize um Raspberry Pi com Raspberry Pi OS atualizado, cartão ou SSD confiável, rede local, fonte adequada para o Pi, relé ou driver compatível com 3,3 V, solenoide 12 V DC/18 W normalmente fechada, fonte 12 V dimensionada, sensor YF-B6, fusível, botão de emergência normalmente fechado e cabos apropriados.

A corrente nominal aproximada da solenoide é de **1,5 A**. A fonte, o relé/driver, os fios e o fusível devem ser dimensionados por profissional habilitado, considerando corrente de partida, aquecimento e proteção contra curto-circuito.

## 2. Preparar o Raspberry Pi

Inicialize o Raspberry Pi OS e abra um terminal localmente ou acesse por SSH restrito à rede de administração.

```bash
sudo apt update
sudo apt full-upgrade -y
sudo apt install -y git curl python3 python3-pip python3-gpiozero chromium systemd
```

Crie um usuário dedicado para a aplicação, caso ainda não exista:

```bash
sudo adduser --disabled-password --gecos "" maverick
sudo install -d -o maverick -g maverick /opt/maverick-totem
sudo install -d -o maverick -g maverick /opt/maverick-tap
sudo install -d -o maverick -g maverick /var/lib/maverick-tap
sudo install -d -o root -g maverick -m 750 /etc/maverick-tap
sudo install -d -o root -g maverick -m 750 /etc/maverick-totem
```

Ative apenas a interface e os serviços necessários. O SSH deve ficar limitado à rede administrativa, preferencialmente por chave, sem senha e sem exposição direta à internet.

## 3. Instalar a aplicação

Há duas formas recomendadas.

### Opção A — preparar o pacote em outro computador

No computador de desenvolvimento, dentro do repositório:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

Copie para o Raspberry Pi os diretórios `dist`, `package.json` e os arquivos de configuração necessários:

```bash
scp -r dist package.json usuario@IP_DO_PI:/tmp/maverick-totem/
```

No Raspberry Pi:

```bash
sudo rm -rf /opt/maverick-totem/*
sudo cp -r /tmp/maverick-totem/dist /opt/maverick-totem/
sudo cp /tmp/maverick-totem/package.json /opt/maverick-totem/
sudo chown -R maverick:maverick /opt/maverick-totem
sudo chmod -R u=rwX,g=rX,o= /opt/maverick-totem
```

### Opção B — clonar e construir no próprio Raspberry Pi

```bash
cd /tmp
git clone https://github.com/TiagoFacundo/totem-maverick-smart-v2.git
cd totem-maverick-smart-v2
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
sudo cp -r dist package.json /opt/maverick-totem/
sudo chown -R maverick:maverick /opt/maverick-totem
```

Para produção, o ideal é gerar o build em uma máquina de desenvolvimento e transferir somente o artefato validado.

## 4. Configurar o servidor local

Crie o arquivo de ambiente da aplicação:

```bash
sudo nano /etc/maverick-totem/totem.env
```

Exemplo mínimo:

```ini
NODE_ENV=production
PORT=3000
TOTEM_API_TOKEN=gere-um-token-longo-e-aleatorio
```

Gere um token forte sem colocá-lo no código:

```bash
openssl rand -hex 32
```

A aplicação deve ser publicada externamente atrás de um proxy HTTPS/TLS confiável. O Pi não deve ser exposto diretamente à internet. Se o servidor central estiver em outro equipamento, use HTTPS com certificado válido e mantenha o token fora do repositório.

Proteja o arquivo:

```bash
sudo chown root:maverick /etc/maverick-totem/totem.env
sudo chmod 640 /etc/maverick-totem/totem.env
```

## 5. Instalar o agente de GPIO

Copie os arquivos do diretório `raspberry_pi` para o Pi:

```bash
sudo cp raspberry_pi/solenoid_agent.py /opt/maverick-tap/
sudo cp raspberry_pi/maverick-solenoid.service /etc/systemd/system/
sudo chmod 750 /opt/maverick-tap/solenoid_agent.py
sudo chown -R maverick:maverick /opt/maverick-tap
```

Crie a configuração:

```bash
sudo cp raspberry_pi/solenoid.env.example /etc/maverick-tap/solenoid.env
sudo nano /etc/maverick-tap/solenoid.env
```

Configuração inicial recomendada para uma torneira:

```ini
MAVERICK_SERVER_URL=https://SEU_SERVIDOR.example.com
TOTEM_ID=TOTEM_001
TAP_ID=TORNEIRA_01
SOLENOID_GPIO=17
FLOW_SENSOR_GPIO=27
# Padrão para módulos comuns ativos em nível baixo; confirme sem carga.
RELAY_ACTIVE_HIGH=false
FLOW_PULSES_PER_LITER=450
FLOW_THRESHOLD_PULSES_PER_SEC=0.5
NO_FLOW_START_SECONDS=10
FLOW_STOP_SECONDS=5
COMMAND_POLL_SECONDS=0.5
MAX_POUR_SECONDS=90
MAX_POLL_FAILURES=3
PENDING_FINISH_FILE=/var/lib/maverick-tap/pending_finished.json
MAVERICK_TEST_MODE=false
TEST_PULSES_PER_SEC=0
LOG_LEVEL=INFO
```

O valor `FLOW_PULSES_PER_LITER=450` é apenas um ponto inicial. Ele deve ser calibrado com um volume conhecido e depois atualizado no arquivo de ambiente.

Com `MAVERICK_TEST_MODE=false`, o controle de vazão físico fica ativo: o GPIO27 conta os pulsos do sensor, o agente calcula o volume e interrompe a solenoide quando não há fluxo inicial, quando o fluxo para, quando o limite autorizado é atingido ou quando ocorre timeout. A solenoide somente é energizada após um comando `start_pour` autorizado.

Proteja a configuração:

```bash
sudo chown root:maverick /etc/maverick-tap/solenoid.env
sudo chmod 640 /etc/maverick-tap/solenoid.env
```

## 6. Instalar os serviços systemd

Copie também os serviços da aplicação e do kiosk:

```bash
sudo cp raspberry_pi/maverick-totem.service /etc/systemd/system/
sudo cp raspberry_pi/maverick-totem-kiosk.service /etc/systemd/system/
sudo systemctl daemon-reload
```

Antes de habilitar o kiosk, confirme que o usuário `maverick` possui sessão gráfica e que o Chromium funciona com o display configurado. Se a sessão gráfica usar outro usuário ou outro display, ajuste `User`, `DISPLAY` e `XAUTHORITY` no serviço kiosk.

Habilite os serviços:

```bash
sudo systemctl enable maverick-totem.service
sudo systemctl enable maverick-solenoid.service
sudo systemctl enable maverick-totem-kiosk.service
```

Ainda não os inicie com a solenoide conectada. Primeiro execute os testes sem carga.

## 7. Teste inicial sem hardware conectado

Desconecte a alimentação de 12 V da solenoide e, se necessário, deixe o relé/driver sem carga. O objetivo é confirmar que o software inicializa e que a saída começa desligada.

Verifique os serviços:

```bash
sudo systemctl start maverick-totem.service
sudo systemctl start maverick-solenoid.service
sudo systemctl status maverick-totem.service --no-pager
sudo systemctl status maverick-solenoid.service --no-pager
```

Verifique os logs:

```bash
journalctl -u maverick-totem.service -f
journalctl -u maverick-solenoid.service -f
```

Valide a aplicação localmente:

```bash
curl -i http://127.0.0.1:3000/
```

Valide o estado do Totem. Em ambiente HTTPS, execute contra o endereço do servidor, não contra uma URL HTTP pública:

```bash
curl --fail --silent \
  -H "X-Totem-ID: TOTEM_001" \
  -H "Authorization: Bearer SEU_TOKEN" \
  https://SEU_SERVIDOR.example.com/api/public/tap/health
```

O resultado esperado deve indicar `status: healthy`.

## 8. Teste de autorização simulada sem aplicativo

O servidor deve estar disponível e o agente deve estar rodando. Para simular uma autorização enviada pelo servidor, abra uma sessão diretamente:

```bash
SESSION_ID="teste-$(date +%s)"
OPERATION_ID="202609150001"

curl --fail --silent -X POST \
  -H "Content-Type: application/json" \
  -H "X-Totem-ID: TOTEM_001" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Idempotency-Key: ${OPERATION_ID}-open" \
  https://SEU_SERVIDOR.example.com/api/public/tap/TORNEIRA_01/open \
  -d "{\
    \"tap_id\": \"TORNEIRA_01\",\
    \"totem_id\": \"TOTEM_001\",\
    \"operation_id\": \"${OPERATION_ID}\",\
    \"session_id\": \"${SESSION_ID}\",\
    \"max_volume_ml\": 500,
    \"max_value_cents\": 8950,
    \"product\": {\
      \"id\": \"maverick-pilsen\",\
      \"name\": \"Maverick Pilsen\",\
      \"price_per_liter\": 17.90,
      \"price_per_100ml_cents\": 179
    }\
  }"
```

Consulte o comando que será recebido pelo agente:

```bash
curl --fail --silent \
  -H "X-Totem-ID: TOTEM_001" \
  -H "Authorization: Bearer SEU_TOKEN" \
  https://SEU_SERVIDOR.example.com/api/public/tap/TORNEIRA_01/command
```

O comando esperado é `start_pour`. Sem carga conectada, confirme no log que a autorização foi recebida e que a saída foi acionada/desligada conforme o teste.

## 9. Teste com pulsos simulados

Para validar medição, encerramento e cálculo sem conectar o YF-B6, edite temporariamente:

```ini
MAVERICK_TEST_MODE=true
TEST_PULSES_PER_SEC=8
```

Reinicie somente o agente:

```bash
sudo systemctl restart maverick-solenoid.service
journalctl -u maverick-solenoid.service -f
```

Envie novamente a autorização do passo anterior. O agente simulará pulsos usando o mesmo caminho de medição do sensor real. Aguarde o encerramento por limite ou envie o fechamento:

```bash
curl --fail --silent -X POST \
  -H "Content-Type: application/json" \
  -H "X-Totem-ID: TOTEM_001" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Idempotency-Key: ${SESSION_ID}-close" \
  https://SEU_SERVIDOR.example.com/api/public/tap/TORNEIRA_01/close \
  -d "{\"session_id\":\"${SESSION_ID}\",\"command\":\"close\",\"reason\":\"teste\"}"
```

Confirme que:

1. A operação inicia somente após a autorização.
2. O volume aumenta conforme os pulsos simulados.
3. O valor é calculado com base no volume.
4. A válvula é desligada antes do envio do encerramento.
5. O registro é preservado no servidor.

Depois do teste, volte obrigatoriamente para:

```ini
MAVERICK_TEST_MODE=false
TEST_PULSES_PER_SEC=0
```

## 10. Teste de operação não iniciada

Configure temporariamente:

```ini
MAVERICK_TEST_MODE=true
TEST_PULSES_PER_SEC=0
NO_FLOW_START_SECONDS=10
```

Envie uma nova autorização. Aguarde pelo menos 10 segundos. O resultado esperado é:

- válvula desligada;
- status `not_started`;
- volume igual a zero;
- registro enviado ou armazenado na fila local;
- retorno da interface ao menu.

## 11. Teste de parada do fluxo

Use pulsos simulados para iniciar a operação e depois altere `TEST_PULSES_PER_SEC` para zero. O agente deve aguardar `FLOW_STOP_SECONDS=5` antes de encerrar.

Durante esses 5 segundos, retorne o valor para um número maior que o limite, por exemplo `8`. O encerramento deve ser cancelado enquanto o fluxo voltar antes do prazo. Faça o teste novamente mantendo o valor em zero e confirme o fechamento após 5 segundos.

## 12. Teste de perda de servidor

Antes da autorização, interrompa temporariamente a comunicação com o servidor. O agente não deve abrir a válvula.

Durante uma operação autorizada, interrompa a rede e observe:

```bash
journalctl -u maverick-solenoid.service -f
```

Após as falhas consecutivas configuradas em `MAX_POLL_FAILURES`, o agente deve desligar a saída. Quando a operação terminar sem conexão, o registro deve aparecer em:

```bash
sudo cat /var/lib/maverick-tap/pending_finished.json
```

Restabeleça a rede. O agente deve reenviar a fila automaticamente. Depois confirme que o arquivo foi esvaziado ou contém somente registros ainda não enviados.

## 13. Teste de reinicialização e watchdog

Com a solenoide ainda desconectada ou sem carga hidráulica:

```bash
sudo systemctl restart maverick-solenoid.service
sudo systemctl status maverick-solenoid.service --no-pager
```

Confirme que o log registra a reinicialização e que o relé inicia desligado. Para testar o watchdog, use primeiro um ambiente de bancada e observe se o serviço é reiniciado quando deixa de enviar heartbeat ao systemd.

Nunca faça esse teste com a válvula energizada sem um botão de emergência físico funcional.

## 14. Teste físico do relé e da válvula

Somente depois de todos os testes anteriores:

1. Desligue o Raspberry Pi e a fonte de 12 V.
2. Revise a fiação com o circuito desenergizado.
3. Confirme que a válvula está em série com a fonte de 12 V e o contato de segurança.
4. Confirme que o botão de emergência normalmente fechado interrompe fisicamente a alimentação ou habilitação do driver.
5. Confirme polaridade, fusível, aterramento e proteção contra transientes.
6. Ligue primeiro o Raspberry Pi sem a fonte da solenoide.
7. Verifique que o GPIO inicia em estado seguro.
8. Ligue a fonte de 12 V sem autorizar uma operação e confirme que a válvula permanece fechada.
9. Autorize uma operação curta com recipiente vazio.
10. Pressione o botão de emergência e confirme o fechamento imediato.
11. Só depois faça um teste com água, nunca diretamente com bebida.

## 15. Calibrar o sensor YF-B6

Use um recipiente graduado. Faça uma extração com volume conhecido, por exemplo 1 litro, e registre o número de pulsos. Calcule:

```text
pulsos_por_litro = pulsos_medidos / litros_reais
```

Atualize `FLOW_PULSES_PER_LITER` com o resultado, reinicie o agente e repita a medição. Faça pelo menos três ciclos e use uma média. Registre a calibração, a data, o sensor e o responsável.

## 16. Ativar inicialização automática

Depois da aprovação dos testes:

```bash
sudo systemctl enable maverick-totem.service
sudo systemctl enable maverick-solenoid.service
sudo systemctl enable maverick-totem-kiosk.service
sudo reboot
```

Após o boot, confirme:

```bash
systemctl is-active maverick-totem.service
systemctl is-active maverick-solenoid.service
systemctl is-active maverick-totem-kiosk.service
```

A aplicação deve abrir automaticamente em modo kiosk e a válvula deve permanecer fechada até que exista uma autorização válida.

## 17. Checklist de aprovação

Considere a instalação aprovada somente se todos os itens forem verdadeiros:

- [ ] O Raspberry Pi inicia sem deixar a válvula aberta.
- [ ] A aplicação abre automaticamente no modo kiosk.
- [ ] O menu exibe o QR com Totem, torneira, produto e preço.
- [ ] Uma autorização duplicada é rejeitada.
- [ ] Comando inválido não abre a válvula.
- [ ] Sem fluxo por 10 segundos a válvula fecha e a operação é registrada como `not_started`.
- [ ] A parada do fluxo exige 5 segundos antes do encerramento.
- [ ] O retorno do fluxo cancela o encerramento durante a janela de 5 segundos.
- [ ] O timeout máximo fecha a válvula independentemente dos demais temporizadores.
- [ ] A perda do servidor não libera uma nova operação.
- [ ] Operações finalizadas offline ficam preservadas localmente.
- [ ] A fila local é reenviada após a recuperação da rede.
- [ ] O botão de emergência físico fecha a válvula sem depender do software.
- [ ] O sensor foi calibrado com volume conhecido.
- [ ] O relé/driver está isolado e a solenoide não está ligada ao GPIO.
- [ ] Os logs possuem data e hora e foram arquivados.

A homologação hidráulica e elétrica deve ser registrada separadamente, incluindo fotos do circuito, valores de calibração, testes de emergência, não conformidades e aprovação do responsável técnico.
