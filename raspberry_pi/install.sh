#!/usr/bin/env bash
set -Eeuo pipefail

# Instalador do Totem Maverick Smart V2 para Raspberry Pi OS.
# Uso seguro por padrão: instala e valida, mas não inicia a solenoide sem --enable.

APP_USER="maverick"
APP_GROUP="maverick"
APP_DIR="/opt/maverick-totem"
TAP_DIR="/opt/maverick-tap"
STATE_DIR="/var/lib/maverick-tap"
CONFIG_DIR="/etc/maverick-totem"
TAP_CONFIG_DIR="/etc/maverick-tap"
REPO_URL="${MAVERICK_REPO_URL:-https://github.com/TiagoFacundo/totem-maverick-smart-v2.git}"
REPO_DIR="${MAVERICK_REPO_DIR:-/tmp/totem-maverick-smart-v2}"
BRANCH="${MAVERICK_BRANCH:-main}"
ENABLE_SERVICES=0
ENABLE_KIOSK=0
SKIP_BUILD=0
DRY_RUN=0

log() { printf '\033[1;36m[totem-installer]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[aviso]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m[erro]\033[0m %s\n' "$*" >&2; exit 1; }
run() { if (( DRY_RUN )); then printf '+ %q ' "$@"; printf '\n'; else "$@"; fi; }

usage() {
  cat <<'EOF'
Instala o Totem Maverick Smart V2 no Raspberry Pi OS.

Uso:
  sudo ./install.sh [opções]

Opções:
  --enable          habilita e inicia aplicação e agente GPIO
  --kiosk           também habilita o Chromium em modo kiosk
  --skip-build      não executa pnpm install/build; exige dist/ existente
  --dry-run         apenas mostra os comandos, sem alterar o sistema
  -h, --help        mostra esta ajuda

Variáveis opcionais:
  MAVERICK_REPO_URL URL do repositório Git
  MAVERICK_BRANCH   branch a instalar (padrão: main)
  MAVERICK_REPO_DIR diretório temporário do clone
EOF
}

while (($#)); do
  case "$1" in
    --enable) ENABLE_SERVICES=1 ;;
    --kiosk) ENABLE_KIOSK=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "opção desconhecida: $1" ;;
  esac
  shift
done

(( EUID == 0 )) || fail "execute como root: sudo ./install.sh"
[[ -f /etc/os-release ]] || fail "não foi possível identificar o sistema operacional"
. /etc/os-release
[[ "${ID:-}" == "raspbian" || "${ID_LIKE:-}" == *debian* ]] || warn "sistema não identificado como Raspberry Pi OS/Debian; continuando por sua conta"

if (( DRY_RUN )); then
  log "modo dry-run ativo"
else
  export DEBIAN_FRONTEND=noninteractive
  log "instalando dependências do sistema"
  apt-get update
  apt-get install -y --no-install-recommends git curl ca-certificates python3 python3-gpiozero nodejs npm chromium systemd openssl
fi

if ! id "$APP_USER" >/dev/null 2>&1; then
  run useradd --system --create-home --home-dir "/home/$APP_USER" --shell /usr/sbin/nologin "$APP_USER"
fi

run install -d -o "$APP_USER" -g "$APP_GROUP" -m 0750 "$APP_DIR" "$TAP_DIR" "$STATE_DIR"
run install -d -o root -g "$APP_GROUP" -m 0750 "$CONFIG_DIR" "$TAP_CONFIG_DIR"

if [[ -d "$REPO_DIR/.git" ]]; then
  log "atualizando repositório local em $REPO_DIR"
  run git -C "$REPO_DIR" fetch --depth=1 origin "$BRANCH"
  run git -C "$REPO_DIR" checkout -B "$BRANCH" "origin/$BRANCH"
else
  log "clonando $REPO_URL"
  run rm -rf "$REPO_DIR"
  run git clone --depth=1 --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
fi

