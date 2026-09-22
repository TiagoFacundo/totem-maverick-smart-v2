#!/usr/bin/env python3
"""Agente de dispensação Maverick para Raspberry Pi.

O relé inicia DESLIGADO e é desligado novamente em qualquer exceção,
perda de comunicação, limite de volume, timeout ou sinal de encerramento.
Nunca ligue a bobina da solenoide diretamente ao GPIO: use relé/driver adequado.
"""

from __future__ import annotations

import json
import logging
import os
import signal
import socket
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

from gpiozero import Button, OutputDevice


SERVER_URL = os.environ.get("MAVERICK_SERVER_URL", "https://SEU-SERVIDOR.example.com").rstrip("/")
API_TOKEN = os.environ.get("TOTEM_API_TOKEN", "")
TOTEM_ID = os.environ.get("TOTEM_ID", "TOTEM_001")
TAP_ID = os.environ.get("TAP_ID", "TORNEIRA_01")
RELAY_GPIO = int(os.environ.get("SOLENOID_GPIO", "17"))
FLOW_GPIO = int(os.environ.get("FLOW_SENSOR_GPIO", "27"))
# A maioria dos módulos de relé para Raspberry Pi é ativo em nível baixo.
# Ajuste para true somente após testar o seu módulo sem a solenoide conectada.
RELAY_ACTIVE_HIGH = os.environ.get("RELAY_ACTIVE_HIGH", "false").lower() == "true"
FLOW_PULSES_PER_LITER = float(os.environ.get("FLOW_PULSES_PER_LITER", "450"))
FLOW_THRESHOLD_PULSES_PER_SEC = float(os.environ.get("FLOW_THRESHOLD_PULSES_PER_SEC", "0.5"))
NO_FLOW_START_SECONDS = float(os.environ.get("NO_FLOW_START_SECONDS", "10"))
FLOW_STOP_SECONDS = float(os.environ.get("FLOW_STOP_SECONDS", "5"))
TEST_MODE = os.environ.get("MAVERICK_TEST_MODE", "false").lower() == "true"
TEST_PULSES_PER_SEC = float(os.environ.get("TEST_PULSES_PER_SEC", "0"))
POLL_SECONDS = float(os.environ.get("COMMAND_POLL_SECONDS", "0.5"))
MAX_POUR_SECONDS = float(os.environ.get("MAX_POUR_SECONDS", "90"))
MAX_POLL_FAILURES = int(os.environ.get("MAX_POLL_FAILURES", "3"))
PENDING_FILE = Path(os.environ.get("PENDING_FINISH_FILE", "/var/lib/maverick-tap/pending_finished.json"))
logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s maverick-tap %(message)s")
logger = logging.getLogger("maverick-tap")


def now_epoch() -> int:
    return int(time.time())


def notify_watchdog() -> None:
    address = os.environ.get("NOTIFY_SOCKET")
    if not address:
        return
    try:
        target = "\0" + address[1:] if address.startswith("@") else address
        with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as sock:
            sock.connect(target)
            sock.sendall(b"WATCHDOG=1")
    except OSError:
        pass


def json_request(method: str, path: str, payload: dict[str, Any] | None = None, idempotency_key: str | None = None) -> dict[str, Any]:
    headers = {"X-Totem-ID": TOTEM_ID, "Accept": "application/json"}
    if API_TOKEN:
        headers["Authorization"] = f"Bearer {API_TOKEN}"
    body = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        headers["Idempotency-Key"] = idempotency_key or str(uuid.uuid4())
        body = json.dumps(payload).encode("utf-8")
    request = Request(f"{SERVER_URL}{path}", data=body, headers=headers, method=method)
    with urlopen(request, timeout=4) as response:
        return json.loads(response.read().decode("utf-8"))


