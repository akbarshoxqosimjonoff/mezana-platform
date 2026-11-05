# Ezan Vakfı — WhatsApp Business Cloud API Shablonlari (`docs/whatsapp-templates.md`)

Meta Business Manager (`WhatsApp Manager → Message Templates`) orqali tasdiqlash uchun **3 ta tranzaksion (`UTILITY`)** shablon, **4 tilda (`tr`, `uz`, `en`, `ar`)**.

> **Qoida:** Ushbu shablonlar faqat tranzaksion bildirishnomalar uchun ishlatiladi (`Category: UTILITY`). Reklama yoki marketing matni qo'shilmaydi. Shablonlar Meta tomonidan tasdiqlanmaguncha `.env` da `WHATSAPP_ENABLED=false` turadi va tizim avtomatik ravishda **SMS (`EZANVAKFI`) + E-pochta** orqali xabar yuboradi.

---

## 1. `kurban_vekalet_alindi` (To'lov va vekalet tasdiqlanganda — 1-xabar)

- **Template Name:** `kurban_vekalet_alindi`
- **Category:** `UTILITY`
- **Parametrlar:**
  - `{{1}}` — Xayriyachi ismi (`Ahmet Yılmaz`)
  - `{{2}}` — Hisse soni (`2`)
  - `{{3}}` — Buyurtma raqami (`KRB-2027-A1B2C3`)
  - `{{4}}` — Kuzatuv sahifasi havolasi (`https://ezanvakfi.org/tr/kurban/takip/...`)

### 🇹🇷 Türkçe (`tr`)
```text
Sayın {{1}}, Ezan Vakfı'na verdiğiniz {{2}} hisse kurban vekâletiniz ve ödemeniz (Sipariş No: {{3}}) başarıyla alınmıştır. Kurbanınızın kesim ve video sürecini canlı takip etmek için: {{4}}
```

### 🇺🇿 O'zbekcha (`uz`)
```text
Hurmatli {{1}}, Azon Vaqfi (Ezan Vakfı)ga bergan {{2}} hisse qurbonlik vakolatingiz va to'lovingiz (Buyurtma: {{3}}) qabul qilindi. Qurbonlik holati va videoni kuzatish havolasi: {{4}}
```

### 🇬🇧 English (`en`)
```text
Dear {{1}}, your Qurbani proxy (Wakalah) and payment for {{2}} share(s) (Order: {{3}}) have been received by Ezan Foundation. Track your Qurbani status and video here: {{4}}
```

### 🇸🇦 العربية (`ar`)
```text
السيد/ة {{1}}، تم استلام توكيلكم وتبرعكم لعدد {{2}} سهم أضحية لدى وقف الأذان (رقم الطلب: {{3}}). لمتابعة حالة الأضحية والفيديو: {{4}}
```

---

## 2. `kurban_kesildi` (Hayvon "kesildi" deb belgilanganda — 2-xabar)

- **Template Name:** `kurban_kesildi`
- **Category:** `UTILITY`
- **Parametrlar:**
  - `{{1}}` — Xayriyachi ismi
  - `{{2}}` — Buyurtma raqami
  - `{{3}}` — Kuzatuv sahifasi havolasi

### 🇹🇷 Türkçe (`tr`)
```text
Sayın {{1}}, vekâletini verdiğiniz kurbanınız (Sipariş No: {{2}}) İslami usullere uygun olarak kesilmiştir. Allah kabul etsin. Kesim videonuz hazırlanmaktadır: {{3}}
```

### 🇺🇿 O'zbekcha (`uz`)
```text
Hurmatli {{1}}, vakolat bergan qurbonligingiz (Buyurtma: {{2}}) islomiy qoidalarga muvofiq so'yildi. Alloh qabul qilsin! Kesim videongiz tayyorlanmoqda: {{3}}
```

### 🇬🇧 English (`en`)
```text
Dear {{1}}, your Qurbani (Order: {{2}}) has been slaughtered in accordance with Islamic guidelines. May Allah accept it. Your video is being prepared: {{3}}
```

### 🇸🇦 العربية (`ar`)
```text
السيد/ة {{1}}، تم ذبح أضحيتكم (رقم الطلب: {{2}}) وفق الضوابط الشرعية. تقبل الله منكم. يجري تجهيز فيديو الذبح: {{3}}
```

---

## 3. `kurban_video_hazir` (Video tasdiqlanganda — 3-xabar)

- **Template Name:** `kurban_video_hazir`
- **Category:** `UTILITY`
- **Parametrlar:**
  - `{{1}}` — Xayriyachi ismi
  - `{{2}}` — Buyurtma raqami
  - `{{3}}` — Kuzatuv va video yuklab olish havolasi

### 🇹🇷 Türkçe (`tr`)
```text
Sayın {{1}}, kurban kesim videonuz (Sipariş No: {{2}}) hazırdır. Videonuzu izlemek ve indirmek için güvenli takip bağlantınız: {{3}}
```

### 🇺🇿 O'zbekcha (`uz`)
```text
Hurmatli {{1}}, qurbonlik kesim videongiz (Buyurtma: {{2}}) tayyor bo'ldi. Videoni ko'rish va yuklab olish uchun xavfsiz havola: {{3}}
```

### 🇬🇧 English (`en`)
```text
Dear {{1}}, your Qurbani slaughter video (Order: {{2}}) is ready. Watch and download your video via your secure tracking link: {{3}}
```

### 🇸🇦 العربية (`ar`)
```text
السيد/ة {{1}}، فيديو ذبح أضحيتكم (رقم الطلب: {{2}}) جاهز الآن. للمشاهدة والتحميل عبر الرابط الآمن: {{3}}
```
