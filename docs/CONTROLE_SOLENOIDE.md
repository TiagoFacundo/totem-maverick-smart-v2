# Controle da Solenoide — Totem Maverick

## O que já existia na aplicação

O código do servidor não aciona uma porta GPIO, pois o ambiente web não possui acesso ao Raspberry Pi. Ele oferece o contrato que autoriza e controla a operação física. O trecho abaixo, em `server/tapApi.ts`, fornece ao Pi o comando autorizado de dispensação:

```ts
app.get("/api/public/tap/:tapId/command", (req, res) => {
  const active = state.session;
  const command = active.status === "error"
    ? { type: "emergency_stop", session_id: active.sessionId }
    : {
        type: "start_pour",
        session_id: active.sessionId,
        max_volume_ml: active.maxVolumeMl,
        max_value_cents: active.maxValueCents,
        product: {
          name: active.product.name,
          price_per_100ml_cents: active.product.pricePer100mlCents,
        },
      };
  return res.json({ tap_id: tapId, command });
});
```

O fechamento lógico do ciclo também já existe no servidor. O endpoint `POST /finished` recebe o volume e o valor medidos, encerra a sessão e responde de modo idempotente.

## Código que aciona o relé no Raspberry Pi

O novo arquivo `raspberry_pi/solenoid_agent.py` é o agente físico. O núcleo do acionamento é este:

```py
class Solenoid:
    def __init__(self, pin: int, active_high: bool):
        self._relay = OutputDevice(pin, active_high=active_high, initial_value=False)
        self.off()

    def on(self) -> None:
        self._relay.on()

    def off(self) -> None:
        self._relay.off()
```

Quando recebe `start_pour`, o agente cria a sessão, zera o medidor de fluxo e somente então liga o relé:

```py
def start_pour(self, command: dict[str, Any]) -> None:
    self.flow.reset()
    self.active = ActivePour(
        session_id=command["session_id"],
        max_volume_ml=float(command["max_volume_ml"]),
        max_value_cents=int(command["max_value_cents"]),
        price_per_100ml_cents=int(command["product"]["price_per_100ml_cents"]),
        started_at=time.time(),
    )
    self.solenoid.on()
```

O método `finish` desliga fisicamente a saída **antes** da requisição HTTP e envia `POST /finished`. O mesmo fechamento ocorre em limite de volume, limite de valor, timeout, parada de emergência, perda consecutiva de polling, retirada do comando pelo servidor, encerramento pelo servidor e sinais `SIGINT` ou `SIGTERM`.

## Caminhos possíveis

| Alternativa | O que está pronto | Indicação |
|---|---|---|
| Somente simulador REST | Interface e servidor representam sessões, comandos e resultados sem GPIO | Demonstração, testes de fluxo e homologação de API |
| Agente Raspberry Pi incluído | Processo Python com GPIO, sensor de fluxo, fila local e fail-safe | Instalação em bancada e operação física após testar a elétrica |

> A válvula deve ser alimentada por circuito próprio e controlada por módulo de relé/driver apropriado. Não use o pino GPIO como fonte de alimentação da solenoide. Inclua um **E-stop físico normalmente fechado** em série com o circuito de potência ou de habilitação do driver; o software é uma camada complementar, não substitui esse corte.
