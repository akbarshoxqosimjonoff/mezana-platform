# Cloudflare, DNS va E-pochta Sozlamalari Rejasi (`deploy/cloudflare-dns-email-plan.md`)

> **Muhim**: DNS yozuvlarini haqiqiy domenlarda (`ezanvakfi.org` va `azonvaqfi.org`) o'zgartirishdan oldin ushbu yozuvlar ro'yxati tasdiqlanishi shart. Mavjud MX va TXT yozuvlarga tegilmaydi.

## 1. Domenlar va DNS Yozuvlari (Cloudflare Proxied)

### `ezanvakfi.org` (Asosiy til: `tr`)
| Turi | Nomi (Host) | Qiymat | Proxy | TTL | Izoh |
| --- | --- | --- | --- | --- | --- |
| `A` | `@` | `<VPS_IP>` | Proxied (Orange) | Auto | Asosiy sayt |
| `CNAME` | `www` | `ezanvakfi.org` | Proxied (Orange) | Auto | `301` -> `https://ezanvakfi.org` |
| `CNAME` | `media` | `<R2_PUBLIC_DOMAIN>` | Proxied (Orange) | Auto | Ombordagi rasm va makbuzlar |

### `azonvaqfi.org` (Asosiy til: `uz`)
| Turi | Nomi (Host) | Qiymat | Proxy | TTL | Izoh |
| --- | --- | --- | --- | --- | --- |
| `A` | `@` | `<VPS_IP>` | Proxied (Orange) | Auto | O'zbek tilidagi asosiy kirish |
| `CNAME` | `www` | `azonvaqfi.org` | Proxied (Orange) | Auto | `301` -> `https://azonvaqfi.org` |

## 2. Transaksion E-pochta (`notify.ezanvakfi.org`)
Asosiy `@ezanvakfi.org` korporativ pochtasiga (MX) zarar yetkazmaslik uchun barcha avtomatik xabarlar (OTP, makbuz, qurbonlik va yangilik xabarnomalari) `notify.ezanvakfi.org` subdomenidan yuboriladi:

| Turi | Nomi (Host) | Qiymat | Proxy |
| --- | --- | --- | --- |
| `TXT` | `notify.ezanvakfi.org` | `v=spf1 include:amazonses.com include:_spf.resend.com ~all` | DNS Only |
| `CNAME` | `resend._domainkey.notify` | `<DKIM_VALUE_FROM_PROVIDER>` | DNS Only |
| `TXT` | `_dmarc.notify` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@ezanvakfi.org; pct=100; adkim=s; aspf=s` | DNS Only |

## 3. Cloudflare SSL/TLS va WAF Qoidalari
- **SSL/TLS**: `Full (Strict)` + Cloudflare Origin Certificate (`/etc/ssl/cloudflare/ezan-origin.pem`).
- **HSTS**: Yoqilgan (`max-age=31536000; includeSubDomains; preload`).
- **WAF**:
  - Cloudflare Managed Ruleset + OWASP Core Ruleset.
  - Rate limit: `/api/donations*`, `/api/kurban*`, `/api/cabinet*`, `/api/admin*` — `10 req / min / IP`.
  - `/admin*` va `/api/admin*` uchun Cloudflare Managed Challenge.
  - Kesh qoidasi: `/_next/static/*` (`Cache Everything`, `Edge TTL: 1 year`), `/api/*`, `/admin*`, `/[locale]/hesabim*`, `/v/*` (`Bypass Cache`).
