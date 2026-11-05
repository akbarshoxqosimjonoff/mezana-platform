import fs from "node:fs";
import { Bot, InlineKeyboard, Keyboard } from "grammy";

function readBotEnvKey(key: string, fallback = ""): string {
  if (process.env[key]) return process.env[key]!;
  const paths = [
    "/srv/data/apps/mezana-platform/.env.platform.local",
    "/srv/data/apps/mezana-platform/apps/telegram-bot/.env",
  ];
  for (const p of paths) {
    try {
      const raw = fs.readFileSync(p, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const k = trimmed.slice(0, eq).trim();
        let v = trimmed.slice(eq + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (k === key && v) return v;
      }
    } catch {}
  }
  return fallback;
}

const VAQF_BFF_BASE = process.env.VAQF_BFF_BASE_URL || "http://127.0.0.1:3000";
const VAQF_PUBLIC_WEB_URL =
  readBotEnvKey("VAQF_PUBLIC_WEB_URL") || "https://moliya.mezana.org/vaqf/";
const VAQF_BOT_SECRET = readBotEnvKey("VAQF_BOT_SECRET", "vaqf_internal_bot_secret_2026");

interface VaqfUserSessionState {
  mode:
    | "awaiting_search_query"
    | "awaiting_fault_asset_code"
    | "awaiting_fault_description"
    | "awaiting_fault_photo"
    | "awaiting_reject_reason";
  assetId?: number;
  inventoryNo?: string;
  assetName?: string;
  faultDescription?: string;
  rejectDocId?: number;
  rejectOutboxId?: number;
  originalChatId?: number;
  originalMessageId?: number;
  originalMessageHtml?: string;
}

const vaqfStateByTelegramId = new Map<string, VaqfUserSessionState>();
const vaqfAccessCache = new Map<string, { hasAccess: boolean; isDirector: boolean; canEdit: boolean; expiresAt: number }>();

export async function callVaqfBff(
  telegramId: string,
  path: string,
  options: { method?: string; body?: any } = {}
): Promise<{ ok: boolean; status: number; data: any }> {
  const method = options.method || "GET";
  const headers: Record<string, string> = {
    "X-Vaqf-Bot-Secret": VAQF_BOT_SECRET,
    "X-Telegram-Id": String(telegramId),
  };
  let bodyStr: string | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    bodyStr = JSON.stringify(options.body);
  }
  try {
    const resp = await fetch(`${VAQF_BFF_BASE}${path}`, {
      method,
      headers,
      body: bodyStr,
    });
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, data };
  } catch (err: any) {
    return {
      ok: false,
      status: 500,
      data: { error: err?.message || "Vaqf BFF bilan ulanishda xato" },
    };
  }
}

export async function checkUserVaqfAccess(telegramId: string, forceRefresh = false): Promise<{
  hasAccess: boolean;
  isDirector: boolean;
  canEdit: boolean;
}> {
  const key = String(telegramId);
  const cached = vaqfAccessCache.get(key);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached;
  }
  const res = await callVaqfBff(key, "/vaqf-api/me");
  if (!res.ok || !res.data?.vaqfAccess) {
    const neg = { hasAccess: false, isDirector: false, canEdit: false, expiresAt: Date.now() + 30_000 };
    vaqfAccessCache.set(key, neg);
    return neg;
  }
  const va = res.data.vaqfAccess;
  const pos = {
    hasAccess: Boolean(va.canAccess || va.canView || va.canCount),
    isDirector: Boolean(va.isDirector || va.canApprove),
    canEdit: Boolean(va.canEdit),
    expiresAt: Date.now() + 60_000,
  };
  vaqfAccessCache.set(key, pos);
  return pos;
}

function escapeHtml(str: any): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildVaqfSubmenuInlineKeyboard(access: { isDirector: boolean; canEdit: boolean }): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text("📦 Mening buyumlarim", "vaqf:menu:my_assets")
    .text("⚠️ Nosozlik xabar qilish", "vaqf:menu:report_fault")
    .row();

  if (access.isDirector) {
    kb.text("✅ Tasdiqlar", "vaqf:menu:approvals");
  }
  kb.text("🔍 Buyum qidirish", "vaqf:menu:search").row();
  kb.webApp("📷 QR skanerlash (Mini App)", `${VAQF_PUBLIC_WEB_URL}?tg_miniapp=1`);
  return kb;
}

