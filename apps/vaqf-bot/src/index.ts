import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import "dotenv/config";
import { Bot, InlineKeyboard, Keyboard } from "grammy";
import {
  readBotEnvKey,
  VAQF_PUBLIC_WEB_URL,
  VAQF_BOT_USERNAME,
  maskSecretToken,
  escapeHtml,
  callVaqfBff,
  checkUserVaqfAccess,
  formatAssetCardHtml,
} from "../../../packages/vaqf-bot-shared/index.mjs";

const token = readBotEnvKey("VAQF_TELEGRAM_BOT_TOKEN");
if (!token) {
  throw new Error("VAQF_TELEGRAM_BOT_TOKEN .env faylida topilmadi");
}

function sanitizeText(msg: any): string {
  const s = String(msg ?? "");
  return s.replace(/[0-9]{8,10}:AA[A-Za-z0-9_-]{30,}/g, (m) => `***${m.slice(-4)}`);
}

const bot = new Bot(token);

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
const userLangByTelegramId = new Map<string, "uz" | "tr">();

async function getUserLang(telegramId: string): Promise<"uz" | "tr"> {
  const cached = userLangByTelegramId.get(telegramId);
  if (cached) return cached;
  const res = await callVaqfBff(telegramId, `/vaqf-api/bot/chat-info?telegram_id=${encodeURIComponent(telegramId)}`);
  const lang = res.data?.chat?.lang === "tr" ? "tr" : "uz";
  userLangByTelegramId.set(telegramId, lang);
  return lang;
}

function buildMainReplyKeyboard(access: { isDirector: boolean; canEdit: boolean }, lang: "uz" | "tr" = "uz"): Keyboard {
  const isTr = lang === "tr";
  const kb = new Keyboard()
    .text(isTr ? "📦 Zimmetimdeki Eşyalar" : "📦 Mening buyumlarim")
    .text(isTr ? "⚠️ Arıza Bildir" : "⚠️ Nosozlik xabar qilish")
    .row();
  if (access.isDirector) {
    kb.text(isTr ? "✅ Onaylar" : "✅ Tasdiqlar").text(isTr ? "📅 Vadeler" : "📅 Muddatlar").row();
  } else {
    kb.text(isTr ? "📅 Vadeler" : "📅 Muddatlar");
  }
  kb.text(isTr ? "🔍 Eşya Ara" : "🔍 Buyum qidirish")
    .text(isTr ? "❓ Yardım" : "❓ Yordam")
    .resized();
  return kb;
}

function buildVaqfSubmenuInlineKeyboard(
  access: { isDirector: boolean; canEdit: boolean },
  lang: "uz" | "tr" = "uz"
): InlineKeyboard {
  const isTr = lang === "tr";
  const kb = new InlineKeyboard()
    .text(isTr ? "📦 Zimmetimdeki Eşyalar" : "📦 Mening buyumlarim", "vaqf:menu:my_assets")
    .text(isTr ? "⚠️ Arıza Bildir" : "⚠️ Nosozlik xabar qilish", "vaqf:menu:report_fault")
    .row();

  if (access.isDirector) {
    kb.text(isTr ? "✅ Onaylar" : "✅ Tasdiqlar", "vaqf:menu:approvals");
  }
  kb.text(isTr ? "📅 Vadeler" : "📅 Muddatlar", "vaqf:menu:schedules")
    .text(isTr ? "🔍 Eşya Ara" : "🔍 Buyum qidirish", "vaqf:menu:search")
    .row();

  kb.webApp(isTr ? "📷 QR Tara (Mini App)" : "📷 QR skanerlash (Mini App)", `${VAQF_PUBLIC_WEB_URL}?tg_miniapp=1`).row();

  if (access.isDirector) {
    kb.text(isTr ? "🇺🇿 O'zbekcha tilga o'tish" : "🇹🇷 Türkçe diline geç", isTr ? "vaqf:lang:uz" : "vaqf:lang:tr");
  }
  return kb;
}

