---
title: "Hardening de un VPS Linux en 2026: checklist práctica"
description: "SSH, firewall, fail2ban, kernel sysctl, actualizaciones automáticas. Una guía paso a paso para dejar tu servidor decente en una hora."
pubDate: 2026-09-02
author: "Equipo Creaty"
tag: "Seguridad"
---

La mayoría de VPS en producción están **un hardening de distancia** de una
postura de seguridad decente. No necesitas instalar herramientas raras: con
configurar bien lo que ya viene en tu distribución, eliminas el 80 % de la
superficie de ataque.

Esta es la checklist que aplicamos en cada servidor nuevo que administramos.

## 1. SSH: cierra la puerta principal

```bash
# /etc/ssh/sshd_config
Port 2222                       # cambia el puerto, reduce ruido
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AllowUsers deploy
```

Recarga: `systemctl restart sshd`. Asegúrate de tener tu clave pública en
`~/.ssh/authorized_keys` **antes** de cerrar la sesión actual.

## 2. Firewall con UFW (Ubuntu) o nftables

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 2222/tcp              # tu nuevo puerto SSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

Para producción real, **nftables** da más control. Pero UFW ya elimina el
95 % de intentos de brute force.

## 3. fail2ban contra brute force

```bash
apt install fail2ban
systemctl enable --now fail2ban
```

Crea `/etc/fail2ban/jail.local`:

```ini
[sshd]
enabled = true
port = 2222
maxretry = 3
findtime = 600
bantime = 3600
```

## 4. Actualizaciones automáticas

Ubuntu: `unattended-upgrades`. Debian: mismo paquete.

```bash
dpkg-reconfigure -plow unattended-upgrades
```

Activa solo `security`, deja los upgrades de paquetes grandes para hacerlos
manualmente con ventana de mantenimiento.

## 5. sysctl: endurece la red

```ini
# /etc/sysctl.d/99-hardening.conf
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.tcp_syncookies = 1
```

Aplica con `sysctl --system`.

## 6. Cabeceras HTTP y TLS

Detrás de Cloudflare, deja que el edge haga TLS. Si sirves directo, usa
**Caddy** o **nginx + Certbot** con configuración Mozilla *Intermediate*.

Cabeceras mínimas en nginx:

```nginx
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: https:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https:" always;
```

## 7. Backups probados

Un backup no verificado **no existe**. Programa `restic` o `borgbackup`
contra R2/S3 y **un cron semanal que restaure a un directorio temporal y
verifique checksums**.

---

## ¿Quieres que dejemos tu servidor así?

Lo configuramos en una sesión remota de 2–3 horas, te dejamos un runbook y
opcionalmente un monitoreo 24/7. [Cotiza el hardening](/contactanos).
