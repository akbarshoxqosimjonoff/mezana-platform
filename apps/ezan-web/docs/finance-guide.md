# Moliya Xodimi Qo'llanmasi (`docs/finance-guide.md`)

## 1. Onlayn Xayriyalar va Ichki Tizim (`vaqf`) Sinxronizatsiyasi
- Saytda to'langan (`status='paid'` va `is_test=false`) har bir xayriya avtomatik ravishda 5 daqiqada `apps/finance-bff` (`vaqf.donations`) bazasiga `source='online'` sifatida sinxronlanadi.
- Har bir yozuv `external_id` bo'yicha idempotent: ikki marta yozilmaydi.
- Maqsadli (`restricted=true`) xayriyalar (`ZEKAT`, `FITRE`, `KURBAN`, `IFTAR`) alohida fond kodi bilan tushadi va umumiy fondga aralashmaydi.

## 2. Shaffoflik Sahifasi va HMAC Tasdig'i
- Ichki vaqf tizimidan faqat agregat raqamlar (oylik jami tushum, xarajat va maqsadlar kesimi) HMAC-SHA256 imzosi bilan `/shaffoflik` va `/faaliyet-raporu/2027` sahifalariga uzatiladi.
- Shaxsiy donor ma'lumotlari hech qachon ommaviy sahifaga chiqmaydi.

## 3. Bank Ko'chirmasini (CSV) Import Qilish va Solishtirish (4-bosqich)
1. Saytda "Banka Havale/EFT" tanlagan xayriyachiga `EZ9F2A` kabi unikal kod beriladi.
2. Bankdan olingan CSV ko'chirmani `/admin` -> **Banka Ekstresi Eşleştirme** bo'limiga yuklang.
3. Tizim izohda `EZ...` kodini topsa, to'lovni avtomatik bog'laydi (`confirmed`) va makbuz yaratadi.
4. Bir xil CSV ikki marta yuklansa, `row_hash` orqali dublikatlar avtomatik o'tkazib yuboriladi (`duplicatesSkipped`).

## 4. Oylik Obunalar va Qurbonlik Eksporti
- **Oylik xayriyalar (`recurring_subscriptions`)**: Karta yechilmasa, 1-, 3- va 7-kunlarda dunning eslatmasi boradi; 3 marta muvaffaqiyatsiz bo'lsa `paused_payment_failed` holatiga o'tadi.
- **Qurbonlik ro'yxati**: `/admin` panelidan davlat va hayvon turi bo'yicha hisse va vekalet ro'yxatini CSV formatida yuklab olish mumkin.
