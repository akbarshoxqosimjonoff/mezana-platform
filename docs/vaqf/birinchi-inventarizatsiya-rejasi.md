# Ezan Vakfı — Birinchi Inventarizatsiya (Boshlang'ich Sanoq) Rejasi

**Maqsad:** Mezana Akademiyasi va Ezan Vakfı tasarrufidagi barcha mavjud jihozlar, mebellar, texnika va ko'chmas mulkni `EV-MZN-000001` seriyali yagona reyestrga kiritish, QR yorliqlarni yopishtirish va mas'ul xodimlar zimmasiga rasmiylashtirish.

---

## 1-bosqich. Tayyorgarlik va tuzilmani yuklash (1-kun)

1. **Joylar va xonalarni kiritish (`1-shablon`):**
   - Web ilovadagi **Sozlamalar / Excel Import** bo'limidan `1. Joylar va xonalar (Bina / Kat / Oda)` shablonini yuklab oling.
   - Bino → Qavat → Xona tartibida to'ldirib, tizimga yuklang.
   - **QR Yorliqlar (PDF)** bo'limidan **"Xona / Eshik QR Yorliqlari"** PDF faylini chiqarib, har bir xona eshigining ichki yuqori burchagiga yopishtiring.
2. **Xodimlar va rollarni biriktirish (`3-shablon`):**
   - Direktor (`director`), Inventar mas'uli (`inventory_manager`), Hisobchi (`accountant`) va xodimlarni (`staff`) tizimga kiriting.
   - Har bir xodim Web ilovadagi **"🔗 Telegram'ni bog'lash"** tugmasi orqali 10 daqiqalik bir martalik kod bilan `@ezanvakfitizimbot` ga ulansin va `/start` bossin.

---

## 2-bosqich. Mavjud mulklarni ro'yxatga olish va QR yorliqlash (2–3-kunlar)

1. **Ommaviy yoki tezkor kiritish (`2-shablon`):**
   - Mavjud ro'yxat bo'lsa, `2. Mavjud buyumlar (Demirbaş / Eşya)` ikki tilli Excel shabloni orqali yuklang (Preview → Xatolarni tekshirish → Bazaga yozish).
   - Ro'yxatda yo'q buyumlarni xonama-xona yurib, telefon orqali **"Yangi buyum qo'shish"** sahifasidan rasmi bilan kiriting (oxirgi tanlangan xona va javobgar saqlanib qoladi).
2. **QR yorliqlarni chop etish va yopishtirish:**
   - **QR Yorliqlar (PDF)** sahifasidan A4 stiker (`3×8 = 24 ta/bet`) yoki termoprinter (`58×40 mm`) formatida chop eting.
   - Donalab hisobga olinadigan buyumlarning (`individual`) o'ziga, partiyali buyumlarning (`batch` — parta, stul, kitoblar) xona ro'yxati taxtasiga yopishtiring.

---

## 3-bosqich. Birinchi nazorat sanog'i va Zimmatlash (4-kun)

1. **Sanoq e'lon qilish (`INV-2026-001`):**
   - Direktor yoki Inventar mas'uli **Inventarizatsiya (Sanoq)** bo'limida butun muassasa bo'yicha sanoq boshlaydi.
   - Sanoqchilar `@ezanvakfitizimbot` dagi `/skan` (Mini App) orqali avval xona QR kodini, so'ng xonadagi buyumlarning QR kodini ketma-ket skanerlaydi.
2. **Farqlarni ko'rib chiqish va Direktor tasdig'i:**
   - Sanoq yakunlangach, Direktor farqlarni ko'rib chiqib **"Sanoqni tasdiqlash"** tugmasini bosadi va 2 tilli (TR/UZ) dalolatnoma PDF'ini yuklab oladi.
3. **Zimmat dalolatnomalarini (`ZMT-...`) rasmiylashtirish:**
   - Shaxsiy javobgarlikdagi buyumlar (noutbuk, proyektor, kalitlar) uchun zimmat hujjati yaratiladi; xodim `@ezanvakfitizimbot` da **"✅ Qabul qildim"** tugmasini bosib elektron tasdiqlaydi.
