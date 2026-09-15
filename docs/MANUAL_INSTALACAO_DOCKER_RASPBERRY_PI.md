# Manual de instalação Docker — Totem Maverick Smart V2

Este manual instala a aplicação do Totem e o agente de controle da solenoide em containers Docker no Raspberry Pi OS. A arquitetura usa dois serviços:

| Serviço | Função |
|---|---|
| `totem-app` | Servidor web/API e interface do Totem na porta 3000 |
| `solenoid-agent` | Agente Python que consulta autorizações, lê o YF-B6 e aciona o relé |

O agente recebe acesso somente aos dispositivos GPIO explicitamente mapeados pelo `docker-compose.yml`. O volume `maverick-tap-state` preserva a fila local de operações finalizadas quando o servidor estiver indisponível.

> **Atenção:** Docker não substitui o circuito de segurança físico. A solenoide de 12 V/18 W não pode ser ligada ao GPIO. Use relé/driver dimensionado, fonte de 12 V própria, fusível, proteção contra transientes e botão de emergência normalmente fechado.

## 1. Pré-requisitos

É necessário um Raspberry Pi com Raspberry Pi OS 64-bit atualizado, acesso sudo, rede local, Docker Engine, Docker Compose plugin, uma fonte adequada para o Pi, módulo relé/driver compatível com GPIO de 3,3 V e, para o teste físico, sensor YF-B6 e solenoide.

A instalação Docker atende bem o servidor e o agente. O modo kiosk gráfico do Chromium continua sendo uma responsabilidade do host; primeiro valide a aplicação em `http://IP_DO_PI:3000` e depois configure o navegador do Raspberry Pi, se necessário.

## 2. Instalação automática

Clone o projeto no Raspberry Pi:

```bash
git clone https://github.com/TiagoFacundo/totem-maverick-smart-v2.git
cd totem-maverick-smart-v2
chmod 750 raspberry_pi/install-docker.sh
sudo raspberry_pi/install-docker.sh
```

O instalador:

1. instala Docker Engine e Docker Compose;
2. habilita o serviço Docker no boot;
3. clona ou atualiza o repositório em `/opt/maverick-totem-src`;
4. cria `.env.docker` a partir do exemplo;
5. cria a configuração inicial sem sobrescrever um arquivo existente;
6. detecta o GID do grupo `gpio`, quando disponível;
7. não inicia o agente GPIO automaticamente.

## 3. Configurar o ambiente

Edite o arquivo criado:

```bash
sudo nano /opt/maverick-totem-src/.env.docker
```

Configuração mínima para teste local:

```ini
TOTEM_HTTP_PORT=3000
TOTEM_ID=TOTEM_001
TAP_ID=TORNEIRA_01
TOTEM_API_TOKEN=
ALLOW_INSECURE_LOCAL_API=true
MAVERICK_SERVER_URL=http://totem-app:3000
SOLENOID_GPIO=17
FLOW_SENSOR_GPIO=27
RELAY_ACTIVE_HIGH=true
FLOW_PULSES_PER_LITER=450
FLOW_THRESHOLD_PULSES_PER_SEC=0.5
NO_FLOW_START_SECONDS=10
FLOW_STOP_SECONDS=5
COMMAND_POLL_SECONDS=0.5
MAX_POUR_SECONDS=90
MAX_POLL_FAILURES=3
MAVERICK_TEST_MODE=false
TEST_PULSES_PER_SEC=0
GPIO_GID=997
```

O valor `GPIO_GID` precisa corresponder ao grupo que tem acesso ao GPIO no host:

```bash
getent group gpio | cut -d: -f3
```

Se esse comando não retornar nada, verifique as permissões de `/dev/gpiomem` e `/dev/gpiochip0`. Não use `privileged: true` como primeira alternativa. Use privilégio ampliado somente em bancada controlada e após compreender o risco.

No teste local, mantenha `TOTEM_API_TOKEN` vazio porque a interface do kiosk faz chamadas à API pelo navegador. Em produção, a autenticação deve ser aplicada no proxy HTTPS ou integrada ao fluxo de autenticação do frontend antes de preencher esse token no servidor. O agente físico já envia `Authorization: Bearer` quando `TOTEM_API_TOKEN` é definido.

### HTTPS e produção

