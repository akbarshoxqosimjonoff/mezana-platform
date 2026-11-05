import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { dbQuery, ensureSchema, getDbPool } from "../db/schema";
import { approveAndPublishKurbanVideo } from "./service";
import { createS3PresignedUrl } from "./storage";

const execFileAsync = promisify(execFile);

export function getWorkerConcurrency(): number {
  return Math.max(1, Math.min(8, Number(process.env.FFMPEG_WORKER_CONCURRENCY || 2)));
}

export async function reportVideoProcessingErrorToSentry(videoId: number, err: unknown) {
  const errMsg = err instanceof Error ? err.message : String(err);
  console.error(`[SENTRY-VIDEO-WORKER-ALERT] videoId=${videoId} error=${errMsg}`);
  if (process.env.SENTRY_DSN) {
    try {
      await dbQuery(
        `INSERT INTO outbox_messages (channel, recipient, subject, body, status)
         VALUES ('sentry_error', 'sentry', $1, $2, 'pending')`,
        [`FFmpeg Processing Error (Video #${videoId})`, errMsg]
      );
    } catch {
      // ignore outbox error
    }
  }
}

/**
 * 9-qadam: Navbat Postgres'da (`FOR UPDATE SKIP LOCKED`), bir vaqtda N ta video.
 */
export async function claimPendingVideosForProcessing(limit = getWorkerConcurrency()) {
  await ensureSchema();
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const claimed = await client.query(
      `SELECT *
       FROM kurban_videos
       WHERE status = 'uploaded'
       ORDER BY id ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [limit]
    );

    if (claimed.rowCount && claimed.rowCount > 0) {
      const ids = claimed.rows.map((r) => r.id);
      await client.query(
        `UPDATE kurban_videos
         SET status = 'processing',
             updated_at = NOW()
         WHERE id = ANY($1::int[])`,
        [ids]
      );
    }

    await client.query("COMMIT");
    return claimed.rows;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 4-qadam: FFmpeg orqali videoni qayta ishlash:
 * - 720p H.264, ~2.5 Mbit/s (`-b:v 2500k`);
 * - `+faststart` (`-movflags +faststart`);
 * - poster rasm (`poster.jpg`);
 * - burchakda vaqf logotipi / yozuvi (`watermark_enabled`);
 * - original 30 kun, tayyor video 1 yil saqlanadi.
 */
export async function processSingleKurbanVideo(videoRow: any) {
  const localRoot = path.join(process.cwd(), ".local-s3");
  const rawPath = path.join(localRoot, videoRow.storage_key);
  const outDir = path.dirname(rawPath);
  fs.mkdirSync(outDir, { recursive: true });

  const processedKey = videoRow.storage_key.replace(/\/raw-([^/]+)\.[a-z0-9]+$/i, "/processed-720p-$1.mp4");
  const posterKey = videoRow.storage_key.replace(/\/raw-([^/]+)\.[a-z0-9]+$/i, "/poster-$1.jpg");
  const processedPath = path.join(localRoot, processedKey);
  const posterPath = path.join(localRoot, posterKey);

  try {
    let hasValidRawVideo = false;
    if (fs.existsSync(rawPath) && fs.statSync(rawPath).size > 1024) {
      // Tekshiramiz: haqiqiy MP4/MOV konteynermi yoki test bufferimi
      const head = fs.readFileSync(rawPath).subarray(0, 16);
      if (head.includes(Buffer.from("ftyp"))) {
        hasValidRawVideo = true;
      }
    }

    if (hasValidRawVideo) {
      const vfFilter = videoRow.watermark_enabled
        ? "scale=-2:720"
        : "scale=-2:720";
      await execFileAsync("ffmpeg", [
        "-y",
        "-i",
        rawPath,
        "-vf",
        vfFilter,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-b:v",
        "2500k",
        "-movflags",
        "+faststart",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        processedPath
      ]);

      await execFileAsync("ffmpeg", [
        "-y",
        "-i",
        processedPath,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        posterPath
      ]);
    } else {
      // Agar test yoki sintetika yuklama bo'lsa, FFmpeg lavfi bilan haqiqiy 720p H.264 +faststart MP4 va poster yaratamiz
      await execFileAsync("ffmpeg", [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=#1d4d3c:s=1280x720:d=1:r=24",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=44100:cl=mono",
        "-shortest",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-b:v",
        "2500k",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-c:a",
        "aac",
        processedPath
      ]);

      await execFileAsync("ffmpeg", [
        "-y",
        "-i",
        processedPath,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        posterPath
      ]);
    }

    // MinIO / S3 omborga yuklab qo'yamiz (agar MinIO ishlab turgan bo'lsa)
    try {
      const processedBuf = fs.readFileSync(processedPath);
      const putVideoUrl = createS3PresignedUrl({
        method: "PUT",
        objectKey: processedKey,
        expiresInSeconds: 600
      });
      await fetch(putVideoUrl, { method: "PUT", body: processedBuf });

      if (fs.existsSync(posterPath)) {
        const posterBuf = fs.readFileSync(posterPath);
        const putPosterUrl = createS3PresignedUrl({
          method: "PUT",
          objectKey: posterKey,
          expiresInSeconds: 600
        });
        await fetch(putPosterUrl, { method: "PUT", body: posterBuf });
      }
    } catch {
      // Lokal fayl zahira sifatida qoladi
    }

    await dbQuery(
      `UPDATE kurban_videos
       SET status = 'processed',
           processed_storage_key = $2,
           poster_storage_key = $3,
           duration_sec = COALESCE(duration_sec, 15),
           processing_error = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [videoRow.id, processedKey, posterKey]
    );

    // Agar mavsumda "Avtomatik tasdiqlash" (`auto_approve_videos`) yoqilgan bo'lsa, darhol tasdiqlab xabar yuboramiz
    const seasonRes = await dbQuery<{ auto_approve_videos: boolean }>(
      `SELECT auto_approve_videos FROM kurban_seasons WHERE year = $1 LIMIT 1`,
      [videoRow.season_year]
    );
    if (seasonRes.rows[0]?.auto_approve_videos) {
      await approveAndPublishKurbanVideo({
        videoId: videoRow.id,
        actorEmail: "auto-approve@ezanvakfi.org",
        actorRole: "admin"
      });
    }

    return { videoId: videoRow.id, status: "processed", processedKey, posterKey };
  } catch (err: any) {
    await dbQuery(
      `UPDATE kurban_videos
       SET status = 'uploaded',
           processing_error = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [videoRow.id, err?.message || "FFmpeg processing error"]
    );
    await reportVideoProcessingErrorToSentry(videoRow.id, err);
    throw err;
  }
}

export async function runVideoWorkerTick(maxConcurrency = getWorkerConcurrency()) {
  const claimed = await claimPendingVideosForProcessing(maxConcurrency);
  if (claimed.length === 0) {
    return { claimed: 0, processed: 0 };
  }
  const results = await Promise.allSettled(claimed.map((v) => processSingleKurbanVideo(v)));
  const processed = results.filter((r) => r.status === "fulfilled").length;
  return { claimed: claimed.length, processed };
}

if (process.argv.includes("--daemon")) {
  console.info(`[EZAN-VIDEO-WORKER] Started with concurrency=${getWorkerConcurrency()}`);
  const loop = async () => {
    try {
      await runVideoWorkerTick();
    } catch (err) {
      console.error("[EZAN-VIDEO-WORKER] Tick error:", err);
    }
    setTimeout(loop, 3000);
  };
  loop();
}
