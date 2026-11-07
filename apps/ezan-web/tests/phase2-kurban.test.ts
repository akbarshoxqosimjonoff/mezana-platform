import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import { dbQuery, ensureSchema } from "../src/db/schema";
import { seedDatabase } from "../src/db/seed";
import {
  canRolePerform,
  getPayloadRuntimeInstance,
  updateKurbanCountryByAdmin,
  updateKurbanSeasonByAdmin,
  upsertKurbanOfferByAdmin
} from "../src/cms/service";
import {
  approveAndPublishKurbanVideo,
  assignPaidSharesToAnimals,
  calculateKurbanSharesTotalTry,
  createKurbanOrderWithQuotaLock,
  expireStaleKurbanReservations,
  generateFieldSheetPdfBuffer,
  generateTrackingToken,
  getKurbanSeasonSummary,
  getKurbanTrackingDetails,
  getPublicKurbanCatalog,
  markAnimalSlaughtered,
  planAnimalAssignmentBuckets
} from "../src/kurban/service";
import {
  buildKurbanSmsText,
  checkStuckOutboxMessages,
  processMessagingDlrWebhook,
  resendKurbanMessageLog
} from "../src/kurban/messaging";
import {
  finalizeMultipartVideoUpload,
  generateSignedVideoUrl,
  getMultipartUploadStatus,
  initiateMultipartVideoUpload,
  recordMultipartPartUploaded,
  validateVideoUploadInput,
  verifySignedVideoUrlParams
} from "../src/kurban/storage";
import { runVideoWorkerTick } from "../src/kurban/video-worker";
import {
  createKvkkDeletionRequest,
  generateDonorKvkkExportPdf,
  getDonorCabinetDashboard,
  requestDonorCabinetOtp,
  verifyDonorCabinetOtp
} from "../src/donor-cabinet/service";
import { processPaymentWebhook, signWebhookPayload } from "../src/payments/service";
import { computeInternalHmac, listUnsyncedDonationsForVaqf, verifyInternalSyncAuth } from "../src/sync";
import { generateTotpCode, loginAdminWithTotp } from "../src/lib/security";

