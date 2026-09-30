#!/usr/bin/env bash
# Levanta el sitio de Creaty Site y lo publica en https://preview.creaty.fun
# mediante un Cloudflare Tunnel nombrado (administrado remotamente).
#
#   ./scripts/preview-tunnel.sh start     # build + preview + tunnel nombrado
#   ./scripts/preview-tunnel.sh stop      # detiene ambos
#   ./scripts/preview-tunnel.sh status    # estado y URL
#   ./scripts/preview-tunnel.sh logs      # logs del conector
#
# Modo quick (sin cuenta, URL aleatoria) con: QUICK=1 ./scripts/preview-tunnel.sh start
#
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-4321}"
CLOUDFLARED="${CLOUDFLARED:-$HOME/.local/bin/cloudflared}"
TOKEN_FILE="${TOKEN_FILE:-$HOME/.creaty-preview/tunnel.token}"
LOG_DIR="${XDG_RUNTIME_DIR:-/tmp}/creaty-preview"
PREVIEW_LOG="$LOG_DIR/astro-preview.log"
TUNNEL_LOG="$LOG_DIR/cloudflared.log"
URL_FILE="$LOG_DIR/tunnel-url.txt"
PUBLIC_URL="https://preview.creaty.fun"
QUICK="${QUICK:-0}"

mkdir -p "$LOG_DIR"

case "${1:-start}" in
  start)
    if ! command -v "$CLOUDFLARED" >/dev/null 2>&1 && [ ! -x "$CLOUDFLARED" ]; then
      echo "cloudflared no encontrado en $CLOUDFLARED" >&2
      echo "Instálalo con: curl -fsSL -o $CLOUDFLARED \\" >&2
      echo "  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x $CLOUDFLARED" >&2
      exit 1
    fi

    cd "$PROJECT_DIR"
    echo "▸ Compilando sitio…"
    npx astro build >/dev/null

    echo "▸ Iniciando astro preview en 127.0.0.1:$PORT…"
    (cd "$PROJECT_DIR" && nohup npx astro preview --port "$PORT" --host 127.0.0.1 \
      >"$PREVIEW_LOG" 2>&1 &)

    for _ in $(seq 1 30); do
      if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/"; then break; fi
      sleep 1
    done
    echo "  ✓ sitio respondiendo en http://127.0.0.1:$PORT"

    echo "▸ Abriendo Cloudflare Tunnel…"
    rm -f "$URL_FILE"

    if [ "$QUICK" = "1" ]; then
      echo "  (modo quick: URL temporal de trycloudflare.com)"
      nohup "$CLOUDFLARED" tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" \
        >"$TUNNEL_LOG" 2>&1 &
      for _ in $(seq 1 45); do
        URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -1 || true)
        [ -n "$URL" ] && break
        sleep 1
      done
      if [ -z "${URL:-}" ]; then
        echo "El tunnel quick no entregó URL. Revisa $TUNNEL_LOG" >&2
        exit 1
      fi
    else
      if [ ! -f "$TOKEN_FILE" ]; then
        echo "No encuentro el token del tunnel en $TOKEN_FILE" >&2
        echo "Recupéralo con:" >&2
        echo "  curl -s -H \"Authorization: Bearer \$CLOUDFLARE_API_TOKEN\" \\" >&2
        echo "    https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/cfd_tunnel/<TUNNEL_ID>/token" >&2
        echo "o regenera el tunnel con: wrangler tunnel create creaty-preview" >&2
        exit 1
      fi
      TOKEN=$(cat "$TOKEN_FILE")
      nohup "$CLOUDFLARED" tunnel --no-autoupdate run --token "$TOKEN" \
        >"$TUNNEL_LOG" 2>&1 &

      # El conector no anuncia la URL: es fija (DNS administrado en Cloudflare).
      # Esperamos a que Cloudflare registre al menos una conexión.
      URL="$PUBLIC_URL"
      for _ in $(seq 1 45); do
        if grep -q "Registered tunnel connection" "$TUNNEL_LOG" 2>/dev/null; then break; fi
        sleep 1
      done
      if ! grep -q "Registered tunnel connection" "$TUNNEL_LOG" 2>/dev/null; then
        echo "El conector no se registró. Revisa $TUNNEL_LOG" >&2
        exit 1
      fi
    fi

    echo "$URL" >"$URL_FILE"
    echo
    echo "  ╭──────────────────────────────────────────╮"
    echo "  │  Preview público:                        │"
    echo "  │  $URL"
    echo "  ╰──────────────────────────────────────────╯"
    echo
    echo "  Logs: $PREVIEW_LOG · $TUNNEL_LOG"
    echo "  Detener: $0 stop"
    exit 0
    ;;

  stop)
    cd "$PROJECT_DIR"
    npx astro preview stop >/dev/null 2>&1 || true
    pkill -f "cloudflared tunnel --no-autoupdate --url http://127.0.0.1:$PORT" 2>/dev/null || true
    rm -f "$URL_FILE"
    echo "✓ Preview y tunnel detenidos."
    ;;

  status)
    if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/" 2>/dev/null; then
      echo "✓ astro preview activo en http://127.0.0.1:$PORT"
    else
      echo "✗ astro preview no responde en 127.0.0.1:$PORT"
    fi
    if [ -f "$URL_FILE" ]; then
      echo "✓ tunnel activo: $(cat "$URL_FILE")"
    else
      echo "✗ sin tunnel activo (ejecuta: $0 start)"
    fi
    ;;

  logs)
    tail -n 40 "$TUNNEL_LOG" 2>/dev/null || echo "sin logs de tunnel"
    ;;

  *)
    echo "Uso: $0 {start|stop|status|logs}" >&2
    exit 1
    ;;
esac
