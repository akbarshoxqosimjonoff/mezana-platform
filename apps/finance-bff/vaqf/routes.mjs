import fsp from "node:fs/promises";
import {
  getActor,
  httpError,
  listInstitutions,
  createInstitution,
  updateInstitution,
  listLocations,
  createLocation,
  updateLocation,
  deleteLocation,
  listCategories,
  createCategory,
  updateCategory,
  listResponsibleStaff,
  listAssets,
  getAssetDetail,
  createAsset,
  updateAsset,
  softDeleteAsset,
  addAssetPhoto,
  addAssetDocument,
  getProtectedFile,
  getSummaryReport,
  generateImportTemplateBuffer,
  exportAssetsExcelBuffer,
  previewOrCommitAssetImport,
  generateQrLabelsPdfBuffer,
} from "./service.mjs";

import {
  resolveVaqfAccessAsync,
  resolveAssetsAndLocationsInScope,
  createCount,
  updateCount,
  startCount,
  listCounts,
  getCountDetail,
  getMyCountData,
  processCountScans,
  uploadCountItemPhoto,
  getCountItemPhotoFile,
  addExtraCountItem,
  markCountLocationDone,
  submitCountForReview,
  getCountDiscrepancies,
  setCountDecisions,
  approveCount,
  cancelCount,
  generateCountReportPdfBuffer,
  generateCountReportExcelBuffer,
} from "./countsService.mjs";

import {
  extractSessionCandidateRefs,
  listUserRolesAndHistory,
  assignUserRole,
  revokeUserRole,
  getVaqfSettings,
  updateVaqfSettings,
  listDocuments,
  getDocumentDetail,
  createDocument,
  updateDocument,
  submitDocument,
  completeRepairDocument,
  approveDocument,
  rejectDocument,
  confirmDocumentByRecipient,
  cancelDocument,
  getMyAssignedAssets,
  getMyPendingDocuments,
  getPersonAssignedAssets,
  listPendingApprovals,
  createFaultReport,
  listFaultReports,
  getFaultPhotoFile,
  updateFaultReportStatus,
  generateLifecycleDocumentPdfBuffer,
  getLifecycleReports,
  generateAssignmentsExcelBuffer,
  generateAssignmentsPdfBuffer,
} from "./lifecycleService.mjs";

import {
  getVaqfBotSecret,
  getVaqfBotUsername,
  resolveLinkedUserByTelegramId,
  verifyTelegramWebAppInitData,
  recordVaqfBotStart,
  setVaqfBotChatLang,
  getVaqfBotChatInfo,
  getVaqfBotStatusForWebUser,
  createVaqfTelegramLinkCode,
  redeemVaqfTelegramLinkCode,
  sendOneTimeBotMigrationNotice,
  listWebNotificationsForUser,
  markWebNotificationRead,
  getUserNotificationPrefs,
  updateUserNotificationPrefs,
  executeBotCallbackAction,
  getFinanceIntegrationSettings,
  updateFinanceIntegrationSettings,
  listPendingFinanceExpenses,
  registerAssetsFromPendingExpense,
  markPendingExpenseNotInventory,
  getInventoryLinksByExpenseIds,
  SCHEDULE_TEMPLATES,
  listSchedules,
  createSchedule,
  completeSchedule,
  snoozeSchedule,
  deleteSchedule,
  getDirectorDashboardData,
  processOutboxBatch,
  startVaqfBackgroundWorkers,
} from "./automationService.mjs";

import {
  verifyVaqfPiiKey,
  rotateVaqfPiiKey,
  runVaqfBackup,
  runWeeklyRestoreTest,
  isHealthRequestAllowed,
  getVaqfSystemHealth,
  runSystemMonitoringChecks,
  generateMultiImportTemplateBuffer,
  previewOrCommitMultiImport,
} from "./opsService.mjs";

import {
  getGovernanceSettings,
  updateGovernanceSetting,
  listDonors,
  getDonorDetail,
  createDonor,
  anonymizeDonor,
  listDonations,
  getDonationDetail,
  createDonation,
  addDonationSpendLink,
  generateDonationReceiptPdf,
  exportDonationsExcel,
  listProperties,
  getPropertyDetail,
  createProperty,
  listLeases,
  getLeaseDetail,
  createLease,
  recordLeasePayment,
  checkLeaseRemindersAndOverdue,
  listArchiveDocuments,
  getArchiveDocumentDetail,
  createArchiveDocument,
  uploadArchiveNewVersion,
  downloadArchiveDocument,
  listBoardMembers,
  createBoardMember,
  listBoardMeetings,
  createBoardMeeting,
  listBoardDecisions,
  createBoardDecision,
  generateBoardDecisionPdf,
  getGovernanceDashboardSummary,
  getAnnualVaqfReportData,
  generateAnnualVaqfReportPdf,
  exportAnnualVaqfReportExcel,
} from "./governanceService.mjs";

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(body);
}

if (!process.execArgv.includes("--test") && !process.argv.some((a) => a.endsWith(".test.mjs"))) {
  startVaqfBackgroundWorkers();
}

async function readJsonBody(req) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > 25 * 1024 * 1024) {
      throw httpError(413, "So'rov hajmi ruxsat etilgan me'yordan oshdi (25MB)");
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw httpError(400, "Noto'g'ri JSON formati");
  }
}

