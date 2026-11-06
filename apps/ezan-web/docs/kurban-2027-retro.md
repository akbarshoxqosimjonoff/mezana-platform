# Kurban 2027 Mavsumi Tahlili va 2028 Tayyorgarlik Hujjati (`docs/kurban-2027-retro.md`)

## 1. Mavsum Yakunlari (`generateKurbanSeasonRetrospective(2027)`)
- **Jami sotilgan hisse**: Davlatlar va hayvon turlari (`sheep`, `goat`, `cattle_share`, `camel_share`) kesimida avtomatik hisoblanadi.
- **Video yuklash ko'rsatkichi**: So'yishdan (`slaughtered_at`) video tasdiqlanguncha (`approved`) o'tgan o'rtacha vaqt (`avgHoursToVideo`).
- **Xabar yetkazish (`DLR`) statistikasi**: SMS (Netgsm) va WhatsApp (360dialog/Meta) bo'yicha `sent`, `delivered`, `failed` va qayta yuborilgan (`retried`) xabarlar tahlili.

## 2. Mavsumiy Arxivlash va 2028 Mavsumini Klonlash (`cloneKurbanSeasonForNextYear`)
1. `2027` mavsumi `is_archived = true, is_active = false` holatiga o'tkaziladi.
2. Eskirgan (`expires_at < NOW()`) video tokenlar ommaviy o'qishdan yopiladi, biroq S3/R2 arxivida saqlanadi.
3. **1 tugma bilan `2028` mavsumini yaratish**:
   - Davlatlar ro'yxati va hayvon turlari `2027` dan `2028` ga nusxalanadi;
   - Barcha narxlar (`price_per_share_try = 0`), kvotalar (`quota_shares = 0`, `sold_shares = 0`) va faollik (`is_active = false`) nolga tushiriladi (`[TASLIK]`), shunda tasdiqlanmagan eski narxlar yangi mavsumda ko'rinmaydi.
4. Dala jamoasi (`/dala`) ilovasida ko'p hisse biriktirilgan yirik qoramol/tuya uchun **bitta videoni yuklab, 7 ta hissega avtomatik ulash** (`assignAnimalAndSlaughter` + `uploadAndTranscodeKurbanVideo`) to'liq ishlaydi.