O exemplo usa HTTP apenas na rede interna Docker para facilitar o teste local. `ALLOW_INSECURE_LOCAL_API=true` não deve ser usado em uma instalação exposta à rede pública.

Em produção:

- coloque um proxy reverso TLS na frente da aplicação;
- publique somente HTTPS;
- defina `ALLOW_INSECURE_LOCAL_API=false`;
- use certificado válido e valide o certificado no cliente;
- não publique a porta 3000 diretamente na internet;
- mantenha `TOTEM_API_TOKEN` somente no arquivo `.env.docker`, com permissão 600.

## 4. Construir e iniciar apenas a aplicação

Antes de conectar ou iniciar o agente GPIO:

```bash
cd /opt/maverick-totem-src
docker compose build totem-app
docker compose up -d totem-app
docker compose ps
```

Verifique os logs:

```bash
docker compose logs -f totem-app
```

Teste o endpoint local:

```bash
curl -i http://127.0.0.1:3000/api/public/tap/health
```

Acesse a interface pelo navegador de outro computador:

```text
http://IP_DO_RASPBERRY_PI:3000/
```

O healthcheck do Compose deve ficar como `healthy`:

```bash
docker inspect --format '{{json .State.Health}}' maverick-totem-app
```

## 5. Iniciar o agente sem carga

Desconecte a alimentação da solenoide. O relé/driver pode permanecer conectado ao GPIO apenas para verificar o estado lógico, sem carga de 12 V.

Confirme no `.env.docker`:

```ini
MAVERICK_TEST_MODE=true
TEST_PULSES_PER_SEC=0
```

Inicie o stack:

```bash
cd /opt/maverick-totem-src
docker compose build
docker compose up -d
docker compose ps
docker compose logs -f solenoid-agent
```

Confirme no log que o agente iniciou e que não há falha de permissão do GPIO. O estado seguro esperado é relé desligado.

## 6. Teste com pulsos simulados

Para testar a medição sem sensor físico, altere:

```ini
MAVERICK_TEST_MODE=true
TEST_PULSES_PER_SEC=8
```

Recrie somente o agente para aplicar a variável:

```bash
cd /opt/maverick-totem-src
docker compose up -d --build --force-recreate solenoid-agent
docker compose logs -f solenoid-agent
```

Envie uma autorização simulada para a API interna. O exemplo abaixo usa o token configurado no `.env.docker`:

```bash
set -a
. /opt/maverick-totem-src/.env.docker
set +a

SESSION_ID="teste-$(date +%s)"
OPERATION_ID="202609150001"

curl --fail --silent -X POST \
  -H "Content-Type: application/json" \
  -H "X-Totem-ID: ${TOTEM_ID}" \
  -H "Authorization: Bearer ${TOTEM_API_TOKEN}" \
  -H "Idempotency-Key: ${OPERATION_ID}-open" \
  http://127.0.0.1:${TOTEM_HTTP_PORT:-3000}/api/public/tap/${TAP_ID}/open \
  -d "{\
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

Consulte o comando:

```bash
curl --fail --silent \
  -H "X-Totem-ID: ${TOTEM_ID}" \
  -H "Authorization: Bearer ${TOTEM_API_TOKEN}" \
  http://127.0.0.1:${TOTEM_HTTP_PORT:-3000}/api/public/tap/${TAP_ID}/command
