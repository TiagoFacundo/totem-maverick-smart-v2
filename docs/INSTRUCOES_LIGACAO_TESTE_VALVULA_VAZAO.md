# Instruções de Ligação e Teste da Válvula de Vazão

**Projeto:** Totem Maverick Smart v2  
**Aplicação:** bancada de teste com Raspberry Pi, sensor de vazão, relé ou driver isolado e válvula solenoide  
**Estado:** procedimento de homologação em bancada

## 1. Objetivo e condição de segurança

Este documento descreve como ligar e testar o conjunto responsável por liberar e medir o fluxo. O procedimento começa com o relé sem carga e somente depois conecta a válvula a uma fonte hidráulica controlada.

> **Nunca ligue a bobina da válvula diretamente ao GPIO do Raspberry Pi.** O GPIO fornece apenas um sinal lógico para a entrada de um relé ou driver adequado. A válvula deve usar uma fonte própria, com proteção elétrica dimensionada para sua tensão e corrente.

A instalação deve possuir um botão de parada de emergência físico, normalmente fechado (**E-stop NC**), em série com a alimentação da válvula ou com a habilitação do driver. O desligamento por software é uma proteção complementar e não substitui o corte físico.

Não execute o teste com cerveja. Use água limpa, um recipiente graduado e uma área capaz de conter vazamentos.

## 2. Componentes necessários

São necessários um Raspberry Pi com alimentação estável, um sensor de vazão por pulsos, um módulo de relé ou driver isolado compatível com sinal lógico de 3,3 V, uma válvula solenoide, uma fonte dedicada para a válvula, fusível adequado, botão E-stop normalmente fechado, mangueiras e conexões compatíveis, além de um recipiente graduado.

O relé ou driver deve suportar a tensão e a corrente da bobina da válvula. A fonte da válvula não deve ser escolhida apenas pela tensão nominal; verifique também a corrente de partida e o regime contínuo indicado pelo fabricante.

## 3. Pinos usados no projeto

A configuração atual usa numeração **BCM**, que é diferente da numeração física dos pinos do conector.

| Função | GPIO BCM | Pino físico | Ligação
|---|---:|---:|---|
| Sinal de controle do relé ou driver | GPIO17 | 11 | Entrada `IN` do módulo |
| Sensor de vazão | GPIO27 | 13 | Saída de pulsos do sensor |
| Terra lógico | GND | 6 | `GND` comum do Raspberry Pi e do módulo lógico |

O GPIO27 deve receber somente um nível compatível com 3,3 V. Se o sensor produzir 5 V na saída, use um conversor de nível ou outro circuito de adequação. Não conecte uma saída de 5 V diretamente ao GPIO.

## 4. Ligação do sinal lógico

Desligue todas as fontes antes de fazer a ligação. Conecte o Raspberry Pi ao módulo de controle desta forma:

```text
Raspberry Pi                         Relé ou driver isolado
────────────────                     ──────────────────────
GPIO17 / pino físico 11  ──────────> IN / sinal de controle
GND    / pino físico 6   ──────────> GND lógico
5 V ou 3,3 V                         VCC, somente conforme o datasheet
```

O módulo deve ser alimentado com a tensão especificada pelo fabricante. Alguns módulos aceitam 5 V na alimentação e 3,3 V na entrada lógica; outros não. Confirme essa compatibilidade antes de energizar.

Ligue o sensor de vazão conforme o datasheet do modelo instalado:

```text
Sensor de vazão                      Raspberry Pi
────────────────                     ─────────────
VCC                                  Fonte compatível do sensor
GND                                  GND do circuito lógico
OUT / pulso                          GPIO27 / pino físico 13
```

Mantenha os cabos do sensor separados dos cabos de potência da válvula. Isso reduz ruído elétrico e leituras falsas.

## 5. Ligação do circuito de potência da válvula

A válvula deve ser ligada ao contato **normalmente aberto** do relé. Assim, o relé desligado mantém a válvula fechada.

```text
Fonte da válvula (+)
        │
      Fusível
        │
     E-stop NC
        │
     COM do relé
        │
     NO do relé  ─────────── (+) válvula solenoide

(-) válvula solenoide ────── (-) fonte da válvula
```

Não use o contato `NC` para alimentar a válvula. A ligação `COM + NC` pode manter a válvula energizada quando o relé estiver desligado.

O diagrama acima é conceitual. A proteção contra transientes deve seguir o tipo de carga e o circuito recomendado pelo fabricante do relé, driver e válvula. Em cargas de corrente contínua, normalmente é necessária proteção contra a tensão de retorno da bobina. Em cargas de corrente alternada, utilize o dispositivo de supressão apropriado.

## 6. Configuração do agente

No Raspberry Pi, a configuração usada pelo serviço fica em:

```bash
/etc/maverick-tap/solenoid.env
```

Use inicialmente os seguintes valores:

```ini
MAVERICK_SERVER_URL=https://SEU_SERVIDOR.example.com
TOTEM_ID=TOTEM_001
TAP_ID=TORNEIRA_01
SOLENOID_GPIO=17
FLOW_SENSOR_GPIO=27
RELAY_ACTIVE_HIGH=false
FLOW_PULSES_PER_LITER=450
FLOW_THRESHOLD_PULSES_PER_SEC=0.5
NO_FLOW_START_SECONDS=10
FLOW_STOP_SECONDS=5
COMMAND_POLL_SECONDS=0.5
MAX_POUR_SECONDS=90
MAX_POLL_FAILURES=3
MAVERICK_TEST_MODE=false
TEST_PULSES_PER_SEC=0
PENDING_FINISH_FILE=/var/lib/maverick-tap/pending_finished.json
```

`RELAY_ACTIVE_HIGH=false` é o padrão adotado para módulos comuns ativos em nível baixo. Isso precisa ser confirmado no teste sem carga. Se o relé apresentar comportamento invertido, não conecte a válvula; valide a polaridade do módulo e ajuste essa variável conforme o datasheet e o teste elétrico.

`FLOW_PULSES_PER_LITER=450` é apenas um valor inicial. O valor final deve ser calibrado com um volume conhecido.

Proteja o arquivo de configuração:

```bash
sudo chown root:maverick /etc/maverick-tap/solenoid.env
sudo chmod 640 /etc/maverick-tap/solenoid.env
```

## 7. Teste 1 — relé sem válvula conectada

Este teste valida a lógica de desligamento sem risco hidráulico.

