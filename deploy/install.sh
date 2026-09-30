#!/usr/bin/env bash
# ============================================================
#  Instalador de site.creaty.fun en Apache + servicio systemd
#  para la API. Requiere sudo.
#
#  Uso:  sudo ./deploy/install.sh
#
#  Es idempotente: se puede volver a ejecutar sin romper nada.
#  Todo lo que modifica queda respaldado en /root/creaty-backup-<fecha>/
# ============================================================
set -euo pipefail

PROJECT_DIR="/home/wilsonricardoeg/creaty-site"
DEPLOY_DIR="$PROJECT_DIR/deploy"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="/root/creaty-backup-$STAMP"

log()  { printf '\033[36m▸\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Ejecuta con sudo: sudo $0"

log "Respaldando configuracion actual en $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
for f in creaty.info-le-ssl.conf creaty.info.conf creatywordpress.conf; do
  [ -f "/etc/apache2/sites-available/$f" ] && cp -a "/etc/apache2/sites-available/$f" "$BACKUP_DIR/"
done
ls -1 /etc/apache2/sites-enabled/ > "$BACKUP_DIR/sites-enabled.list"
ok "Respaldo creado"

# ------------------------------------------------------------
# 1. Quitar site.creaty.fun del vhost de creaty.info
# ------------------------------------------------------------
log "Quitando site.creaty.fun de creaty.info-le-ssl.conf"
VHOST_OLD="/etc/apache2/sites-available/creaty.info-le-ssl.conf"

if grep -q "site.creaty.fun" "$VHOST_OLD"; then
  # El alias suelto de la linea 81: es lo que hacia que site.creaty.fun
  # se sirviera con el vhost de creaty.info.
  sed -i '/^[[:space:]]*ServerAlias[[:space:]]\+site\.creaty\.fun[[:space:]]*$/d' "$VHOST_OLD"

  # El bloque <VirtualHost *:80> completo que declaraba site.creaty.fun.
  # Se borra de "ServerName site.creaty.fun" hasta el </VirtualHost> que cierra.
  python3 - "$VHOST_OLD" <<'PY'
import re, sys
path = sys.argv[1]
src = open(path).read()
# Elimina cada VirtualHost *:80 cuyo ServerName sea site.creaty.fun
pat = re.compile(
    r'[ \t]*<VirtualHost \*:80>.*?ServerName\s+site\.creaty\.fun.*?</VirtualHost>\s*',
    re.S,
)
out, n = pat.subn('', src)
open(path, 'w').write(out)
print(f'  bloques :80 de site.creaty.fun eliminados: {n}')
PY
  ok "creaty.info-le-ssl.conf limpio"
else
  warn "site.creaty.fun no estaba en $VHOST_OLD (quizá ya aplicado)"
fi

# El vhost de :80 de creaty.info.conf solo servía site.creaty.fun y ya no
# está habilitado, pero lo dejamos en sites-available sin tocar: no molesta.
log "El vhost :80 antiguo queda en sites-available (no habilitado, inerte)"

# ------------------------------------------------------------
# 2. Instalar el vhost nuevo
# ------------------------------------------------------------
log "Instalando vhost de site.creaty.fun"
install -m 644 "$DEPLOY_DIR/creaty-site.conf" /etc/apache2/sites-available/creaty-site.conf
a2enmod proxy proxy_http headers rewrite >/dev/null 2>&1 || true
a2ensite creaty-site >/dev/null
ok "vhost instalado y habilitado"

# ------------------------------------------------------------
# 3. Validar antes de recargar
# ------------------------------------------------------------
log "Validando configuracion de Apache"
if ! apache2ctl configtest; then
  warn "configtest fallo. Se restauran los respaldos."
  [ -f "$BACKUP_DIR/creaty.info-le-ssl.conf" ] && \
    cp -a "$BACKUP_DIR/creaty.info-le-ssl.conf" /etc/apache2/sites-available/
  a2dissite creaty-site >/dev/null 2>&1 || true
  die "configtest fallo; nada recargado"
fi
ok "configtest correcto"

log "Recargando Apache"
systemctl reload apache2
sleep 2
systemctl is-active --quiet apache2 && ok "Apache activo" || die "Apache no quedo activo"

# ------------------------------------------------------------
# 4. Servicio systemd de la API
# ------------------------------------------------------------
# La API puede estar corriendo desde scripts/stack.sh (preview).
# Hay que liberarla o systemd no podrá tomar el puerto 8787.
log "Liberando el puerto 8787 si lo ocupa la pila de preview"
if ss -ltnp 2>/dev/null | grep -q ':8787 '; then
  warn "puerto 8787 ocupado; deteniendo la pila de preview"
  "$PROJECT_DIR/scripts/stack.sh" stop >/dev/null 2>&1 || true
  pkill -f "node src/server.js" 2>/dev/null || true
  sleep 2
  ss -ltnp 2>/dev/null | grep -q ':8787 ' && warn "el puerto sigue ocupado; revisa manualmente" \
    || ok "puerto 8787 libre"
else
  ok "puerto 8787 ya estaba libre"
fi

log "Instalando servicio systemd de la API"
install -m 644 "$DEPLOY_DIR/creaty-api.service" /etc/systemd/system/creaty-api.service
systemctl daemon-reload
systemctl enable creaty-api >/dev/null
systemctl restart creaty-api
sleep 3

if systemctl is-active --quiet creaty-api; then
  ok "creaty-api activo (arranque automatico habilitado)"
else
  warn "creaty-api no quedo activo; revisa: journalctl -u creaty-api -n 30"
fi

# ------------------------------------------------------------
# 5. Verificacion
# ------------------------------------------------------------
echo
log "Verificacion local (por el puerto 443, sin pasar por Cloudflare)"
printf '  GET /          -> HTTP %s\n' \
  "$(curl -sk -o /dev/null -w '%{http_code}' -H 'Host: site.creaty.fun' https://127.0.0.1/ || echo ERR)"
printf '  GET /api/health-> HTTP %s\n' \
  "$(curl -sk -o /dev/null -w '%{http_code}' -H 'Host: site.creaty.fun' https://127.0.0.1/api/health || echo ERR)"
printf '  certificado    -> %s\n' \
  "$(echo | openssl s_client -connect 127.0.0.1:443 -servername site.creaty.fun 2>/dev/null | openssl x509 -noout -subject 2>/dev/null || echo 'sin cert')"

echo
log "Comprobacion de renovacion de certificado (no modifica nada)"
certbot renew --cert-name site.creaty.fun --dry-run 2>&1 | tail -6 || \
  warn "El dry-run fallo; revisa la renovacion manualmente"

echo
ok "Instalacion completada"
echo "  Respaldo:  $BACKUP_DIR"
echo "  Revertir:  cp -a $BACKUP_DIR/creaty.info-le-ssl.conf /etc/apache2/sites-available/ && a2dissite creaty-site && systemctl reload apache2"
echo
echo "  Publico:   https://site.creaty.fun"
echo "  Logs API:  journalctl -u creaty-api -f"