class FlowMeter:
    """Conta pulsos de sensor de fluxo conectado entre GPIO e GND."""

    def __init__(self, pin: int, pulses_per_liter: float):
        self._lock = Lock()
        self._pulses = 0
        self._pulses_per_liter = pulses_per_liter
        self._sensor = Button(pin, pull_up=True, bounce_time=0.002)
        self._sensor.when_pressed = self._count_pulse

    def _count_pulse(self) -> None:
        with self._lock:
            self._pulses += 1

    def reset(self) -> None:
        with self._lock:
            self._pulses = 0

    def inject(self, count: int) -> None:
        with self._lock:
            self._pulses += max(0, count)

    @property
    def pulses(self) -> int:
        with self._lock:
            return self._pulses

    @property
    def volume_ml(self) -> float:
        with self._lock:
            return (self._pulses / self._pulses_per_liter) * 1000

    def close(self) -> None:
        self._sensor.close()


class Solenoid:
    """Saída fail-safe. O construtor e close() sempre deixam o relé desligado."""

    def __init__(self, pin: int, active_high: bool):
        self._relay = OutputDevice(pin, active_high=active_high, initial_value=False)
        self.off()

    def on(self) -> None:
        self._relay.on()

    def off(self) -> None:
        self._relay.off()

    def close(self) -> None:
        self.off()
        self._relay.close()


@dataclass
class ActivePour:
    session_id: str
    max_volume_ml: float
    max_value_cents: int
    price_per_100ml_cents: int
    started_at: float
    flow_started_at: float | None = None
    last_pulse_at: float | None = None
    last_pulses: int = 0


