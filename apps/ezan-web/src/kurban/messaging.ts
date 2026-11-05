import crypto from "node:crypto";
import { dbQuery, ensureSchema } from "../db/schema";
import { Locale } from "../i18n/country-locale";
import { requireEnvSecret } from "../lib/config";

export type KurbanMessageStage = "payment_confirmed" | "animal_slaughtered" | "video_published";
export type KurbanTemplateName = "kurban_vekalet_alindi" | "kurban_kesildi" | "kurban_video_hazir";

export interface SmsSendRequest {
  to: string;
  body: string;
  encoding: "GSM7_LATIN" | "TURKISH_LATIN" | "UCS-2";
  senderHeader: string;
}

export interface SmsSendResult {
  provider: string;
  messageId: string;
  status: "sent" | "failed";
  error?: string;
}

export interface SmsProvider {
  readonly name: string;
  sendSms(req: SmsSendRequest): Promise<SmsSendResult>;
}

export interface WhatsAppSendRequest {
  to: string;
  templateName: KurbanTemplateName;
  locale: Locale;
  parameters: string[];
  renderedText: string;
}

export interface WhatsAppProvider {
  readonly name: string;
  sendTemplate(req: WhatsAppSendRequest): Promise<SmsSendResult>;
}

export const SMS_SENDER_HEADER = "EZANVAKFI";

export function isValidInternationalPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const cleaned = phone.trim().replace(/[\s\-()]/g, "");
  return /^\+?[1-9]\d{8,14}$/.test(cleaned);
}

export function normalizePhoneE164(phone: string): string {
  const cleaned = (phone || "").trim().replace(/[\s\-()]/g, "");
  if (!cleaned) return "";
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}

/**
 * 5-qadam: SMS matnlari (<= 160 belgi).
 * - Turkcha va o'zbekcha matnlar lotin yozuvida, harflarni almashtirmasdan;
 * - Arabcha SMS UCS-2 kodlashda va qisqa yoziladi.
 */
export function buildKurbanSmsText(params: {
  stage: KurbanMessageStage;
  locale: Locale;
  orderNo: string;
  shareCount: number;
  trackingUrl: string;
}): { body: string; encoding: "GSM7_LATIN" | "TURKISH_LATIN" | "UCS-2"; templateName: KurbanTemplateName; charLength: number } {
  const { stage, locale, shareCount, trackingUrl } = params;

  let templateName: KurbanTemplateName = "kurban_vekalet_alindi";
  if (stage === "animal_slaughtered") templateName = "kurban_kesildi";
  if (stage === "video_published") templateName = "kurban_video_hazir";

  let body = "";
  let encoding: "GSM7_LATIN" | "TURKISH_LATIN" | "UCS-2" = "TURKISH_LATIN";

  if (stage === "payment_confirmed") {
    if (locale === "tr") {
      body = `Ezan Vakfı: ${shareCount} hisse kurban vekaletiniz ve ödemeniz alındı. Takip: ${trackingUrl}`;
      encoding = "TURKISH_LATIN";
    } else if (locale === "uz") {
      body = `Azon Vaqfi: ${shareCount} hisse qurbonlik vakolatingiz qabul qilindi. Kuzatuv: ${trackingUrl}`;
      encoding = "GSM7_LATIN";
    } else if (locale === "ar") {
      body = `وقف الأذان: تم قبول وكالة أضحيتكم (${shareCount}). المتابعة: ${trackingUrl}`;
      encoding = "UCS-2";
    } else {
      body = `Ezan Foundation: Your Qurbani proxy (${shareCount} share) is confirmed. Track: ${trackingUrl}`;
      encoding = "GSM7_LATIN";
    }
  } else if (stage === "animal_slaughtered") {
    if (locale === "tr") {
      body = `Ezan Vakfı: Kurbanınız İslami usullere uygun kesildi. Video hazırlanıyor: ${trackingUrl}`;
      encoding = "TURKISH_LATIN";
    } else if (locale === "uz") {
      body = `Azon Vaqfi: Qurbonligingiz islomiy qoidalarga muvofiq so'yildi. Video tayyorlanmoqda: ${trackingUrl}`;
      encoding = "GSM7_LATIN";
    } else if (locale === "ar") {
      body = `وقف الأذان: تم ذبح أضحيتكم شرعاً. يجري تجهيز الفيديو: ${trackingUrl}`;
      encoding = "UCS-2";
    } else {
      body = `Ezan Foundation: Your Qurbani has been slaughtered. Video preparing: ${trackingUrl}`;
      encoding = "GSM7_LATIN";
    }
  } else {
    if (locale === "tr") {
      body = `Ezan Vakfı: Kurban kesim videonuz hazır. İzlemek ve indirmek için: ${trackingUrl}`;
      encoding = "TURKISH_LATIN";
    } else if (locale === "uz") {
      body = `Azon Vaqfi: Qurbonlik videongiz tayyor. Ko'rish va yuklab olish uchun: ${trackingUrl}`;
      encoding = "GSM7_LATIN";
    } else if (locale === "ar") {
      body = `وقف الأذان: فيديو أضحيتكم جاهز للمشاهدة والتحميل: ${trackingUrl}`;
      encoding = "UCS-2";
    } else {
      body = `Ezan Foundation: Your Qurbani video is ready to watch and download: ${trackingUrl}`;
      encoding = "GSM7_LATIN";
    }
  }

  if (body.length > 160) {
    body = body.slice(0, 160);
  }

  return {
    body,
    encoding,
    templateName,
    charLength: body.length
  };
}