export async function sendVaqfMainMenu(bot: Bot, chatId: number, telegramId: string) {
  const access = await checkUserVaqfAccess(telegramId, true);
  if (!access.hasAccess) {
    await bot.api.sendMessage(
      chatId,
      "🔒 Sizning hisobingizda hozircha <b>Vaqf</b> bo'limiga kirish huquqi yo'q.",
      { parse_mode: "HTML" }
    );
    return;
  }

  const text =
    `🏛 <b>Ezan Vakfı — Mulk va Inventar Boshqaruvi</b>\n\n` +
    `Quyidagi bo'limlardan birini tanlang:\n` +
    `• <b>📦 Mening buyumlarim</b> — zimmangizdagi buyumlar va qabul qilishni kutayotgan dalolatnomalar\n` +
    `• <b>⚠️ Nosozlik xabar qilish</b> — buyumdagi nosozlik haqida rasm va izoh yuborish\n` +
    (access.isDirector
      ? `• <b>✅ Tasdiqlar</b> — Direktor tasdig'ini kutayotgan hisobdan chiqarish va ko'chirish hujjatlari\n`
      : "") +
    `• <b>🔍 Buyum qidirish</b> — inventar raqami yoki nomi bo'yicha qidirish\n` +
    `• <b>📷 QR skanerlash</b> — telefon kamerasi orqali QR yorliqni skanerlash`;

  await bot.api.sendMessage(chatId, text, {
    parse_mode: "HTML",
    reply_markup: buildVaqfSubmenuInlineKeyboard(access),
  });
}

async function sendAssetCardToChat(bot: Bot, chatId: number, telegramId: string, codeOrId: string, byCode = true) {
  const endpoint = byCode
    ? `/vaqf-api/assets/by-code/${encodeURIComponent(codeOrId)}`
    : `/vaqf-api/assets/${encodeURIComponent(codeOrId)}`;
  const res = await callVaqfBff(telegramId, endpoint);
  if (!res.ok || !res.data?.asset) {
    await bot.api.sendMessage(
      chatId,
      `⚠️ <b>${escapeHtml(codeOrId)}</b> bo'yicha mulk kartochkasi topilmadi.`,
      { parse_mode: "HTML" }
    );
    return;
  }

  const a = res.data.asset;
  const statusMap: Record<string, string> = {
    in_use: "🟢 Foydalanishda",
    in_storage: "📦 Omborda",
    under_repair: "🛠 Ta'mirda",
    missing: "🔴 Topilmadi",
    written_off: "⚫ Hisobdan chiqarilgan",
  };
  const condMap: Record<string, string> = {
    new: "Yangi",
    good: "Yaxshi",
    fair: "O'rtacha",
    poor: "Yomon / Nosoz",
  };

  const caption =
    `🏛 <b>${escapeHtml(a.name)}</b>\n` +
    `🏷 Inventar №: <code>${escapeHtml(a.inventory_no)}</code>\n` +
    `📂 Kategoriya: <b>${escapeHtml(a.category_name || "—")}</b>\n` +
    `📍 Joylashuv: <b>${escapeHtml(a.location_name || "Belgilanmagan")}</b> (${escapeHtml(a.institution_name || "Mezana")})\n` +
    `👤 Javobgar: <b>${escapeHtml(a.responsible_name || "Biriktirilmagan")}</b>\n` +
    `📊 Miqdor: <b>${a.quantity} ${escapeHtml(a.unit || "dona")}</b>\n` +
    `📌 Holati: <b>${statusMap[a.status] || a.status}</b> (${condMap[a.condition] || a.condition})\n` +
    (a.brand || a.model ? `🔧 rusumi: ${escapeHtml([a.brand, a.model].filter(Boolean).join(" "))}\n` : "") +
    (a.warranty_until_str ? `🛡 Kafolat muddati: <b>${escapeHtml(a.warranty_until_str)}</b>\n` : "");

  const kb = new InlineKeyboard()
    .text("⚠️ Nosozlik xabar qilish", `vaqf:fault_start:${a.id}`)
    .row()
    .text("⬅️ Vaqf menyusi", "vaqf:menu:home");

  await bot.api.sendMessage(chatId, caption, {
    parse_mode: "HTML",
    reply_markup: kb,
  });
}

