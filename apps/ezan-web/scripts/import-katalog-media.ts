import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ensureSchema, dbQuery } from "../src/db/schema";

export interface KatalogManifestItem {
  fayl: string;
  katalog_sahifa: number | null;
  en: number | null;
  boy: number | null;
  turi: "foto" | "stok" | "skrinshot" | "dekor" | "logo";
  alt_tr: string;
  alt_uz: string;
  ishlatish: string[];
  izoh: string;
}

const FOCAL_POINTS: Record<string, { x: number; y: number }> = {
  "rasmlar/hakkimizda/mutevelli-heyet-baskani.jpg": { x: 0.5, y: 0.35 },
  "rasmlar/hakkimizda/mezana-kursusunde-konusmaci.jpg": { x: 0.5, y: 0.3 },
  "rasmlar/egitim/sinav-salonu-genis.jpg": { x: 0.5, y: 0.45 },
  "rasmlar/egitim/akademi-talebeleri-derste.jpg": { x: 0.5, y: 0.4 },
  "rasmlar/egitim/medrese-toplu-foto.jpg": { x: 0.5, y: 0.4 },
  "rasmlar/egitim/kadin-medresesi-talebeler.jpg": { x: 0.5, y: 0.45 },
  "rasmlar/yurt/talebeler-yemekte.jpg": { x: 0.5, y: 0.5 }
};

const CHILDREN_CONSENT_REQUIRED = new Set([
  "rasmlar/egitim/kuran-kursu-cocuklar.jpg",
  "rasmlar/yardim/mezana-konteyner-cocuklar.jpg"
]);

const ALT_EN_AR_TRANSLATIONS: Record<string, { en: string; ar: string }> = {
  "rasmlar/brand/ezan-vakfi-logo.svg": {
    en: "Ezan Foundation logo",
    ar: "شعار وقف أذان"
  },
  "rasmlar/brand/besmele-hat.png": {
    en: "Golden Basmala calligraphy",
    ar: "مخطوطة البسملة باللون الذهبي"
  },
  "rasmlar/hakkimizda/mutevelli-heyet-baskani.jpg": {
    en: "Chairman of the Board of Trustees speaking while seated",
    ar: "رئيس مجلس الأمناء يتحدث جالساً"
  },
  "rasmlar/hakkimizda/mezana-bina-dis-cephe.jpg": {
    en: "Exterior facade of the Mezana building",
    ar: "الواجهة الخارجية لمبنى ميزانا"
  },
  "rasmlar/hakkimizda/mezana-kursusunde-konusmaci.jpg": {
    en: "Speaker addressing the audience at the Mezana podium",
    ar: "متحدث يلقي كلمة على منبر ميزانا"
  },
  "rasmlar/egitim/sinav-salonu-genis.jpg": {
    en: "Students taking an exam in a wide hall",
    ar: "طلاب يؤدون الامتحان في قاعة واسعة"
  }
};

function buildFourLocaleAlt(item: KatalogManifestItem) {
  const custom = ALT_EN_AR_TRANSLATIONS[item.fayl];
  return {
    tr: item.alt_tr || "",
    uz: item.alt_uz || "",
    en: custom?.en || item.alt_tr || "Ezan Foundation visual",
    ar: custom?.ar || "صورة لوقف أذان"
  };
}