async function sendUnlinkedGuide(chatId: number, telegramId: string) {
  const html =
    `🏛 <b>Ezan Vakfı — Vaqf Mulk va Boshqaruv Boti (@${escapeHtml(VAQF_BOT_USERNAME)})</b>\n\n` +
    `🔒 Sizning Telegram hisobingiz (ID: <code>${escapeHtml(telegramId)}</code>) hali tizimdagi foydalanuvchiga bog'lanmagan.\n\n` +
    `<b>Qanday bog'lanadi?</b>\n` +
    `1️⃣ Web tizimga kiring: ${escapeHtml(VAQF_PUBLIC_WEB_URL)}\n` +
    `2️⃣ Yuqori o'ng burchakdagi <b>"🔗 Telegram'ni bog'lash"</b> tugmasini bosing.\n` +
    `3️⃣ Hosil bo'lgan 10 daqiqalik bir martalik havolani bosing yoki kodni shu yerga <code>/start link_KOD</code> ko'rinishida yuboring.`;

  await bot.api.sendMessage(chatId, html, { parse_mode: "HTML" });
}

async function sendVaqfMainMenu(chatId: number, telegramId: string) {
  const access = await checkUserVaqfAccess(telegramId, true);
  if (!access.hasAccess) {
    await sendUnlinkedGuide(chatId, telegramId);
    return;
  }

  const lang = await getUserLang(telegramId);
  const isTr = lang === "tr";

  const text = isTr
    ? `🏛 <b>Ezan Vakfı — Vakıf Malvarlığı ve Envanter Sistemi</b>\n` +
      `👤 Kullanıcı: <b>${escapeHtml(access.user?.name || access.user?.username || "Yetkili")}</b> (${escapeHtml(access.role)})\n\n` +
      `Aşağıdaki işlemlerden birini seçin:\n` +
      `• <b>/buyumlarim</b> — Zimmetinizdeki eşyalar ve teslim onayı bekleyen tutanaklar\n` +
      `• <b>/nosozlik</b> — Eşya arızasını fotoğraf ve açıklama ile bildirme\n` +
      (access.isDirector ? `• <b>/tasdiqlar</b> — Müdür onayı bekleyen kayıttan düşme ve devir belgeleri\n` : "") +
      `• <b>/qidir</b> — Envanter numarası veya adıyla eşya arama\n` +
      `• <b>/skan</b> — Telefon kamerasıyla QR etiket tarama (Mini App)\n` +
      `• <b>/muddatlar</b> — Yaklaşan garanti, bakım ve kira vadeleri\n` +
      `• <b>/yordam</b> — Rolünüze göre kullanım kılavuzu`
    : `🏛 <b>Ezan Vakfı — Mulk va Inventar Boshqaruvi</b>\n` +
      `👤 Foydalanuvchi: <b>${escapeHtml(access.user?.name || access.user?.username || "Xodim")}</b> (${escapeHtml(access.role)})\n\n` +
      `Quyidagi buyruqlar yoki tugmalardan foydalaning:\n` +
      `• <b>/buyumlarim</b> — zimmangizdagi buyumlar va "Qabul qildim" tasdig'i\n` +
      `• <b>/nosozlik</b> — buyumdagi nosozlik haqida rasm va izoh yuborish\n` +
      (access.isDirector ? `• <b>/tasdiqlar</b> — Direktor tasdig'ini kutayotgan hujjatlar\n` : "") +
      `• <b>/qidir</b> — inventar raqami yoki nomi bo'yicha qidirish\n` +
      `• <b>/skan</b> — telefon kamerasi orqali QR yorliqni skanerlash\n` +
      `• <b>/muddatlar</b> — yaqinlashayotgan kafolat va texnik ko'rik muddatlari\n` +
      `• <b>/yordam</b> — rolingizga mos qisqa ko'rsatma`;

  await bot.api.sendMessage(chatId, text, {
    parse_mode: "HTML",
    reply_markup: buildVaqfSubmenuInlineKeyboard(access, lang),
  });
}

async function sendAssetCardToChat(chatId: number, telegramId: string, codeOrId: string, byCode = true) {
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

  const lang = await getUserLang(telegramId);
  const a = res.data.asset;
  const caption = formatAssetCardHtml(a, lang);

  const kb = new InlineKeyboard()
    .text(lang === "tr" ? "⚠️ Arıza Bildir" : "⚠️ Nosozlik xabar qilish", `vaqf:fault_start:${a.id}`)
    .row()
    .text(lang === "tr" ? "⬅️ Ana Menü" : "⬅️ Bosh menyu", "vaqf:menu:home");

  await bot.api.sendMessage(chatId, caption, {
    parse_mode: "HTML",
    reply_markup: kb,
  });
}