async function downloadTelegramPhotoAsDataUrl(bot: Bot, fileId: string): Promise<string | null> {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return null;
    const file = await bot.api.getFile(fileId);
    if (!file.file_path) return null;
    const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export function registerVaqfBotFlow(bot: Bot) {
  // Deep link `/start a_<inventoryNo>` or `/vaqf` command
  bot.command("vaqf", async (ctx) => {
    if (!ctx.from || !ctx.chat) return;
    vaqfStateByTelegramId.delete(String(ctx.from.id));
    await sendVaqfMainMenu(bot, ctx.chat.id, String(ctx.from.id));
  });

  bot.hears(/^🏛\s*Vaqf$/i, async (ctx) => {
    if (!ctx.from || !ctx.chat) return;
    vaqfStateByTelegramId.delete(String(ctx.from.id));
    await sendVaqfMainMenu(bot, ctx.chat.id, String(ctx.from.id));
  });

  // Intercept `/start a_<inventoryNo>` QR scan deep links before general `/start`
  bot.use(async (ctx, next) => {
    if (ctx.from && ctx.chat && ctx.message?.text) {
      const m = ctx.message.text.trim().match(/^\/start\s+a_([A-Za-z0-9_-]+)$/i);
      if (m) {
        const invNo = m[1]!.toUpperCase();
        await sendAssetCardToChat(bot, ctx.chat.id, String(ctx.from.id), invNo, true);
        return;
      }
    }
    await next();
  });

  // Callback queries starting with `vaqf:`
  bot.callbackQuery(/^vaqf:/, async (ctx) => {
    if (!ctx.from) return;
    const telegramId = String(ctx.from.id);
    const chatId = ctx.chat?.id || ctx.from.id;
    const data = ctx.callbackQuery.data;

    try {
      if (data === "vaqf:menu:home") {
        vaqfStateByTelegramId.delete(telegramId);
        await ctx.answerCallbackQuery();
        await sendVaqfMainMenu(bot, chatId, telegramId);
        return;
      }

      // 1. 📦 Mening buyumlarim
      if (data === "vaqf:menu:my_assets") {
        await ctx.answerCallbackQuery({ text: "Yuklanmoqda..." });
        const [myAssetsRes, pendingRes] = await Promise.all([
          callVaqfBff(telegramId, "/vaqf-api/my/assets"),
          callVaqfBff(telegramId, "/vaqf-api/my/pending"),
        ]);

        const assets = myAssetsRes.data?.items || [];
        const pendingDocs = pendingRes.data?.items || [];

        if (pendingDocs.length > 0) {
          for (const doc of pendingDocs) {
            const itemsList = (doc.items || [])
              .map((it: any) => `• <b>${escapeHtml(it.asset_name)}</b> (<code>${escapeHtml(it.inventory_no)}</code>) — ${it.qty} ${it.unit || "dona"}`)
              .join("\n");
            const msgHtml =
              `⏳ <b>Qabul qilishingiz kutilayotgan zimmat dalolatnomasi: ${escapeHtml(doc.doc_no)}</b>\n\n` +
              `${itemsList}\n\n` +
              `<i>Buyumlarni qabul qilib olganingizni tasdiqlash uchun quyidagi tugmani bosing:</i>`;
            const kb = new InlineKeyboard()
              .text("✅ Qabul qildim", `vaqf:cfm:${doc.id}:0`)
              .text("🔎 Ro'yxat", `vaqf:doc:${doc.id}`);
            await bot.api.sendMessage(chatId, msgHtml, { parse_mode: "HTML", reply_markup: kb });
          }
        }

        if (assets.length === 0) {
          await bot.api.sendMessage(
            chatId,
            pendingDocs.length > 0
              ? "📦 Yuqoridagi dalolatnomani tasdiqlaganingizdan so'ng buyumlar zimmangizga o'tadi."
              : "📦 Hozirda sizning zimmangizda faol buyumlar yo'q.",
            {
              parse_mode: "HTML",
              reply_markup: new InlineKeyboard().text("⬅️ Vaqf menyusi", "vaqf:menu:home"),
            }
          );
          return;
        }

        const lines = assets.slice(0, 25).map((a: any, idx: number) => {
          return `${idx + 1}. <b>${escapeHtml(a.asset_name)}</b> (<code>${escapeHtml(a.inventory_no)}</code>) — ${a.qty} ${escapeHtml(a.unit || "dona")} | 📍 ${escapeHtml(a.location_name || "—")}`;
        });

        const kb = new InlineKeyboard();
        for (const a of assets.slice(0, 6)) {
          kb.text(`⚠️ Nosozlik: ${a.inventory_no}`, `vaqf:fault_start:${a.asset_id}`).row();
        }
        kb.text("⬅️ Vaqf menyusi", "vaqf:menu:home");

        await bot.api.sendMessage(
          chatId,
          `📦 <b>Sizning zimmangizdagi buyumlar (${assets.length} ta):</b>\n\n${lines.join("\n")}`,
          { parse_mode: "HTML", reply_markup: kb }
        );
        return;
      }

      // 2. ⚠️ Nosozlik xabar qilish
      if (data === "vaqf:menu:report_fault") {
        await ctx.answerCallbackQuery();
        const myAssetsRes = await callVaqfBff(telegramId, "/vaqf-api/my/assets");
        const myAssets = myAssetsRes.data?.items || [];

        vaqfStateByTelegramId.set(telegramId, { mode: "awaiting_fault_asset_code" });

        const kb = new InlineKeyboard();
        for (const a of myAssets.slice(0, 8)) {
          kb.text(`📦 ${a.asset_name} (${a.inventory_no})`, `vaqf:fault_start:${a.asset_id}`).row();
        }
        kb.webApp("📷 QR skanerlash", `${VAQF_PUBLIC_WEB_URL}?tg_miniapp=1`).row();
        kb.text("❌ Bekor qilish", "vaqf:menu:home");

        await bot.api.sendMessage(
          chatId,
          `⚠️ <b>Nosozlik haqida xabar berish</b>\n\n` +
            `Buyumning <b>inventar raqamini</b> yozib yuboring (masalan: <code>EV-MZN-000001</code>) yoki quyidagi ro'yxatdan tanlang:`,
          { parse_mode: "HTML", reply_markup: kb }
        );
        return;
      }

      const faultStartMatch = data.match(/^vaqf:fault_start:(\d+)$/);
      if (faultStartMatch) {
        await ctx.answerCallbackQuery();
        const assetId = Number(faultStartMatch[1]);
        const aRes = await callVaqfBff(telegramId, `/vaqf-api/assets/${assetId}`);
        const asset = aRes.data?.asset;
        if (!asset) {
          await bot.api.sendMessage(chatId, "⚠️ Buyum topilmadi.");
          return;
        }
        vaqfStateByTelegramId.set(telegramId, {
          mode: "awaiting_fault_description",
          assetId: asset.id,
          inventoryNo: asset.inventory_no,
          assetName: asset.name,
        });
        await bot.api.sendMessage(
          chatId,
          `🛠 Buyum: <b>${escapeHtml(asset.name)}</b> (<code>${escapeHtml(asset.inventory_no)}</code>)\n\n` +
            `✍️ Iltimos, <b>nosozlik tavsifini (nima bo'lganini)</b> yozib yuboring:`,
          {
            parse_mode: "HTML",
            reply_markup: new InlineKeyboard().text("❌ Bekor qilish", "vaqf:menu:home"),
          }
        );
        return;
      }

      if (data === "vaqf:fault_submit_no_photo") {
        const st = vaqfStateByTelegramId.get(telegramId);
        if (!st || !st.assetId || !st.faultDescription) {
          await ctx.answerCallbackQuery({ text: "Sessiya tugagan", show_alert: true });
          return;
        }
        await ctx.answerCallbackQuery({ text: "Yuborilmoqda..." });
        const fRes = await callVaqfBff(telegramId, `/vaqf-api/assets/${st.assetId}/fault`, {
          method: "POST",
          body: { description: st.faultDescription },
        });
        vaqfStateByTelegramId.delete(telegramId);
        if (!fRes.ok) {
          await bot.api.sendMessage(chatId, `❌ Xatolik: ${escapeHtml(fRes.data?.error || "Saqlab bo'lmadi")}`, {
            parse_mode: "HTML",
          });
          return;
        }
        await bot.api.sendMessage(
          chatId,
          `✅ <b>Nosozlik xabari qabul qilindi!</b>\n\n` +
            `📦 Buyum: <b>${escapeHtml(st.assetName)} (${escapeHtml(st.inventoryNo)})</b>\n` +
            `📝 Tavsif: ${escapeHtml(st.faultDescription)}\n` +
            `Inventar mas'uliga xabarnoma yuborildi.`,
          {
            parse_mode: "HTML",
            reply_markup: new InlineKeyboard().text("⬅️ Vaqf menyusi", "vaqf:menu:home"),
          }
        );
        return;
      }

      // 3. ✅ Tasdiqlar (Direktor)
      if (data === "vaqf:menu:approvals") {
        await ctx.answerCallbackQuery({ text: "Yuklanmoqda..." });
        const appRes = await callVaqfBff(telegramId, "/vaqf-api/approvals");
        if (!appRes.ok) {
          await bot.api.sendMessage(chatId, `❌ ${escapeHtml(appRes.data?.error || "Ruxsat yo'q")}`, {
            parse_mode: "HTML",
          });
          return;
        }
        const docs = appRes.data?.items || [];
        if (docs.length === 0) {
          await bot.api.sendMessage(
            chatId,
            "✅ Hozirda tasdiqlash kutilayotgan hujjatlar yo'q.",
            {
              parse_mode: "HTML",
              reply_markup: new InlineKeyboard().text("⬅️ Vaqf menyusi", "vaqf:menu:home"),
            }
          );
          return;
        }

        for (const doc of docs.slice(0, 10)) {
          const itemsText = (doc.items || [])
            .map((it: any) => `• ${escapeHtml(it.asset_name)} (<code>${escapeHtml(it.inventory_no)}</code>)`)
            .join("\n");
          const html =
            `📋 <b>Tasdiq kutilmoqda: ${escapeHtml(doc.doc_no)}</b>\n` +
            `📌 Amal turi: <b>${escapeHtml(doc.type)}</b>\n` +
            `👤 Kiritdi: <b>${escapeHtml(doc.created_by_name || "Mas'ul")}</b>\n` +
            (doc.reason ? `📝 Sabab: <b>${escapeHtml(doc.reason)}</b>\n` : "") +
            `💰 Qiymati: <b>₺${Number(doc.total_value_try || 0).toLocaleString("tr-TR")}</b>\n\n` +
            `📦 <b>Buyumlar:</b>\n${itemsText}`;
          const kb = new InlineKeyboard()
            .text("✅ Tasdiqlash", `vaqf:app:${doc.id}:0`)
            .text("❌ Rad etish", `vaqf:rej:${doc.id}:0`)
            .row()
            .text("🔎 Batafsil", `vaqf:doc:${doc.id}`);
          await bot.api.sendMessage(chatId, html, { parse_mode: "HTML", reply_markup: kb });
        }
        return;
      }

      // 4. 🔍 Buyum qidirish
      if (data === "vaqf:menu:search") {
        await ctx.answerCallbackQuery();
        vaqfStateByTelegramId.set(telegramId, { mode: "awaiting_search_query" });
        await bot.api.sendMessage(
          chatId,
          `🔍 <b>Buyum qidirish</b>\n\n` +
            `Inventar raqami (masalan: <code>EV-MZN-000001</code>) yoki buyum nomini yozib yuboring:`,
          {
            parse_mode: "HTML",
            reply_markup: new InlineKeyboard().text("❌ Bekor qilish", "vaqf:menu:home"),
          }
        );
        return;
      }

      const viewAssetMatch = data.match(/^vaqf:asset:(\d+)$/);
      if (viewAssetMatch) {
        await ctx.answerCallbackQuery();
        await sendAssetCardToChat(bot, chatId, telegramId, viewAssetMatch[1]!, false);
        return;
      }

      // 5. INLINE ACTION BUTTONS ON OUTBOX NOTIFICATIONS (IDEMPOTENT)
      // Approve document: `vaqf:app:<docId>:<outboxId>`
      const appMatch = data.match(/^vaqf:app:(\d+)(?::(\d+))?$/);
      if (appMatch) {
        const docId = Number(appMatch[1]);
        const outboxId = appMatch[2] ? Number(appMatch[2]) : null;
        const res = await callVaqfBff(telegramId, "/vaqf-api/bot/callback", {
          method: "POST",
          body: {
            telegramId,
            action: "approve_doc",
            targetId: docId,
            outboxId: outboxId || null,
          },
        });
        if (!res.ok) {
          await ctx.answerCallbackQuery({ text: res.data?.error || "Xatolik", show_alert: true });
          return;
        }
        await ctx.answerCallbackQuery({ text: res.data.statusLine || "✅ Tasdiqlandi" });
        const origText = ctx.callbackQuery.message?.text || "";
        try {
          await ctx.editMessageText(`${escapeHtml(origText)}\n\n<b>${escapeHtml(res.data.statusLine)}</b>`, {
            parse_mode: "HTML",
          });
        } catch {}
        return;
      }

      // Reject document prompt: `vaqf:rej:<docId>:<outboxId>`
      const rejMatch = data.match(/^vaqf:rej:(\d+)(?::(\d+))?$/);
      if (rejMatch) {
        const docId = Number(rejMatch[1]);
        const outboxId = rejMatch[2] ? Number(rejMatch[2]) : undefined;
        await ctx.answerCallbackQuery();
        vaqfStateByTelegramId.set(telegramId, {
          mode: "awaiting_reject_reason",
          rejectDocId: docId,
          rejectOutboxId: outboxId,
          originalChatId: chatId,
          originalMessageId: ctx.callbackQuery.message?.message_id,
          originalMessageHtml: ctx.callbackQuery.message?.text || "",
        });
        await bot.api.sendMessage(
          chatId,
          `❌ <b>Hujjatni (#${docId}) rad etish sababini yozib yuboring:</b>`,
          {
            parse_mode: "HTML",
            reply_markup: new InlineKeyboard().text("Bekor qilish", "vaqf:menu:home"),
          }
        );
        return;
      }

      // Recipient confirm assignment: `vaqf:cfm:<docId>:<outboxId>`
      const cfmMatch = data.match(/^vaqf:cfm:(\d+)(?::(\d+))?$/);
      if (cfmMatch) {
        const docId = Number(cfmMatch[1]);
        const outboxId = cfmMatch[2] ? Number(cfmMatch[2]) : null;
        const res = await callVaqfBff(telegramId, "/vaqf-api/bot/callback", {
          method: "POST",
          body: {
            telegramId,
            action: "confirm_doc",
            targetId: docId,
            outboxId: outboxId || null,
          },
        });
        if (!res.ok) {
          await ctx.answerCallbackQuery({ text: res.data?.error || "Xatolik", show_alert: true });
          return;
        }
        await ctx.answerCallbackQuery({ text: res.data.statusLine || "✅ Qabul qilindi" });
        const origText = ctx.callbackQuery.message?.text || "";
        try {
          await ctx.editMessageText(`${escapeHtml(origText)}\n\n<b>${escapeHtml(res.data.statusLine)}</b>`, {
            parse_mode: "HTML",
          });
        } catch {}
        return;
      }

      // Create repair from fault: `vaqf:rep:<faultId>:<outboxId>`
      const repMatch = data.match(/^vaqf:rep:(\d+)(?::(\d+))?$/);
      if (repMatch) {
        const faultId = Number(repMatch[1]);
        const outboxId = repMatch[2] ? Number(repMatch[2]) : null;
        const res = await callVaqfBff(telegramId, "/vaqf-api/bot/callback", {
          method: "POST",
          body: {
            telegramId,
            action: "create_repair_from_fault",
            targetId: faultId,
            outboxId: outboxId || null,
          },
        });
        if (!res.ok) {
          await ctx.answerCallbackQuery({ text: res.data?.error || "Xatolik", show_alert: true });
          return;
        }
        await ctx.answerCallbackQuery({ text: res.data.statusLine || "🛠 Ta'mirga berildi" });
        const origText = ctx.callbackQuery.message?.text || "";
        try {
          await ctx.editMessageText(`${escapeHtml(origText)}\n\n<b>${escapeHtml(res.data.statusLine)}</b>`, {
            parse_mode: "HTML",
          });
        } catch {}
        return;
      }

      // Schedule done / snooze: `vaqf:schdone:<scheduleId>:<outboxId>` / `vaqf:schsnooze:<scheduleId>:<outboxId>`
      const schDoneMatch = data.match(/^vaqf:schdone:(\d+)(?::(\d+))?$/);
      if (schDoneMatch) {
        const scheduleId = Number(schDoneMatch[1]);
        const outboxId = schDoneMatch[2] ? Number(schDoneMatch[2]) : null;
        const res = await callVaqfBff(telegramId, "/vaqf-api/bot/callback", {
          method: "POST",
          body: {
            telegramId,
            action: "schedule_done",
            targetId: scheduleId,
            outboxId: outboxId || null,
          },
        });
        if (!res.ok) {
          await ctx.answerCallbackQuery({ text: res.data?.error || "Xatolik", show_alert: true });
          return;
        }
        await ctx.answerCallbackQuery({ text: res.data.statusLine || "✔️ Bajarildi" });
        const origText = ctx.callbackQuery.message?.text || "";
        try {
          await ctx.editMessageText(`${escapeHtml(origText)}\n\n<b>${escapeHtml(res.data.statusLine)}</b>`, {
            parse_mode: "HTML",
          });
        } catch {}
        return;
      }

      const schSnoozeMatch = data.match(/^vaqf:schsnooze:(\d+)(?::(\d+))?$/);
      if (schSnoozeMatch) {
        const scheduleId = Number(schSnoozeMatch[1]);
        const outboxId = schSnoozeMatch[2] ? Number(schSnoozeMatch[2]) : null;
        const res = await callVaqfBff(telegramId, "/vaqf-api/bot/callback", {
          method: "POST",
          body: {
            telegramId,
            action: "schedule_snooze",
            targetId: scheduleId,
            outboxId: outboxId || null,
          },
        });
        if (!res.ok) {
          await ctx.answerCallbackQuery({ text: res.data?.error || "Xatolik", show_alert: true });
          return;
        }
        await ctx.answerCallbackQuery({ text: res.data.statusLine || "⏰ 3 kunga surildi" });
        const origText = ctx.callbackQuery.message?.text || "";
        try {
          await ctx.editMessageText(`${escapeHtml(origText)}\n\n<b>${escapeHtml(res.data.statusLine)}</b>`, {
            parse_mode: "HTML",
          });
        } catch {}
        return;
      }

      // View document detail: `vaqf:doc:<docId>`
      const docDetailMatch = data.match(/^vaqf:doc:(\d+)$/);
      if (docDetailMatch) {
        await ctx.answerCallbackQuery();
        const docId = Number(docDetailMatch[1]);
        const dRes = await callVaqfBff(telegramId, `/vaqf-api/documents/${docId}`);
        if (!dRes.ok) {
          await bot.api.sendMessage(chatId, `❌ ${escapeHtml(dRes.data?.error || "Hujjat topilmadi")}`, {
            parse_mode: "HTML",
          });
          return;
        }
        const doc = dRes.data;
        const itemsLines = (doc.items || []).map(
          (it: any, i: number) =>
            `${i + 1}. <b>${escapeHtml(it.asset_name)}</b> (<code>${escapeHtml(it.inventory_no)}</code>) — ${it.qty} ${escapeHtml(it.unit || "dona")}`
        );
        const text =
          `📄 <b>Hujjat: ${escapeHtml(doc.doc_no)}</b>\n` +
          `📌 Turi: <b>${escapeHtml(doc.type)}</b> | Holati: <b>${escapeHtml(doc.status)}</b>\n` +
          (doc.to_person_name ? `👤 Qabul qiluvchi: <b>${escapeHtml(doc.to_person_name)}</b>\n` : "") +
          (doc.to_location_name ? `📍 Joy: <b>${escapeHtml(doc.to_location_name)}</b>\n` : "") +
          (doc.reason ? `📝 Sabab / Izoh: ${escapeHtml(doc.reason)}\n` : "") +
          `\n📦 <b>Buyumlar (${itemsLines.length} ta):</b>\n${itemsLines.join("\n")}`;
        await bot.api.sendMessage(chatId, text, { parse_mode: "HTML" });
        return;
      }

      // View count detail: `vaqf:cnt:<countId>`
      const cntDetailMatch = data.match(/^vaqf:cnt:(\d+)$/);
      if (cntDetailMatch) {
        await ctx.answerCallbackQuery();
        const countId = Number(cntDetailMatch[1]);
        const cRes = await callVaqfBff(telegramId, `/vaqf-api/counts/${countId}`);
        if (!cRes.ok) {
          await bot.api.sendMessage(chatId, `❌ ${escapeHtml(cRes.data?.error || "Sanoq topilmadi")}`, {
            parse_mode: "HTML",
          });
          return;
        }
        const c = cRes.data;
        const s = c.summary || {};
        const kb = new InlineKeyboard().webApp(
          "📷 Skanerlashni ochish (Mini App)",
          `${VAQF_PUBLIC_WEB_URL}?tg_miniapp=1&count_id=${countId}`
        );
        await bot.api.sendMessage(
          chatId,
          `📋 <b>Inventarizatsiya: ${escapeHtml(c.code)} — ${escapeHtml(c.title)}</b>\n` +
            `📌 Holati: <b>${escapeHtml(c.status)}</b>\n` +
            `📊 Kutilgan: <b>${s.expected_cards ?? 0}</b> | Topilgan: <b>${s.present_cards ?? 0}</b>\n` +
            `⚠️ Farqlar: <b>${s.discrepancy_count ?? 0} ta</b> (Topilmadi: ${s.missing_cards ?? 0}, Boshqa joyda: ${s.moved_cards ?? 0}, Ortiqcha: ${s.extra_cards ?? 0})`,
          { parse_mode: "HTML", reply_markup: kb }
        );
        return;
      }

      // View pending finance expense: `vaqf:pexp:<id>`
      const pexpMatch = data.match(/^vaqf:pexp:(\d+)$/);
      if (pexpMatch) {
        await ctx.answerCallbackQuery();
        await bot.api.sendMessage(
          chatId,
          `📝 Moliya xaridini inventarga ro'yxatga olish uchun Web ilovadagi <b>"Ro'yxatga olinishi kerak"</b> bo'limini oching:\n${VAQF_PUBLIC_WEB_URL}`,
          { parse_mode: "HTML" }
        );
        return;
      }

      await ctx.answerCallbackQuery();
    } catch (err: any) {
      await ctx.answerCallbackQuery({ text: err?.message || "Xatolik", show_alert: true }).catch(() => {});
    }
  });

  // Middleware to handle active Vaqf session states (search query, fault description/photo, rejection reason)
  bot.use(async (ctx, next) => {
    if (!ctx.from || !ctx.chat) {
      await next();
      return;
    }
    const telegramId = String(ctx.from.id);
    const state = vaqfStateByTelegramId.get(telegramId);
    if (!state) {
      await next();
      return;
    }

    const rawText = (ctx.message?.text || "").trim();
    if (rawText.startsWith("/")) {
      vaqfStateByTelegramId.delete(telegramId);
      await next();
      return;
    }

    // 1. Search query
    if (state.mode === "awaiting_search_query" && rawText) {
      vaqfStateByTelegramId.delete(telegramId);
      const qRes = await callVaqfBff(
        telegramId,
        `/vaqf-api/assets?search=${encodeURIComponent(rawText)}&limit=8`
      );
      const items = qRes.data?.items || [];
      if (items.length === 0) {
        await ctx.reply(`🔍 <b>"${escapeHtml(rawText)}"</b> bo'yicha buyum topilmadi.`, {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text("🔍 Qayta qidirish", "vaqf:menu:search")
            .text("⬅️ Vaqf menyusi", "vaqf:menu:home"),
        });
        return;
      }
      if (items.length === 1) {
        await sendAssetCardToChat(bot, ctx.chat.id, telegramId, String(items[0].id), false);
        return;
      }
      const kb = new InlineKeyboard();
      for (const it of items) {
        kb.text(`${it.inventory_no} — ${it.name}`, `vaqf:asset:${it.id}`).row();
      }
      kb.text("⬅️ Vaqf menyusi", "vaqf:menu:home");
      await ctx.reply(
        `🔍 <b>"${escapeHtml(rawText)}" bo'yicha topilgan buyumlar (${qRes.data?.total || items.length} ta):</b>\nTanlang:`,
        { parse_mode: "HTML", reply_markup: kb }
      );
      return;
    }

    // 2. Fault report: asset code typed manually
    if (state.mode === "awaiting_fault_asset_code" && rawText) {
      const byCodeRes = await callVaqfBff(
        telegramId,
        `/vaqf-api/assets/by-code/${encodeURIComponent(rawText.toUpperCase())}`
      );
      let asset = byCodeRes.data?.asset;
      if (!asset) {
        const searchRes = await callVaqfBff(
          telegramId,
          `/vaqf-api/assets?search=${encodeURIComponent(rawText)}&limit=1`
        );
        asset = searchRes.data?.items?.[0];
      }
      if (!asset) {
        await ctx.reply(
          `⚠️ <b>"${escapeHtml(rawText)}"</b> bo'yicha buyum topilmadi. Inventar raqamini tekshirib qayta yozing:`,
          {
            parse_mode: "HTML",
            reply_markup: new InlineKeyboard().text("❌ Bekor qilish", "vaqf:menu:home"),
          }
        );
        return;
      }
      vaqfStateByTelegramId.set(telegramId, {
        mode: "awaiting_fault_description",
        assetId: asset.id,
        inventoryNo: asset.inventory_no,
        assetName: asset.name,
      });
      await ctx.reply(
        `🛠 Buyum topildi: <b>${escapeHtml(asset.name)}</b> (<code>${escapeHtml(asset.inventory_no)}</code>)\n\n` +
          `✍️ Endi <b>nosozlik tavsifini (nima bo'lganini)</b> yozib yuboring:`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().text("❌ Bekor qilish", "vaqf:menu:home"),
        }
      );
      return;
    }

    // 3. Fault report: description typed
    if (state.mode === "awaiting_fault_description" && rawText) {
      state.mode = "awaiting_fault_photo";
      state.faultDescription = rawText;
      vaqfStateByTelegramId.set(telegramId, state);
      await ctx.reply(
        `📸 Nosozlik tavsifi qabul qilindi.\n\nEndi buyumning <b>rasmini yuboring</b> yoki rasmsiz yuborish tugmasini bosing:`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text("⏭ Rasmsiz yuborish", "vaqf:fault_submit_no_photo")
            .row()
            .text("❌ Bekor qilish", "vaqf:menu:home"),
        }
      );
      return;
    }

    // 4. Fault report: photo uploaded
    if (state.mode === "awaiting_fault_photo" && ctx.message?.photo?.length) {
      const largest = ctx.message.photo[ctx.message.photo.length - 1]!;
      const dataUrl = await downloadTelegramPhotoAsDataUrl(bot, largest.file_id);
      const fRes = await callVaqfBff(telegramId, `/vaqf-api/assets/${state.assetId}/fault`, {
        method: "POST",
        body: {
          description: state.faultDescription,
          photoDataUrl: dataUrl,
        },
      });
      vaqfStateByTelegramId.delete(telegramId);
      if (!fRes.ok) {
        await ctx.reply(`❌ Xatolik: ${escapeHtml(fRes.data?.error || "Saqlab bo'lmadi")}`, {
          parse_mode: "HTML",
        });
        return;
      }
      await ctx.reply(
        `✅ <b>Nosozlik xabari va rasm qabul qilindi!</b>\n\n` +
          `📦 Buyum: <b>${escapeHtml(state.assetName)} (${escapeHtml(state.inventoryNo)})</b>\n` +
          `📝 Tavsif: ${escapeHtml(state.faultDescription)}\n` +
          `Inventar mas'uliga xabarnoma yuborildi.`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().text("⬅️ Vaqf menyusi", "vaqf:menu:home"),
        }
      );
      return;
    }

    // 5. Director rejection reason reply
    if (state.mode === "awaiting_reject_reason" && rawText && state.rejectDocId) {
      const res = await callVaqfBff(telegramId, "/vaqf-api/bot/callback", {
        method: "POST",
        body: {
          telegramId,
          action: "reject_doc",
          targetId: state.rejectDocId,
          outboxId: state.rejectOutboxId || null,
          reason: rawText,
        },
      });
      vaqfStateByTelegramId.delete(telegramId);
      if (!res.ok) {
        await ctx.reply(`❌ Xatolik: ${escapeHtml(res.data?.error || "Rad etib bo'lmadi")}`, {
          parse_mode: "HTML",
        });
        return;
      }
      if (state.originalChatId && state.originalMessageId) {
        try {
          await bot.api.editMessageText(
            state.originalChatId,
            state.originalMessageId,
            `${escapeHtml(state.originalMessageHtml || "")}\n\n<b>${escapeHtml(res.data.statusLine)}</b>`,
            { parse_mode: "HTML" }
          );
        } catch {}
      }
      await ctx.reply(`<b>${escapeHtml(res.data.statusLine)}</b>`, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text("⬅️ Vaqf menyusi", "vaqf:menu:home"),
      });
      return;
    }

    await next();
  });
}