export async function handleVaqfApi(req, res, url, { getSession, getSessionAccessContext }) {
  const pathname = url.pathname;
  const method = req.method.toUpperCase();

  try {
    // Public QR landing info endpoint for unauthenticated phone camera scans (`/vaqf/a/<inventoryNo>`)
    const publicQrMatch = pathname.match(/^\/vaqf-api\/public\/qr-info\/([^/]+)$/);
    if (publicQrMatch && method === "GET") {
      const code = decodeURIComponent(publicQrMatch[1]).trim().toUpperCase();
      const botUsername = getVaqfBotUsername();
      let assetSummary = null;
      try {
        const asset = await getAssetDetail(code, { byCode: true });
        assetSummary = {
          id: asset.id,
          inventory_no: asset.inventory_no,
          name: asset.name,
          category_name: asset.category_name,
          institution_name: asset.institution_name,
          location_name: asset.location_name,
        };
      } catch {}
      return sendJson(res, 200, {
        inventory_no: code,
        asset: assetSummary,
        bot_username: botUsername,
        tg_deep_link: `https://t.me/${botUsername}?start=a_${encodeURIComponent(code)}`,
      });
    }

    // Internal Bot endpoints (`POST /vaqf-api/bot/*`), strictly from localhost + secret
    if (pathname.startsWith("/vaqf-api/bot/")) {
      const remoteAddr = String(req.socket?.remoteAddress || "");
      const isLocal =
        remoteAddr === "127.0.0.1" ||
        remoteAddr === "::1" ||
        remoteAddr === "::ffff:127.0.0.1";
      const secretHeader = String(req.headers["x-vaqf-bot-secret"] || "");
      if (!isLocal || secretHeader !== getVaqfBotSecret()) {
        return sendJson(res, 403, { error: "Faqat lokal Telegram bot servisi uchun ruxsat etilgan" });
      }

      if (pathname === "/vaqf-api/bot/callback" && method === "POST") {
        const body = await readJsonBody(req);
        const result = await executeBotCallbackAction(body);
        return sendJson(res, 200, result);
      }

      if (pathname === "/vaqf-api/bot/start" && method === "POST") {
        const body = await readJsonBody(req);
        const result = await recordVaqfBotStart(body.telegram_id || req.headers["x-telegram-id"], body.lang);
        return sendJson(res, 200, result);
      }

      if (pathname === "/vaqf-api/bot/redeem-link" && method === "POST") {
        const body = await readJsonBody(req);
        const result = await redeemVaqfTelegramLinkCode(
          body.telegram_id || req.headers["x-telegram-id"],
          body.code,
          body.meta || {}
        );
        return sendJson(res, 200, result);
      }

      if (pathname === "/vaqf-api/bot/lang" && method === "POST") {
        const body = await readJsonBody(req);
        const result = await setVaqfBotChatLang(body.telegram_id || req.headers["x-telegram-id"], body.lang);
        return sendJson(res, 200, result);
      }

      if (pathname === "/vaqf-api/bot/chat-info" && method === "GET") {
        const tgId = url.searchParams.get("telegram_id") || req.headers["x-telegram-id"];
        const info = await getVaqfBotChatInfo(tgId);
        return sendJson(res, 200, { chat: info });
      }
    }

    // Telegram Mini App Auth & Quick Lookup (`POST /vaqf-api/miniapp/auth`)
    if (pathname === "/vaqf-api/miniapp/auth" && method === "POST") {
      const body = await readJsonBody(req);
      const initData = String(body.initData || req.headers["x-telegram-init-data"] || "");
      const verified = verifyTelegramWebAppInitData(initData);
      if (!verified.valid) {
        return sendJson(res, 401, { error: `Telegram Mini App imzosi yaroqsiz: ${verified.error}` });
      }
      const linked = await resolveLinkedUserByTelegramId(verified.telegramId);
      if (!linked) {
        return sendJson(res, 403, {
          error: "Telegram hisobingiz tizimga bog'lanmagan. Avval veb-sayt orqali bir martalik kod bilan bog'lang.",
        });
      }
      const vAccess = await resolveVaqfAccessAsync(linked.sess, linked.accessContext);
      if (!vAccess.canAccess && !vAccess.canView && !vAccess.canCount) {
        return sendJson(res, 403, { error: "Sizda Vaqf tizimida rol yoki ruxsat mavjud emas" });
      }
      let scannedAsset = null;
      if (body.inventory_no) {
        try {
          scannedAsset = await getAssetDetail(String(body.inventory_no).trim(), { byCode: true });
        } catch {}
      }
      return sendJson(res, 200, {
        authenticated: true,
        telegramId: verified.telegramId,
        user: linked.sess.user,
        vaqfAccess: vAccess,
        asset: scannedAsset,
      });
    }

    // Resolve session via:
    // 1) Cookie session (`getSession(req)`)
    // 2) Local Telegram Bot headers (`X-Vaqf-Bot-Secret` + `X-Telegram-Id` from 127.0.0.1)
    // 3) Telegram Mini App header (`X-Telegram-Init-Data`)
    let sess = getSession(req);
    let accessContext = sess ? getSessionAccessContext(sess) : null;

    if (!sess) {
      const botSecretHeader = String(req.headers["x-vaqf-bot-secret"] || "");
      const tgIdHeader = String(req.headers["x-telegram-id"] || "").trim();
      const remoteAddr = String(req.socket?.remoteAddress || "");
      const isLocal =
        remoteAddr === "127.0.0.1" ||
        remoteAddr === "::1" ||
        remoteAddr === "::ffff:127.0.0.1";

      if (isLocal && botSecretHeader && botSecretHeader === getVaqfBotSecret() && tgIdHeader) {
        const linked = await resolveLinkedUserByTelegramId(tgIdHeader);
        if (!linked) {
          return sendJson(res, 403, {
            error: "Telegram hisobi tizimdagi foydalanuvchiga bog'lanmagan",
            code: "TELEGRAM_NOT_LINKED",
          });
        }
        sess = linked.sess;
        accessContext = linked.accessContext;
      } else if (req.headers["x-telegram-init-data"]) {
        const verified = verifyTelegramWebAppInitData(String(req.headers["x-telegram-init-data"]));
        if (!verified.valid) {
          return sendJson(res, 401, { error: `Telegram Mini App initData xatosi: ${verified.error}` });
        }
        const linked = await resolveLinkedUserByTelegramId(verified.telegramId);
        if (!linked) {
          return sendJson(res, 403, {
            error: "Telegram hisobi tizimdagi foydalanuvchiga bog'lanmagan",
            code: "TELEGRAM_NOT_LINKED",
          });
        }
        sess = linked.sess;
        accessContext = linked.accessContext;
      }
    }

    // 5-QADAM (6-BOSQICH): HEALTH ENDPOINT (`GET /vaqf-api/health`)
    // Strictly restricted to 127.0.0.1 (no external X-Forwarded-For) OR Director session
    if (pathname === "/vaqf-api/health" && method === "GET") {
      let maybeVAccess = null;
      if (sess) {
        if (!accessContext) accessContext = getSessionAccessContext(sess);
        maybeVAccess = await resolveVaqfAccessAsync(sess, accessContext);
      }
      if (!isHealthRequestAllowed(req, maybeVAccess)) {
        return sendJson(res, 403, { error: "Health endpoint faqat 127.0.0.1 va Direktor uchun ochiq" });
      }
      const health = await getVaqfSystemHealth();
      return sendJson(res, 200, health);
    }

    if (!sess) {
      return sendJson(res, 401, { error: "Sessiya muddati tugagan. Iltimos, tizimga kiring." });
    }
    if (!accessContext) {
      accessContext = getSessionAccessContext(sess);
    }
    const vAccess = await resolveVaqfAccessAsync(sess, accessContext);
    const actor = getActor(sess, accessContext);

    if (pathname === "/vaqf-api/me" && method === "GET") {
      if (!vAccess.canView && !vAccess.canCount && !vAccess.canAccess) {
        return sendJson(res, 403, { error: "Vaqf tizimiga kirish huquqi yo'q", vaqfAccess: vAccess });
      }
      const [staff, botStatus] = await Promise.all([
        vAccess.canView ? listResponsibleStaff() : Promise.resolve([]),
        getVaqfBotStatusForWebUser(sess, accessContext),
      ]);
      return sendJson(res, 200, {
        authenticated: true,
        user: {
          ...sess.user,
          isDirector: accessContext.isDirector,
          accountName: accessContext.accountName,
          sourceLabel: accessContext.sourceLabel,
        },
        vaqfAccess: vAccess,
        staff,
        botStatus,
      });
    }

    if (pathname === "/vaqf-api/me/bot-status" && method === "GET") {
      const botStatus = await getVaqfBotStatusForWebUser(sess, accessContext);
      return sendJson(res, 200, botStatus);
    }

    if (pathname === "/vaqf-api/me/telegram-link-code" && method === "POST") {
      const linkData = await createVaqfTelegramLinkCode(sess, accessContext);
      return sendJson(res, 200, linkData);
    }

    // ========================================================================
    // 4-BOSQICH: NOTIFICATIONS BELL & PREFS (/vaqf-api/notifications*)
    // ========================================================================
    if (pathname === "/vaqf-api/notifications" && method === "GET") {
      if (!vAccess.canAccess && !vAccess.canView && !vAccess.canCount) {
        return sendJson(res, 403, { error: "Xabarnomalarni ko'rish huquqi yo'q" });
      }
      const [notifs, prefs] = await Promise.all([
        listWebNotificationsForUser(sess, accessContext, vAccess),
        getUserNotificationPrefs(actor.actorId),
      ]);
      return sendJson(res, 200, { ...notifs, prefs });
    }

    if (pathname === "/vaqf-api/notifications/prefs" && method === "GET") {
      const prefs = await getUserNotificationPrefs(actor.actorId);
      return sendJson(res, 200, { prefs });
    }

    if (pathname === "/vaqf-api/notifications/prefs" && (method === "PATCH" || method === "POST")) {
      const body = await readJsonBody(req);
      const prefs = await updateUserNotificationPrefs(actor.actorId, body);
      return sendJson(res, 200, { prefs });
    }

    const notifReadMatch = pathname.match(/^\/vaqf-api\/notifications\/([^/]+)\/read$/);
    if (notifReadMatch && method === "POST") {
      const result = await markWebNotificationRead(notifReadMatch[1], sess, accessContext, vAccess);
      return sendJson(res, 200, result);
    }

    // ========================================================================
    // 4-BOSQICH: FINANCE INTEGRATION (/vaqf-api/finance/*)
    // ========================================================================
    if (pathname === "/vaqf-api/finance/expense-links" && method === "GET") {
      const links = await getInventoryLinksByExpenseIds();
      return sendJson(res, 200, { links });
    }

    if (pathname === "/vaqf-api/finance/settings" && method === "GET") {
      if (!vAccess.canView) {
        return sendJson(res, 403, { error: "Moliya integratsiyasi sozlamalarini ko'rish huquqi yo'q" });
      }
      const finSettings = await getFinanceIntegrationSettings();
      return sendJson(res, 200, finSettings);
    }

    if (pathname === "/vaqf-api/finance/settings" && (method === "PATCH" || method === "POST")) {
      if (!vAccess.canManageRoles && !vAccess.isDirector) {
        return sendJson(res, 403, { error: "Moliya integratsiyasi sozlamalarini o'zgartirish faqat Direktor uchun" });
      }
      const body = await readJsonBody(req);
      const finSettings = await updateFinanceIntegrationSettings(body, actor);
      return sendJson(res, 200, finSettings);
    }

    if (pathname === "/vaqf-api/finance/pending-expenses" && method === "GET") {
      if (!vAccess.canView) {
        return sendJson(res, 403, { error: "Ro'yxatga olinishi kerak xaridlarni ko'rish huquqi yo'q" });
      }
      const filters = Object.fromEntries(url.searchParams.entries());
      const items = await listPendingFinanceExpenses(filters);
      return sendJson(res, 200, { items });
    }

    const finRegMatch = pathname.match(/^\/vaqf-api\/finance\/pending-expenses\/(\d+)\/register$/);
    if (finRegMatch && method === "POST") {
      if (!vAccess.canEdit) {
        return sendJson(res, 403, { error: "Xaridni inventarga ro'yxatga olish huquqi yo'q" });
      }
      const body = await readJsonBody(req);
      const result = await registerAssetsFromPendingExpense(finRegMatch[1], body, actor);
      return sendJson(res, 201, result);
    }

    const finNotInvMatch = pathname.match(/^\/vaqf-api\/finance\/pending-expenses\/(\d+)\/not-inventory$/);
    if (finNotInvMatch && method === "POST") {
      if (!vAccess.canEdit) {
        return sendJson(res, 403, { error: "Xaridni 'inventar emas' deb belgilash huquqi yo'q" });
      }
      const body = await readJsonBody(req);
      const item = await markPendingExpenseNotInventory(finNotInvMatch[1], body.reason || body.note, actor);
      return sendJson(res, 200, { item });
    }

    // ========================================================================
    // 4-BOSQICH: SCHEDULES & REMINDERS (/vaqf-api/schedules*)
    // ========================================================================
    if (pathname === "/vaqf-api/schedules" && method === "GET") {
      if (!vAccess.canView && !vAccess.canAccess) {
        return sendJson(res, 403, { error: "Muddatlar va eslatmalarni ko'rish huquqi yo'q" });
      }
      const filters = Object.fromEntries(url.searchParams.entries());
      const data = await listSchedules(filters);
      return sendJson(res, 200, data);
    }

    if (pathname === "/vaqf-api/schedules" && method === "POST") {
      if (!vAccess.canEdit) {
        return sendJson(res, 403, { error: "Yangi muddat qo'shish huquqi yo'q" });
      }
      const body = await readJsonBody(req);
      const item = await createSchedule(body, actor);
      return sendJson(res, 201, { item });
    }

    const schedDoneMatch = pathname.match(/^\/vaqf-api\/schedules\/(\d+)\/done$/);
    if (schedDoneMatch && method === "POST") {
      if (!vAccess.canEdit && !vAccess.canAccess) {
        return sendJson(res, 403, { error: "Muddatni bajarildi deb belgilash huquqi yo'q" });
      }
      const body = await readJsonBody(req);
      const item = await completeSchedule(schedDoneMatch[1], body, actor);
      return sendJson(res, 200, { item });
    }

    const schedSnoozeMatch = pathname.match(/^\/vaqf-api\/schedules\/(\d+)\/snooze$/);
    if (schedSnoozeMatch && method === "POST") {
      if (!vAccess.canEdit && !vAccess.canAccess) {
        return sendJson(res, 403, { error: "Muddatni kechiktirish huquqi yo'q" });
      }
      const body = await readJsonBody(req);
      const item = await snoozeSchedule(schedSnoozeMatch[1], Number(body.days || 3), actor);
      return sendJson(res, 200, { item });
    }

    const schedDelMatch = pathname.match(/^\/vaqf-api\/schedules\/(\d+)$/);
    if (schedDelMatch && method === "DELETE") {
      if (!vAccess.canEdit) {
        return sendJson(res, 403, { error: "Muddatni o'chirish huquqi yo'q" });
      }
      const result = await deleteSchedule(schedDelMatch[1], actor);
      return sendJson(res, 200, result);
    }

    // ========================================================================
    // 6-BOSQICH: SYSTEM OPS & MULTI-TEMPLATE IMPORT (/vaqf-api/ops/*, /vaqf-api/import/*)
    // ========================================================================
    if (pathname === "/vaqf-api/ops/backup" && method === "POST") {
      if (!vAccess.isDirector) {
        return sendJson(res, 403, { error: "Zaxira nusxa olish faqat Direktor uchun" });
      }
      const body = await readJsonBody(req);
      const result = await runVaqfBackup({
        requireSeparateDisk: Boolean(body.requireSeparateDisk),
        triggeredBy: actor.actorId,
      });
      return sendJson(res, 200, result);
    }

    if (pathname === "/vaqf-api/ops/restore-test" && method === "POST") {
      if (!vAccess.isDirector) {
        return sendJson(res, 403, { error: "Restore test o'tkazish faqat Direktor uchun" });
      }
      const result = await runWeeklyRestoreTest({ triggeredBy: actor.actorId });
      return sendJson(res, 200, result);
    }

    if (pathname === "/vaqf-api/ops/verify-pii-key" && method === "POST") {
      if (!vAccess.isDirector) {
        return sendJson(res, 403, { error: "PII kalitni tekshirish faqat Direktor uchun" });
      }
      const body = await readJsonBody(req);
      const result = await verifyVaqfPiiKey(body.candidateKey || undefined);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    if (pathname === "/vaqf-api/ops/rotate-pii-key" && method === "POST") {
      if (!vAccess.isDirector) {
        return sendJson(res, 403, { error: "PII kalitni aylantirish faqat Direktor uchun" });
      }
      const body = await readJsonBody(req);
      const result = await rotateVaqfPiiKey({
        currentKey: body.currentKey,
        nextKey: body.nextKey,
        actor,
      });
      return sendJson(res, 200, result);
    }

    if (pathname === "/vaqf-api/ops/monitoring-check" && method === "POST") {
      if (!vAccess.isDirector) {
        return sendJson(res, 403, { error: "Monitoring tekshiruvi faqat Direktor uchun" });
      }
      const result = await runSystemMonitoringChecks();
      return sendJson(res, 200, result);
    }

    if (pathname === "/vaqf-api/ops/migration-broadcast" && method === "POST") {
      if (!vAccess.isDirector) {
        return sendJson(res, 403, { error: "O'tish e'lonini yuborish faqat Direktor uchun" });
      }
      const result = await sendOneTimeBotMigrationNotice({ actor });
      return sendJson(res, 200, result);
    }

    const multiTplMatch = pathname.match(/^\/vaqf-api\/import\/templates\/(locations|assets|roles|properties|schedules)$/);
    if (multiTplMatch && method === "GET") {
      if (!vAccess.canView) {
        return sendJson(res, 403, { error: "Import shablonini yuklab olish huquqi yo'q" });
      }
      const tplType = multiTplMatch[1];
      const { buffer, fileName } = await generateMultiImportTemplateBuffer(tplType);
      res.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      });
      res.end(buffer);
      return;
    }

    const multiImpMatch = pathname.match(/^\/vaqf-api\/import\/(locations|roles|properties|schedules)$/);
    if (multiImpMatch && method === "POST") {
      if (!vAccess.canEdit) {
        return sendJson(res, 403, { error: "Excel import qilish huquqi yo'q" });
      }
      const tplType = multiImpMatch[1];
      const body = await readJsonBody(req);
      const result = await previewOrCommitMultiImport(tplType, body, actor, vAccess);
      return sendJson(res, 200, result);
    }

    // ========================================================================
    // 4-BOSQICH: DIRECTOR DASHBOARD (/vaqf-api/dashboard)
    // ========================================================================
    if (pathname === "/vaqf-api/dashboard" && method === "GET") {
      if (!vAccess.canView) {
        return sendJson(res, 403, { error: "Bosh sahifa statistikasini ko'rish huquqi yo'q" });
      }
      const institutionId = url.searchParams.get("institution_id") || "all";
      const [data, governance] = await Promise.all([
        getDirectorDashboardData({ institutionId }),
        getGovernanceDashboardSummary({ institutionId }),
      ]);
      return sendJson(res, 200, { ...data, governance });
    }

    // Allow asset search (`GET /vaqf-api/bot/search`) for any user with Vaqf access (including staff in bot `/qidir`)
    if (pathname === "/vaqf-api/bot/search" && method === "GET" && (vAccess.canView || vAccess.canAccess || vAccess.canCount)) {
      const search = url.searchParams.get("search") || "";
      const limit = Number(url.searchParams.get("limit") || 10);
      const result = await listAssets({ search, limit });
      return sendJson(res, 200, result);
    }

    // Allow QR lookup by code (`GET /vaqf-api/assets/by-code/:code`) for any user with Vaqf access (including staff/bot/MiniApp)
    const byCodeEarlyMatch = pathname.match(/^\/vaqf-api\/assets\/by-code\/([^/]+)$/);
    if (byCodeEarlyMatch && method === "GET" && (vAccess.canView || vAccess.canAccess || vAccess.canCount)) {
      const code = decodeURIComponent(byCodeEarlyMatch[1]);
      const asset = await getAssetDetail(code, { byCode: true });
      return sendJson(res, 200, { asset });
    }

    // ========================================================================
    // 1-QADAM: ROLES & SETTINGS (/vaqf-api/roles, /vaqf-api/settings)
    // ========================================================================
    if (pathname === "/vaqf-api/roles" && method === "GET") {
      if (!vAccess.canView) {
        return sendJson(res, 403, { error: "Rollar ro'yxatini ko'rish huquqi yo'q" });
      }
      const [rolesData, staff] = await Promise.all([listUserRolesAndHistory(), listResponsibleStaff()]);
      return sendJson(res, 200, { ...rolesData, staff });
    }

    if (pathname === "/vaqf-api/roles" && method === "POST") {
      if (!vAccess.canManageRoles && !vAccess.isDirector) {
        return sendJson(res, 403, { error: "Foydalanuvchi rollarini boshqarish faqat Direktor uchun" });
      }
      const body = await readJsonBody(req);
      const roleRow = await assignUserRole(body, actor);
      return sendJson(res, 201, { role: roleRow });
    }

    const roleDeleteMatch = pathname.match(/^\/vaqf-api\/roles\/(\d+)$/);
    if ((roleDeleteMatch || pathname === "/vaqf-api/roles") && method === "DELETE") {
      if (!vAccess.canManageRoles && !vAccess.isDirector) {
        return sendJson(res, 403, { error: "Foydalanuvchi rolini bekor qilish faqat Direktor uchun" });
      }
      const id = roleDeleteMatch ? roleDeleteMatch[1] : url.searchParams.get("id");
      const note = url.searchParams.get("note") || null;
      const result = await revokeUserRole(id, actor, note);
      return sendJson(res, 200, result);
    }

    if (pathname === "/vaqf-api/settings" && method === "GET") {
      if (!vAccess.canView) {
        return sendJson(res, 403, { error: "Sozlamalarni ko'rish huquqi yo'q" });
      }
      const settings = await getVaqfSettings();
      return sendJson(res, 200, settings);
    }

    if (pathname === "/vaqf-api/settings" && (method === "PATCH" || method === "POST")) {
      if (!vAccess.canManageRoles && !vAccess.isDirector) {
        return sendJson(res, 403, { error: "Sozlamalarni o'zgartirish faqat Direktor uchun" });
      }
      const body = await readJsonBody(req);
      const settings = await updateVaqfSettings(body, actor);
      return sendJson(res, 200, settings);
    }

    // ========================================================================
    // 3-QADAM: STAFF SELF-SERVICE & FAULT REPORTS (/vaqf-api/my/*, /vaqf-api/faults*)
    // ========================================================================
    if (pathname === "/vaqf-api/my/assets" && method === "GET") {
      const items = await getMyAssignedAssets(sess, accessContext);
      return sendJson(res, 200, { items });
    }

    if (pathname === "/vaqf-api/my/pending" && method === "GET") {
      const items = await getMyPendingDocuments(sess, accessContext);
      return sendJson(res, 200, { items });
    }

    const assetFaultMatch = pathname.match(/^\/vaqf-api\/assets\/(\d+)\/fault$/);
    if (assetFaultMatch && method === "POST") {
      const body = await readJsonBody(req);
      const fault = await createFaultReport(assetFaultMatch[1], body, sess, accessContext);
      return sendJson(res, 201, { fault });
    }

    const faultPhotoMatch = pathname.match(/^\/vaqf-api\/faults\/(\d+)\/photo$/);
    if (faultPhotoMatch && method === "GET") {
      const filePath = await getFaultPhotoFile(faultPhotoMatch[1]);
      const content = await fsp.readFile(filePath);
      res.writeHead(200, {
        "Content-Type": filePath.endsWith(".png") ? "image/png" : "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      });
      res.end(content);
      return;
    }

    if (pathname === "/vaqf-api/faults" && method === "GET") {
      if (!vAccess.canView) {
        return sendJson(res, 403, { error: "Nosozliklar ro'yxatini ko'rish huquqi yo'q" });
      }
      const filters = Object.fromEntries(url.searchParams.entries());
      const items = await listFaultReports(filters);
      return sendJson(res, 200, { items });
    }

    const faultPatchMatch = pathname.match(/^\/vaqf-api\/faults\/(\d+)$/);
    if (faultPatchMatch && method === "PATCH") {
      if (!vAccess.canEdit) {
        return sendJson(res, 403, { error: "Nosozlik holatini o'zgartirish huquqi yo'q" });
      }
      const body = await readJsonBody(req);
      const fault = await updateFaultReportStatus(faultPatchMatch[1], body, actor);
      return sendJson(res, 200, { fault });
    }

    // ========================================================================
    // 3-QADAM: APPROVALS & EMPLOYEE ASSETS (/vaqf-api/approvals, /vaqf-api/people/:ref/assets)
    // ========================================================================
    if (pathname === "/vaqf-api/approvals" && method === "GET") {
      if (!vAccess.canView) {
        return sendJson(res, 403, { error: "Tasdiqlar ro'yxatini ko'rish huquqi yo'q" });
      }
      const items = await listPendingApprovals();
      return sendJson(res, 200, { items });
    }

    const peopleAssetsMatch = pathname.match(/^\/vaqf-api\/people\/([^/]+)\/assets$/);
    if (peopleAssetsMatch && method === "GET") {
      if (!vAccess.canView) {
        return sendJson(res, 403, { error: "Xodim buyumlarini ko'rish huquqi yo'q" });
      }
      const personRef = decodeURIComponent(peopleAssetsMatch[1]);
      const items = await getPersonAssignedAssets(personRef);
      return sendJson(res, 200, { items });
    }

    // ========================================================================
    // 3-QADAM & 5-QADAM: DOCUMENTS (/vaqf-api/documents/*)
    // ========================================================================
    if (pathname === "/vaqf-api/documents" || pathname.startsWith("/vaqf-api/documents/")) {
      // Recipient confirmation endpoint is open to any authenticated employee (checked against to_person_ref inside)
      const docConfirmMatch = pathname.match(/^\/vaqf-api\/documents\/(\d+)\/confirm$/);
      if (docConfirmMatch && method === "POST") {
        const body = await readJsonBody(req);
        const detail = await confirmDocumentByRecipient(docConfirmMatch[1], body, req, sess, accessContext);
        return sendJson(res, 200, detail);
      }

      // PDF download endpoint: allowed for canView OR if the user is recipient/sender of the document
      const docPdfMatch = pathname.match(/^\/vaqf-api\/documents\/(\d+)\/pdf$/);
      if (docPdfMatch && method === "GET") {
        const docId = docPdfMatch[1];
        const detail = await getDocumentDetail(docId);
        if (!vAccess.canView) {
          const userRefs = extractSessionCandidateRefs(sess, accessContext);
          const toRef = String(detail.to_person_ref || "").trim().toLowerCase();
          const toName = String(detail.to_person_name || "").trim().toLowerCase();
          const fromRef = String(detail.from_person_ref || "").trim().toLowerCase();
          const fromName = String(detail.from_person_name || "").trim().toLowerCase();
          const isParticipant =
            (toRef && userRefs.has(toRef)) ||
            (toName && userRefs.has(toName)) ||
            (fromRef && userRefs.has(fromRef)) ||
            (fromName && userRefs.has(fromName));
          if (!isParticipant) {
            return sendJson(res, 403, { error: "Ushbu dalolatnoma PDF faylini yuklab olish huquqi yo'q" });
          }
        }
        const lang = url.searchParams.get("lang") || "tr";
        const pdfBuf = await generateLifecycleDocumentPdfBuffer(docId, { lang });
        res.writeHead(200, {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="ezan-vakfi-${detail.doc_no}-${lang}.pdf"`,
          "Cache-Control": "no-store",
        });
        res.end(pdfBuf);
        return;
      }

      // Single document detail GET: allowed for canView OR participant
      const docItemMatch = pathname.match(/^\/vaqf-api\/documents\/(\d+)$/);
      if (docItemMatch && method === "GET") {
        const detail = await getDocumentDetail(docItemMatch[1]);
        if (!vAccess.canView) {
          const userRefs = extractSessionCandidateRefs(sess, accessContext);
          const toRef = String(detail.to_person_ref || "").trim().toLowerCase();
          const toName = String(detail.to_person_name || "").trim().toLowerCase();
          const fromRef = String(detail.from_person_ref || "").trim().toLowerCase();
          const fromName = String(detail.from_person_name || "").trim().toLowerCase();
          const isParticipant =
            (toRef && userRefs.has(toRef)) ||
            (toName && userRefs.has(toName)) ||
            (fromRef && userRefs.has(fromRef)) ||
            (fromName && userRefs.has(fromName));
          if (!isParticipant) {
            return sendJson(res, 403, { error: "Ushbu hujjatni ko'rish huquqi yo'q" });
          }
        }
        return sendJson(res, 200, detail);
      }

      // List documents
      if (pathname === "/vaqf-api/documents" && method === "GET") {
        if (!vAccess.canView && !vAccess.canAccess) {
          return sendJson(res, 403, { error: "Hujjatlar ro'yxatini ko'rish huquqi yo'q" });
        }
        const filters = Object.fromEntries(url.searchParams.entries());
        const items = await listDocuments(filters, sess, accessContext, vAccess);
        return sendJson(res, 200, { items });
      }

      // Create draft document (and optionally auto-submit if body.submit = true)
      if (pathname === "/vaqf-api/documents" && method === "POST") {
        if (!vAccess.canManageDocuments && !vAccess.canEdit) {
          return sendJson(res, 403, { error: "Yangi hujjat yaratish huquqi yo'q" });
        }
        const body = await readJsonBody(req);
        let detail = await createDocument(body, actor);
        if (body.submit) {
          detail = await submitDocument(detail.id, body, actor);
        }
        return sendJson(res, 201, detail);
      }

      // Update draft document
      if (docItemMatch && method === "PATCH") {
        if (!vAccess.canManageDocuments && !vAccess.canEdit) {
          return sendJson(res, 403, { error: "Hujjatni tahrirlash huquqi yo'q" });
        }
        const body = await readJsonBody(req);
        const detail = await updateDocument(docItemMatch[1], body, actor);
        return sendJson(res, 200, detail);
      }

      // Sub-actions on `/vaqf-api/documents/:id/(submit|complete-repair|approve|reject|cancel)`
      const docActionMatch = pathname.match(
        /^\/vaqf-api\/documents\/(\d+)\/(submit|complete-repair|approve|reject|cancel)$/
      );
      if (docActionMatch && method === "POST") {
        const [, docId, action] = docActionMatch;
        const body = await readJsonBody(req);

        if (action === "submit") {
          if (!vAccess.canManageDocuments && !vAccess.canEdit) {
            return sendJson(res, 403, { error: "Hujjatni yuborish huquqi yo'q" });
          }
          const detail = await submitDocument(docId, body, actor);
          return sendJson(res, 200, detail);
        }

        if (action === "complete-repair") {
          if (!vAccess.canManageDocuments && !vAccess.canEdit) {
            return sendJson(res, 403, { error: "Ta'mir hujjatini yakunlash huquqi yo'q" });
          }
          const detail = await completeRepairDocument(docId, body, actor);
          return sendJson(res, 200, detail);
        }

        if (action === "approve") {
          const detail = await approveDocument(docId, body, actor, vAccess);
          return sendJson(res, 200, detail);
        }

        if (action === "reject") {
          const detail = await rejectDocument(docId, body, actor, vAccess);
          return sendJson(res, 200, detail);
        }

        if (action === "cancel") {
          if (!vAccess.canManageDocuments && !vAccess.canEdit) {
            return sendJson(res, 403, { error: "Hujjatni bekor qilish huquqi yo'q" });
          }
          const detail = await cancelDocument(docId, body, actor);
          return sendJson(res, 200, detail);
        }
      }

      return sendJson(res, 404, { error: `Hujjatlar API endpoint topilmadi: ${method} ${pathname}` });
    }

    // ========================================================================
    // INVENTORY COUNTS (/vaqf-api/counts/*)
    // ========================================================================
    if (pathname === "/vaqf-api/counts" || pathname.startsWith("/vaqf-api/counts/")) {
      if (!vAccess.canView && !vAccess.canCount) {
        return sendJson(res, 403, { error: "Inventarizatsiya bo'limiga kirish huquqi yo'q" });
      }

      // Scope preview before starting a count
      if (pathname === "/vaqf-api/counts/preview-scope" && (method === "GET" || method === "POST")) {
        if (!vAccess.canManageCounts) {
          return sendJson(res, 403, { error: "Sanoq qamrovini ko'rish huquqi yo'q" });
        }
        const body = method === "POST" ? await readJsonBody(req) : {};
        const institutionId = Number(body.institution_id || url.searchParams.get("institution_id") || 1);
        const locIdsRaw = body.location_ids || (url.searchParams.get("location_ids") || "").split(",").filter(Boolean);
        const catIdsRaw = body.category_ids || (url.searchParams.get("category_ids") || "").split(",").filter(Boolean);
        const preview = await resolveAssetsAndLocationsInScope(institutionId, {
          location_ids: locIdsRaw,
          category_ids: catIdsRaw,
        });
        return sendJson(res, 200, preview);
      }

      // List counts
      if (pathname === "/vaqf-api/counts" && method === "GET") {
        const filters = Object.fromEntries(url.searchParams.entries());
        const items = await listCounts(filters, vAccess);
        return sendJson(res, 200, { items });
      }

      // Create draft count
      if (pathname === "/vaqf-api/counts" && method === "POST") {
        if (!vAccess.canManageCounts) {
          return sendJson(res, 403, { error: "Yangi sanoq yaratish huquqi yo'q" });
        }
        const body = await readJsonBody(req);
        const detail = await createCount(body, actor);
        return sendJson(res, 201, detail);
      }

      // Count item photo upload / serve
      const itemPhotoMatch = pathname.match(/^\/vaqf-api\/counts\/(\d+)\/items\/(\d+)\/photo$/);
      if (itemPhotoMatch && method === "POST") {
        if (!vAccess.canCount) {
          return sendJson(res, 403, { error: "Sanoqda rasm yuklash huquqi yo'q" });
        }
        const body = await readJsonBody(req);
        const item = await uploadCountItemPhoto(itemPhotoMatch[1], itemPhotoMatch[2], body, sess, accessContext, vAccess);
        return sendJson(res, 200, { item });
      }
      if (itemPhotoMatch && method === "GET") {
        const filePath = await getCountItemPhotoFile(itemPhotoMatch[1], itemPhotoMatch[2]);
        const content = await fsp.readFile(filePath);
        res.writeHead(200, {
          "Content-Type": filePath.endsWith(".png") ? "image/png" : "image/jpeg",
          "Cache-Control": "private, max-age=3600",
        });
        res.end(content);
        return;
      }

      // Decision on single item or batch (`PATCH /vaqf-api/counts/:id/items/:itemId/decision` or `PATCH /vaqf-api/counts/:id/decisions`)
      const itemDecisionMatch = pathname.match(/^\/vaqf-api\/counts\/(\d+)\/items\/([^/]+)\/decision$/);
      const batchDecisionMatch = pathname.match(/^\/vaqf-api\/counts\/(\d+)\/decisions$/);
      if ((itemDecisionMatch || batchDecisionMatch) && method === "PATCH") {
        if (!vAccess.canManageCounts) {
          return sendJson(res, 403, { error: "Farqlar bo'yicha qaror qabul qilish huquqi yo'q" });
        }
        const countId = itemDecisionMatch ? itemDecisionMatch[1] : batchDecisionMatch[1];
        const itemIdOrBatch = itemDecisionMatch ? itemDecisionMatch[2] : "batch";
        const body = await readJsonBody(req);
        const result = await setCountDecisions(countId, itemIdOrBatch, body);
        return sendJson(res, 200, result);
      }

      // Mark location done (`POST /vaqf-api/counts/:id/locations/:locId/done`)
      const locDoneMatch = pathname.match(/^\/vaqf-api\/counts\/(\d+)\/locations\/(\d+)\/done$/);
      if (locDoneMatch && method === "POST") {
        if (!vAccess.canCount) {
          return sendJson(res, 403, { error: "Sanoqda joyni yakunlash huquqi yo'q" });
        }
        const result = await markCountLocationDone(locDoneMatch[1], locDoneMatch[2], sess, accessContext, vAccess);
        return sendJson(res, 200, result);
      }

      // Sub-actions on `/vaqf-api/counts/:id/<subaction>`
      const countActionMatch = pathname.match(
        /^\/vaqf-api\/counts\/(\d+)\/(start|my|scans|extra|submit|discrepancies|approve|cancel|report\.pdf|report\.xlsx)$/
      );
      if (countActionMatch) {
        const [, countId, action] = countActionMatch;

        if (action === "start" && method === "POST") {
          if (!vAccess.canManageCounts) {
            return sendJson(res, 403, { error: "Sanoqni boshlash huquqi yo'q" });
          }
          const detail = await startCount(countId, actor);
          return sendJson(res, 200, detail);
        }

        if (action === "my" && method === "GET") {
          const data = await getMyCountData(countId, sess, accessContext, vAccess);
          return sendJson(res, 200, data);
        }

        if (action === "scans" && method === "POST") {
          const body = await readJsonBody(req);
          const result = await processCountScans(countId, body, sess, accessContext, vAccess);
          return sendJson(res, 200, result);
        }

        if (action === "extra" && method === "POST") {
          const body = await readJsonBody(req);
          const item = await addExtraCountItem(countId, body, sess, accessContext, vAccess);
          return sendJson(res, 201, { item });
        }

        if (action === "submit" && method === "POST") {
          if (!vAccess.canManageCounts && !vAccess.canCount) {
            return sendJson(res, 403, { error: "Sanoqni ko'rib chiqishga yuborish huquqi yo'q" });
          }
          const detail = await submitCountForReview(countId, actor);
          return sendJson(res, 200, detail);
        }

        if (action === "discrepancies" && method === "GET") {
          if (!vAccess.canManageCounts && !vAccess.canView) {
            return sendJson(res, 403, { error: "Farqlar ro'yxatini ko'rish huquqi yo'q" });
          }
          const data = await getCountDiscrepancies(countId);
          return sendJson(res, 200, data);
        }

        if (action === "approve" && method === "POST") {
          if (!vAccess.canApprove && !vAccess.isDirector) {
            return sendJson(res, 403, { error: "Sanoqni tasdiqlash faqat Direktor uchun" });
          }
          const body = await readJsonBody(req);
          const detail = await approveCount(countId, body, actor);
          return sendJson(res, 200, detail);
        }

        if (action === "cancel" && method === "POST") {
          if (!vAccess.canManageCounts) {
            return sendJson(res, 403, { error: "Sanoqni bekor qilish huquqi yo'q" });
          }
          const body = await readJsonBody(req);
          const detail = await cancelCount(countId, body, actor);
          return sendJson(res, 200, detail);
        }

        if (action === "report.pdf" && method === "GET") {
          if (!vAccess.canView) {
            return sendJson(res, 403, { error: "Dalolatnomani yuklab olish huquqi yo'q" });
          }
          const lang = url.searchParams.get("lang") || "tr";
          const pdfBuf = await generateCountReportPdfBuffer(countId, { lang });
          res.writeHead(200, {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="ezan-vakfi-sayim-${countId}-${lang}.pdf"`,
            "Cache-Control": "no-store",
          });
          res.end(pdfBuf);
          return;
        }

        if (action === "report.xlsx" && method === "GET") {
          if (!vAccess.canView) {
            return sendJson(res, 403, { error: "Excel hisobotni yuklab olish huquqi yo'q" });
          }
          const xlsxBuf = await generateCountReportExcelBuffer(countId);
          res.writeHead(200, {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="ezan-vakfi-sayim-${countId}.xlsx"`,
            "Cache-Control": "no-store",
          });
          res.end(xlsxBuf);
          return;
        }
      }

      // Single count GET / PATCH (`/vaqf-api/counts/:id`)
      const countItemMatch = pathname.match(/^\/vaqf-api\/counts\/(\d+)$/);
      if (countItemMatch && method === "GET") {
        const detail = await getCountDetail(countItemMatch[1], vAccess);
        return sendJson(res, 200, detail);
      }
      if (countItemMatch && method === "PATCH") {
        if (!vAccess.canManageCounts) {
          return sendJson(res, 403, { error: "Sanoqni tahrirlash huquqi yo'q" });
        }
        const body = await readJsonBody(req);
        const detail = await updateCount(countItemMatch[1], body, actor);
        return sendJson(res, 200, detail);
      }

      return sendJson(res, 404, { error: `Sanoq API endpoint topilmadi: ${method} ${pathname}` });
    }

    // Categories GET is also allowed for active count scanners (for adding extra items)
    if (pathname === "/vaqf-api/categories" && method === "GET" && (vAccess.canView || vAccess.canCount)) {
      const items = await listCategories();
      return sendJson(res, 200, { items });
    }

    // --- PROTECTED FILE SERVING (/srv/data/vaqf/*) ---
    // Allowed for any user with Vaqf access (including staff viewing their assigned asset photo)
    const fileServeMatch = pathname.match(/^\/vaqf-api\/files\/(photos|documents)\/(\d+)$/);
    if (fileServeMatch && method === "GET" && (vAccess.canView || vAccess.canAccess)) {
      const [, kind, fileId] = fileServeMatch;
      const meta = await getProtectedFile(kind, fileId);
      const content = await fsp.readFile(meta.file_path);
      const safeName = encodeURIComponent(meta.file_name || "file");
      res.writeHead(200, {
        "Content-Type": meta.mime_type || "application/octet-stream",
        "Content-Disposition": `inline; filename*=UTF-8''${safeName}`,
        "Cache-Control": "private, max-age=3600",
      });
      res.end(content);
      return;
    }

    // ========================================================================
    // 5-BOSQICH: VAQF BOSHQARUVI (Hadyalar, Ko'chmas mulk, Ijara, Arxiv, Kurul, Yillik Hisobot)
    // ========================================================================
    if (!vAccess.canView) {
      return sendJson(res, 403, { error: "Vaqf tizimiga kirish huquqi yo'q" });
    }

    // --- GOVERNANCE SETTINGS ---
    if (pathname === "/vaqf-api/governance/settings" && method === "GET") {
      const settings = await getGovernanceSettings();
      return sendJson(res, 200, settings);
    }
    if (pathname === "/vaqf-api/governance/settings" && method === "PATCH") {
      if (!vAccess.isDirector) {
        return sendJson(res, 403, { error: "Vaqf boshqaruvi shablon va qoidalarini faqat Direktor o'zgartira oladi" });
      }
      const body = await readJsonBody(req);
      const settings = await updateGovernanceSetting(body.key, body.value, actor);
      return sendJson(res, 200, settings);
    }

    // --- 1-QADAM: DONORS & DONATIONS (BAĞIŞ) ---
    if (pathname === "/vaqf-api/donors" && method === "GET") {
      const search = url.searchParams.get("search") || "";
      const items = await listDonors({ search, vAccess });
      return sendJson(res, 200, { items });
    }
    if (pathname === "/vaqf-api/donors" && method === "POST") {
      const body = await readJsonBody(req);
      const donor = await createDonor(body, actor, vAccess);
      return sendJson(res, 201, { donor });
    }
    const donorAnonMatch = pathname.match(/^\/vaqf-api\/donors\/(\d+)\/anonymize$/);
    if (donorAnonMatch && method === "POST") {
      const donor = await anonymizeDonor(donorAnonMatch[1], actor, vAccess);
      return sendJson(res, 200, { donor });
    }
    const donorDetailMatch = pathname.match(/^\/vaqf-api\/donors\/(\d+)$/);
    if (donorDetailMatch && method === "GET") {
      const donor = await getDonorDetail(donorDetailMatch[1], vAccess);
      return sendJson(res, 200, { donor });
    }

    if (pathname === "/vaqf-api/donations" && method === "GET") {
      const institutionId = url.searchParams.get("institution_id") || null;
      const kind = url.searchParams.get("kind") || null;
      const restricted = url.searchParams.get("restricted");
      const source = url.searchParams.get("source") || null;
      const items = await listDonations({ institutionId, kind, restricted, source, vAccess });
      return sendJson(res, 200, { items });
    }
    if (pathname === "/vaqf-api/donations" && method === "POST") {
      const body = await readJsonBody(req);
      const donation = await createDonation(body, actor, vAccess);
      return sendJson(res, 201, { donation });
    }
    if (pathname === "/vaqf-api/donations/export.xlsx" && method === "GET") {
      const institutionId = url.searchParams.get("institution_id") || null;
      const buf = await exportDonationsExcel({ institutionId, vAccess });
      res.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ezan-vakfi-bagislar.xlsx"`,
        "Cache-Control": "no-store",
      });
      res.end(buf);
      return;
    }
    const donReceiptMatch = pathname.match(/^\/vaqf-api\/donations\/(\d+)\/receipt\.pdf$/);
    if (donReceiptMatch && method === "GET") {
      const lang = url.searchParams.get("lang") || "tr";
      const { buffer, fileName } = await generateDonationReceiptPdf(donReceiptMatch[1], { lang, actor, vAccess });
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "no-store",
      });
      res.end(buffer);
      return;
    }
    const donSpendMatch = pathname.match(/^\/vaqf-api\/donations\/(\d+)\/spend$/);
    if (donSpendMatch && method === "POST") {
      const body = await readJsonBody(req);
      const donation = await addDonationSpendLink(donSpendMatch[1], body, actor, vAccess);
      return sendJson(res, 200, { donation });
    }
    const donDetailMatch = pathname.match(/^\/vaqf-api\/donations\/(\d+)$/);
    if (donDetailMatch && method === "GET") {
      const donation = await getDonationDetail(donDetailMatch[1], vAccess);
      return sendJson(res, 200, { donation });
    }

    // --- 2-QADAM: PROPERTIES & LEASES ---
    if (pathname === "/vaqf-api/properties" && method === "GET") {
      const institutionId = url.searchParams.get("institution_id") || null;
      const items = await listProperties({ institutionId });
      return sendJson(res, 200, { items });
    }
    if (pathname === "/vaqf-api/properties" && method === "POST") {
      const body = await readJsonBody(req);
      const property = await createProperty(body, actor, vAccess);
      return sendJson(res, 201, { property });
    }
    const propDetailMatch = pathname.match(/^\/vaqf-api\/properties\/(\d+)$/);
    if (propDetailMatch && method === "GET") {
      const property = await getPropertyDetail(propDetailMatch[1], vAccess);
      return sendJson(res, 200, { property });
    }

    if (pathname === "/vaqf-api/leases" && method === "GET") {
      const propertyId = url.searchParams.get("property_id") || null;
      const institutionId = url.searchParams.get("institution_id") || null;
      const direction = url.searchParams.get("direction") || null;
      const items = await listLeases({ propertyId, institutionId, direction, vAccess });
      return sendJson(res, 200, { items });
    }
    if (pathname === "/vaqf-api/leases" && method === "POST") {
      const body = await readJsonBody(req);
      const lease = await createLease(body, actor, vAccess);
      return sendJson(res, 201, { lease });
    }
    if (pathname === "/vaqf-api/leases/check-overdue" && method === "POST") {
      const body = await readJsonBody(req);
      const result = await checkLeaseRemindersAndOverdue({ referenceDateStr: body.referenceDateStr });
      return sendJson(res, 200, result);
    }
    const leasePayMatch = pathname.match(/^\/vaqf-api\/leases\/(\d+)\/payments\/(\d+)$/);
    if (leasePayMatch && method === "POST") {
      const body = await readJsonBody(req);
      const lease = await recordLeasePayment(leasePayMatch[1], leasePayMatch[2], body, actor, vAccess);
      return sendJson(res, 200, { lease });
    }
    const leaseDetailMatch = pathname.match(/^\/vaqf-api\/leases\/(\d+)$/);
    if (leaseDetailMatch && method === "GET") {
      const lease = await getLeaseDetail(leaseDetailMatch[1], vAccess);
      return sendJson(res, 200, { lease });
    }

    // --- 3-QADAM: ARCHIVE DOCUMENTS ---
    if (pathname === "/vaqf-api/archive" && method === "GET") {
      const category = url.searchParams.get("category") || null;
      const institutionId = url.searchParams.get("institution_id") || null;
      const items = await listArchiveDocuments({ category, institutionId, vAccess });
      return sendJson(res, 200, { items });
    }
    if (pathname === "/vaqf-api/archive" && method === "POST") {
      const body = await readJsonBody(req);
      const document = await createArchiveDocument(body, actor, vAccess);
      return sendJson(res, 201, { document });
    }
    const archVerMatch = pathname.match(/^\/vaqf-api\/archive\/(\d+)\/versions$/);
    if (archVerMatch && method === "POST") {
      const body = await readJsonBody(req);
      const document = await uploadArchiveNewVersion(archVerMatch[1], body, actor, vAccess);
      return sendJson(res, 200, { document });
    }
    const archDlMatch = pathname.match(/^\/vaqf-api\/archive\/(\d+)\/download$/);
    if (archDlMatch && method === "GET") {
      const versionNo = url.searchParams.get("version") || null;
      const ipAddress = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || null;
      const { buffer, fileName, mimeType } = await downloadArchiveDocument(archDlMatch[1], {
        versionNo,
        actor,
        vAccess,
        ipAddress,
      });
      res.writeHead(200, {
        "Content-Type": mimeType || "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        "Cache-Control": "no-store",
      });
      res.end(buffer);
      return;
    }
    const archDetailMatch = pathname.match(/^\/vaqf-api\/archive\/(\d+)$/);
    if (archDetailMatch && method === "GET") {
      const document = await getArchiveDocumentDetail(archDetailMatch[1], vAccess);
      return sendJson(res, 200, { document });
    }

    // --- 4-QADAM: YÖNETİM KURULU (BOARD MEMBERS, MEETINGS, DECISIONS) ---
    if (pathname === "/vaqf-api/board/members" && method === "GET") {
      const items = await listBoardMembers();
      return sendJson(res, 200, { items });
    }
    if (pathname === "/vaqf-api/board/members" && method === "POST") {
      const body = await readJsonBody(req);
      const member = await createBoardMember(body, actor, vAccess);
      return sendJson(res, 201, { member });
    }
    if (pathname === "/vaqf-api/board/meetings" && method === "GET") {
      const items = await listBoardMeetings();
      return sendJson(res, 200, { items });
    }
    if (pathname === "/vaqf-api/board/meetings" && method === "POST") {
      const body = await readJsonBody(req);
      const meeting = await createBoardMeeting(body, actor, vAccess);
      return sendJson(res, 201, { meeting });
    }
    if (pathname === "/vaqf-api/board/decisions" && method === "GET") {
      const year = url.searchParams.get("year") || null;
      const status = url.searchParams.get("status") || null;
      const items = await listBoardDecisions({ year, status });
      return sendJson(res, 200, { items });
    }
    if (pathname === "/vaqf-api/board/decisions" && method === "POST") {
      const body = await readJsonBody(req);
      const decision = await createBoardDecision(body, actor, vAccess);
      return sendJson(res, 201, { decision });
    }
    const bdPdfMatch = pathname.match(/^\/vaqf-api\/board\/decisions\/(\d+)\/pdf$/);
    if (bdPdfMatch && method === "GET") {
      const lang = url.searchParams.get("lang") || "tr";
      const { buffer, fileName } = await generateBoardDecisionPdf(bdPdfMatch[1], { lang });
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "no-store",
      });
      res.end(buffer);
      return;
    }

    // --- 5-QADAM: YILLIK VAQF HISOBOTI (DATA, PDF, EXCEL) ---
    if (pathname === "/vaqf-api/reports/annual" && method === "GET") {
      const year = Number(url.searchParams.get("year") || new Date().getFullYear());
      const data = await getAnnualVaqfReportData({ year, vAccess });
      return sendJson(res, 200, data);
    }
    if (pathname === "/vaqf-api/reports/annual.pdf" && method === "GET") {
      const year = Number(url.searchParams.get("year") || new Date().getFullYear());
      const lang = url.searchParams.get("lang") || "tr";
      const { buffer, fileName } = await generateAnnualVaqfReportPdf({ year, lang, vAccess });
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "no-store",
      });
      res.end(buffer);
      return;
    }
    if (pathname === "/vaqf-api/reports/annual.xlsx" && method === "GET") {
      const year = Number(url.searchParams.get("year") || new Date().getFullYear());
      const buf = await exportAnnualVaqfReportExcel({ year, vAccess });
      res.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Ezan_Vakfi_Yillik_Rapor_${year}.xlsx"`,
        "Cache-Control": "no-store",
      });
      res.end(buf);
      return;
    }

    const isWriteMethod = method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE";
    if (isWriteMethod && !vAccess.canEdit) {
      return sendJson(res, 403, { error: "Vaqf ma'lumotlarini o'zgartirish huquqi yo'q" });
    }

    // --- INSTITUTIONS ---
    if (pathname === "/vaqf-api/institutions" && method === "GET") {
      const items = await listInstitutions();
      return sendJson(res, 200, { items });
    }
    if (pathname === "/vaqf-api/institutions" && method === "POST") {
      const body = await readJsonBody(req);
      const item = await createInstitution(body);
      return sendJson(res, 201, { item });
    }
    const instPatchMatch = pathname.match(/^\/vaqf-api\/institutions\/(\d+)$/);
    if ((instPatchMatch || pathname === "/vaqf-api/institutions") && method === "PATCH") {
      const body = await readJsonBody(req);
      const id = instPatchMatch ? instPatchMatch[1] : body.id;
      const item = await updateInstitution(id, body);
      return sendJson(res, 200, { item });
    }

    // --- LOCATIONS ---
    if (pathname === "/vaqf-api/locations" && method === "GET") {
      const institutionId = url.searchParams.get("institution_id") || undefined;
      const items = await listLocations({ institutionId });
      return sendJson(res, 200, { items });
    }
    if (pathname === "/vaqf-api/locations" && method === "POST") {
      const body = await readJsonBody(req);
      const result = await createLocation(body);
      return sendJson(res, 201, result.synced ? result : { item: result });
    }
    const locIdMatch = pathname.match(/^\/vaqf-api\/locations\/(\d+)$/);
    if ((locIdMatch || pathname === "/vaqf-api/locations") && method === "PATCH") {
      const body = await readJsonBody(req);
      const id = locIdMatch ? locIdMatch[1] : body.id;
      const item = await updateLocation(id, body);
      return sendJson(res, 200, { item });
    }
    if ((locIdMatch || pathname === "/vaqf-api/locations") && method === "DELETE") {
      const id = locIdMatch ? locIdMatch[1] : url.searchParams.get("id");
      const result = await deleteLocation(id);
      return sendJson(res, 200, result);
    }

    // --- CATEGORIES ---
    if (pathname === "/vaqf-api/categories" && method === "GET") {
      const items = await listCategories();
      return sendJson(res, 200, { items });
    }
    if (pathname === "/vaqf-api/categories" && method === "POST") {
      const body = await readJsonBody(req);
      const item = await createCategory(body);
      return sendJson(res, 201, { item });
    }
    const catIdMatch = pathname.match(/^\/vaqf-api\/categories\/(\d+)$/);
    if ((catIdMatch || pathname === "/vaqf-api/categories") && method === "PATCH") {
      const body = await readJsonBody(req);
      const id = catIdMatch ? catIdMatch[1] : body.id;
      const item = await updateCategory(id, body);
      return sendJson(res, 200, { item });
    }

    // --- ASSETS EXPORT & IMPORT TEMPLATE ---
    if (pathname === "/vaqf-api/assets/export" && method === "GET") {
      const filters = Object.fromEntries(url.searchParams.entries());
      const buf = await exportAssetsExcelBuffer(filters);
      const dateStr = new Date().toISOString().slice(0, 10);
      res.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ezan-vaqf-mulk-${dateStr}.xlsx"`,
        "Cache-Control": "no-store",
      });
      res.end(buf);
      return;
    }

    if (pathname === "/vaqf-api/import/template" && method === "GET") {
      const buf = await generateImportTemplateBuffer();
      res.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="ezan-vaqf-import-shablon.xlsx"',
        "Cache-Control": "no-store",
      });
      res.end(buf);
      return;
    }

    if (pathname === "/vaqf-api/import/assets" && method === "POST") {
      const body = await readJsonBody(req);
      const result = await previewOrCommitAssetImport(body, actor);
      return sendJson(res, 200, result);
    }

    // --- QR BY CODE ---
    const byCodeMatch = pathname.match(/^\/vaqf-api\/assets\/by-code\/([^/]+)$/);
    if (byCodeMatch && method === "GET") {
      const code = decodeURIComponent(byCodeMatch[1]);
      const asset = await getAssetDetail(code, { byCode: true });
      return sendJson(res, 200, { asset });
    }

    // --- ASSET PHOTOS & DOCUMENTS ---
    const photoAddMatch = pathname.match(/^\/vaqf-api\/assets\/(\d+)\/photos$/);
    if (photoAddMatch && method === "POST") {
      const body = await readJsonBody(req);
      const photo = await addAssetPhoto(photoAddMatch[1], body, actor);
      return sendJson(res, 201, { photo });
    }

    const docAddMatch = pathname.match(/^\/vaqf-api\/assets\/(\d+)\/documents$/);
    if (docAddMatch && method === "POST") {
      const body = await readJsonBody(req);
      const document = await addAssetDocument(docAddMatch[1], body, actor);
      return sendJson(res, 201, { document });
    }

    // --- ASSETS LIST & CREATE ---
    if (pathname === "/vaqf-api/assets" && method === "GET") {
      const filters = Object.fromEntries(url.searchParams.entries());
      const result = await listAssets(filters);
      return sendJson(res, 200, result);
    }

    if (pathname === "/vaqf-api/assets" && method === "POST") {
      const body = await readJsonBody(req);
      const asset = await createAsset(body, actor);
      return sendJson(res, 201, { asset });
    }

    // --- ASSET ITEM GET / PATCH / DELETE ---
    const assetItemMatch = pathname.match(/^\/vaqf-api\/assets\/(\d+)$/);
    if (assetItemMatch && method === "GET") {
      const asset = await getAssetDetail(assetItemMatch[1]);
      return sendJson(res, 200, { asset });
    }
    if (assetItemMatch && method === "PATCH") {
      const body = await readJsonBody(req);
      const asset = await updateAsset(assetItemMatch[1], body, actor);
      return sendJson(res, 200, { asset });
    }
    if (assetItemMatch && method === "DELETE") {
      let reason = url.searchParams.get("reason") || null;
      try {
        const body = await readJsonBody(req);
        if (body.reason) reason = body.reason;
      } catch {}
      const result = await softDeleteAsset(assetItemMatch[1], actor, reason);
      return sendJson(res, 200, result);
    }

    // --- QR LABELS PDF (supports mode=assets & mode=locations) ---
    if (pathname === "/vaqf-api/labels" && method === "GET") {
      const rawIds = String(url.searchParams.get("ids") || url.searchParams.get("location_ids") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const mode = url.searchParams.get("mode") === "locations" ? "locations" : "assets";
      const proto = req.headers["x-forwarded-proto"] || "http";
      const host = req.headers["x-forwarded-host"] || req.headers.host || "192.168.1.10:3000";
      const baseUrl = url.searchParams.get("base_url") || `${proto}://${host}`;
      const preset = url.searchParams.get("preset") || "a4_3x8";
      const cols = url.searchParams.get("cols") || undefined;
      const rows = url.searchParams.get("rows") || undefined;
      const widthMm = url.searchParams.get("width_mm") || undefined;
      const heightMm = url.searchParams.get("height_mm") || undefined;

      const pdfBuf = await generateQrLabelsPdfBuffer({
        ids: rawIds,
        mode,
        baseUrl,
        preset,
        cols,
        rows,
        widthMm,
        heightMm,
      });
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="ezan-vaqf-${mode}-qr-yorliqlar.pdf"`,
        "Cache-Control": "no-store",
      });
      res.end(pdfBuf);
      return;
    }

    // --- REPORTS (1-BOSQICH SUMMARY & 6-QADAM LIFECYCLE REPORTS) ---
    if (pathname === "/vaqf-api/reports/summary" && method === "GET") {
      const institutionId = url.searchParams.get("institution_id") || undefined;
      const summary = await getSummaryReport({ institutionId });
      return sendJson(res, 200, summary);
    }

    if (pathname === "/vaqf-api/reports/lifecycle" && method === "GET") {
      const filters = Object.fromEntries(url.searchParams.entries());
      const report = await getLifecycleReports(filters);
      return sendJson(res, 200, report);
    }

    if (pathname === "/vaqf-api/reports/assignments.xlsx" && method === "GET") {
      const institutionId = Number(url.searchParams.get("institution_id") || 1);
      const buf = await generateAssignmentsExcelBuffer(institutionId);
      const dateStr = new Date().toISOString().slice(0, 10);
      res.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ezan-vakfi-zimmatlar-${dateStr}.xlsx"`,
        "Cache-Control": "no-store",
      });
      res.end(buf);
      return;
    }

    if (pathname === "/vaqf-api/reports/assignments.pdf" && method === "GET") {
      const institutionId = Number(url.searchParams.get("institution_id") || 1);
      const lang = url.searchParams.get("lang") || "tr";
      const buf = await generateAssignmentsPdfBuffer(institutionId, { lang });
      const dateStr = new Date().toISOString().slice(0, 10);
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="ezan-vakfi-zimmatlar-${dateStr}-${lang}.pdf"`,
        "Cache-Control": "no-store",
      });
      res.end(buf);
      return;
    }

    return sendJson(res, 404, { error: `Vaqf API endpoint topilmadi: ${method} ${pathname}` });
  } catch (err) {
    console.error(`[VAQF API ERROR] ${method} ${pathname}:`, err.message);
    return sendJson(res, err.status || 500, {
      error: err.message || "Ichki server xatosi",
      ...(err.details ? { details: err.details } : {}),
    });
  }
}