async function handleMyAssets(chatId: number, telegramId: string) {
  const [myAssetsRes, pendingRes] = await Promise.all([
    callVaqfBff(telegramId, "/vaqf-api/my/assets"),
    callVaqfBff(telegramId, "/vaqf-api/my/pending"),
  ]);

  if (!myAssetsRes.ok && myAssetsRes.status === 403) {
    await sendUnlinkedGuide(chatId, telegramId);
    return;
  }

  const assets = myAssetsRes.data?.items || [];
  const pendingDocs = pendingRes.data?.items || [];

  if (pendingDocs.length > 0) {
    for (const doc of pendingDocs) {
      const itemsList = (doc.items || [])
        .map(
          (it: any) =>
            `• <b>${escapeHtml(it.asset_name)}</b> (<code>${escapeHtml(it.inventory_no)}</code>) — ${it.qty} ${it.unit || "dona"}`
        )
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
        reply_markup: new InlineKeyboard().text("⬅️ Bosh menyu", "vaqf:menu:home"),
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
  kb.text("⬅️ Bosh menyu", "vaqf:menu:home");

  await bot.api.sendMessage(
    chatId,
    `📦 <b>Sizning zimmangizdagi buyumlar (${assets.length} ta):</b>\n\n${lines.join("\n")}`,
    { parse_mode: "HTML", reply_markup: kb }
  );
}

async function handleFaultPrompt(chatId: number, telegramId: string) {
  const myAssetsRes = await callVaqfBff(telegramId, "/vaqf-api/my/assets");
  if (!myAssetsRes.ok && myAssetsRes.status === 403) {
    await sendUnlinkedGuide(chatId, telegramId);
    return;
  }
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
}

async function handleApprovals(chatId: number, telegramId: string) {
  const appRes = await callVaqfBff(telegramId, "/vaqf-api/approvals");
  if (!appRes.ok) {
    await bot.api.sendMessage(chatId, `❌ ${escapeHtml(appRes.data?.error || "Tasdiqlarni ko'rish huquqi yo'q")}`, {
      parse_mode: "HTML",
    });
    return;
  }
  const docs = appRes.data?.items || [];
  if (docs.length === 0) {
    await bot.api.sendMessage(chatId, "✅ Hozirda tasdiqlash kutilayotgan hujjatlar yo'q.", {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("⬅️ Bosh menyu", "vaqf:menu:home"),
    });
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
}

async function executeSearchQuery(chatId: number, telegramId: string, queryText: string) {
  const qRes = await callVaqfBff(
    telegramId,
    `/vaqf-api/bot/search?search=${encodeURIComponent(queryText)}&limit=8`
  );
  if (!qRes.ok && qRes.status === 403) {
    await sendUnlinkedGuide(chatId, telegramId);
    return;
  }
  const items = qRes.data?.items || [];
  if (items.length === 0) {
    await bot.api.sendMessage(chatId, `🔍 <b>"${escapeHtml(queryText)}"</b> bo'yicha buyum topilmadi.`, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("🔍 Qayta qidirish", "vaqf:menu:search")
        .text("⬅️ Bosh menyu", "vaqf:menu:home"),
    });
    return;
  }
  if (items.length === 1) {
    await sendAssetCardToChat(chatId, telegramId, String(items[0].id), false);
    return;
  }
  const kb = new InlineKeyboard();
  for (const it of items) {
    kb.text(`${it.inventory_no} — ${it.name}`, `vaqf:asset:${it.id}`).row();
  }
  kb.text("⬅️ Bosh menyu", "vaqf:menu:home");
  await bot.api.sendMessage(
    chatId,
    `🔍 <b>"${escapeHtml(queryText)}" bo'yicha topilgan buyumlar (${qRes.data?.total || items.length} ta):</b>\nTanlang:`,
    { parse_mode: "HTML", reply_markup: kb }
  );
}

async function handleSchedules(chatId: number, telegramId: string) {
  const sRes = await callVaqfBff(telegramId, "/vaqf-api/schedules");
  if (!sRes.ok) {
    await bot.api.sendMessage(chatId, `❌ ${escapeHtml(sRes.data?.error || "Muddatlarni ko'rish huquqi yo'q")}`, {
      parse_mode: "HTML",
    });
    return;
  }
  const items = (sRes.data?.items || []).filter((s: any) => s.urgency !== "completed").slice(0, 12);
  if (items.length === 0) {
    await bot.api.sendMessage(chatId, "📅 Hozirda yaqinlashayotgan yoki muddati o'tgan eslatmalar yo'q.", {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("⬅️ Bosh menyu", "vaqf:menu:home"),
    });
    return;
  }

  const lines = items.map((s: any, idx: number) => {
    const badge =
      s.urgency === "overdue"
        ? "🔴 Muddati o'tgan"
        : s.urgency === "due_soon"
        ? "🟠 Yaqin qoldi"
        : "🟢 Rejada";
    const target = s.asset_inventory_no
      ? `${s.asset_name} (${s.asset_inventory_no})`
      : s.location_name || "Umumiy";
    return `${idx + 1}. ${badge} — <b>${escapeHtml(s.title)}</b>\n   📌 ${escapeHtml(target)} | 📅 Muddat: <b>${escapeHtml(s.due_date_str || "—")}</b>`;
  });

  const kb = new InlineKeyboard();
  for (const s of items.slice(0, 5)) {
    kb.text(`✔️ Bajarildi: #${s.id}`, `vaqf:schdone:${s.id}:0`)
      .text(`⏰ +3 kun: #${s.id}`, `vaqf:schsnooze:${s.id}:0`)
      .row();
  }
  kb.text("⬅️ Bosh menyu", "vaqf:menu:home");

  await bot.api.sendMessage(
    chatId,
    `📅 <b>Muddatlar va davriy tekshiruvlar (${items.length} ta):</b>\n\n${lines.join("\n\n")}`,
    { parse_mode: "HTML", reply_markup: kb }
  );
}

async function handleHelp(chatId: number, telegramId: string) {
  const access = await checkUserVaqfAccess(telegramId, true);
  if (!access.hasAccess) {
    await sendUnlinkedGuide(chatId, telegramId);
    return;
  }

  let roleGuide = "";
  if (access.isDirector) {
    roleGuide =
      `👑 <b>Direktor uchun ko'rsatma:</b>\n` +
      `• <b>/tasdiqlar</b> — Hisobdan chiqarish, muassasalararo ko'chirish va yuqori qiymatli amallarni 1 bosishda tasdiqlash yoki sabab yozib rad etish.\n` +
      `• <b>/muddatlar</b> — Kafolat, texnik ko'rik va ijara muddatlarini nazorat qilish.\n` +
      `• Tilni almashtirish uchun bosh menyudagi <b>🇹🇷 Türkçe / 🇺🇿 O'zbekcha</b> tugmasini bosing.`;
  } else if (access.canEdit) {
    roleGuide =
      `🛠 <b>Inventar mas'uli uchun ko'rsatma:</b>\n` +
      `• <b>/skan</b> — Telefon kamerasi orqali buyum va xona QR kodlarini skanerlash, sanoq o'tkazish.\n` +
      `• <b>/qidir &lt;so'z&gt;</b> — Buyumni inventar raqami yoki nomi bilan tez topish.\n` +
      `• <b>/muddatlar</b> — Kelgan texnik ko'rik eslatmalarini "✔️ Bajarildi" yoki "⏰ 3 kunga surish" bilan boshqarish.`;
  } else {
    roleGuide =
      `👤 <b>Xodim uchun ko'rsatma:</b>\n` +
      `• <b>/buyumlarim</b> — Zimmangizga biriktirilgan buyumlarni ko'rish va yangi zimmat dalolatnomasini "✅ Qabul qildim" tugmasi bilan tasdiqlash.\n` +
      `• <b>/nosozlik</b> — Zimmangizdagi yoki xonadagi buyum buzilsa, rasm va izoh bilan xabar berish.\n` +
      `• <b>/skan</b> — Buyumdagi QR yorliqni skanerlab, ma'lumotini ko'rish.`;
  }

  const html =
    `❓ <b>Ezan Vakfı (@${escapeHtml(VAQF_BOT_USERNAME)}) — Yordam</b>\n\n` +
    `${roleGuide}\n\n` +
    `🌐 Web ilova: ${escapeHtml(VAQF_PUBLIC_WEB_URL)}`;

  await bot.api.sendMessage(chatId, html, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text("⬅️ Bosh menyu", "vaqf:menu:home"),
  });
}

async function downloadTelegramPhotoAsDataUrl(fileId: string): Promise<string | null> {
  try {
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

// ============================================================================
// COMMANDS REGISTRATION
// ============================================================================

bot.command("start", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  const telegramId = String(ctx.from.id);
  const chatId = ctx.chat.id;
  vaqfStateByTelegramId.delete(telegramId);

  const payload = String(ctx.match || "").trim();

  // 1. One-time link code: `/start link_<CODE>`
  const linkMatch = payload.match(/^link_([A-Za-z0-9_-]+)$/i);
  if (linkMatch) {
    const code = linkMatch[1]!;
    const redRes = await callVaqfBff(telegramId, "/vaqf-api/bot/redeem-link", {
      method: "POST",
      body: {
        telegram_id: telegramId,
        code,
        meta: {
          username: ctx.from.username || null,
          first_name: ctx.from.first_name || null,
          last_name: ctx.from.last_name || null,
        },
      },
    });
    if (!redRes.ok) {
      await ctx.reply(
        `❌ <b>Bog'lash kodi xatosi:</b> ${escapeHtml(redRes.data?.error || "Kod yaroqsiz yoki muddati o'tgan")}`,
        { parse_mode: "HTML" }
      );
      return;
    }
    await ctx.reply(
      `✅ <b>Telegram hisobingiz Ezan Vakfı tizimiga muvaffaqiyatli bog'landi!</b>\n` +
        `👤 Foydalanuvchi: <b>${escapeHtml(redRes.data?.user?.name || redRes.data?.user_ref)}</b>`,
      { parse_mode: "HTML" }
    );
    await sendVaqfMainMenu(chatId, telegramId);
    return;
  }

  // Record `/start` in `vaqf.bot_chats`
  await callVaqfBff(telegramId, "/vaqf-api/bot/start", {
    method: "POST",
    body: { telegram_id: telegramId },
  });

  // 2. QR deep link: `/start a_<inventoryNo>`
  const qrMatch = payload.match(/^a_([A-Za-z0-9_-]+)$/i);
  if (qrMatch) {
    const invNo = qrMatch[1]!.toUpperCase();
    const access = await checkUserVaqfAccess(telegramId, true);
    if (!access.hasAccess) {
      await sendUnlinkedGuide(chatId, telegramId);
      return;
    }
    await sendAssetCardToChat(chatId, telegramId, invNo, true);
    return;
  }

  await sendVaqfMainMenu(chatId, telegramId);
});

bot.command("buyumlarim", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  vaqfStateByTelegramId.delete(String(ctx.from.id));
  await handleMyAssets(ctx.chat.id, String(ctx.from.id));
});

bot.command("nosozlik", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  await handleFaultPrompt(ctx.chat.id, String(ctx.from.id));
});

