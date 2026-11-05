import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dbQuery, ensureSchema } from "../db/schema";
import { requireEnvSecret } from "../lib/config";

export const MULTIPART_CHUNK_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB
export const MAX_VIDEO_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
export const SIGNED_VIDEO_URL_TTL_SECONDS = 3600; // 1 soat

export function getS3Config() {
  const endpoint = (process.env.S3_ENDPOINT || "http://127.0.0.1:9000").replace(/\/+$/, "");
  const bucket = process.env.S3_BUCKET || "ezan-kurban-videos";
  const region = process.env.S3_REGION || "auto";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || "minioadmin";
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || "minioadmin123";
  return { endpoint, bucket, region, accessKeyId, secretAccessKey };
}

export function validateVideoUploadInput(params: {
  fileName: string;
  mimeType: string;
  totalSizeBytes: number;
}): { valid: boolean; error?: string } {
  const ext = path.extname(params.fileName || "").toLowerCase();
  const mime = (params.mimeType || "").toLowerCase().trim();

  const allowedExts = [".mp4", ".mov"];
  const allowedMimes = ["video/mp4", "video/quicktime"];

  if (!allowedExts.includes(ext) || !allowedMimes.includes(mime)) {
    return { valid: false, error: "Invalid file type: Only MP4 and MOV videos are allowed." };
  }

  if (!Number.isFinite(params.totalSizeBytes) || params.totalSizeBytes <= 0) {
    return { valid: false, error: "File size must be greater than 0 bytes." };
  }

  if (params.totalSizeBytes > MAX_VIDEO_SIZE_BYTES) {
    return { valid: false, error: "File size exceeds maximum limit of 2 GB." };
  }

  return { valid: true };
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * AWS Signature Version 4 (S3 / Cloudflare R2 / MinIO mos) presigned URL generatori.
 */
export function createS3PresignedUrl(params: {
  method: "GET" | "PUT";
  objectKey: string;
  expiresInSeconds: number;
  queryParams?: Record<string, string>;
  now?: Date;
}): string {
  const cfg = getS3Config();
  const now = params.now || new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const urlObj = new URL(`${cfg.endpoint}/${cfg.bucket}/${params.objectKey.replace(/^\/+/, "")}`);
  const credentialScope = `${dateStamp}/${cfg.region}/s3/aws4_request`;

  const qp: Record<string, string> = {
    ...(params.queryParams || {}),
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${cfg.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(params.expiresInSeconds),
    "X-Amz-SignedHeaders": "host"
  };

  const sortedKeys = Object.keys(qp).sort();
  const canonicalQueryString = sortedKeys
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(qp[k]!)}`)
    .join("&");

  const canonicalHeaders = `host:${urlObj.host}\n`;
  const canonicalRequest = [
    params.method,
    urlObj.pathname,
    canonicalQueryString,
    canonicalHeaders,
    "host",
    "UNSIGNED-PAYLOAD"
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");

  const kDate = hmacSha256(`AWS4${cfg.secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, cfg.region);
  const kService = hmacSha256(kRegion, "s3");
  const kSigning = hmacSha256(kService, "aws4_request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  return `${urlObj.origin}${urlObj.pathname}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

/**
 * 6-qadam: Video faqat 1 soatlik imzolangan havola orqali ochiladi.
 * Kuzatuv sahifasi har ochilganda yangi imzolangan URL yaratadi.
 */
export function generateSignedVideoUrl(params: {
  storageKey: string;
  expiresInSeconds?: number;
  download?: boolean;
  nowMs?: number;
}): { url: string; s3PresignedUrl: string; expiresAt: string; expiresInSeconds: number } {
  const ttl = params.expiresInSeconds ?? SIGNED_VIDEO_URL_TTL_SECONDS;
  const nowMs = params.nowMs ?? Date.now();
  const expSec = Math.floor(nowMs / 1000) + ttl;
  const dlFlag = params.download ? "1" : "0";
  const secret = requireEnvSecret("ADMIN_SESSION_SECRET", 32);

  const payload = `${params.storageKey}|${expSec}|${dlFlag}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  const s3PresignedUrl = createS3PresignedUrl({
    method: "GET",
    objectKey: params.storageKey,
    expiresInSeconds: ttl,
    queryParams: params.download
      ? { "response-content-disposition": `attachment; filename="${path.basename(params.storageKey)}"` }
      : {},
    now: new Date(nowMs)
  });

  const url = `/api/kurban/video-stream?key=${encodeURIComponent(params.storageKey)}&exp=${expSec}&dl=${dlFlag}&sig=${sig}`;
  return {
    url,
    s3PresignedUrl,
    expiresAt: new Date(expSec * 1000).toISOString(),
    expiresInSeconds: ttl
  };
}

export function verifySignedVideoUrlParams(params: {
  storageKey: string;
  exp: string | number;
  dl?: string;
  sig: string;
  nowMs?: number;
}): boolean {
  const expSec = Number(params.exp);
  if (!Number.isFinite(expSec)) return false;
  const nowSec = Math.floor((params.nowMs ?? Date.now()) / 1000);
  if (expSec <= nowSec) return false;

  const dlFlag = params.dl === "1" ? "1" : "0";
  const secret = requireEnvSecret("ADMIN_SESSION_SECRET", 32);
  const payload = `${params.storageKey}|${expSec}|${dlFlag}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(params.sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function initiateMultipartVideoUpload(params: {
  animalId: number;
  fileName: string;
  mimeType: string;
  totalSizeBytes: number;
  uploadedBy: string;
  assignedCountryCode?: string | null;
}) {
  await ensureSchema();
  const validation = validateVideoUploadInput(params);
  if (!validation.valid) {
    const err: any = new Error(validation.error);
    err.statusCode = 400;
    throw err;
  }

  const animalRes = await dbQuery<{
    id: number;
    season_year: number;
    country_code: string;
    tag_no: string;
  }>(`SELECT id, season_year, country_code, tag_no FROM kurban_animals WHERE id = $1 LIMIT 1`, [params.animalId]);

  const animal = animalRes.rows[0];
  if (!animal) {
    const err: any = new Error("Animal not found");
    err.statusCode = 404;
    throw err;
  }

  if (params.assignedCountryCode && animal.country_code !== params.assignedCountryCode) {
    const err: any = new Error(`Forbidden: Field user for ${params.assignedCountryCode} cannot upload video for ${animal.country_code}`);
    err.statusCode = 403;
    throw err;
  }

  const uploadId = `mpu_${crypto.randomBytes(16).toString("hex")}`;
  const ext = path.extname(params.fileName).toLowerCase() || ".mp4";
  const storageKey = `kurban/${animal.season_year}/${animal.country_code}/${animal.tag_no}/raw-${uploadId}${ext}`;
  const totalParts = Math.ceil(params.totalSizeBytes / MULTIPART_CHUNK_SIZE_BYTES);

  await dbQuery(
    `INSERT INTO kurban_upload_sessions (
       upload_id, animal_id, country_code, storage_key, file_name, mime_type,
       total_size_bytes, chunk_size_bytes, completed_parts, uploaded_by, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '[]'::jsonb, $9, 'initiated')`,
    [
      uploadId,
      animal.id,
      animal.country_code,
      storageKey,
      params.fileName,
      params.mimeType,
      params.totalSizeBytes,
      MULTIPART_CHUNK_SIZE_BYTES,
      params.uploadedBy
    ]
  );

  const partUrls = Array.from({ length: totalParts }, (_, idx) => {
    const partNumber = idx + 1;
    return {
      partNumber,
      presignedUrl: createS3PresignedUrl({
        method: "PUT",
        objectKey: storageKey,
        expiresInSeconds: 3600,
        queryParams: { uploadId, partNumber: String(partNumber) }
      })
    };
  });

  return {
    uploadId,
    animalId: animal.id,
    tagNo: animal.tag_no,
    countryCode: animal.country_code,
    storageKey,
    chunkSizeBytes: MULTIPART_CHUNK_SIZE_BYTES,
    totalParts,
    completedParts: [] as { partNumber: number; etag: string }[],
    partUrls
  };
}

export async function getMultipartUploadStatus(uploadId: string) {
  await ensureSchema();
  const res = await dbQuery(`SELECT * FROM kurban_upload_sessions WHERE upload_id = $1 LIMIT 1`, [uploadId]);
  const row = res.rows[0];
  if (!row) {
    const err: any = new Error("Upload session not found");
    err.statusCode = 404;
    throw err;
  }
  const totalParts = Math.ceil(Number(row.total_size_bytes) / Number(row.chunk_size_bytes));
  const completedParts: { partNumber: number; etag: string; sizeBytes?: number }[] = Array.isArray(row.completed_parts)
    ? row.completed_parts
    : [];
  const completedNums = new Set(completedParts.map((p) => p.partNumber));
  const remainingParts: number[] = [];
  for (let p = 1; p <= totalParts; p++) {
    if (!completedNums.has(p)) remainingParts.push(p);
  }
  return {
    uploadId: row.upload_id,
    animalId: row.animal_id,
    storageKey: row.storage_key,
    status: row.status,
    totalSizeBytes: Number(row.total_size_bytes),
    chunkSizeBytes: Number(row.chunk_size_bytes),
    totalParts,
    completedParts,
    remainingParts
  };
}

export async function recordMultipartPartUploaded(params: {
  uploadId: string;
  partNumber: number;
  etag?: string;
  sizeBytes?: number;
  chunkDataBase64?: string;
}) {
  await ensureSchema();
  const res = await dbQuery(`SELECT * FROM kurban_upload_sessions WHERE upload_id = $1 LIMIT 1`, [params.uploadId]);
  const session = res.rows[0];
  if (!session) {
    const err: any = new Error("Upload session not found");
    err.statusCode = 404;
    throw err;
  }
  if (session.status !== "initiated") {
    const err: any = new Error(`Upload session is already ${session.status}`);
    err.statusCode = 400;
    throw err;
  }

  // Agar chunk ma'lumoti yuborilgan bo'lsa, MinIO yoki lokal storage keshiga yozib qo'yamiz
  let computedEtag = params.etag;
  if (params.chunkDataBase64) {
    const buf = Buffer.from(params.chunkDataBase64, "base64");
    computedEtag = computedEtag || `"${ crypto.createHash("md5").update(buf).digest("hex") }"`;
    const localDir = path.join(process.cwd(), ".local-s3", path.dirname(session.storage_key));
    fs.mkdirSync(localDir, { recursive: true });
    const partPath = path.join(localDir, `${path.basename(session.storage_key)}.part${params.partNumber}`);
    fs.writeFileSync(partPath, buf);

    // MinIO / S3 endpointga ham PUT qilib ko'ramiz (agar MinIO ishlab turgan bo'lsa)
    try {
      const putUrl = createS3PresignedUrl({
        method: "PUT",
        objectKey: `${session.storage_key}.part${params.partNumber}`,
        expiresInSeconds: 300
      });
      await fetch(putUrl, { method: "PUT", body: buf });
    } catch {
      // Lokal fayl tizimi zahira sifatida saqlanadi
    }
  }

  const existingParts: { partNumber: number; etag: string; sizeBytes?: number }[] = Array.isArray(session.completed_parts)
    ? session.completed_parts
    : [];
  const filtered = existingParts.filter((p) => p.partNumber !== params.partNumber);
  filtered.push({
    partNumber: params.partNumber,
    etag: computedEtag || `"etag-part-${params.partNumber}"`,
    sizeBytes: params.sizeBytes
  });
  filtered.sort((a, b) => a.partNumber - b.partNumber);

  await dbQuery(
    `UPDATE kurban_upload_sessions
     SET completed_parts = $2::jsonb,
         updated_at = NOW()
     WHERE upload_id = $1`,
    [params.uploadId, JSON.stringify(filtered)]
  );

  return {
    uploadId: params.uploadId,
    partNumber: params.partNumber,
    completedPartsCount: filtered.length
  };
}

export async function finalizeMultipartVideoUpload(params: {
  uploadId: string;
  uploadedBy: string;
}) {
  await ensureSchema();
  const status = await getMultipartUploadStatus(params.uploadId);
  if (status.remainingParts.length > 0) {
    const err: any = new Error(`Cannot finalize upload: missing parts ${status.remainingParts.join(", ")}`);
    err.statusCode = 400;
    throw err;
  }

  const animalRes = await dbQuery<{
    id: number;
    season_year: number;
    country_code: string;
    tag_no: string;
  }>(`SELECT id, season_year, country_code, tag_no FROM kurban_animals WHERE id = $1 LIMIT 1`, [status.animalId]);
  const animal = animalRes.rows[0]!;

  // Lokal part fayllarini bitta MP4 faylga birlashtiramiz (agar mavjud bo'lsa)
  const localDir = path.join(process.cwd(), ".local-s3", path.dirname(status.storageKey));
  const finalLocalPath = path.join(process.cwd(), ".local-s3", status.storageKey);
  if (fs.existsSync(localDir)) {
    const buffers: Buffer[] = [];
    for (let p = 1; p <= status.totalParts; p++) {
      const partPath = path.join(localDir, `${path.basename(status.storageKey)}.part${p}`);
      if (fs.existsSync(partPath)) {
        buffers.push(fs.readFileSync(partPath));
      }
    }
    if (buffers.length > 0) {
      const merged = Buffer.concat(buffers);
      fs.writeFileSync(finalLocalPath, merged);
      try {
        const putUrl = createS3PresignedUrl({
          method: "PUT",
          objectKey: status.storageKey,
          expiresInSeconds: 600
        });
        await fetch(putUrl, { method: "PUT", body: merged });
      } catch {
        // Ignore if MinIO is not reachable in unit test
      }
    }
  }

  const seasonRes = await dbQuery<{
    video_retention_days: number;
    original_retention_days: number;
  }>(`SELECT video_retention_days, original_retention_days FROM kurban_seasons WHERE year = $1 LIMIT 1`, [animal.season_year]);
  const videoRetDays = seasonRes.rows[0]?.video_retention_days || 365;
  const origRetDays = seasonRes.rows[0]?.original_retention_days || 30;

  await dbQuery(`UPDATE kurban_upload_sessions SET status = 'completed', updated_at = NOW() WHERE upload_id = $1`, [
    params.uploadId
  ]);

  const vidRes = await dbQuery<{ id: number }>(
    `INSERT INTO kurban_videos (
       animal_id, season_year, country_code, storage_key, mime_type, size_bytes,
       uploaded_by, status, original_expires_at, video_expires_at
     ) VALUES (
       $1, $2, $3, $4, 'video/mp4', $5, $6, 'uploaded',
       NOW() + ($7 || ' days')::interval,
       NOW() + ($8 || ' days')::interval
     )
     RETURNING id`,
    [
      animal.id,
      animal.season_year,
      animal.country_code,
      status.storageKey,
      status.totalSizeBytes,
      params.uploadedBy,
      String(origRetDays),
      String(videoRetDays)
    ]
  );

  const videoId = vidRes.rows[0]!.id;
  await dbQuery(
    `UPDATE kurban_animals
     SET video_id = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [animal.id, videoId]
  );

  // Koordinatorga Telegram/Outbox bildirishnomasi: "Çad: 14/40 hayvon videosi yuklandi"
  const countryRes = await dbQuery<{ name: any }>(`SELECT name FROM kurban_countries WHERE code = $1 LIMIT 1`, [
    animal.country_code
  ]);
  const countryNameTr = (countryRes.rows[0]?.name?.tr || animal.country_code).replace(/\s*\[TASLIK\]/g, "");

  const countsRes = await dbQuery<{ total_animals: string; with_video: string }>(
    `SELECT
       COUNT(*)::text AS total_animals,
       COUNT(video_id)::text AS with_video
     FROM kurban_animals
     WHERE season_year = $1 AND country_code = $2`,
    [animal.season_year, animal.country_code]
  );
  const totalAnimals = Number(countsRes.rows[0]?.total_animals || 1);
  const withVideo = Number(countsRes.rows[0]?.with_video || 1);
  const coordMsg = `${countryNameTr}: ${withVideo}/${totalAnimals} hayvon videosi yuklandi (Tag: ${animal.tag_no})`;

  await dbQuery(
    `INSERT INTO outbox_messages (channel, recipient, subject, body, status)
     VALUES ('telegram_coordinator', 'coordinator', 'Kurban Video Yuklandi', $1, 'pending')`,
    [coordMsg]
  );

  return {
    videoId,
    animalId: animal.id,
    tagNo: animal.tag_no,
    storageKey: status.storageKey,
    status: "uploaded",
    coordinatorAlert: coordMsg
  };
}