if (( SKIP_BUILD == 0 )); then
  command -v node >/dev/null || fail "Node.js não está disponível"
  if ! command -v corepack >/dev/null 2>&1; then
    run npm install --global corepack
  fi
  run corepack enable
  log "instalando dependências e compilando a aplicação"
  run bash -c "cd '$REPO_DIR' && corepack pnpm install --frozen-lockfile && corepack pnpm check && corepack pnpm test && corepack pnpm build"
fi

if (( DRY_RUN == 0 )) && [[ ! -f "$REPO_DIR/dist/index.js" ]]; then
  fail "dist/index.js não encontrado; execute sem --skip-build ou forneça um build válido"
fi

log "instalando artefatos da aplicação"
run rm -rf "$APP_DIR/dist"
run cp -a "$REPO_DIR/dist" "$APP_DIR/dist"
run cp "$REPO_DIR/package.json" "$APP_DIR/package.json"
run chown -R "$APP_USER:$APP_GROUP" "$APP_DIR"
run chmod -R u=rwX,g=rX,o= "$APP_DIR"

log "instalando agente GPIO e unidades systemd"
run install -o "$APP_USER" -g "$APP_GROUP" -m 0750 "$REPO_DIR/raspberry_pi/solenoid_agent.py" "$TAP_DIR/solenoid_agent.py"
run install -o root -g root -m 0644 "$REPO_DIR/raspberry_pi/maverick-solenoid.service" /etc/systemd/system/maverick-solenoid.service
run install -o root -g root -m 0644 "$REPO_DIR/raspberry_pi/maverick-totem.service" /etc/systemd/system/maverick-totem.service
run install -o root -g root -m 0644 "$REPO_DIR/raspberry_pi/maverick-totem-kiosk.service" /etc/systemd/system/maverick-totem-kiosk.service

if [[ ! -f "$TAP_CONFIG_DIR/solenoid.env" ]]; then
  run install -o root -g "$APP_GROUP" -m 0640 "$REPO_DIR/raspberry_pi/solenoid.env.example" "$TAP_CONFIG_DIR/solenoid.env"
  warn "edite $TAP_CONFIG_DIR/solenoid.env antes de iniciar o agente"
else
  log "preservando configuração existente: $TAP_CONFIG_DIR/solenoid.env"
fi

if [[ ! -f "$CONFIG_DIR/totem.env" ]]; then
  if (( DRY_RUN == 0 )); then
    token="$(openssl rand -hex 32)"
    cat > "$CONFIG_DIR/totem.env" <<EOF
NODE_ENV=production
PORT=3000
TOTEM_API_TOKEN=$token
EOF
    chown root:"$APP_GROUP" "$CONFIG_DIR/totem.env"
    chmod 0640 "$CONFIG_DIR/totem.env"
  else
    log "criaria $CONFIG_DIR/totem.env com token aleatório"
  fi
else
  log "preservando configuração existente: $CONFIG_DIR/totem.env"
fi

run systemctl daemon-reload
run systemctl disable --now maverick-totem-kiosk.service 2>/dev/null || true

if (( ENABLE_SERVICES )); then
  log "habilitando aplicação e agente GPIO"
  run systemctl enable --now maverick-totem.service
  run systemctl enable --now maverick-solenoid.service
  if (( ENABLE_KIOSK )); then
    run systemctl enable --now maverick-totem-kiosk.service
  fi
else
  log "modo seguro: serviços instalados, mas não iniciados"
fi

cat <<EOF

Instalação concluída.

Próximos passos:
  1. Edite: sudo nano $TAP_CONFIG_DIR/solenoid.env
  2. Confirme GPIO, URL HTTPS, calibração e modo de teste.
  3. Valide: sudo systemctl status maverick-totem.service maverick-solenoid.service
  4. Logs: sudo journalctl -u maverick-solenoid.service -f
  5. Quando aprovado sem carga, inicie: sudo systemctl enable --now maverick-solenoid.service

A aplicação local usa:
  $APP_DIR/dist/index.js

Nunca conecte a solenoide diretamente ao GPIO. Use relé/driver apropriado,
fonte dedicada, fusível e botão de emergência físico normalmente fechado.
EOF
