# Ezan Vakfı — Inventar Mas'uli Uchun Yo'riqnoma (`inventory_manager`)

## 1. Buyum qo'shish va QR yorliq chiqarish
1. **Yangi buyum qo'shish:** Web ilovada **"+ Yangi buyum"** tugmasini bosing, buyum nomi, kategoriyasi, xonasi, javobgar xodimi va rasmini kiriting. Tizim avtomatik `EV-MZN-000001` formatida inventar raqami beradi.
2. **Moliya xaridlarini ro'yxatga olish:** **"Ro'yxatga olinishi kerak"** bo'limida moliyada tasdiqlangan jihoz xarajatlarini ko'rib, **"Inventarga olish"** yoki **"Inventar emas"** (sababi bilan) tugmasini bosing.
3. **QR yorliq chop etish:** **"QR Yorliqlar (PDF)"** bo'limidan A4 stiker yoki termoprinter formatida buyum va xona QR kodlarini chop eting.

## 2. Mulk harakati va Hujjatlar (Dalolatnomalar)
Har bir harakat **"Hujjatlar (Dalolatnoma)"** bo'limida rasmiylashtiriladi:
- **Zimmatga berish (`ZMT`):** Xodimga buyum biriktiriladi; xodim `@ezanvakfitizimbot` da **"✅ Qabul qildim"** tugmasini bosgach, hujjat yakunlanadi.
- **Zimmatdan qaytarish (`QYT`):** Xodimdan buyum qaytarib olinadi; ishdan ketayotgan xodim uchun **"Zimmat varaqasi"** (PDF) chiqariladi.
- **Ko'chirish (`KCH`):** Bir bino ichida xonadan xonaga ko'chirish darhol bajariladi; muassasalararo yoki yuqori qiymatli ko'chirish Direktor tasdig'iga yuboriladi.
- **Ta'mir (`TMR`):** Nosozlik xabaridan 1 bosishda ta'mir hujjati ochiladi; ta'mirdan qaytganda xarajat va natija (`tuzatildi` / `yaroqsiz`) kiritiladi.
- **Hisobdan chiqarish so'rovi (`HCH`):** Sabab va dalil rasmlari bilan kiritilib, Direktor tasdig'iga yuboriladi.

## 3. Sanoq (Inventarizatsiya) va Muddatlar
- **Sanoq:** Sanoq yaratib, sanoqchilarni tayinlang. Sanoqchilar `@ezanvakfitizimbot` (`/skan`) orqali xona va buyumlarni skanerlaydi.
- **Muddatlar va Eslatmalar:** Kombi, o't o'chirgich, lift va kafolat muddatlarini kiriting; botga kelgan eslatmani **"✔️ Bajarildi"** deb belgilanganda keyingi davr avtomatik yaratiladi.
