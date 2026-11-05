# Ezan Vakfı — Kurban Bayramı Saha ve Operasyon Rehberi (`docs/kurban-runbook.md`)
# Ezan Vakfı — Qurbon Hayiti Dala va Operatsion Yo'riqnomasi (`docs/kurban-runbook.md`)

---

## 🇹🇷 BÖLÜM 1: TÜRKÇE REHBER (Kurban Bayramı Operasyon Planı)

### 1. Kim Ne Yapar? (Görev Dağılımı)

| Rol | Sorumlu | Görevleri |
| --- | --- | --- |
| **Vakıf Yöneticisi (`admin`)** | Merkez Koordinasyon | 1. Bayramdan önce `/admin` panelinden `kurbanSeason` tarihlerini (`salesOpenAt`, `salesCloseAt`), ülkeleri ve hisse kotalarını yayınlar.<br>2. Satış kapandıktan sonra **Hisseleri Hayvanlara Ata** (`assign_animals`) işlemini çalıştırır ve **A4 Saha Kesim Listesi PDF**'ini (`/api/admin/kurban/field-sheet-pdf`) indirip saha ekiplerine iletir.<br>3. Yüklenen videoları inceler ve **Onayla (`approve_video`)** butonuna basar. |
| **Saha Ekibi (`field`)** | Ülke Sorumlusu (Türkiye, Özbekistan, Çad, Somali) | 1. `/dala` mobil sayfasına e-posta, parola ve **6 haneli 2FA (TOTP)** kodu ile giriş yapar (oturum 4 gün açık kalır).<br>2. Kesimden önce A4 listedeki `tagNo` (örn. `TD-2027-B001`) numarasını tahtaya yazar ve hissedar isimlerini sesli okur.<br>3. Kesim tamamlandığında `/dala` sayfasında **✓ Kesildi Olarak İşaretle** butonuna basar (2. bildirim SMS/WhatsApp olarak otomatik gider).<br>4. Kesim videosunu (`MP4` veya `MOV`, ≤ 2 GB) ilgili hayvana yükler. |
| **Mali İşler (`finance`)** | Muhasebe | Online kurban bağışlarının iç vakıf sistemine (`vaqf.donations`) `Onlayn kurban: <Ülke> 2027` ve `restricted=true` olarak senkronize olduğunu kontrol eder. |

---

### 2. Saha Video Yükleme Sırası (`/dala`)

1. Telefondan `https://ezanvakfi.org/dala` adresini açın ve `field` hesabınızla (2FA koduyla) giriş yapın.
2. Arama kutusuna hayvanın küpe/sıra numarasını (`tagNo`, örn. `TD-2027-B001`) yazın.
3. Kesim gerçekleştiğinde önce **✓ Kesildi deb belgilash** butonuna dokunun.
4. **Video Yuklash (MP4/MOV ≤ 2GB)** butonuna dokunup videoyu seçin:
   - Video **8 MB'lık parçalar (multipart)** halinde doğrudan S3/R2 depolama alanına yüklenir.
   - İnternet kesilirse veya sayfa kapanırsa kuyruk **IndexedDB**'de saklanır; bağlantı geldiğinde kaldığı parçadan devam eder.
5. Yükleme tamamlandığında arka plandaki **FFmpeg Worker** videoyu otomatik olarak **720p H.264 (~2.5 Mbit/s, `+faststart`)** formatına dönüştürür, kapak fotoğrafı (`poster.jpg`) üretir ve koordinatöre `"Çad: 14/40 hayvon videosi yuklandi"` bildirimi gönderir.

---

### 3. Sorun Giderme (Acil Durum Prosedürü)

- **Sorun 1: Saha ekibinin interneti çok yavaş veya sık kopuyor.**
  - *Çözüm:* `/dala` sayfasını kapatmayın veya aynı cihazdan tekrar açın. IndexedDB kuyruğu tamamlanmış 8 MB parçaları hatırlar ve yalnızca kalan parçaları gönderir.
- **Sorun 2: Bağışçıya SMS/WhatsApp gitmedi veya telefon numarası hatalı.**
  - *Çözüm:* `/admin` panelindeki **"Noto'g'ri Telefon Raqam Ogohlantirish Ro'yxati"** bölümünden hatalı numaraları kontrol edin. Numara düzeltildikten sonra bildirim geçmişinden **Qayta yuborish (`resend_message`)** butonuna basın.
- **Sorun 3: Outbox'ta 10 dakikadan uzun bekleyen mesaj uyarısı geldi.**
  - *Çözüm:* Netgsm / WhatsApp API bakiyesini ve `.env` içindeki `NETGSM_*` anahtarlarını kontrol edin. Mesajlar `kurban_message_logs` tablosunda kaybolmaz; sorun giderildiğinde otomatik gönderilir.
