import { Bot, InlineKeyboard } from "grammy";
import {
  VAQF_BOT_USERNAME,
  escapeHtml,
  callVaqfBff,
  checkUserVaqfAccess,
} from "../../../../packages/vaqf-bot-shared/index.mjs";

export { callVaqfBff, checkUserVaqfAccess };

export async function sendVaqfMovedNotice(bot: Bot, chatId: number, startParam = "") {
  const deepUrl = startParam
    ? `https://t.me/${VAQF_BOT_USERNAME}?start=${encodeURIComponent(startParam)}`
    : `https://t.me/${VAQF_BOT_USERNAME}`;

  const kb = new InlineKeyboard().url(
    `🏛 Vaqf endi alohida botda (@${VAQF_BOT_USERNAME})`,
    deepUrl
  );

  await bot.api.sendMessage(
    chatId,
    `🏛 <b>Vaqf endi alohida botda!</b>\n\n` +
      `Ezan Vakfı mulki, zimmatlar, nosozliklar, tasdiqlar va QR skanerlash endi maxsus <b>@${escapeHtml(VAQF_BOT_USERNAME)}</b> orqali ishlaydi.\n\n` +
      `👇 Davom etish uchun quyidagi tugmani bosing:`,
    {
      parse_mode: "HTML",
      reply_markup: kb,
    }
  );
}

export function registerVaqfBotFlow(bot: Bot) {
  bot.command("vaqf", async (ctx) => {
    if (!ctx.from || !ctx.chat) return;
    await sendVaqfMovedNotice(bot, ctx.chat.id);
  });

  bot.hears(/^🏛\s*Vaqf(?:\s+endi\s+alohida\s+botda)?$/i, async (ctx) => {
    if (!ctx.from || !ctx.chat) return;
    await sendVaqfMovedNotice(bot, ctx.chat.id);
  });

  // Redirect old QR deep links (`/start a_<inventoryNo>`) to the dedicated Vaqf bot
  bot.use(async (ctx, next) => {
    if (ctx.from && ctx.chat && ctx.message?.text) {
      const m = ctx.message.text.trim().match(/^\/start\s+(a_[A-Za-z0-9_-]+)$/i);
      if (m) {
        await sendVaqfMovedNotice(bot, ctx.chat.id, m[1]!);
        return;
      }
    }
    await next();
  });

  // Legacy inline callback buttons on historical `@mezanatizimbot` messages:
  // Either execute the BFF callback action idempotently or guide user to `@ezanvakfitizimbot` without throwing errors
  bot.callbackQuery(/^vaqf:/, async (ctx) => {
    if (!ctx.from) return;
    const telegramId = String(ctx.from.id);
    const chatId = ctx.chat?.id || ctx.from.id;
    const data = ctx.callbackQuery.data;

    try {
      const actionMap: Array<{ regex: RegExp; action: string }> = [
        { regex: /^vaqf:app:(\d+)(?::(\d+))?$/, action: "approve_doc" },
        { regex: /^vaqf:cfm:(\d+)(?::(\d+))?$/, action: "confirm_doc" },
        { regex: /^vaqf:rep:(\d+)(?::(\d+))?$/, action: "create_repair_from_fault" },
        { regex: /^vaqf:schdone:(\d+)(?::(\d+))?$/, action: "schedule_done" },
        { regex: /^vaqf:schsnooze:(\d+)(?::(\d+))?$/, action: "schedule_snooze" },
      ];

      for (const item of actionMap) {
        const m = data.match(item.regex);
        if (m) {
          const targetId = Number(m[1]);
          const outboxId = m[2] ? Number(m[2]) : null;
          const res = await callVaqfBff(telegramId, "/vaqf-api/bot/callback", {
            method: "POST",
            body: { telegramId, action: item.action, targetId, outboxId },
          });
          if (!res.ok) {
            await ctx.answerCallbackQuery({
              text: `${res.data?.error || "Xatolik"} (@${VAQF_BOT_USERNAME} botiga o'ting)`,
              show_alert: true,
            });
            return;
          }
          await ctx.answerCallbackQuery({
            text: `${res.data.statusLine || "✅ Bajarildi"} (Yangi bot: @${VAQF_BOT_USERNAME})`,
          });
          const origText = ctx.callbackQuery.message?.text || "";
          try {
            await ctx.editMessageText(
              `${escapeHtml(origText)}\n\n<b>${escapeHtml(res.data.statusLine)}</b>\n<i>ℹ️ Eslatma: Vaqf xabarlari endi @${escapeHtml(VAQF_BOT_USERNAME)} da</i>`,
              { parse_mode: "HTML" }
            );
          } catch {}
          return;
        }
      }

      await ctx.answerCallbackQuery({
        text: `Bu amal endi @${VAQF_BOT_USERNAME} botida`,
      });
      await sendVaqfMovedNotice(bot, chatId);
    } catch {
      await ctx.answerCallbackQuery({
        text: `Bu amal endi @${VAQF_BOT_USERNAME} botida`,
      }).catch(() => {});
    }
  });
}
