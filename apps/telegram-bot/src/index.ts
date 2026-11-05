import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import "dotenv/config";
import { Bot } from "grammy";
import { prisma } from "./db/client.js";
import { registerLateArrivalFlow, startLatePoller } from "./late/flow.js";
import { registerVaqfBotFlow, checkUserVaqfAccess } from "./vaqf/flow.js";
import {
  AUTHORIZED_USERS,
  notifyDirectorsOfPendingUser,
  refreshDynamicAuthorizedUsers,
  registerExpenseSandboxFlow,
  sendAccountWelcome,
} from "./expense/sandboxFlow.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN .env'da yo'q");

const bot = new Bot(token);

// Middleware:
// - If user is in AUTHORIZED_USERS -> proceed to full bot features (next()).
// - If user is NOT in AUTHORIZED_USERS -> handle polite registration (ask Full Name -> "Akkauntingiz administrator tomonidan tasdiqlanishini kuting").
bot.use(async (ctx, next) => {
  if (!ctx.from) return;
  const telegramId = String(ctx.from.id);
  const auth = AUTHORIZED_USERS[telegramId];

  // Authorized user -> full access
  if (auth) {
    await next();
    return;
  }
  const vaqfAcc = await checkUserVaqfAccess(telegramId);
  if (vaqfAcc.hasAccess) {
    await next();
    return;
  }
  const lateContact = await prisma.telegramContact.findUnique({ where: { telegramId } });
  if (lateContact?.isLateResponsible) {
    await next();
    return;
  }
  if (telegramId === "1178330042" || (lateContact?.fullName && lateContact.fullName.trim().toLowerCase() === "amir")) {
    if (ctx.chat) {
      await ctx.reply(
        "? Assalomu alaykum, *Amir*!\n\nAkkauntingiz faollashtirilgan. Kirish eshigida kech qolgan talabalar mas'ul xodim tomonidan tasdiqlangan zahoti ularning rasmi va ism-familiyasi sizga yuboriladi.",
        { parse_mode: "Markdown", reply_markup: { remove_keyboard: true } }
      );
    }
    return;
  }

  // Unapproved / pending user flow:
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({
      text: "⏳ Akkauntingiz administrator tomonidan tasdiqlanishini kuting.",
      show_alert: true,
    });
    return;
  }

  if (!ctx.chat) return;

  const firstName = ctx.from.first_name || null;
  const lastName = ctx.from.last_name || null;
  const username = ctx.from.username || null;
  const rawText = (ctx.message?.text || "").trim();

  if (rawText === "/id" || /^(mening\s+id|my\s+id|id)$/i.test(rawText)) {
    await ctx.reply(`🆔 Sizning Telegram ID raqamingiz: \`${telegramId}\``, {
      parse_mode: "Markdown",
      reply_markup: { remove_keyboard: true },
    });
    return;
  }

  if (rawText === "/ism") {
    await prisma.telegramContact.upsert({
      where: { telegramId },
      create: {
        telegramId,
        firstName,
        lastName,
        username,
        awaitingName: true,
        lastStartAt: new Date(),
      },
      update: {
        awaitingName: true,
      },
    });
    await ctx.reply(
      "✏️ Iltimos, *Ism va Familiyangizni* to'liq yozib yuboring (masalan: _Abdulloh Karimov_):",
      {
        parse_mode: "Markdown",
        reply_markup: { remove_keyboard: true },
      }
    );
    return;
  }

  const existing = await prisma.telegramContact.findUnique({
    where: { telegramId },
  });
  const hasFullName = Boolean(existing?.fullName && existing.fullName.trim().length >= 2);

  if (rawText === "/start" || rawText === "/menu") {
    await prisma.telegramContact.upsert({
      where: { telegramId },
      create: {
        telegramId,
        firstName,
        lastName,
        username,
        awaitingName: true,
        lastStartAt: new Date(),
      },
      update: {
        firstName,
        lastName,
        username,
        awaitingName: !hasFullName,
        lastStartAt: new Date(),
      },
    });

    if (hasFullName && existing?.fullName) {
      await ctx.reply(
        [
          `⏳ Assalomu alaykum, *${existing.fullName}*!`,
          "",
          "Ma'lumotlaringiz ro'yxatga olingan.",
          "🔒 *Akkauntingiz administrator tomonidan tasdiqlanishini kuting.*",
          "",
          "_(Ism-familiyangizni o'zgartirish uchun /ism buyrug'ini bosing)_",
        ].join("\n"),
        {
          parse_mode: "Markdown",
          reply_markup: { remove_keyboard: true },
        }
      );
      return;
    }

    await ctx.reply(
      [
        "👋 Assalomu alaykum! Mezana tizimining rasmiy botiga xush kelibsiz.",
        "",
        "📝 Ro'yxatdan o'tish uchun iltimos, *Ism va Familiyangizni* to'liq yozib yuboring (masalan: _Abdulloh Karimov_):",
      ].join("\n"),
      {
        parse_mode: "Markdown",
        reply_markup: { remove_keyboard: true },
      }
    );
    return;
  }

  // If user is sending their name (or hasn't provided a name yet)
  const needsName = !existing || !hasFullName || existing.awaitingName;
  if (needsName) {
    const cleanName = rawText.replace(/\s+/g, " ").trim();
    if (!cleanName || cleanName.startsWith("/") || cleanName.length < 3 || cleanName.length > 80) {
      await ctx.reply(
        "📝 Ro'yxatdan o'tish uchun iltimos, *Ism va Familiyangizni* to'liq yozib yuboring (masalan: _Abdulloh Karimov_):",
        {
          parse_mode: "Markdown",
          reply_markup: { remove_keyboard: true },
        }
      );
      return;
    }

    const saved = await prisma.telegramContact.upsert({
      where: { telegramId },
      create: {
        telegramId,
        firstName,
        lastName,
        username,
        fullName: cleanName,
        awaitingName: false,
        lastStartAt: new Date(),
      },
      update: {
        firstName,
        lastName,
        username,
        fullName: cleanName,
        awaitingName: false,
      },
    });

    await ctx.reply(
      [
        `✅ Rahmat, *${saved.fullName || cleanName}*! Ma'lumotlaringiz qabul qilindi.`,
        "",
        "⏳ *Akkauntingiz administrator tomonidan tasdiqlanishini kuting.*",
        "Tasdiqlangandan so'ng botning barcha funksiyalari siz uchun ochiladi.",
      ].join("\n"),
      {
        parse_mode: "Markdown",
        reply_markup: { remove_keyboard: true },
      }
    );

    await notifyDirectorsOfPendingUser(
      bot,
      telegramId,
      saved.fullName || cleanName,
      username
    );
    return;
  }

  // Already gave name, waiting for admin approval
  await ctx.reply(
    [
      `⏳ Hurmatli *${existing?.fullName || "foydalanuvchi"}*, sizning ma'lumotlaringiz qabul qilingan.`,
      "",
      "🔒 *Akkauntingiz administrator tomonidan tasdiqlanishini kuting.*",
      "_(Ism-familiyani o'zgartirish uchun: /ism)_",
    ].join("\n"),
    {
      parse_mode: "Markdown",
      reply_markup: { remove_keyboard: true },
    }
  );
});