- **Sorun 4: Yanlış video yüklendi.**
  - *Çözüm:* Merkez admin videoyu onaylamadan (`published` yapmadan) bağışçıya hiçbir bağlantı gitmez. Saha ekibi aynı `tagNo` için doğru videoyu tekrar yükleyebilir.

---
---

## 🇺🇿 2-BO'LIM: O'ZBEKCHA YO'RIQNOMA (Qurbon Hayiti Ish Tartibi)

### 1. Kim Nima Qiladi? (Vazifalar Taqsimoti)

| Rol | Mas'ul | Vazifalari |
| --- | --- | --- |
| **Markaziy Admin (`admin`)** | Vaqf Markazi | 1. Mavsum sanalari (`salesOpenAt`, `salesCloseAt`), davlatlar va hisse kvotalarini `/admin` orqali tasdiqlaydi.<br>2. Sotuv yopilgach, `paid` hisselarni hayvonlarga biriktiradi (`assign_animals`: sigirga 7 tadan buyurtmani bo'lmasdan, qo'yga 1 tadan) va **A4 Dala Kesim Ro'yxati PDF** faylini (`/api/admin/kurban/field-sheet-pdf`) chop etib dala jamoasiga beradi.<br>3. Dala jamoasi yuklagan videolarni ko'rib **Tasdiqlash (`approve_video`)** tugmasini bosadi. |
| **Dala Jamoasi (`field`)** | Davlat Koordinatori (Turkiya, O'zbekiston, Chad, Somali) | 1. `/dala` mobil sahifasiga `field` roli va **2FA (TOTP)** kodi bilan kiradi (sessiya hayit kunlari 4 kun saqlanadi).<br>2. So'yishdan oldin taxtachaga `tagNo` (`TD-2027-B001`) raqamini yozadi va A4 varaqdagi hissedorlar ismlarini (lotin yozuvida) hamda niyat turlarini ovoz chiqarib o'qiydi.<br>3. Hayvon so'yilgach, `/dala` sahifasida **✓ Kesildi deb belgilash** tugmasini bosadi (hissedorlarga darhol 2-xabar ketadi).<br>4. Videoni (`MP4`/`MOV`, ≤ 2 GB) shu hayvon kartochkasiga yuklaydi. |
| **Moliya (`finance`)** | Buxgalteriya | Qurbonlik to'lovlari ichki vaqf tizimiga (`vaqf.donations`) `purpose = 'Onlayn kurban: <davlat> 2027'`, `restricted = true` bo'lib tushganini va shaxsiy ma'lumotlar (ism/telefon/video) ichki bazaga o'tmaganini nazorat qiladi. |

---

### 2. Video Yuklash Tartibi (`/dala`)

1. Telefonda `/dala` sahifasini oching va 2FA kodingiz bilan kiring.
2. Qidiruv maydoniga hayvonning `tagNo` raqamini yozing.
3. Hayvon so'yilishi bilan **✓ Kesildi deb belgilash** tugmasini bosing.
4. **Video Yuklash (MP4/MOV ≤ 2GB)** tugmasini bosib videoni tanlang:
   - Fayl **8 MB bo'laklarga** bo'linib, S3/R2 omborga yuklanadi.
   - Internet uzilib qolsa yoki sahifa yopilsa ham navbat **IndexedDB** da saqlanadi va aloqa tiklanganda qolgan joyidan davom etadi.
5. **FFmpeg Worker** alohida jarayonda (`SKIP LOCKED`) videoni **720p H.264 (~2.5 Mbit/s, `+faststart`)** formatga o'tkazadi, poster rasm yaratadi va koordinatorga xabar beradi.
6. Admin videoni tasdiqlagach (yoki `auto_approve_videos=true` bo'lsa avtomatik), xayriyachiga **3-xabar** (1 soatlik imzolangan video havolasi bilan) yuboriladi. Agar bitta buyurtmada bir nechta hayvon bo'lsa, 3-xabar oxirgi video tayyor bo'lganda yuboriladi (lekin kuzatuv sahifasi har bir hayvon tayyor bo'lganda darhol yangilanadi).

---

### 3. Muammo Bo'lsa Nima Qilish Kerak?

- **Internet uzilib qoldi:** Sahifani yangilang va o'sha faylni qayta tanlang — tizim yuklangan 8 MB qismlarni tekshirib (`upload_status`), qolgan qismidan davom etadi.
- **Xayriyachi telefon raqamini xato kiritgan:** `/admin` panelidagi **"Noto'g'ri Telefon Raqam Ogohlantirish Ro'yxati"** da bunday buyurtmalar alohida ko'rinadi. Raqam tuzatilgach **Qayta yuborish** tugmasini bosing.
- **FFmpeg xatosi:** Xato matni `kurban_videos.processing_error` ustuniga va Sentry (`outbox_messages`) ga tushadi; worker videoni qayta ishlashga urinadi (`POST /api/admin/kurban` → `run_video_worker`).