bot.command("tasdiqlar", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  vaqfStateByTelegramId.delete(String(ctx.from.id));
  await handleApprovals(ctx.chat.id, String(ctx.from.id));
});

bot.command("qidir", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  const telegramId = String(ctx.from.id);
  const queryText = String(ctx.match || "").trim();
  if (queryText) {
    vaqfStateByTelegramId.delete(telegramId);
    await executeSearchQuery(ctx.chat.id, telegramId, queryText);
    return;
  }
  vaqfStateByTelegramId.set(telegramId, { mode: "awaiting_search_query" });
  await ctx.reply(
    `🔍 <b>Buyum qidirish</b>\n\nInventar raqami (masalan: <code>EV-MZN-000001</code>) yoki buyum nomini yozib yuboring:`,
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("❌ Bekor qilish", "vaqf:menu:home"),
    }
  );
});

bot.command("skan", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  const telegramId = String(ctx.from.id);
  const access = await checkUserVaqfAccess(telegramId, true);
  if (!access.hasAccess) {
    await sendUnlinkedGuide(ctx.chat.id, telegramId);
    return;
  }
  const kb = new InlineKeyboard()
    .webApp("📷 Kamerani ochish (Mini App)", `${VAQF_PUBLIC_WEB_URL}?tg_miniapp=1`)
    .row()
    .text("⬅️ Bosh menyu", "vaqf:menu:home");
  await ctx.reply(
    `📷 <b>QR yorliqni skanerlash</b>\n\nQuyidagi tugmani bosib Mini App skanerini oching:`,
    { parse_mode: "HTML", reply_markup: kb }
  );
});