class TapAgent:
    def __init__(self) -> None:
        self.solenoid = Solenoid(RELAY_GPIO, RELAY_ACTIVE_HIGH)
        self.flow = FlowMeter(FLOW_GPIO, FLOW_PULSES_PER_LITER)
        self.active: ActivePour | None = None
        self.poll_failures = 0
        self.running = True

    def stop(self, *_: object) -> None:
        self.running = False
        self.solenoid.off()

    def queue_finish(self, payload: dict[str, Any], key: str) -> None:
        PENDING_FILE.parent.mkdir(parents=True, exist_ok=True)
        try:
            pending = json.loads(PENDING_FILE.read_text()) if PENDING_FILE.exists() else []
        except (OSError, json.JSONDecodeError):
            pending = []
        pending.append({"payload": payload, "key": key})
        PENDING_FILE.write_text(json.dumps(pending[-20:]))

    def flush_pending(self) -> None:
        if not PENDING_FILE.exists():
            return
        try:
            pending = json.loads(PENDING_FILE.read_text())
        except (OSError, json.JSONDecodeError):
            return
        remaining = []
        for item in pending:
            try:
                json_request("POST", f"/api/public/tap/{TAP_ID}/finished", item["payload"], item["key"])
            except (URLError, TimeoutError, OSError):
                remaining.append(item)
        PENDING_FILE.write_text(json.dumps(remaining))

    def value_cents(self) -> int:
        if not self.active:
            return 0
        return round((self.flow.volume_ml / 100) * self.active.price_per_100ml_cents)

    def finish(self, status: str, error_code: str | None = None) -> None:
        if not self.active:
            self.solenoid.off()
            return
        active = self.active
        logger.info("fechando operação %s status=%s erro=%s volume_ml=%s", active.session_id, status, error_code, round(self.flow.volume_ml))
        # A saída é desligada antes de qualquer chamada de rede.
        self.solenoid.off()
        payload: dict[str, Any] = {
            "session_id": active.session_id,
            "status": status,
            "volume_poured_ml": round(self.flow.volume_ml),
            "value_cents": self.value_cents(),
            "started_at": int(active.started_at),
            "finished_at": now_epoch(),
        }
        if error_code:
            payload["error_code"] = error_code
        key = f"{active.session_id}-finished"
        self.active = None
        try:
            json_request("POST", f"/api/public/tap/{TAP_ID}/finished", payload, key)
        except (URLError, TimeoutError, OSError):
            self.queue_finish(payload, key)

    def start_pour(self, command: dict[str, Any]) -> None:
        session_id = command.get("session_id")
        if not session_id:
            return
        if self.active and self.active.session_id == session_id:
            return
        if self.active:
            self.finish("error", "SESSION_REPLACED")
        product = command.get("product") or {}
        self.flow.reset()
        self.active = ActivePour(
            session_id=session_id,
            max_volume_ml=float(command["max_volume_ml"]),
            max_value_cents=int(command["max_value_cents"]),
            price_per_100ml_cents=int(product["price_per_100ml_cents"]),
            started_at=time.time(),
        )
        logger.info("autorização recebida operação=%s limite_ml=%s", session_id, command.get("max_volume_ml"))
        self.solenoid.on()

    def flow_rate(self, now: float) -> float:
        if not self.active:
            return 0.0
        if TEST_MODE and TEST_PULSES_PER_SEC > 0:
            self.flow.inject(round(TEST_PULSES_PER_SEC * POLL_SECONDS))
        pulses = self.flow.pulses
        elapsed = max(0.001, now - self.active.started_at)
        delta = pulses - self.active.last_pulses
        self.active.last_pulses = pulses
        if delta > 0:
            self.active.last_pulse_at = now
            if self.active.flow_started_at is None:
                self.active.flow_started_at = now
        return delta / elapsed

    def enforce_limits(self) -> None:
        if not self.active:
            return
        now = time.time()
        pulses_per_sec = self.flow_rate(now)
        if self.active.flow_started_at is None and now - self.active.started_at >= NO_FLOW_START_SECONDS:
            self.finish("not_started", "NO_FLOW_10S")
            return
        if self.active.flow_started_at is not None and self.active.last_pulse_at is not None and now - self.active.last_pulse_at >= FLOW_STOP_SECONDS and pulses_per_sec < FLOW_THRESHOLD_PULSES_PER_SEC:
            self.finish("finished", "FLOW_STOP_5S")
            return
        if self.flow.volume_ml >= self.active.max_volume_ml:
            self.finish("finished")
        elif self.value_cents() >= self.active.max_value_cents:
            self.finish("finished")
        elif now - self.active.started_at >= MAX_POUR_SECONDS:
            self.finish("error", "SAFETY_TIMEOUT")

    def apply_command(self, command: dict[str, Any] | None) -> None:
        if command is None:
            # A retirada de comando é tratada como condição insegura para uma sessão ativa.
            # O método finish desliga a saída antes de enviar POST /finished.
            if self.active:
                self.finish("error", "COMMAND_WITHDRAWN")
            else:
                self.solenoid.off()
            return
        command_type = command.get("type")
        if command_type == "emergency_stop":
            self.finish("error", "EMERGENCY_STOP")
        elif command_type == "close":
            self.finish("finished")
        elif command_type == "start_pour" and command.get("authorized") is True:
            self.start_pour(command)
        else:
            # Nunca energizar a saída por comando ausente, desconhecido ou sem
            # autorização explícita. Isso também cobre respostas antigas do API.
            self.solenoid.off()

    def run(self) -> None:
        try:
            while self.running:
                notify_watchdog()
                self.flush_pending()
                try:
                    response = json_request("GET", f"/api/public/tap/{TAP_ID}/command")
                    self.poll_failures = 0
                    self.apply_command(response.get("command"))
                    self.enforce_limits()
                except (URLError, TimeoutError, OSError, ValueError, KeyError):
                    self.poll_failures += 1
                    logger.warning("falha de comunicação consecutiva=%s", self.poll_failures)
                    if self.poll_failures >= MAX_POLL_FAILURES:
                        self.finish("error", "COMMAND_POLL_FAILED")
                time.sleep(POLL_SECONDS)
        finally:
            self.solenoid.off()
            self.flow.close()
            self.solenoid.close()


if __name__ == "__main__":
    agent = TapAgent()
    signal.signal(signal.SIGINT, agent.stop)
    signal.signal(signal.SIGTERM, agent.stop)
    agent.run()
