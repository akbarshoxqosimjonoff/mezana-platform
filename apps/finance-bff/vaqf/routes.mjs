import fsp from "node:fs/promises";
import {
  vaqfAccess,
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
    const vAccess = vaqfAccess(sess, accessContext);

    if (pathname === "/vaqf-api/me" && method === "GET") {
      if (!vAccess.canView) {
        return sendJson(res, 403, { error: "Vaqf tizimiga kirish huquqi yo'q", vaqfAccess: vAccess });
      }
      const staff = await listResponsibleStaff();
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

    if (!vAccess.canView) {
      return sendJson(res, 403, { error: "Vaqf tizimiga kirish huquqi yo'q" });
    }

    const isWriteMethod = method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE";
    if (isWriteMethod && !vAccess.canEdit) {
      return sendJson(res, 403, { error: "Vaqf ma'lumotlarini o'zgartirish huquqi yo'q" });
    }

    const actor = getActor(sess, accessContext);

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

    // --- QR LABELS PDF ---
    if (pathname === "/vaqf-api/labels" && method === "GET") {
      const rawIds = String(url.searchParams.get("ids") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
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
        baseUrl,
        preset,
        cols,
        rows,
        widthMm,
        heightMm,
      });
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="ezan-vaqf-qr-yorliqlar.pdf"',
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