1. Desconecte a fonte de potência da válvula.
2. Mantenha o Raspberry Pi e o módulo de relé ou driver ligados.
3. Confirme que o circuito de potência está aberto ou que a válvula está desconectada.
4. Reinicie o serviço:

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart maverick-solenoid
   sudo systemctl status maverick-solenoid --no-pager
   ```

5. Confirme que o relé permanece desligado durante a inicialização.
6. Acione a leitura simulada no totem. O relé somente deve mudar de estado depois que o servidor enviar uma autorização `start_pour`.
7. Pare o agente com `Ctrl+C` ou execute:

   ```bash
   sudo systemctl stop maverick-solenoid
   ```

8. Confirme que o relé volta para desligado.

Se o relé ligar no boot, interrompa o procedimento. Verifique a polaridade `RELAY_ACTIVE_HIGH`, a ligação `COM + NO` e a existência de um nível flutuante na entrada do módulo.

## 8. Teste 2 — sensor de vazão sem válvula

Este teste verifica os pulsos antes de liberar água pela válvula.

1. Deixe a fonte da válvula desligada.
2. Ligue o sensor de vazão ao GPIO27.
3. Faça passar água pelo sensor usando uma bomba ou circuito manual controlado.
4. Observe o log do agente:

   ```bash
   sudo journalctl -u maverick-solenoid -f
   ```

5. Compare o volume indicado pelo sistema com o volume coletado em um recipiente graduado.
6. Repita a medição pelo menos três vezes.

Se houver pulsos sem fluxo, verifique ruído, aterramento, alimentação do sensor e o tempo de debounce. Se não houver pulsos durante o fluxo, verifique a tensão da saída `OUT`, o GPIO configurado e a orientação hidráulica do sensor.

## 9. Teste 3 — modo simulado do agente

O modo simulado valida a lógica de autorização, cálculo e encerramento sem depender de pulsos reais do sensor. Ele não valida a hidráulica.

Configure temporariamente:

```ini
MAVERICK_TEST_MODE=true
TEST_PULSES_PER_SEC=8
```

Reinicie o agente e acione uma autorização pelo totem. O agente deve ligar o relé somente depois de receber o comando autorizado, gerar pulsos internos e encerrar quando atingir o limite da sessão.

Para testar a proteção contra ausência de fluxo, use:

```ini
MAVERICK_TEST_MODE=true
TEST_PULSES_PER_SEC=0
NO_FLOW_START_SECONDS=10
```

Após a autorização, o agente deve desligar a válvula depois de 10 segundos sem pulsos e registrar o encerramento como `not_started` com o código `NO_FLOW_10S`.

Depois do teste, retorne obrigatoriamente para:

```ini
MAVERICK_TEST_MODE=false
TEST_PULSES_PER_SEC=0
```

## 10. Teste 4 — válvula com água

Somente execute este teste depois de aprovar os testes sem carga.

1. Instale a válvula no circuito hidráulico com água.
2. Coloque um recipiente graduado na saída.
3. Verifique todas as conexões e mantenha o E-stop acessível.
4. Ligue a fonte dedicada da válvula.
5. Reinicie o agente e confirme que a válvula permanece fechada.
6. No totem, acione **[DEV] SIMULAR ESCANEAMENTO** ou outro fluxo autorizado de teste.
7. Confirme que a válvula abre somente após `start_pour` autorizado.
8. Meça o volume coletado e compare com o volume informado pelo agente.
9. Interrompa o fluxo e confirme o fechamento após `FLOW_STOP_SECONDS`.
10. Acione o E-stop e confirme que a válvula fecha pelo circuito físico, mesmo que o software esteja indisponível.

Não deixe a válvula aberta sem supervisão. Durante o primeiro teste hidráulico, use um limite de volume pequeno e mantenha a mão próxima ao E-stop.

## 11. Calibração do sensor

A calibração relaciona pulsos do sensor com volume real. Para cada ciclo, deixe o sistema entregar um volume conhecido em um recipiente graduado e registre a quantidade de pulsos.

Use a relação:

```text
pulsos por litro = pulsos medidos × 1000 / volume medido em ml
```

Faça pelo menos três ciclos. Use a média dos resultados somente se a diferença entre os ciclos for aceitável. Depois, atualize:

```ini
FLOW_PULSES_PER_LITER=VALOR_CALIBRADO
```

Reinicie o serviço e repita o teste com um segundo volume conhecido. Registre o sensor, a data, o volume de referência, a quantidade de pulsos e o valor calibrado.

## 12. Testes de falha obrigatórios

A homologação só deve avançar quando todos os resultados abaixo forem observados:

| Situação | Resultado esperado |
|---|---|
| Agente inicia | Relé desligado e válvula fechada |
| Não há autorização | Válvula permanece fechada |
| Comando sem `authorized: true` | Válvula permanece fechada |
| Comando desaparece | Relé desliga e a sessão é encerrada com erro |
| Não há fluxo inicial | Válvula desliga após 10 segundos |
| Fluxo para durante a sessão | Válvula desliga após 5 segundos |
| Limite de volume atingido | Válvula desliga antes do `POST /finished` |
| Limite financeiro atingido | Válvula desliga |
| Timeout atingido | Válvula desliga |
| Três falhas consecutivas de rede | Válvula desliga |
| E-stop pressionado | Alimentação física da válvula é interrompida |
| Raspberry Pi desligado | Válvula fica desenergizada |

## 13. Diagnóstico rápido

### A válvula fica aberta no boot

Desligue imediatamente a fonte da válvula. Verifique se a bobina está em `COM + NO`, confirme `RELAY_ACTIVE_HIGH=false` e teste o relé sem a válvula conectada. Se o módulo for ativo em nível alto, altere a configuração somente depois de confirmar o comportamento com um multímetro.

### A válvula abre, mas o volume não aumenta

Verifique se o sensor está instalado no sentido correto, se há água passando pelo rotor, se o GPIO27 recebe níveis compatíveis com 3,3 V e se o sensor possui alimentação adequada.

### O volume indicado não corresponde ao volume real

Calibre `FLOW_PULSES_PER_LITER`. Não altere os limites de segurança para compensar um sensor sem calibração.

### A válvula fecha mesmo com fluxo

Verifique o valor de `FLOW_STOP_SECONDS`, a taxa mínima definida em `FLOW_THRESHOLD_PULSES_PER_SEC`, o debounce e a qualidade da alimentação do sensor. Ruído elétrico ou pulsos ausentes podem ser interpretados como falta de fluxo.

### O relé não aciona após autorização

Confirme que o servidor enviou `start_pour`, que o comando contém `authorized: true`, que o `TOTEM_ID` e o `TAP_ID` estão corretos e que o agente possui acesso à URL configurada em `MAVERICK_SERVER_URL`.

## 14. Registro de homologação

Preencha este registro para cada rodada de teste:

| Campo | Registro |
|---|---|
| Data e hora | |
| Responsável | |
| Raspberry Pi | |
| Sensor e modelo | |
| Válvula e tensão | |
| Relé ou driver | |
| GPIO do relé | 17 |
| GPIO do sensor | 27 |
| `RELAY_ACTIVE_HIGH` | false |
| `FLOW_PULSES_PER_LITER` | |
| Volume de referência | |
| Pulsos medidos | |
| Resultado do E-stop | |
| Resultado da perda de rede | |
| Não conformidades | |
| Liberação para próximo teste | |

## Referências

[1]: ../raspberry_pi/solenoid_agent.py "Agente GPIO da solenoide e sensor de vazão"
[2]: ../raspberry_pi/README.md "Instruções do agente GPIO do Raspberry Pi"
[3]: ./CONTROLE_SOLENOIDE.md "Controle da solenoide do Totem Maverick"
[4]: ./ESQUEMA_LIGACAO_SOLENOIDE_PROTOBOARD.mmd "Esquema de ligação da solenoide em protoboard"
[5]: ./MANUAL_INSTALACAO_DOCKER_RASPBERRY_PI.md "Manual de instalação do Raspberry Pi"
[6]: ./ROTEIRO_VALIDACAO_OPERACIONAL.md "Roteiro de validação operacional"

[1] [2] [3] [4] [5] [6]

author: Manus AI
