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

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(body);
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
    const sess = getSession(req);
    if (!sess) {
      return sendJson(res, 401, { error: "Sessiya muddati tugagan. Iltimos, tizimga kiring." });
    }
    const accessContext = getSessionAccessContext(sess);
    const vAccess = await resolveVaqfAccessAsync(sess, accessContext);
    const actor = getActor(sess, accessContext);

    if (pathname === "/vaqf-api/me" && method === "GET") {
      if (!vAccess.canView && !vAccess.canCount) {
        return sendJson(res, 403, { error: "Vaqf tizimiga kirish huquqi yo'q", vaqfAccess: vAccess });
      }
      const staff = vAccess.canView ? await listResponsibleStaff() : [];
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
      });
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
          return sendJson(res, 403, { error: "Sanoq qamrovini ko'rish faqat Direktor uchun" });
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
          return sendJson(res, 403, { error: "Yangi sanoq yaratish faqat Direktor uchun" });
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
          return sendJson(res, 403, { error: "Farqlar bo'yicha qaror qabul qilish faqat Direktor uchun" });
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
            return sendJson(res, 403, { error: "Sanoqni boshlash faqat Direktor uchun" });
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
          if (!vAccess.canManageCounts) {
            return sendJson(res, 403, { error: "Farqlar ro'yxatini ko'rish faqat Direktor uchun" });
          }
          const data = await getCountDiscrepancies(countId);
          return sendJson(res, 200, data);
        }

        if (action === "approve" && method === "POST") {
          if (!vAccess.canManageCounts) {
            return sendJson(res, 403, { error: "Sanoqni tasdiqlash faqat Direktor uchun" });
          }
          const body = await readJsonBody(req);
          const detail = await approveCount(countId, body, actor);
          return sendJson(res, 200, detail);
        }

        if (action === "cancel" && method === "POST") {
          if (!vAccess.canManageCounts) {
            return sendJson(res, 403, { error: "Sanoqni bekor qilish faqat Direktor uchun" });
          }
          const body = await readJsonBody(req);
          const detail = await cancelCount(countId, body, actor);
          return sendJson(res, 200, detail);
        }

        if (action === "report.pdf" && method === "GET") {
          if (!vAccess.canManageCounts) {
            return sendJson(res, 403, { error: "Dalolatnomani yuklab olish faqat Direktor uchun" });
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
          if (!vAccess.canManageCounts) {
            return sendJson(res, 403, { error: "Excel hisobotni yuklab olish faqat Direktor uchun" });
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
          return sendJson(res, 403, { error: "Sanoqni tahrirlash faqat Direktor uchun" });
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

    // All non-count endpoints require full Vaqf view/edit permission
    if (!vAccess.canView) {
      return sendJson(res, 403, { error: "Vaqf tizimiga kirish huquqi yo'q" });
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

    // --- PROTECTED FILE SERVING (/srv/data/vaqf/*) ---
    const fileServeMatch = pathname.match(/^\/vaqf-api\/files\/(photos|documents)\/(\d+)$/);
    if (fileServeMatch && method === "GET") {
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

    // --- REPORTS SUMMARY ---
    if (pathname === "/vaqf-api/reports/summary" && method === "GET") {
      const institutionId = url.searchParams.get("institution_id") || undefined;
      const summary = await getSummaryReport({ institutionId });
      return sendJson(res, 200, summary);
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