class MockSmsProvider implements SmsProvider {
  readonly name = "mock";
  async sendSms(req: SmsSendRequest): Promise<SmsSendResult> {
    return {
      provider: "mock",
      messageId: `mock-sms-${crypto.randomBytes(6).toString("hex")}`,
      status: "sent"
    };
  }
}

class NetgsmSmsProvider implements SmsProvider {
  readonly name = "netgsm";
  async sendSms(req: SmsSendRequest): Promise<SmsSendResult> {
    const usercode = process.env.NETGSM_USERCODE;
    const password = process.env.NETGSM_PASSWORD;
    const msgheader = process.env.NETGSM_MSGHEADER || SMS_SENDER_HEADER;
    if (!usercode || !password) {
      throw new Error("Configuration error: NETGSM_USERCODE and NETGSM_PASSWORD are required when SMS_PROVIDER=netgsm");
    }

    const dil = req.encoding === "UCS-2" ? "AR" : "TR";
    const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<mainbody>
  <header>
    <company dil="${dil}">Netgsm</company>
    <usercode>${usercode}</usercode>
    <password>${password}</password>
    <type>1:n</type>
    <msgheader>${msgheader}</msgheader>
  </header>
  <body>
    <msg><![CDATA[${req.body}]]></msg>
    <no>${req.to.replace(/^\+/, "")}</no>
  </body>
</mainbody>`;

    const res = await fetch("https://api.netgsm.com.tr/sms/send/xml", {
      method: "POST",
      headers: { "Content-Type": "application/xml; charset=UTF-8" },
      body: xmlBody
    });
    const text = (await res.text()).trim();
    if (text.startsWith("00")) {
      return {
        provider: "netgsm",
        messageId: text.split(" ")[1] || text,
        status: "sent"
      };
    }
    return {
      provider: "netgsm",
      messageId: text,
      status: "failed",
      error: `Netgsm error response: ${text}`
    };
  }
}

class MockWhatsAppProvider implements WhatsAppProvider {
  readonly name = "mock";
  async sendTemplate(req: WhatsAppSendRequest): Promise<SmsSendResult> {
    return {
      provider: "mock",
      messageId: `mock-wa-${crypto.randomBytes(6).toString("hex")}`,
      status: "sent"
    };
  }
}

class CloudApiWhatsAppProvider implements WhatsAppProvider {
  readonly name = "cloud-api";
  async sendTemplate(req: WhatsAppSendRequest): Promise<SmsSendResult> {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId) {
      throw new Error("Configuration error: WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required for cloud-api");
    }

    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: req.to.replace(/^\+/, ""),
        type: "template",
        template: {
          name: req.templateName,
          language: { code: req.locale === "uz" ? "uz" : req.locale === "ar" ? "ar" : req.locale === "en" ? "en" : "tr" },
          components: [
            {
              type: "body",
              parameters: req.parameters.map((text) => ({ type: "text", text }))
            }
          ]
        }
      })
    });

    const data: any = await res.json();
    if (res.ok && data?.messages?.[0]?.id) {
      return {
        provider: "cloud-api",
        messageId: String(data.messages[0].id),
        status: "sent"
      };
    }
    return {
      provider: "cloud-api",
      messageId: "",
      status: "failed",
      error: data?.error?.message || "WhatsApp Cloud API error"
    };
  }
}

export function getSmsProvider(): SmsProvider {
  const name = (process.env.SMS_PROVIDER || "mock").toLowerCase();
  if (name === "netgsm") return new NetgsmSmsProvider();
  return new MockSmsProvider();
}

export function getWhatsAppProvider(): WhatsAppProvider {
  const name = (process.env.WHATSAPP_PROVIDER || "mock").toLowerCase();
  if (name === "cloud-api") return new CloudApiWhatsAppProvider();
  return new MockWhatsAppProvider();
}

export function isWhatsAppEnabled(): boolean {
  return process.env.WHATSAPP_ENABLED === "true";
}

/**
 * Buyurtma uchun 1-, 2- yoki 3-bosqich xabarlarini outbox'ga (`kurban_message_logs`) qo'shadi.
 * - Bitta buyurtmada bir nechta hisse bo'lsa, bitta xabar yuboriladi (`dedupe_key = order:{id}:{stage}:{channel}`).
 */
export async function enqueueKurbanOrderStageMessages(params: {
  orderId: number;
  stage: KurbanMessageStage;
  originBaseUrl?: string;
  receiptPdfAttachmentBase64?: string | null;
}) {
  await ensureSchema();
  const orderRes = await dbQuery(`SELECT * FROM kurban_orders WHERE id = $1 LIMIT 1`, [params.orderId]);
  const order = orderRes.rows[0];
  if (!order) return { queued: 0 };

  const sharesRes = await dbQuery<{ id: number; tracking_token: string; status: string }>(
    `SELECT id, tracking_token, status FROM kurban_shares WHERE order_id = $1 ORDER BY seq_in_order ASC, id ASC`,
    [order.id]
  );
  if (sharesRes.rowCount === 0) return { queued: 0 };

  // 3-bosqich qoidasi: "Hisselar har xil hayvonda bo'lsa, oxirgi video tayyor bo'lganda yuboriladi."
  if (params.stage === "video_published") {
    const allReady = sharesRes.rows.every((s) => s.status === "video_ready" || s.status === "notified");
    if (!allReady) {
      return { queued: 0, waitingForRemainingAnimals: true };
    }
  }

  const primaryShare = sharesRes.rows[0]!;
  const locale = (order.locale || "tr") as Locale;
  const baseUrl = (params.originBaseUrl || "https://ezanvakfi.org").replace(/\/+$/, "");
  const trackingUrl = `${baseUrl}/${locale}/kurban/takip/${primaryShare.tracking_token}`;

  const smsBuilt = buildKurbanSmsText({
    stage: params.stage,
    locale,
    orderNo: order.order_no,
    shareCount: Number(order.total_shares),
    trackingUrl
  });

  const phoneValid = isValidInternationalPhone(order.donor_phone);
  const normalizedPhone = phoneValid ? normalizePhoneE164(order.donor_phone) : String(order.donor_phone || "invalid");
  const initialPhoneStatus = phoneValid ? "pending" : "invalid_phone";

  let queuedCount = 0;

  // 1) SMS
  const smsDedupe = `order:${order.id}:${params.stage}:sms`;
  const smsIns = await dbQuery(
    `INSERT INTO kurban_message_logs (
       order_id, share_id, event_stage, channel, recipient, locale, template_name,
       body, encoding, char_length, provider, status, dedupe_key
     ) VALUES ($1, $2, $3, 'sms', $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    [
      order.id,
      primaryShare.id,
      params.stage,
      normalizedPhone,
      locale,
      smsBuilt.templateName,
      smsBuilt.body,
      smsBuilt.encoding,
      smsBuilt.charLength,
      getSmsProvider().name,
      initialPhoneStatus,
      smsDedupe
    ]
  );
  if (smsIns.rowCount > 0) queuedCount++;

  // 2) WhatsApp (agar WHATSAPP_ENABLED=true bo'lsa)
  if (isWhatsAppEnabled()) {
    const waDedupe = `order:${order.id}:${params.stage}:whatsapp`;
    const waIns = await dbQuery(
      `INSERT INTO kurban_message_logs (
         order_id, share_id, event_stage, channel, recipient, locale, template_name,
         body, encoding, char_length, provider, status, dedupe_key
       ) VALUES ($1, $2, $3, 'whatsapp', $4, $5, $6, $7, 'UTF-8', $8, $9, $10, $11)
       ON CONFLICT (dedupe_key) DO NOTHING
       RETURNING id`,
      [
        order.id,
        primaryShare.id,
        params.stage,
        normalizedPhone,
        locale,
        smsBuilt.templateName,
        smsBuilt.body,
        smsBuilt.body.length,
        getWhatsAppProvider().name,
        initialPhoneStatus,
        waDedupe
      ]
    );
    if (waIns.rowCount > 0) queuedCount++;
  }

  // 3) E-pochta (1-bosqich makbuz PDF bilan va 3-bosqich video havolasi bilan; 2-bosqichda e-pochta yo'q)
  if ((params.stage === "payment_confirmed" || params.stage === "video_published") && order.donor_email) {
    const emailDedupe = `order:${order.id}:${params.stage}:email`;
    const emailIns = await dbQuery(
      `INSERT INTO kurban_message_logs (
         order_id, share_id, event_stage, channel, recipient, locale, template_name,
         body, encoding, char_length, provider, status, dedupe_key
       ) VALUES ($1, $2, $3, 'email', $4, $5, $6, $7, 'UTF-8', $8, 'outbox-smtp', 'pending', $9)
       ON CONFLICT (dedupe_key) DO NOTHING
       RETURNING id`,
      [
        order.id,
        primaryShare.id,
        params.stage,
        order.donor_email,
        locale,
        smsBuilt.templateName,
        smsBuilt.body,
        smsBuilt.body.length,
        emailDedupe
      ]
    );

    if (emailIns.rowCount > 0) {
      queuedCount++;
      const attachments = params.receiptPdfAttachmentBase64
        ? [{ filename: `${order.order_no}-makbuz.pdf`, contentBase64: params.receiptPdfAttachmentBase64 }]
        : [];
      await dbQuery(
        `INSERT INTO outbox_messages (channel, recipient, subject, body, attachments, status)
         VALUES ('email', $1, $2, $3, $4::jsonb, 'pending')`,
        [
          order.donor_email,
          params.stage === "payment_confirmed"
            ? `Ezan Vakfı – Kurban Vekalet ve Makbuz (${order.order_no})`
            : `Ezan Vakfı – Kurban Kesim Videonuz Hazır (${order.order_no})`,
          smsBuilt.body,
          JSON.stringify(attachments)
        ]
      );
    }
  }

  // Yuborishni darhol ishga tushiramiz (rate-limited outbox dispatcher)
  await dispatchPendingKurbanMessages(25);

  return { queued: queuedCount };
}

/**
 * Outbox dispatcher (provayder tezlik limiti bilan).
 */
export async function dispatchPendingKurbanMessages(maxBatchSize = 30) {
  await ensureSchema();
  const limit = Math.min(100, Math.max(1, maxBatchSize));
  const res = await dbQuery(
    `SELECT *
     FROM kurban_message_logs
     WHERE status = 'pending'
       AND next_retry_at <= NOW()
       AND attempts < 5
     ORDER BY id ASC
     LIMIT $1`,
    [limit]
  );

  const smsProvider = getSmsProvider();
  const waProvider = getWhatsAppProvider();
  let sentCount = 0;

  for (const row of res.rows) {
    try {
      if (row.channel === "sms") {
        const result = await smsProvider.sendSms({
          to: row.recipient,
          body: row.body,
          encoding: row.encoding as any,
          senderHeader: SMS_SENDER_HEADER
        });
        if (result.status === "sent") {
          await dbQuery(
            `UPDATE kurban_message_logs
             SET status = 'sent', provider_message_id = $2, attempts = attempts + 1, sent_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [row.id, result.messageId]
          );
          sentCount++;
        } else {
          throw new Error(result.error || "SMS send failed");
        }
      } else if (row.channel === "whatsapp") {
        const result = await waProvider.sendTemplate({
          to: row.recipient,
          templateName: (row.template_name || "kurban_vekalet_alindi") as KurbanTemplateName,
          locale: (row.locale || "tr") as Locale,
          parameters: [row.body],
          renderedText: row.body
        });
        if (result.status === "sent") {
          await dbQuery(
            `UPDATE kurban_message_logs
             SET status = 'sent', provider_message_id = $2, attempts = attempts + 1, sent_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [row.id, result.messageId]
          );
          sentCount++;
        } else {
          throw new Error(result.error || "WhatsApp send failed");
        }
      } else if (row.channel === "email") {
        await dbQuery(
          `UPDATE kurban_message_logs
           SET status = 'sent', provider_message_id = $2, attempts = attempts + 1, sent_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [row.id, `email-outbox-${row.id}`]
        );
        sentCount++;
      }

      if (row.event_stage === "video_published" && row.order_id) {
        await dbQuery(
          `UPDATE kurban_shares
           SET status = 'notified', updated_at = NOW()
           WHERE order_id = $1 AND status = 'video_ready'`,
          [row.order_id]
        );
        await dbQuery(`UPDATE kurban_orders SET notify_video_sent_at = NOW(), updated_at = NOW() WHERE id = $1`, [row.order_id]);
      } else if (row.event_stage === "animal_slaughtered" && row.order_id) {
        await dbQuery(`UPDATE kurban_orders SET notify_slaughter_sent_at = NOW(), updated_at = NOW() WHERE id = $1`, [row.order_id]);
      } else if (row.event_stage === "payment_confirmed" && row.order_id) {
        await dbQuery(`UPDATE kurban_orders SET notify_vekalet_sent_at = NOW(), updated_at = NOW() WHERE id = $1`, [row.order_id]);
      }
    } catch (err: any) {
      await dbQuery(
        `UPDATE kurban_message_logs
         SET attempts = attempts + 1,
             status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END,
             last_error = $2,
             next_retry_at = NOW() + INTERVAL '2 minutes',
             updated_at = NOW()
         WHERE id = $1`,
        [row.id, err?.message || "Send error"]
      );
    }
  }

  return { processed: res.rowCount, sent: sentCount };
}

/**
 * 5-qadam: Delivery Report (DLR) webhook qabul qilish va imzosini tekshirish.
 */
export async function processMessagingDlrWebhook(params: {
  rawBody: string;
  signatureHeader: string | null;
}) {
  await ensureSchema();
  const secret = requireEnvSecret("PAYMENT_WEBHOOK_SECRET", 32);
  if (!params.signatureHeader) {
    const err: any = new Error("Missing X-DLR-Signature header");
    err.statusCode = 401;
    throw err;
  }

  const expected = crypto.createHmac("sha256", secret).update(params.rawBody).digest("hex");
  let valid = false;
  try {
    valid = crypto.timingSafeEqual(Buffer.from(params.signatureHeader), Buffer.from(expected));
  } catch {
    valid = false;
  }
  if (!valid) {
    const err: any = new Error("Invalid DLR webhook signature");
    err.statusCode = 401;
    throw err;
  }

  const payload = JSON.parse(params.rawBody);
  const providerMessageId = String(payload.messageId || payload.providerMessageId || "");
  const dlrStatus = payload.status === "delivered" ? "delivered" : "failed";

  const res = await dbQuery(
    `UPDATE kurban_message_logs
     SET status = $2::varchar,
         delivered_at = CASE WHEN $2::varchar = 'delivered' THEN NOW() ELSE delivered_at END,
         last_error = $3,
         updated_at = NOW()
     WHERE provider_message_id = $1
     RETURNING id, order_id, status`,
    [providerMessageId, dlrStatus, payload.error || null]
  );

  return { updated: res.rowCount, status: dlrStatus };
}

/**
 * Admin: Xabarni qayta yuborish ("Qayta yuborish" tugmasi).
 */
export async function resendKurbanMessageLog(logId: number) {
  await ensureSchema();
  await dbQuery(
    `UPDATE kurban_message_logs
     SET status = 'pending',
         attempts = 0,
         next_retry_at = NOW(),
         last_error = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [logId]
  );
  return dispatchPendingKurbanMessages(5);
}

/**
 * 9-qadam: Outbox'da 10 daqiqadan uzoq turgan xabar bo'lsa, koordinatorga ogohlantirish.
 */
export async function checkStuckOutboxMessages() {
  await ensureSchema();
  const stuckRes = await dbQuery<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM kurban_message_logs
     WHERE status = 'pending'
       AND created_at < NOW() - INTERVAL '10 minutes'`
  );
  const stuckCount = Number(stuckRes.rows[0]?.count || 0);
  if (stuckCount > 0) {
    await dbQuery(
      `INSERT INTO outbox_messages (channel, recipient, subject, body, status)
       VALUES ('coordinator_alert', 'coordinator', 'Outbox Kechikish Ogohlantirishi', $1, 'pending')`,
      [`DIQQAT: Outbox'da ${stuckCount} ta qurbonlik xabari 10 daqiqadan ortiq kutmoqda!`]
    );
  }
  return { stuckCount };
}