export async function runKatalogMediaImport(options?: {
  sourceRootDir?: string;
  publicDir?: string;
  skipRasterEncoding?: boolean;
}) {
  await ensureSchema();

  const appRoot = path.resolve(__dirname, "..");
  const manifestPath = path.join(appRoot, "src/cms/katalog-manifest.json");
  const sourceRoot =
    options?.sourceRootDir || path.join(appRoot, ".import/katalog/ezan-katalog");
  const publicDir = options?.publicDir || path.join(appRoot, "public");

  const manifest: KatalogManifestItem[] = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.length !== 62) {
    throw new Error(`Expected 62 items in manifest.json, found ${manifest.length}`);
  }

  let insertedCount = 0;
  let skippedExistingCount = 0;
  let skippedArxivCount = 0;

  for (const item of manifest) {
    if (item.fayl.includes("..") || path.isAbsolute(item.fayl)) {
      throw new Error(`Unsafe path detected in manifest: ${item.fayl}`);
    }

    // 7 ta arxiv/ skrinshotlari saytga import qilinmaydi
    if (item.fayl.startsWith("rasmlar/arxiv/")) {
      skippedArxivCount++;
      continue;
    }

    const existing = await dbQuery<{ id: number }>(
      `SELECT id FROM cms_media WHERE file_key = $1 LIMIT 1`,
      [item.fayl]
    );
    if (existing.rowCount > 0) {
      skippedExistingCount++;
      continue;
    }

    const srcFile = path.join(sourceRoot, item.fayl);
    const relSubpath = item.fayl.replace(/^rasmlar\//, "");
    const parsed = path.parse(relSubpath);
    const outSubdir = path.join(publicDir, "media/katalog", parsed.dir);
    fs.mkdirSync(outSubdir, { recursive: true });

    const focal = FOCAL_POINTS[item.fayl] || { x: 0.5, y: 0.5 };
    const consentVerified = !CHILDREN_CONSENT_REQUIRED.has(item.fayl);
    const isStock = item.turi === "stok";
    const needsReview = isStock
      ? { tr: true, uz: true, en: true, ar: true }
      : { tr: false, uz: false, en: true, ar: true };
    const altText = buildFourLocaleAlt(item);

    // SVG Logotip va Faviconlar
    if (item.turi === "logo" && item.fayl.endsWith(".svg")) {
      const publicLogoPath = path.join(publicDir, "ezan-vakfi-logo.svg");
      if (fs.existsSync(srcFile)) {
        fs.copyFileSync(srcFile, publicLogoPath);
        if (!options?.skipRasterEncoding) {
          await sharp(srcFile).resize(192, 192).png().toFile(path.join(publicDir, "icon-192.png"));
          await sharp(srcFile).resize(512, 512).png().toFile(path.join(publicDir, "icon-512.png"));
          await sharp(srcFile).resize(180, 180).png().toFile(path.join(publicDir, "apple-touch-icon.png"));
        }
      }

      await dbQuery(
        `INSERT INTO cms_media (
           file_key, file_url, mime_type, width, height, media_type, is_stock,
           consent_verified, catalog_page, focal_x, focal_y, usage_targets,
           variants, blur_data_url, alt_text, notes, needs_review
         ) VALUES (
           $1, $2, 'image/svg+xml', NULL, NULL, 'logo', FALSE,
           TRUE, NULL, 0.5, 0.5, $3::jsonb,
           $4::jsonb, NULL, $5::jsonb, $6, $7::jsonb
         )`,
        [
          item.fayl,
          "/ezan-vakfi-logo.svg",
          JSON.stringify(item.ishlatish),
          JSON.stringify({ svg: "/ezan-vakfi-logo.svg" }),
          JSON.stringify(altText),
          item.izoh,
          JSON.stringify(needsReview)
        ]
      );
      insertedCount++;
      continue;
    }

    const variants: Record<string, Record<string, string>> = {
      avif: {},
      webp: {},
      fallback: {}
    };
    let blurDataUrl = "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoUAA0AAUAmJaQAA3AA/vuUAAA=";
    let finalWidth = item.en || 800;
    let finalHeight = item.boy || 600;

    if (fs.existsSync(srcFile) && !options?.skipRasterEncoding) {
      let basePipeline = sharp(srcFile).rotate(); // auto-orient & strip EXIF
      const meta = await basePipeline.metadata();
      const origW = meta.width || item.en || 800;
      const origH = meta.height || item.boy || 600;

      // usulus-sunan-kitaplari.jpg pastki 8% qismini kesib tashlash (video pleyer chizig'i)
      if (item.fayl === "rasmlar/yayincilik/usulus-sunan-kitaplari.jpg") {
        const croppedH = Math.floor(origH * 0.92);
        basePipeline = basePipeline.extract({ left: 0, top: 0, width: origW, height: croppedH });
        finalWidth = origW;
        finalHeight = croppedH;
      } else {
        finalWidth = origW;
        finalHeight = origH;
      }

      const rawBuffer = await basePipeline.toBuffer();

      // 20px blur placeholder
      const blurBuf = await sharp(rawBuffer).resize(20).webp({ quality: 50 }).toBuffer();
      blurDataUrl = `data:image/webp;base64,${blurBuf.toString("base64")}`;

      const targetWidths = [480, 800, 1280, 1920].filter((w) => w <= finalWidth);
      if (targetWidths.length === 0) {
        targetWidths.push(finalWidth);
      }

      const isPng = parsed.ext.toLowerCase() === ".png";
      for (const w of targetWidths) {
        const baseNameW = `${parsed.name}-${w}`;
        const relUrlPrefix = `/media/katalog/${parsed.dir ? `${parsed.dir}/` : ""}${baseNameW}`;

        const avifPath = path.join(outSubdir, `${baseNameW}.avif`);
        if (!fs.existsSync(avifPath)) {
          await sharp(rawBuffer)
            .resize({ width: w, withoutEnlargement: true })
            .avif({ quality: 65, effort: 0 })
            .toFile(avifPath);
        }
        variants.avif[String(w)] = `${relUrlPrefix}.avif`;

        const webpPath = path.join(outSubdir, `${baseNameW}.webp`);
        if (!fs.existsSync(webpPath)) {
          await sharp(rawBuffer)
            .resize({ width: w, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(webpPath);
        }
        variants.webp[String(w)] = `${relUrlPrefix}.webp`;

        if (isPng) {
          const pngPath = path.join(outSubdir, `${baseNameW}.png`);
          if (!fs.existsSync(pngPath)) {
            await sharp(rawBuffer)
              .resize({ width: w, withoutEnlargement: true })
              .png({ compressionLevel: 9 })
              .toFile(pngPath);
          }
          variants.fallback[String(w)] = `${relUrlPrefix}.png`;
        } else {
          const jpgPath = path.join(outSubdir, `${baseNameW}.jpg`);
          if (!fs.existsSync(jpgPath)) {
            await sharp(rawBuffer)
              .resize({ width: w, withoutEnlargement: true })
              .jpeg({ quality: 82, progressive: true })
              .toFile(jpgPath);
          }
          variants.fallback[String(w)] = `${relUrlPrefix}.jpg`;
        }
      }
    } else {
      const targetWidths = [480, 800, 1280, 1920].filter((w) => w <= finalWidth);
      if (targetWidths.length === 0) targetWidths.push(finalWidth);
      const ext = parsed.ext.toLowerCase() === ".png" ? "png" : "jpg";
      for (const w of targetWidths) {
        const relUrlPrefix = `/media/katalog/${parsed.dir ? `${parsed.dir}/` : ""}${parsed.name}-${w}`;
        variants.avif[String(w)] = `${relUrlPrefix}.avif`;
        variants.webp[String(w)] = `${relUrlPrefix}.webp`;
        variants.fallback[String(w)] = `${relUrlPrefix}.${ext}`;
      }
    }

    const defaultWidthKey = Object.keys(variants.webp)[Math.min(1, Object.keys(variants.webp).length - 1)] || "480";
    const primaryUrl = variants.webp[defaultWidthKey] || `/media/katalog/${relSubpath}`;

    await dbQuery(
      `INSERT INTO cms_media (
         file_key, file_url, mime_type, width, height, media_type, is_stock,
         consent_verified, catalog_page, focal_x, focal_y, usage_targets,
         variants, blur_data_url, alt_text, notes, needs_review
       ) VALUES (
         $1, $2, 'image/webp', $3, $4, $5, $6,
         $7, $8, $9, $10, $11::jsonb,
         $12::jsonb, $13, $14::jsonb, $15, $16::jsonb
       )`,
      [
        item.fayl,
        primaryUrl,
        finalWidth,
        finalHeight,
        item.turi,
        isStock,
        consentVerified,
        item.katalog_sahifa,
        focal.x,
        focal.y,
        JSON.stringify(item.ishlatish),
        JSON.stringify(variants),
        blurDataUrl,
        JSON.stringify(altText),
        item.izoh,
        JSON.stringify(needsReview)
      ]
    );
    insertedCount++;
  }

  return {
    totalInManifest: manifest.length,
    insertedCount,
    skippedExistingCount,
    skippedArxivCount
  };
}

if (require.main === module) {
  runKatalogMediaImport()
    .then((res) => {
      console.log("[KATALOG MEDIA IMPORT COMPLETED]", JSON.stringify(res));
      process.exit(0);
    })
    .catch((err) => {
      console.error("[KATALOG MEDIA IMPORT FAILED]", err);
      process.exit(1);
    });
}
