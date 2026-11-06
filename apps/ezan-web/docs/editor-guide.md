# Muharrir va Kontent Boshqaruvchisi Qo'llanmasi (`docs/editor-guide.md`)

## 1. Admin Panelga Kirish va TOTP 2FA
1. `https://ezanvakfi.org/admin` sahifasiga o'ting.
2. Elektron pochta, parol va Google Authenticator / Authy ilovasidagi **6 xonali TOTP 2FA** kodini kiriting.
3. Rollar:
   - `super_admin` va `editor`: yangilik, loyiha, kampaniya, video va sahifalarni yaratish hamda nashr qilish (`published`).
   - `translator`: faqat matn tarjimalarini (`tr`, `uz`, `en`, `ar`) tahrirlash va `needsReview` bayrog'ini yangilash.

## 2. Yangilik, Loyiha va Video Qo'shish
- **Loyiha holati (`projectStatus`)**:
  - `davom etmoqda` — hozir amalda bajarilayotgan loyihalar ("Rakamlarla Vakfımız" blokida ko'rinadi).
  - `planlanan` — kelajak rejalari ("Gelecek Planlarımız / Hedeflerimiz" blokida ko'rinadi, joriy raqamlarga qo'shilmaydi).
  - `tugallangan` — yakunlangan loyihalar.
- **Katalog va tasdiqlanmagan raqamlar**:
  - Agar ko'rsatkich katalogdan olingan bo'lsa, `source="katalog-2026"` va `needsReview=true` bo'lib, saytda **"Katalog verisi"** yorlig'i bilan chiqadi.
  - `[TASLIK]` yoki bo'sh qolgan maydonlar saytda hech qachon ommaga ko'rsatilmaydi.

## 3. 4 Tilda Tarjima va `needsReview`
- Har bir kontent `tr`, `uz`, `en`, `ar` tillarida saqlanadi.
- O'zbek tili (`uz`) faqat **o'zbek lotin alifbosida** yozilishi shart (kirill harflari kiritilmaydi).
- Hadislarning arabcha matni (`arabicOriginal`) aniq manbadan tasdiqlanmaguncha bo'sh qoldiriladi.

## 4. Ramazon Rejimi (`ramadanMode`) va Fitre / Fidye
- Diyanet fitr va fidya miqdorini e'lon qilgach, **Ramazan Ayarları** bo'limida `fitre_amount_try` va `fidye_amount_try` qiymatlarini kiriting.
- Qiymat `> 0` bo'lishi bilan `fitre` va `fidye` kampaniyalari avtomatik ravishda saytda ko'rinadi.
- `ramadan_mode = true` yoqilganda Bosh sahifada maxsus Ramazon banneri va tezkor "Fitre / İftar / Zekat" tugmalari chiqadi.

## 5. 4-Bosqich Imkoniyatlari (Feature Flag orqali)
- **Shaxsiy Kampaniyalar (P2P)**: Xayriyachi yaratgan kampaniya `pending_moderation` holatida tushadi. Admin tasdiqlagandan (`approved`) keyingina `/[locale]/destek/[slug]` sahifasi ochiladi.
- **Loyiha Yangilanishlari (Ta'sir Hisoboti)**: Loyihaga yangi foto va ko'rsatkich (`project_updates`) qo'shib `published` qilinsa, shu loyihaga xayriya qilganlarga avtomatik xabar boradi.
- **YouTube va Instagram**: YouTube'dan kelgan videolar avtomatik `draft` bo'lib tushadi; muharrir 4 tildagi sarlavhani tekshirib `published` qiladi.