describe("Phase 2 — Kurban, Personal Videos, SMS/WhatsApp, Donor Cabinet & Vaqf Sync", () => {
  const adminActor = {
    userId: 1,
    email: "admin@ezanvakfi.org",
    role: "admin" as const,
    totpVerified: true,
    clientIp: "127.0.0.1"
  };

  afterAll(async () => {
    await dbQuery(`UPDATE kurban_seasons SET is_active = FALSE, vekalet_version = 'v2027.1', vekalet_text = '{"tr":"","uz":"","en":"","ar":""}'::jsonb WHERE year = 2027`);
    await dbQuery(`UPDATE kurban_offers SET price_per_share_try = 0, quota_shares = 0, sold_shares = 0, is_active = FALSE`);
    await dbQuery(`UPDATE kurban_countries SET is_active = FALSE`);
  });

  beforeAll(async () => {
    process.env.EZAN_SYNC_SECRET =
      process.env.EZAN_SYNC_SECRET || "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
    process.env.PAYMENT_WEBHOOK_SECRET =
      process.env.PAYMENT_WEBHOOK_SECRET || "f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a5968778695a4b3c2d1e0f";
    process.env.ADMIN_SESSION_SECRET =
      process.env.ADMIN_SESSION_SECRET || "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    process.env.WHATSAPP_ENABLED = "true";
    await ensureSchema();
    await seedDatabase();
  });

  // ==========================================================================
  // 0-QADAM: PAYLOAD CMS 3, ADMIN CRUD VA `field` ROLI CHEKLOVI
  // ==========================================================================
  it("Step 0: initializes Payload CMS 3 on ezan_web DB and enforces field role restrictions", async () => {
    const payload = await getPayloadRuntimeInstance();
    expect(payload).toBeDefined();
    expect(payload.collections).toHaveProperty("kurbanCountries");
    expect(payload.collections).toHaveProperty("kurbanOffers");
    expect(payload.collections).toHaveProperty("kurbanSeasons");

    // field roli faqat dala_upload qila oladi, CMS hech narsasiga kira olmaydi
    expect(canRolePerform("field", "dala_upload")).toBe(true);
    expect(canRolePerform("field", "read")).toBe(false);
    expect(canRolePerform("field", "edit_content")).toBe(false);
    expect(canRolePerform("field", "manage_settings")).toBe(false);

    // field foydalanuvchi 2FA bilan kirganda 4 kunlik sessiya oladi
    const totpCode = generateTotpCode("4948474645444342414039383736353433323130");
    const fieldLogin = await loginAdminWithTotp({
      email: "field@ezanvakfi.org",
      password: "EzanField!2027",
      totpCode
    });
    expect(fieldLogin.user.role).toBe("field");
    expect(fieldLogin.user.assignedCountryCode).toBe("TD");
  }, 20000);

  it("Step 0 & 1: hides countries without price/quota on public site until admin configures them", async () => {
    // Dastlabki seed holatida barcha davlatlar va narxi 0 bo'lgani uchun saytda ko'rinmaydi
    await dbQuery(`UPDATE kurban_offers SET price_per_share_try = 0, quota_shares = 0, sold_shares = 0, is_active = FALSE`);
    const initialCatalog = await getPublicKurbanCatalog("tr");
    expect(initialCatalog.countries.length).toBe(0);

    // Admin CMS orqali mavsum va Çad (TD) hamda Türkiye (TR) narx/kvotalarini kiritadi
    await updateKurbanSeasonByAdmin(adminActor, {
      year: 2027,
      eidDay1: "2027-05-16",
      eidDay2: "2027-05-17",
      eidDay3: "2027-05-18",
      eidDay4: "2027-05-19",
      salesOpenAt: "2026-01-01T00:00:00Z",
      salesCloseAt: "2027-05-14T20:59:00Z",
      isActive: true,
      autoApproveVideos: false,
      videoRetentionDays: 365,
      originalRetentionDays: 30,
      vekaletVersion: "v2027.1",
      vekaletText: {
        tr: "Kurbanımı kesmeye ve dağıtmaya Ezan Vakfı'nı vekil tayin ettim.",
        uz: "Qurbonligimni so'yishga va tarqatishga Ezan Vakfı'ni vakil qildim.",
        en: "I appoint Ezan Foundation as my proxy to slaughter and distribute my Qurbani.",
        ar: "وكلت وقف الأذان في ذبح أضحيتي وتوزيعها."
      }
    });

    await updateKurbanCountryByAdmin(adminActor, {
      code: "TD",
      flag: "🇹🇩",
      partnerInternal: "Çad İç Koordinatörlüğü (Gizli)",
      isActive: true,
      name: { tr: "Çad", uz: "Chad", en: "Chad", ar: "تشاد" },
      description: {
        tr: "Çad kırsal bölgelerindeki ihtiyaç sahipleri için kurban organizasyonu.",
        uz: "Chad hududidagi muhtoj oilalar uchun qurbonlik.",
        en: "Qurbani organization for families in need in Chad.",
        ar: "مشروع الأضاحي للأسر المحتاجة في تشاد."
      }
    });

    await upsertKurbanOfferByAdmin(adminActor, {
      seasonYear: 2027,
      countryCode: "TD",
      animalType: "cattle",
      sharesPerAnimal: 7,
      pricePerShareTry: 4500,
      quotaShares: 70,
      isActive: true
    });

    await upsertKurbanOfferByAdmin(adminActor, {
      seasonYear: 2027,
      countryCode: "TD",
      animalType: "sheep",
      sharesPerAnimal: 1,
      pricePerShareTry: 5200,
      quotaShares: 30,
      isActive: true
    });

    const activeCatalog = await getPublicKurbanCatalog("tr");
    expect(activeCatalog.salesOpen).toBe(true);
    expect(activeCatalog.countries.length).toBe(1);
    expect(activeCatalog.countries[0]!.code).toBe("TD");
    // partner_internal hech qachon ommaviy javobda bo'lmasligi shart
    expect(JSON.stringify(activeCatalog)).not.toContain("Çad İç Koordinatörlüğü");
  });

  // ==========================================================================
  // 10-QADAM (UNIT TESTLAR): NARX, TOKEN, XABAR UZUNLIGI, BIRIKTIRISH ALGORITMI
  // ==========================================================================
  it("Unit: calculates server price accurately and rejects invalid share counts", () => {
    expect(calculateKurbanSharesTotalTry(4500, 1)).toBe(4500);
    expect(calculateKurbanSharesTotalTry(4500, 7)).toBe(31500);
    expect(() => calculateKurbanSharesTotalTry(0, 1)).toThrow();
    expect(() => calculateKurbanSharesTotalTry(4500, 0)).toThrow();
  });

  it("Unit: generates 32-byte (64 hex chars) cryptographically random tracking tokens", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const token = generateTrackingToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      seen.add(token);
    }
    expect(seen.size).toBe(500);
  });

  it("Unit: builds SMS texts <= 160 chars across all 4 locales and stages, with native Latin for TR/UZ and UCS-2 for AR", () => {
    const stages = ["payment_confirmed", "animal_slaughtered", "video_published"] as const;
    const locales = ["tr", "uz", "en", "ar"] as const;
    const sampleUrl = "https://ezanvakfi.org/tr/kurban/takip/a1b2c3d4e5f60718293a4b5c6d7e";

    for (const stage of stages) {
      for (const locale of locales) {
        const res = buildKurbanSmsText({
          stage,
          locale,
          orderNo: "KRB-2027-ABC123",
          shareCount: 2,
          trackingUrl: sampleUrl
        });
        expect(res.charLength).toBeLessThanOrEqual(160);
        if (locale === "ar") {
          expect(res.encoding).toBe("UCS-2");
        } else if (locale === "tr") {
          expect(res.encoding).toBe("TURKISH_LATIN");
          expect(res.body).toContain("Ezan Vakfı");
        } else if (locale === "uz") {
          expect(res.encoding).toBe("GSM7_LATIN");
        }
      }
    }
  });

  it("Unit: assigns cattle shares in buckets of 7 without splitting shares of the same order", () => {
    const shares = [
      // Order 101: 4 shares
      { shareId: 1, orderId: 101, ownerName: "Ali 1", intentionType: "vacip" as const },
      { shareId: 2, orderId: 101, ownerName: "Ali 2", intentionType: "vacip" as const },
      { shareId: 3, orderId: 101, ownerName: "Ali 3", intentionType: "vacip" as const },
      { shareId: 4, orderId: 101, ownerName: "Ali 4", intentionType: "vacip" as const },
      // Order 102: 4 shares (cannot fit in bucket 1 without splitting -> goes to bucket 2!)
      { shareId: 5, orderId: 102, ownerName: "Veli 1", intentionType: "adak" as const },
      { shareId: 6, orderId: 102, ownerName: "Veli 2", intentionType: "adak" as const },
      { shareId: 7, orderId: 102, ownerName: "Veli 3", intentionType: "adak" as const },
      { shareId: 8, orderId: 102, ownerName: "Veli 4", intentionType: "adak" as const },
      // Order 103: 3 shares (fits with Order 101 in bucket 1 -> 4 + 3 = 7!)
      { shareId: 9, orderId: 103, ownerName: "Hasan 1", intentionType: "akika" as const },
      { shareId: 10, orderId: 103, ownerName: "Hasan 2", intentionType: "akika" as const },
      { shareId: 11, orderId: 103, ownerName: "Hasan 3", intentionType: "akika" as const }
    ];

    const buckets = planAnimalAssignmentBuckets({
      countryCode: "TD",
      seasonYear: 2027,
      animalType: "cattle",
      shares
    });

    expect(buckets.length).toBe(2);
    expect(buckets[0]!.shares.length).toBe(7); // Order 101 (4) + Order 103 (3)
    expect(buckets[1]!.shares.length).toBe(4); // Order 102 (4)

    // Tekshiramiz: Order 101 ning barcha 4 ta hissesi bitta hayvonda, Order 102 ning barcha 4 ta hissesi bitta hayvonda
    const order101Buckets = buckets.filter((b) => b.shares.some((s) => s.orderId === 101));
    const order102Buckets = buckets.filter((b) => b.shares.some((s) => s.orderId === 102));
    expect(order101Buckets.length).toBe(1);
    expect(order102Buckets.length).toBe(1);
  });

  // ==========================================================================
  // 1-QADAM: KVOTA REZERV MUDDATI (15 DAQIQA) VA SALES_CLOSE_AT CUTOFF
  // ==========================================================================
  it("Unit & Integration: expires stale 15-minute reservations and releases quota; enforces salesCloseAt cutoff", async () => {
    const offerRes = await dbQuery<{ id: number; sold_shares: number }>(
      `SELECT id, sold_shares FROM kurban_offers WHERE season_year = 2027 AND country_code = 'TD' AND animal_type = 'sheep' LIMIT 1`
    );
    const offerId = offerRes.rows[0]!.id;
    const beforeSold = Number(offerRes.rows[0]!.sold_shares);

    const created = await createKurbanOrderWithQuotaLock({
      originHost: "ezanvakfi.org",
      locale: "tr",
      offerId,
      shares: [{ ownerName: "Zeynep Kaya", intentionType: "vacip" }],
      vekaletAccepted: true,
      readNamesAloudConsent: true,
      kvkkConsent: true,
      donor: { name: "Zeynep Kaya", phone: "+905559998877", email: "zeynep@example.com" }
    });

    const afterReserve = await dbQuery<{ sold_shares: number }>(`SELECT sold_shares FROM kurban_offers WHERE id = $1`, [offerId]);
    expect(Number(afterReserve.rows[0]!.sold_shares)).toBe(beforeSold + 1);

    // 16 daqiqa o'tgach rezerv muddati tugaydi va kvota bo'shaydi
    const expResult = await expireStaleKurbanReservations(Date.now() + 16 * 60 * 1000);
    expect(expResult.expiredOrders).toBeGreaterThanOrEqual(1);

    const afterExpire = await dbQuery<{ sold_shares: number }>(`SELECT sold_shares FROM kurban_offers WHERE id = $1`, [offerId]);
    expect(Number(afterExpire.rows[0]!.sold_shares)).toBe(beforeSold);

    const ordStatus = await dbQuery<{ status: string }>(`SELECT status FROM kurban_orders WHERE id = $1`, [created.order.id]);
    expect(ordStatus.rows[0]!.status).toBe("cancelled");

    // salesCloseAt (2027-05-14T20:59:00Z) dan keyin oqim yopilishi
    const afterCloseMs = new Date("2027-05-15T10:00:00Z").getTime();
    const closedCatalog = await getPublicKurbanCatalog("uz", afterCloseMs);
    expect(closedCatalog.salesClosed).toBe(true);
    expect(closedCatalog.salesOpen).toBe(false);

    await expect(
      createKurbanOrderWithQuotaLock({
        originHost: "azonvaqfi.org",
        locale: "uz",
        offerId,
        shares: [{ ownerName: "Test User", intentionType: "vacip" }],
        vekaletAccepted: true,
        readNamesAloudConsent: true,
        kvkkConsent: true,
        donor: { name: "Test User", phone: "+998901234567" },
        nowMs: afterCloseMs
      })
    ).rejects.toThrow(/SALES_CLOSED/);
  });

  // ==========================================================================
  // 10-QADAM (INTEGRATSIYA): TO'LOV -> BIRIKTIRISH -> KESILDI -> VIDEO -> TASDIQ -> REFUND
  // ==========================================================================
  it("Integration: full lifecycle (Payment -> Stage 1 msg -> Assign -> Slaughter & Stage 2 msg -> Video upload & FFmpeg -> Approve & Stage 3 msg -> Tracking privacy)", async () => {
    const cattleOfferRes = await dbQuery<{ id: number }>(
      `SELECT id FROM kurban_offers WHERE season_year = 2027 AND country_code = 'TD' AND animal_type = 'cattle' LIMIT 1`
    );
    const cattleOfferId = cattleOfferRes.rows[0]!.id;

    // 2 ta alohida xayriyachi (Donor A va Donor B) hisse sotib oladi (bitta sigirga tushadi)
    const orderA = await createKurbanOrderWithQuotaLock({
      originHost: "ezanvakfi.org",
      locale: "tr",
      offerId: cattleOfferId,
      shares: [
        { ownerName: "Mehmet Demir", intentionType: "vacip" },
        { ownerName: "Ayşe Demir", intentionType: "sukur" }
      ],
      vekaletAccepted: true,
      readNamesAloudConsent: true,
      kvkkConsent: true,
      donor: { name: "Mehmet Demir", phone: "+905321112233", email: "mehmet@example.com" }
    });

    const orderB = await createKurbanOrderWithQuotaLock({
      originHost: "azonvaqfi.org",
      locale: "uz",
      offerId: cattleOfferId,
      shares: [{ ownerName: "Abdulloh Karimov", intentionType: "vacip" }],
      vekaletAccepted: true,
      readNamesAloudConsent: true,
      kvkkConsent: true,
      donor: { name: "Abdulloh Karimov", phone: "+998901112233", email: "abdulloh@example.com" }
    });

    // 1) To'lov tasdiqlanadi -> hisselar `paid` bo'ladi va 1-xabar (`payment_confirmed`) outbox'ga tushadi
    for (const ord of [orderA, orderB]) {
      const payload = JSON.stringify({
        eventId: `evt-paid-${ord.order.orderNo}`,
        donationExternalId: ord.donation.external_id,
        status: "paid",
        paidPrice: ord.donation.amount_try
      });
      const sig = signWebhookPayload(payload);
      await processPaymentWebhook({ rawBody: payload, signatureHeader: sig });
    }

    const stage1Logs = await dbQuery(
      `SELECT * FROM kurban_message_logs WHERE order_id = $1 AND event_stage = 'payment_confirmed'`,
      [orderA.order.id]
    );
    expect(stage1Logs.rowCount).toBeGreaterThanOrEqual(2); // SMS + WhatsApp + Email
    // Bitta buyurtmada 2 ta hisse bo'lsa ham faqat 1 ta SMS yuboriladi!
    expect(stage1Logs.rows.filter((r) => r.channel === "sms").length).toBe(1);

    // 2) Admin `paid` hisselarni hayvonlarga biriktiradi va A4 PDF oladi
    const assigned = await assignPaidSharesToAnimals({
      seasonYear: 2027,
      countryCode: "TD",
      animalType: "cattle",
      actorEmail: "admin@ezanvakfi.org",
      actorRole: "admin"
    });
    expect(assigned.assignedAnimalsCount).toBeGreaterThanOrEqual(1);
    const animal = assigned.animals[0]!;

    const pdfBuf = await generateFieldSheetPdfBuffer({ seasonYear: 2027, countryCode: "TD" });
    expect(pdfBuf.subarray(0, 4).toString("utf8")).toBe("%PDF");

    // 3) Dala jamoasi hayvonni "kesildi" deb belgilaydi -> hisselar `slaughtered` va 2-xabar (`animal_slaughtered`) ketadi
    const slaughterRes = await markAnimalSlaughtered({
      animalId: animal.id,
      actorEmail: "field@ezanvakfi.org",
      actorRole: "field",
      assignedCountryCode: "TD"
    });
    expect(slaughterRes.status).toBe("slaughtered");

    const stage2Logs = await dbQuery(
      `SELECT * FROM kurban_message_logs WHERE order_id = $1 AND event_stage = 'animal_slaughtered'`,
      [orderA.order.id]
    );
    expect(stage2Logs.rowCount).toBeGreaterThanOrEqual(1);
    // 2-bosqichda e-pochta yo'q (faqat SMS va WhatsApp)
    expect(stage2Logs.rows.some((r) => r.channel === "email")).toBe(false);

    // 4) Dala jamoasi videoni multipart qilib yuklaydi (uzilib qolganda qolgan joyidan davom etish bilan)
    expect(validateVideoUploadInput({ fileName: "bad.exe", mimeType: "application/octet-stream", totalSizeBytes: 100 }).valid).toBe(false);
    expect(validateVideoUploadInput({ fileName: "huge.mp4", mimeType: "video/mp4", totalSizeBytes: 3 * 1024 * 1024 * 1024 }).valid).toBe(false);

    const initUp = await initiateMultipartVideoUpload({
      animalId: animal.id,
      fileName: "kurban-kesim.mp4",
      mimeType: "video/mp4",
      totalSizeBytes: 2048,
      uploadedBy: "field@ezanvakfi.org",
      assignedCountryCode: "TD"
    });
    expect(initUp.totalParts).toBe(1);

    await recordMultipartPartUploaded({
      uploadId: initUp.uploadId,
      partNumber: 1,
      sizeBytes: 2048,
      chunkDataBase64: Buffer.alloc(2048, 1).toString("base64")
    });

    const upStatus = await getMultipartUploadStatus(initUp.uploadId);
    expect(upStatus.remainingParts.length).toBe(0);

    const finalized = await finalizeMultipartVideoUpload({
      uploadId: initUp.uploadId,
      uploadedBy: "field@ezanvakfi.org"
    });
    expect(finalized.status).toBe("uploaded");
    expect(finalized.coordinatorAlert).toContain("hayvon videosi yuklandi");

    // 5) FFmpeg worker (`SKIP LOCKED`) videoni qayta ishlaydi (720p H.264 +faststart + poster)
    const workerRes = await runVideoWorkerTick(2);
    expect(workerRes.processed).toBeGreaterThanOrEqual(1);

    // Admin tasdiqlashidan oldin 3-xabar ketmagan bo'lishi kerak
    const beforeApproveLogs = await dbQuery(
      `SELECT * FROM kurban_message_logs WHERE order_id = $1 AND event_stage = 'video_published'`,
      [orderA.order.id]
    );
    expect(beforeApproveLogs.rowCount).toBe(0);

    // 6) Admin videoni tasdiqlaydi -> hisselar `video_ready` -> `notified` va 3-xabar (`video_published`) ketadi
    const approved = await approveAndPublishKurbanVideo({
      videoId: finalized.videoId,
      actorEmail: "admin@ezanvakfi.org",
      actorRole: "admin"
    });
    expect(approved.status).toBe("published");

    const stage3Logs = await dbQuery(
      `SELECT * FROM kurban_message_logs WHERE order_id = $1 AND event_stage = 'video_published'`,
      [orderA.order.id]
    );
    expect(stage3Logs.rowCount).toBeGreaterThanOrEqual(2); // SMS + WhatsApp + Email

    // Delivery Report (DLR) webhook imzosini tekshiramiz
    const smsLog = stage3Logs.rows.find((r) => r.channel === "sms")!;
    const dlrBody = JSON.stringify({ messageId: smsLog.provider_message_id, status: "delivered" });
    const dlrSig = signWebhookPayload(dlrBody);
    const dlrRes = await processMessagingDlrWebhook({ rawBody: dlrBody, signatureHeader: dlrSig });
    expect(dlrRes.status).toBe("delivered");

    // Admin qayta yuborish va outbox monitoringi
    await resendKurbanMessageLog(smsLog.id);
    await checkStuckOutboxMessages();

    // 7) 6-qadam: Kuzatuv sahifasi maxfiyligi va 1 soatlik imzolangan havola
    const trackingA = await getKurbanTrackingDetails(orderA.order.primaryTrackingToken, "tr");
    expect(trackingA).not.toBeNull();
    expect(trackingA!.shares.length).toBe(2);
    expect(trackingA!.shares[0]!.video?.expiresInSeconds).toBe(3600);
    // Donor A ning kuzatuv sahifasida bitta hayvondagi Donor B ("Abdulloh Karimov") ismi ASLO ko'rinmaydi!
    expect(JSON.stringify(trackingA)).not.toContain("Abdulloh Karimov");

    // Imzolangan URL muddati o'tsa rad etiladi
    const signed = generateSignedVideoUrl({ storageKey: "kurban/2027/TD/test.mp4", expiresInSeconds: 3600, nowMs: 1000000 });
    const urlObj = new URL(`http://localhost${signed.url}`);
    expect(
      verifySignedVideoUrlParams({
        storageKey: urlObj.searchParams.get("key")!,
        exp: urlObj.searchParams.get("exp")!,
        dl: urlObj.searchParams.get("dl")!,
        sig: urlObj.searchParams.get("sig")!,
        nowMs: 1000000 + 1000 * 1000
      })
    ).toBe(true);
    expect(
      verifySignedVideoUrlParams({
        storageKey: urlObj.searchParams.get("key")!,
        exp: urlObj.searchParams.get("exp")!,
        dl: urlObj.searchParams.get("dl")!,
        sig: urlObj.searchParams.get("sig")!,
        nowMs: 1000000 + 3601 * 1000
      })
    ).toBe(false);
  });

  // ==========================================================================
  // 7-QADAM: XAYRIYACHI KABINETI (OTP, AVTOMATIK BOG'LASH, KVKK JSON/PDF)
  // ==========================================================================
  it("Step 7: authenticates donor via 6-digit SMS OTP (5 attempts max) and links donations & Qurban shares", async () => {
    const otpReq = await requestDonorCabinetOtp({
      channel: "sms",
      target: "+905321112233",
      locale: "tr"
    });
    expect(otpReq.sent).toBe(true);
    expect(otpReq.devMockOtpCode).toMatch(/^\d{6}$/);

    // Xato kod urinishi rad etiladi
    await expect(
      verifyDonorCabinetOtp({
        channel: "sms",
        target: "+905321112233",
        code: "000000",
        host: "ezanvakfi.org",
        locale: "tr"
      })
    ).rejects.toThrow(/OTP_INVALID/);

    // To'g'ri kod bilan 30 kunlik sessiya yaratiladi
    const verified = await verifyDonorCabinetOtp({
      channel: "sms",
      target: "+905321112233",
      code: otpReq.devMockOtpCode!,
      host: "ezanvakfi.org",
      locale: "tr"
    });
    expect(verified.expiresInSeconds).toBe(30 * 24 * 60 * 60);

    const dash = await getDonorCabinetDashboard({ phone: "+905321112233", locale: "tr" });
    expect(dash.kurbanShares.length).toBeGreaterThanOrEqual(2);
    expect(dash.donations.length).toBeGreaterThanOrEqual(1);

    const kvkkPdf = await generateDonorKvkkExportPdf(dash);
    expect(kvkkPdf.subarray(0, 4).toString("utf8")).toBe("%PDF");

    const delReq = await createKvkkDeletionRequest({
      phone: "+905321112233",
      reason: "Test KVKK request"
    });
    expect(delReq.status).toBe("pending");
  });

  // ==========================================================================
  // 8-QADAM: ICHKI VAQF SINXRONLASH (PII YUBORILMAYDI, SUMMARY HMAC, REFUND)
  // ==========================================================================
  it("Step 8: syncs live Qurban donations without PII/videos, verifies HMAC summary, and handles refund -> cancelled", async () => {
    const prevLive = process.env.DONATIONS_LIVE;
    process.env.DONATIONS_LIVE = "true";
    let liveOrderExtId = "";

    try {
      const sheepOfferRes = await dbQuery<{ id: number }>(
        `SELECT id FROM kurban_offers WHERE season_year = 2027 AND country_code = 'TD' AND animal_type = 'sheep' LIMIT 1`
      );
      const liveOrder = await createKurbanOrderWithQuotaLock({
        originHost: "ezanvakfi.org",
        locale: "tr",
        offerId: sheepOfferRes.rows[0]!.id,
        shares: [{ ownerName: "Gizli Hissedar İsmi", intentionType: "vacip" }],
        vekaletAccepted: true,
        readNamesAloudConsent: true,
        kvkkConsent: true,
        donor: { name: "Gizli Bağışçı", phone: "+905440001122", email: "gizli@example.com" }
      });

      liveOrderExtId = liveOrder.donation.external_id;
      const paidPayload = JSON.stringify({
        eventId: `evt-live-paid-${liveOrder.order.orderNo}`,
        donationExternalId: liveOrder.donation.external_id,
        status: "paid",
        paidPrice: liveOrder.donation.amount_try
      });
      await processPaymentWebhook({ rawBody: paidPayload, signatureHeader: signWebhookPayload(paidPayload) });

      const syncBatch = await listUnsyncedDonationsForVaqf(0, 100);
      const syncedItem = syncBatch.items.find((i) => i.external_ref === liveOrder.donation.external_id);
      expect(syncedItem).toBeDefined();
      expect(syncedItem!.purpose).toBe("Onlayn kurban: Çad 2027");
      expect(syncedItem!.restricted).toBe(true);
      expect(syncedItem!.notes).toBe("1 hisse (sheep)");
      // Ichki tizimga ism, telefon va e-pochta YUBORILMAYDI!
      expect(syncedItem!.donor.is_anonymous).toBe(true);
      expect(syncedItem!.donor.full_name).toBe("Anonim Bağışçı");
      expect(syncedItem!.donor.phone).toBeNull();
      expect(syncedItem!.donor.email).toBeNull();
      expect(JSON.stringify(syncedItem)).not.toContain("Gizli");

      // HMAC summary tekshiruvi
      const ts = String(Math.floor(Date.now() / 1000));
      const pathAndQuery = "/api/internal/kurban/summary?season=2027";
      const sig = computeInternalHmac(ts, "GET", pathAndQuery, "");
      expect(
        verifyInternalSyncAuth({
          timestampHeader: ts,
          signatureHeader: sig,
          method: "GET",
          pathAndQuery
        }).ok
      ).toBe(true);

      const summary = await getKurbanSeasonSummary(2027);
      expect(summary.totals.soldShares).toBeGreaterThanOrEqual(1);

      // Refund -> refunded holatiga o'tadi va sync javobida status='refunded' chiqadi
      const refundPayload = JSON.stringify({
        eventId: `evt-live-refund-${liveOrder.order.orderNo}`,
        donationExternalId: liveOrder.donation.external_id,
        status: "refunded",
        reason: "Mijoz talabi bilan qaytarildi"
      });
      await processPaymentWebhook({ rawBody: refundPayload, signatureHeader: signWebhookPayload(refundPayload) });

      const afterRefundSync = await listUnsyncedDonationsForVaqf(0, 100);
      const refundedSyncItem = afterRefundSync.items.find((i) => i.external_ref === liveOrder.donation.external_id);
      expect(refundedSyncItem?.status).toBe("refunded");
    } finally {
      process.env.DONATIONS_LIVE = prevLive;
      if (typeof liveOrderExtId === "string" && liveOrderExtId) {
        await dbQuery("UPDATE donations SET is_test = TRUE WHERE external_id = $1::uuid", [liveOrderExtId]);
      }
    }
  });

  // ==========================================================================
  // 10-QADAM: KVOTA POYGA TESTI (100 -> 10) VA YUKLAMA TESTLARI (200 CHECKOUT + 50 VIDEO UPLOAD)
  // ==========================================================================
  it(
    "Step 10: executes 100-way quota race (exact 10 succeed), 200 concurrent checkouts, and 50 concurrent video uploads",
    async () => {
      await updateKurbanCountryByAdmin(adminActor, {
        code: "SO",
        flag: "🇸🇴",
        isActive: true,
        name: { tr: "Somali", uz: "Somali", en: "Somalia", ar: "الصومال" },
        description: { tr: "Somali kurban", uz: "Somali qurbonlik", en: "Somalia Qurbani", ar: "أضاحي الصومال" }
      });

      // 1) KVOTA POYGA TESTI (100 parallel so'rov -> 10 ta qolgan hisse -> aniq 10 tasi o'tadi)
      await dbQuery(`DELETE FROM kurban_orders WHERE country_code = 'SO'`);
      await dbQuery(
        `INSERT INTO kurban_offers (season_year, country_code, animal_type, shares_per_animal, price_per_share_try, quota_shares, sold_shares, is_active)
         VALUES (2027, 'SO', 'sheep', 1, 4200, 10, 0, TRUE)
         ON CONFLICT (season_year, country_code, animal_type) DO UPDATE SET
           price_per_share_try = 4200,
           quota_shares = 10,
           sold_shares = 0,
           is_active = TRUE`
      );

      const raceOfferRes = await dbQuery<{ id: number }>(
        `SELECT id FROM kurban_offers WHERE season_year = 2027 AND country_code = 'SO' AND animal_type = 'sheep' LIMIT 1`
      );
      const raceOfferId = raceOfferRes.rows[0]!.id;

      const raceStart = performance.now();
      const racePromises = Array.from({ length: 100 }, (_, i) =>
        createKurbanOrderWithQuotaLock({
          originHost: "ezanvakfi.org",
          locale: "tr",
          offerId: raceOfferId,
          shares: [{ ownerName: `Race Donor ${i + 1}`, intentionType: "vacip" }],
          vekaletAccepted: true,
          readNamesAloudConsent: true,
          kvkkConsent: true,
          donor: { name: `Race Donor ${i + 1}`, phone: `+90555000${String(i).padStart(4, "0")}` }
        })
      );

      const raceResults = await Promise.allSettled(racePromises);
      const raceDurationMs = Math.round(performance.now() - raceStart);
      const raceSucceeded = raceResults.filter((r) => r.status === "fulfilled").length;
      const raceRejected = raceResults.filter((r) => r.status === "rejected").length;

      const afterRaceOffer = await dbQuery<{ sold_shares: number; quota_shares: number }>(
        `SELECT sold_shares, quota_shares FROM kurban_offers WHERE id = $1`,
        [raceOfferId]
      );

      expect(raceSucceeded).toBe(10);
      expect(raceRejected).toBe(90);
      expect(Number(afterRaceOffer.rows[0]?.sold_shares)).toBe(10);

      // 2) 200 PARALLEL FOYDALANUVCHI QURBONLIK SAHIFASI VA CHECKOUT YUKLAMA TESTI
      await dbQuery(
        `INSERT INTO kurban_offers (season_year, country_code, animal_type, shares_per_animal, price_per_share_try, quota_shares, sold_shares, is_active)
         VALUES (2027, 'SO', 'cattle', 7, 4000, 1000, 0, TRUE)
         ON CONFLICT (season_year, country_code, animal_type) DO UPDATE SET
           price_per_share_try = 4000,
           quota_shares = 1000,
           sold_shares = 0,
           is_active = TRUE`
      );
      const loadOfferRes = await dbQuery<{ id: number }>(
        `SELECT id FROM kurban_offers WHERE season_year = 2027 AND country_code = 'SO' AND animal_type = 'cattle' LIMIT 1`
      );
      const loadOfferId = loadOfferRes.rows[0]!.id;

      const latenciesMs: number[] = [];
      const checkoutStart = performance.now();

      const userPromises = Array.from({ length: 200 }, async (_, i) => {
        const t0 = performance.now();
        await getPublicKurbanCatalog("tr");
        await createKurbanOrderWithQuotaLock({
          originHost: "ezanvakfi.org",
          locale: "tr",
          offerId: loadOfferId,
          shares: [{ ownerName: `Load User ${i + 1}`, intentionType: "vacip" }],
          vekaletAccepted: true,
          readNamesAloudConsent: true,
          kvkkConsent: true,
          donor: { name: `Load User ${i + 1}`, phone: `+90533000${String(i).padStart(4, "0")}` }
        });
        latenciesMs.push(performance.now() - t0);
      });

      const checkoutResults = await Promise.allSettled(userPromises);
      const checkoutTotalMs = Math.round(performance.now() - checkoutStart);
      const checkoutSuccess = checkoutResults.filter((r) => r.status === "fulfilled").length;
      if (checkoutSuccess !== 200) {
        const firstErr = checkoutResults.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
        console.error("CHECKOUT ERROR:", firstErr?.reason);
      }
      expect(checkoutSuccess).toBe(200);

      latenciesMs.sort((a, b) => a - b);
      const avgMs = Math.round(latenciesMs.reduce((a, b) => a + b, 0) / latenciesMs.length);
      const p50Ms = Math.round(latenciesMs[Math.floor(latenciesMs.length * 0.5)] || 0);
      const p95Ms = Math.round(latenciesMs[Math.floor(latenciesMs.length * 0.95)] || 0);
      const p99Ms = Math.round(latenciesMs[Math.floor(latenciesMs.length * 0.99)] || 0);

      // 3) 50 PARALLEL VIDEO YUKLASH (MINIO VA MULTIPART S3 STORAGE BILAN)
      const animalIds: number[] = [];
      for (let i = 1; i <= 50; i++) {
        const tagNo = `SO-2027-LOAD-${String(i).padStart(3, "0")}`;
        const aRes = await dbQuery<{ id: number }>(
          `INSERT INTO kurban_animals (season_year, country_code, animal_type, shares_capacity, tag_no, status)
           VALUES (2027, 'SO', 'cattle', 7, $1, 'slaughtered')
           ON CONFLICT (season_year, country_code, tag_no) DO UPDATE SET updated_at = NOW()
           RETURNING id`,
          [tagNo]
        );
        animalIds.push(aRes.rows[0]!.id);
      }

      const sampleChunkB64 = Buffer.alloc(64 * 1024, 0x42).toString("base64");
      const uploadLatenciesMs: number[] = [];
      const uploadStart = performance.now();

      const uploadPromises = animalIds.map(async (animalId, idx) => {
        const u0 = performance.now();
        const init = await initiateMultipartVideoUpload({
          animalId,
          fileName: `parallel-video-${idx + 1}.mp4`,
          mimeType: "video/mp4",
          totalSizeBytes: 64 * 1024,
          uploadedBy: "field@ezanvakfi.org"
        });
        await recordMultipartPartUploaded({
          uploadId: init.uploadId,
          partNumber: 1,
          sizeBytes: 64 * 1024,
          chunkDataBase64: sampleChunkB64
        });
        await finalizeMultipartVideoUpload({
          uploadId: init.uploadId,
          uploadedBy: "field@ezanvakfi.org"
        });
        uploadLatenciesMs.push(performance.now() - u0);
      });

      const uploadResults = await Promise.allSettled(uploadPromises);
      const uploadTotalMs = Math.round(performance.now() - uploadStart);
      const uploadSuccess = uploadResults.filter((r) => r.status === "fulfilled").length;
      expect(uploadSuccess).toBe(50);

      uploadLatenciesMs.sort((a, b) => a - b);
      const uploadAvgMs = Math.round(uploadLatenciesMs.reduce((a, b) => a + b, 0) / uploadLatenciesMs.length);
      const uploadP95Ms = Math.round(uploadLatenciesMs[Math.floor(uploadLatenciesMs.length * 0.95)] || 0);

      await dbQuery(`DELETE FROM kurban_animals WHERE tag_no LIKE 'SO-2027-LOAD-%'`);
      await dbQuery(`DELETE FROM kurban_orders WHERE country_code = 'SO'`);

      console.log(
        "PHASE2_BENCHMARK_RESULTS=" +
          JSON.stringify({
            quotaRaceTest: {
              parallelRequests: 100,
              availableShares: 10,
              succeeded: raceSucceeded,
              rejectedQuotaExceeded: raceRejected,
              finalSoldSharesInDb: Number(afterRaceOffer.rows[0]?.sold_shares),
              totalDurationMs: raceDurationMs
            },
            checkout200ConcurrentTest: {
              concurrentUsers: 200,
              succeeded: checkoutSuccess,
              failed: 200 - checkoutSuccess,
              totalDurationMs: checkoutTotalMs,
              avgLatencyMs: avgMs,
              p50LatencyMs: p50Ms,
              p95LatencyMs: p95Ms,
              p99LatencyMs: p99Ms
            },
            videoUpload50ConcurrentTest: {
              concurrentUploads: 50,
              succeeded: uploadSuccess,
              failed: 50 - uploadSuccess,
              totalDurationMs: uploadTotalMs,
              avgLatencyMs: uploadAvgMs,
              p95LatencyMs: uploadP95Ms
            }
          })
      );
    },
    60_000
  );
});
