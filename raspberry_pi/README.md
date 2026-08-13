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
