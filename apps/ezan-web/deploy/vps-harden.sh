#!/usr/bin/env bash
# Ezan Vakfı — Ubuntu 24.04 LTS Production VPS Qattiqlashtirish (Hardening) Skripti
# DIQQAT: Ushbu skriptni yangi VPS'da ishga tushirishdan oldin SSH kalitingiz ~/.ssh/authorized_keys ichida ekanini tekshiring!
set -euo pipefail

SSH_PORT="${SSH_PORT:-2222}"
TIMEZONE="Europe/Istanbul"

echo "[1/6] Vaqt zonasi va NTP sozlanmoqda (${TIMEZONE})..."
timedatectl set-timezone "${TIMEZONE}"
apt-get update -y
apt-get install -y ufw fail2ban unattended-upgrades apt-listchanges chrony curl gnupg ca-certificates

systemctl enable --now chrony

echo "[2/6] Avtomatik xavfsizlik yangilanishlari yoqilmoqda..."
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "[3/6] SSH xavfsizligi (faqat kalit, root login yo'q, port ${SSH_PORT})..."
sed -i "s/^#\?Port .*/Port ${SSH_PORT}/" /etc/ssh/sshd_config
sed -i "s/^#\?PermitRootLogin .*/PermitRootLogin no/" /etc/ssh/sshd_config
sed -i "s/^#\?PasswordAuthentication .*/PasswordAuthentication no/" /etc/ssh/sshd_config
sed -i "s/^#\?PubkeyAuthentication .*/PubkeyAuthentication yes/" /etc/ssh/sshd_config
sshd -t
systemctl reload ssh || systemctl reload sshd

echo "[4/6] Fail2ban sozlanmoqda..."
cat >/etc/fail2ban/jail.local <<EOF
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port = ${SSH_PORT}
EOF
systemctl enable --now fail2ban

echo "[5/6] UFW Firewall: faqat ${SSH_PORT}/tcp (SSH) va Cloudflare IP diapazonlaridan 443/tcp..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow "${SSH_PORT}/tcp" comment 'SSH Custom Port'

# Cloudflare IPv4 va IPv6 diapazonlaridan 443 portga ruxsat
for cidr in 173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22; do
  ufw allow proto tcp from "${cidr}" to any port 443 comment 'Cloudflare IPv4 HTTPS'
done

for cidr6 in 2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32; do
  ufw allow proto tcp from "${cidr6}" to any port 443 comment 'Cloudflare IPv6 HTTPS'
done

ufw --force enable

echo "[6/6] VPS qattiqlashtirish muvaffaqiyatli yakunlandi."
