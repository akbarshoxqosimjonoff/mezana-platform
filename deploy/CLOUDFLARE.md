# Cloudflare Sozlamalari Ro'yxati (ezanvakfi.org va azonvaqfi.org)

1. **DNS**:
   - `ezanvakfi.org`: `A` `@` -> Turkiyadagi VPS IP (Proxy: ON / Orange Cloud)
   - `www.ezanvakfi.org`: `CNAME` `www` -> `ezanvakfi.org` (Proxy: ON)
   - `azonvaqfi.org`: `A` `@` -> Turkiyadagi VPS IP (Proxy: ON / Orange Cloud)
   - `www.azonvaqfi.org`: `CNAME` `www` -> `azonvaqfi.org` (Proxy: ON)
2. **SSL/TLS**:
   - Mode: **Full (strict)**
   - Origin Server Certificate: `/etc/ssl/cloudflare/origin.pem` va `origin.key`
   - Always Use HTTPS: **ON**
   - HSTS: **Enabled** (max-age: 12 months, includeSubDomains, preload)
3. **Network / Geolocation**:
   - **IP Geolocation (`CF-IPCountry` header)**: **ON** (Middleware shu sarlavha orqali davlatni aniqlaydi)
4. **Caching Rules**:
   - `/` va til prefikssiz sahifalar: `Cache-Control: private, no-store` (Bypass Cache) — bir foydalanuvchining til redirecti boshqasiga keshlanmasligi uchun.
   - `/_next/static/*`: Edge Cache TTL 1 yil (`immutable`).
   - HTML sahifalar (`/{tr,uz,en,ar}/*`): Bypass yoki 5 daqiqalik qisqa Edge Cache.
5. **Redirect Rules**:
   - `www.ezanvakfi.org/*` -> `301` `https://ezanvakfi.org/$1`
   - `www.azonvaqfi.org/*` -> `301` `https://azonvaqfi.org/$1`
6. **WAF & Bot Fight Mode & Turnstile**:
   - WAF Managed Rules: **ON**
   - Bot Fight Mode: **ON** (Verified bots like Googlebot allowed)
   - Turnstile Widget: Aloqa, Qurbonlik xabarnomasi va Obuna formalari uchun Site Key va Secret Key `.env` ga qo'yiladi.