bot.command("muddatlar", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  vaqfStateByTelegramId.delete(String(ctx.from.id));
  await handleSchedules(ctx.chat.id, String(ctx.from.id));
});

bot.command(["yordam", "help"], async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  vaqfStateByTelegramId.delete(String(ctx.from.id));
  await handleHelp(ctx.chat.id, String(ctx.from.id));
});

// ============================================================================
// CALLBACK QUERIES (`vaqf:*`)
// ============================================================================
bot.callbackQuery(/^vaqf:/, async (ctx) => {
  if (!ctx.from) return;
  const telegramId = String(ctx.from.id);
  const chatId = ctx.chat?.id || ctx.from.id;
  const data = ctx.callbackQuery.data;

  try {
    if (data === "vaqf:menu:home") {
      vaqfStateByTelegramId.delete(telegramId);
      await ctx.answerCallbackQuery();
      await sendVaqfMainMenu(chatId, telegramId);
      return;
    }

    if (data === "vaqf:lang:uz" || data === "vaqf:lang:tr") {
      const newLang = data.endsWith(":tr") ? "tr" : "uz";
      userLangByTelegramId.set(telegramId, newLang);
      await callVaqfBff(telegramId, "/vaqf-api/bot/lang", {
        method: "POST",
        body: { telegram_id: telegramId, lang: newLang },
      });
      await ctx.answerCallbackQuery({
        text: newLang === "tr" ? "🇹🇷 Dil Türkçe olarak değiştirildi" : "🇺🇿 Til O'zbekchaga o'zgartirildi",
      });
      await sendVaqfMainMenu(chatId, telegramId);
      return;
    }

    if (data === "vaqf:menu:my_assets") {
      await ctx.answerCallbackQuery({ text: "Yuklanmoqda..." });
      await handleMyAssets(chatId, telegramId);
      return;
    }

    if (data === "vaqf:menu:report_fault") {
      await ctx.answerCallbackQuery();
      await handleFaultPrompt(chatId, telegramId);
      return;
    }

    if (data === "vaqf:menu:approvals") {
      await ctx.answerCallbackQuery({ text: "Yuklanmoqda..." });
      await handleApprovals(chatId, telegramId);
      return;
    }

    if (data === "vaqf:menu:schedules") {
      await ctx.answerCallbackQuery({ text: "Yuklanmoqda..." });
      await handleSchedules(chatId, telegramId);
      return;
    }

    if (data === "vaqf:menu:search") {
      await ctx.answerCallbackQuery();
      vaqfStateByTelegramId.set(telegramId, { mode: "awaiting_search_query" });
      await bot.api.sendMessage(
        chatId,
        `🔍 <b>Buyum qidirish</b>\n\nInventar raqami (masalan: <code>EV-MZN-000001</code>) yoki buyum nomini yozib yuboring:`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().text("❌ Bekor qilish", "vaqf:menu:home"),
        }
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
          reply_markup: new InlineKeyboard().text("⬅️ Bosh menyu", "vaqf:menu:home"),
        }
      );
      return;
    }

    const viewAssetMatch = data.match(/^vaqf:asset:(\d+)$/);
    if (viewAssetMatch) {
      await ctx.answerCallbackQuery();
      await sendAssetCardToChat(chatId, telegramId, viewAssetMatch[1]!, false);
      return;
    }

    // Approve document: `vaqf:app:<docId>:<outboxId>`
    const appMatch = data.match(/^vaqf:app:(\d+)(?::(\d+))?$/);
    if (appMatch) {
      const docId = Number(appMatch[1]);
      const outboxId = appMatch[2] ? Number(appMatch[2]) : null;
      const res = await callVaqfBff(telegramId, "/vaqf-api/bot/callback", {
        method: "POST",
        body: { telegramId, action: "approve_doc", targetId: docId, outboxId },
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
      await bot.api.sendMessage(chatId, `❌ <b>Hujjatni (#${docId}) rad etish sababini yozib yuboring:</b>`, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text("Bekor qilish", "vaqf:menu:home"),
      });
      return;
    }

    // Recipient confirm assignment: `vaqf:cfm:<docId>:<outboxId>`
    const cfmMatch = data.match(/^vaqf:cfm:(\d+)(?::(\d+))?$/);
    if (cfmMatch) {
      const docId = Number(cfmMatch[1]);
      const outboxId = cfmMatch[2] ? Number(cfmMatch[2]) : null;
      const res = await callVaqfBff(telegramId, "/vaqf-api/bot/callback", {
        method: "POST",
        body: { telegramId, action: "confirm_doc", targetId: docId, outboxId },
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
        body: { telegramId, action: "create_repair_from_fault", targetId: faultId, outboxId },
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

    // Schedule done / snooze
    const schDoneMatch = data.match(/^vaqf:schdone:(\d+)(?::(\d+))?$/);
    if (schDoneMatch) {
      const scheduleId = Number(schDoneMatch[1]);
      const outboxId = schDoneMatch[2] ? Number(schDoneMatch[2]) : null;
      const res = await callVaqfBff(telegramId, "/vaqf-api/bot/callback", {
        method: "POST",
        body: { telegramId, action: "schedule_done", targetId: scheduleId, outboxId },
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
        body: { telegramId, action: "schedule_snooze", targetId: scheduleId, outboxId },
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
          `⚠️ Farqlar: <b>${s.discrepancy_count ?? 0} ta</b>`,
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
    await ctx.answerCallbackQuery({ text: sanitizeText(err?.message || "Xatolik"), show_alert: true }).catch(() => {});
  }
});

// ============================================================================
// SESSION STATE HANDLERS (Search, Fault report, Reject reason)
// ============================================================================
bot.on("message", async (ctx) => {
  if (!ctx.from || !ctx.chat) return;
  const telegramId = String(ctx.from.id);
  const state = vaqfStateByTelegramId.get(telegramId);
  const rawText = (ctx.message?.text || "").trim();

  if (!state) {
    if (rawText) {
      await sendVaqfMainMenu(ctx.chat.id, telegramId);
    }
    return;
  }

  // 1. Search query
  if (state.mode === "awaiting_search_query" && rawText) {
    vaqfStateByTelegramId.delete(telegramId);
    await executeSearchQuery(ctx.chat.id, telegramId, rawText);
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
        `/vaqf-api/bot/search?search=${encodeURIComponent(rawText)}&limit=1`
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
    const dataUrl = await downloadTelegramPhotoAsDataUrl(largest.file_id);
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
        reply_markup: new InlineKeyboard().text("⬅️ Bosh menyu", "vaqf:menu:home"),
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
      reply_markup: new InlineKeyboard().text("⬅️ Bosh menyu", "vaqf:menu:home"),
    });
    return;
  }
});

bot.catch((err) => {
  console.error("[mezana-vaqf-bot] Xato:", sanitizeText(err.error));
});

async function startVaqfBotPolling() {
  try {
    await bot.api.setMyCommands([
      { command: "start", description: "Salomlashish va hisobni bog'lash" },
      { command: "buyumlarim", description: "Zimmatdagi buyumlar va Qabul qildim" },
      { command: "nosozlik", description: "Buyum nosozligi haqida xabar berish" },
      { command: "tasdiqlar", description: "Direktor tasdig'ini kutayotgan hujjatlar" },
      { command: "qidir", description: "Inventar raqami yoki nomi bo'yicha qidirish" },
      { command: "skan", description: "Mini App kamerasida QR skanerlash" },
      { command: "muddatlar", description: "Yaqinlashayotgan kafolat va ko'rik muddatlari" },
      { command: "yordam", description: "Rolga mos qisqa ko'rsatma" },
    ]);
  } catch (err: any) {
    console.warn("[mezana-vaqf-bot] setMyCommands ogohlantirishi:", sanitizeText(err?.message));
  }

  while (true) {
    try {
      await bot.start({
        onStart: (botInfo) => {
          console.log(
            `[mezana-vaqf-bot] @${botInfo.username} (${botInfo.first_name}, token=${maskSecretToken(token)}) ishga tushdi!`
          );
        },
      });
    } catch (err: any) {
      console.error("[mezana-vaqf-bot] Polling xatosi:", sanitizeText(err?.message || err));
      try {
        await bot.stop();
      } catch {}
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

startVaqfBotPolling();