```

O agente deve receber `start_pour`, contabilizar pulsos simulados e desligar a saída ao atingir limite ou receber encerramento.

## 7. Teste sem fluxo

Configure:

```ini
MAVERICK_TEST_MODE=true
TEST_PULSES_PER_SEC=0
NO_FLOW_START_SECONDS=10
```

Recrie o agente e envie uma nova autorização. Após 10 segundos, o resultado esperado é:

- saída desligada;
- status `not_started`;
- volume zero;
- registro de encerramento enviado ou mantido na fila local.

## 8. Teste de parada e retorno do fluxo

Inicie com `TEST_PULSES_PER_SEC=8`. Depois altere para zero e recrie o agente. Ele deve aguardar 5 segundos antes de encerrar. Se os pulsos voltarem durante a janela, a operação deve continuar. Se permanecerem em zero, a operação deve finalizar.

## 9. Teste de duplicidade

Envie novamente uma autorização com o mesmo `operation_id`. A API deve retornar rejeição com motivo `DUPLICATE_OPERATION`. Uma nova operação deve usar outro identificador.

## 10. Teste da fila offline

Pare a aplicação temporariamente:

```bash
docker compose stop totem-app
```

Durante uma operação, o agente deverá desligar a saída por segurança. Se houver encerramento sem comunicação, a fila persistida ficará no volume Docker. Verifique:

```bash
docker run --rm -v maverick-tap-state:/data alpine sh -c 'find /data -type f -maxdepth 3 -print -exec cat {} \;'
```

Restaure o serviço:

```bash
docker compose up -d totem-app solenoid-agent
docker compose logs -f solenoid-agent
```

## 11. Conectar o sensor YF-B6

Desligue as fontes. Conecte o sensor conforme o esquema elétrico aprovado para o modelo instalado. Confirme tensão de alimentação, nível lógico, aterramento comum quando aplicável e proteção da entrada GPIO.

Depois:

1. coloque `MAVERICK_TEST_MODE=false`;
2. coloque `TEST_PULSES_PER_SEC=0`;
3. reinicie o agente;
4. faça teste com água e recipiente graduado;
5. conte pulsos e compare com o volume real;
6. ajuste `FLOW_PULSES_PER_LITER`;
7. repita pelo menos três medições.

Nunca faça a primeira calibração usando bebida comercial. Registre o valor final e a data.

## 12. Conectar relé/driver e solenoide

Somente após validar o software e o sensor:

1. mantenha o Pi desligado;
2. confirme que o driver suporta a corrente da bobina;
3. use fonte de 12 V dedicada;
4. instale fusível adequado;
5. use proteção contra carga indutiva;
6. instale botão de emergência normalmente fechado em série com a alimentação ou habilitação;
7. confirme que a válvula normalmente fechada retorna fisicamente ao estado fechado sem energia;
8. energize primeiro apenas o Pi;
9. valide o estado desligado do relé;
10. energize a fonte de 12 V sem autorização;
11. teste uma operação curta com água;
12. acione o botão de emergência e confirme fechamento imediato.

## 13. Operação diária

Ver estado dos containers:

```bash
cd /opt/maverick-totem-src
docker compose ps
```

Acompanhar logs:

```bash
docker compose logs -f --tail=200
```

Reiniciar após alteração de configuração:

```bash
docker compose up -d --force-recreate
```

Parar com segurança:

```bash
docker compose stop
```

Atualizar o código:

```bash
cd /opt/maverick-totem-src
git pull --ff-only
docker compose up -d --build
```

## 14. Backup e recuperação

Faça backup do arquivo de ambiente e do volume de operações pendentes:

```bash
sudo cp /opt/maverick-totem-src/.env.docker /var/backups/maverick-env.docker
sudo docker run --rm \
  -v maverick-tap-state:/data \
  -v /var/backups:/backup \
  alpine tar czf /backup/maverick-tap-state.tgz -C /data .
```

Não publique o backup do `.env.docker`, pois ele contém o token do Totem.

## 15. Desinstalação

Para remover os containers e o volume de fila:

```bash
cd /opt/maverick-totem-src
docker compose down
# somente se tiver certeza de que não há operações pendentes:
docker volume rm maverick-tap-state
```

Para remover Docker do sistema, use o procedimento oficial da distribuição e confirme antes que nenhum outro serviço o utiliza.

## 16. Checklist de aprovação

- [ ] Docker inicia automaticamente no boot.
- [ ] `totem-app` fica `healthy`.
- [ ] A interface abre na porta configurada.
- [ ] O agente inicia com relé desligado.
- [ ] A autorização duplicada é rejeitada.
- [ ] O teste com pulsos simulados calcula volume e valor.
- [ ] O cenário sem fluxo fecha após 10 segundos.
- [ ] O cenário de parada fecha após 5 segundos.
- [ ] O timeout máximo fecha a saída.
- [ ] A perda da API não libera a torneira.
- [ ] A fila local sobrevive ao restart do container.
- [ ] O sensor foi calibrado com volume conhecido.
- [ ] A emergência física fecha a válvula independentemente do Docker.
- [ ] `ALLOW_INSECURE_LOCAL_API=false` antes de qualquer exposição externa.
- [ ] O acesso externo é somente por HTTPS/TLS.

Docker fornece empacotamento e reinicialização automática, mas não substitui systemd, firewall, TLS, atualização do Raspberry Pi OS ou os intertravamentos elétricos necessários para uma instalação de produção.