bot.command(["start", "menu"], async (ctx) => {
  if (!ctx.from) return;
  const telegramId = String(ctx.from.id);
  const auth = AUTHORIZED_USERS[telegramId];
  if (!auth) return;

  try {
    await prisma.telegramContact.upsert({
      where: { telegramId },
      create: {
        telegramId,
        firstName: ctx.from.first_name || null,
        lastName: ctx.from.last_name || null,
        username: ctx.from.username || null,
        fullName: auth.personName,
        userId: auth.userId,
        awaitingName: false,
        lastStartAt: new Date(),
      },
      update: {
        firstName: ctx.from.first_name || null,
        lastName: ctx.from.last_name || null,
        username: ctx.from.username || null,
        fullName: auth.personName,
        userId: auth.userId,
        awaitingName: false,
        lastStartAt: new Date(),
      },
    });
  } catch {}

  await sendAccountWelcome(bot, ctx.chat.id, telegramId);
});

// 1. Register late arrival callbacks & night reply handler
registerLateArrivalFlow(bot);

// 2. Register Vaqf inventory & asset management flow
registerVaqfBotFlow(bot);

// 3. Register Production AI Expense flow linked to the unified system accounts
registerExpenseSandboxFlow(bot);

bot.catch((err) => {
  console.error("Bot handler xatosi:", err.error);
});

async function startPollingLoop() {
  while (true) {
    try {
      await bot.start({
        onStart: (botInfo) => {
          console.log(
            `[mezana-telegram-bot] @${botInfo.username} (Production Account-Linked + Pending Approval Mode) faol ishga tushdi!`
          );
        },
      });
      console.warn(
        "[mezana-telegram-bot] bot.start() yakunlandi, 5 soniyadan so'ng qayta ulanadi..."
      );
    } catch (err: any) {
      console.error("[mezana-telegram-bot] Polling xatosi:", err?.message || err);
      try {
        await bot.stop();
      } catch {}
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

startLatePoller(bot);
startPollingLoop();
