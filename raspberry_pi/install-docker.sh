#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="${MAVERICK_REPO_DIR:-/opt/maverick-totem-src}"
BRANCH="${MAVERICK_BRANCH:-main}"
REPO_URL="${MAVERICK_REPO_URL:-https://github.com/TiagoFacundo/totem-maverick-smart-v2.git}"
ENV_FILE="$REPO_DIR/.env.docker"

log() { printf '\033[1;36m[docker-installer]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[erro]\033[0m %s\n' "$*" >&2; exit 1; }

(( EUID == 0 )) || fail "execute como root: sudo ./raspberry_pi/install-docker.sh"

. /etc/os-release
[[ "${ID_LIKE:-}" == *debian* || "${ID:-}" == "raspbian" ]] || fail "este instalador espera Raspberry Pi OS/Debian"

log "instalando Docker Engine e Compose plugin"
apt-get update
apt-get install -y ca-certificates curl git openssl
install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
fi
arch="$(dpkg --print-architecture)"
release="${VERSION_CODENAME:-bookworm}"
printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian %s stable\n' "$arch" "$release" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

if [[ -d "$REPO_DIR/.git" ]]; then
  git -C "$REPO_DIR" fetch --depth=1 origin "$BRANCH"
  git -C "$REPO_DIR" checkout -B "$BRANCH" "origin/$BRANCH"
else
  rm -rf "$REPO_DIR"
  git clone --depth=1 --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
fi

cd "$REPO_DIR"
if [[ ! -f .env.docker ]]; then
  cp .env.docker.example .env.docker
fi

if command -v getent >/dev/null 2>&1 && getent group gpio >/dev/null 2>&1; then
  gpio_gid="$(getent group gpio | cut -d: -f3)"
  sed -i "s/^GPIO_GID=.*/GPIO_GID=$gpio_gid/" .env.docker
fi

chmod 600 .env.docker
log "configuração criada em $ENV_FILE"
log "faça primeiro um teste sem iniciar o agente GPIO:"
printf '  cd %q && docker compose build totem-app && docker compose up -d totem-app\n' "$REPO_DIR"
printf '  docker compose logs -f totem-app\n'
printf '\nDepois de revisar .env.docker e a fiação, inicie o agente com:\n'
printf '  cd %q && docker compose up -d\n' "$REPO_DIR"
printf '\nPara ver o estado:\n'
printf '  cd %q && docker compose ps\n' "$REPO_DIR"
