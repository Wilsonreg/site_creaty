#!/usr/bin/env bash
# Pila completa del preview de Creaty Site:
#   astro preview (sitio, :4321)  ->  gateway (:8780)  ->  cloudflared
#   gateway enruta /api/* a la API (:8787)
#
#   ./scripts/stack.sh start|stop|status|logs
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT/api"
RUN="${XDG_RUNTIME_DIR:-/tmp}/creaty-preview"
mkdir -p "$RUN"

declare -A PIDS=(
  [api]="$RUN/api.pid"
  [gateway]="$RUN/gateway.pid"
  [site]="$RUN/site.pid"
  [tunnel]="$RUN/tunnel.pid"
)
declare -A LOGS=(
  [api]="$RUN/api.log"
  [gateway]="$RUN/gateway.log"
  [site]="$RUN/site.log"
  [tunnel]="$RUN/tunnel.log"
)

PORT_SITE=4321
PORT_API=8787
PORT_GATEWAY=8780

alive() {
  # 'astro preview' se demoniza: el PID guardado es el wrapper de npx, que
  # termina de inmediato. Para el sitio la fuente de verdad es el puerto.
  if [ "$1" = "site" ]; then
    curl -fs -m 2 -o /dev/null "http://127.0.0.1:$PORT_SITE/" && return 0
    return 1
  fi
  [ -f "${PIDS[$1]}" ] && kill -0 "$(cat "${PIDS[$1]}")" 2>/dev/null
}

start_one() {
  local name="$1"; shift
  alive "$name" && { echo "  · $name ya estaba corriendo"; return; }
  local dir="$1"; shift
  # setsid crea una sesion nueva: el proceso sobrevive si muere el shell que
  # lo lanzo. Como setsid hace fork, el PID que we'd guardar seria el del
  # padre (que termina al instante) y el status mintiria; por eso el hijo
  # escribe su propio $$ y luego exec, conservando ese PID.
  ( cd "$dir" && setsid bash -c 'echo $$ > "$1"; shift; exec "$@"' _ "${PIDS[$name]}" "$@" \
      >"${LOGS[$name]}" 2>&1 </dev/null & )
  sleep 0.5
}

wait_http() {
  local url="$1" tries="${2:-40}"
  for _ in $(seq 1 "$tries"); do
    curl -fs -m 2 -o /dev/null "$url" && return 0
    sleep 0.5
  done
  return 1
}

case "${1:-start}" in
  start)
    echo "▸ Sitio…"
    start_one site "$ROOT" npx astro preview --port $PORT_SITE --host 127.0.0.1
    wait_http "http://127.0.0.1:$PORT_SITE/" || { echo "✗ el sitio no arranco"; tail -5 "${LOGS[site]}"; exit 1; }

    echo "▸ API…"
    start_one api "$API_DIR" node src/server.js
    wait_http "http://127.0.0.1:$PORT_API/api/health" || { echo "✗ la API no arranco (revisa ${LOGS[api]})"; tail -10 "${LOGS[api]}"; exit 1; }

    echo "▸ Gateway…"
    start_one gateway "$API_DIR" node src/gateway.js
    wait_http "http://127.0.0.1:$PORT_GATEWAY/api/health" || { echo "✗ el gateway no arranco"; tail -5 "${LOGS[gateway]}"; exit 1; }

    if [ -f "$HOME/.creaty-preview/tunnel.token" ]; then
      echo "▸ Cloudflare Tunnel…"
      TOKEN=$(cat "$HOME/.creaty-preview/tunnel.token")
      start_one tunnel "$ROOT" "$HOME/.local/bin/cloudflared" tunnel --no-autoupdate run --token "$TOKEN"
      for _ in $(seq 1 30); do
        grep -q "Registered tunnel connection" "${LOGS[tunnel]}" 2>/dev/null && break
        sleep 1
      done
      if grep -q "Registered tunnel connection" "${LOGS[tunnel]}" 2>/dev/null; then
        echo "  ✓ conector registrado"
      else
        echo "  ! el conector no se registro; revisa ${LOGS[tunnel]}"
      fi
    else
      echo "▸ Tunnel omitido (falta ~/.creaty-preview/tunnel.token)"
    fi

    echo
    echo "  Sitio   http://127.0.0.1:$PORT_SITE"
    echo "  API     http://127.0.0.1:$PORT_API/api/health"
    echo "  Gateway http://127.0.0.1:$PORT_GATEWAY  (lo que ve el tunnel)"
    [ -f "$HOME/.creaty-preview/tunnel.token" ] && echo "  Publico https://preview.creaty.fun"
    echo
    ;;

  stop)
    for name in tunnel gateway api site; do
      if alive "$name"; then
        kill "$(cat "${PIDS[$name]}")" 2>/dev/null
        rm -f "${PIDS[$name]}"
        echo "  ✓ $name detenido"
      fi
    done
    cd "$ROOT" && npx astro preview stop >/dev/null 2>&1 || true
    ;;

  status)
    printf "  %-8s %s\n" "sitio"    "$(alive site    && echo 'activo' || echo 'detenido')  (127.0.0.1:$PORT_SITE)"
    printf "  %-8s %s\n" "api"      "$(alive api      && echo 'activo' || echo 'detenido')  (127.0.0.1:$PORT_API)"
    printf "  %-8s %s\n" "gateway"  "$(alive gateway  && echo 'activo' || echo 'detenido')  (127.0.0.1:$PORT_GATEWAY)"
    printf "  %-8s %s\n" "tunnel"   "$(alive tunnel   && echo 'activo' || echo 'detenido')"
    echo
    curl -fsS -m 3 "http://127.0.0.1:$PORT_GATEWAY/api/health" 2>/dev/null \
      && echo || echo "  gateway sin respuesta"
    ;;

  logs)
    for name in site api gateway tunnel; do
      echo "───── $name ─────"
      tail -n 12 "${LOGS[$name]}" 2>/dev/null || echo "(sin logs)"
    done
    ;;

  *)
    echo "Uso: $0 {start|stop|status|logs}" >&2
    exit 1
    ;;
esac
