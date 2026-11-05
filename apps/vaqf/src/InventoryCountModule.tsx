import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ClipboardCheck,
  Plus,
  Play,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  QrCode,
  Camera,
  RefreshCw,
  FileDown,
  FileSpreadsheet,
  MapPin,
  Users,
  ArrowLeft,
  Check,
  X,
  Wifi,
  WifiOff,
  UploadCloud,
  PackagePlus,
  Tag,
  Eye,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

declare global {
  interface Window {
    BarcodeDetector?: any;
    jsQR?: (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;
  }
}

async function apiFetch(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body && typeof options.body === "string" ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/?next=${next}`;
    throw new Error("Sessiya muddati tugagan");
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Xatolik (${res.status})`);
    return data;
  }
  if (!res.ok) throw new Error(`Xatolik (${res.status})`);
  return res;
}

const COUNT_STATUS_META: Record<string, { label: string; badge: string }> = {
  draft: { label: "Qoralama", badge: "badge-slate" },
  in_progress: { label: "Jarayonda (Sanalmoqda)", badge: "badge-amber" },
  review: { label: "Ko'rib chiqilmoqda", badge: "badge-cyan" },
  approved: { label: "Tasdiqlangan", badge: "badge-emerald" },
  cancelled: { label: "Bekor qilingan", badge: "badge-rose" },
};

const LOC_STATUS_META: Record<string, { label: string; badge: string }> = {
  pending: { label: "Kutilmoqda", badge: "badge-slate" },
  counting: { label: "Sanalmoqda", badge: "badge-amber" },
  done: { label: "Tugadi", badge: "badge-emerald" },
};

const RESULT_META: Record<string, { label: string; badge: string; color: string }> = {
  pending: { label: "Kutilmoqda", badge: "badge-slate", color: "#64748b" },
  found: { label: "Joyida topildi", badge: "badge-emerald", color: "#10b981" },
  moved: { label: "Boshqa joydan topildi", badge: "badge-amber", color: "#f59e0b" },
  missing: { label: "Topilmadi (Yo'qolgan)", badge: "badge-rose", color: "#f43f5e" },
  extra: { label: "Ro'yxatda yo'q (Yangi)", badge: "badge-cyan", color: "#06b6d4" },
  qty_diff: { label: "Miqdor farqi", badge: "badge-amber", color: "#d97706" },
  damaged: { label: "Shikastlangan", badge: "badge-rose", color: "#e11d48" },
};

const DECISION_META: Record<string, { label: string; desc: string }> = {
  apply: { label: "Qo'llash (Yangilash)", desc: "Joyi, miqdori yoki yangi kartochkani tasdiqlash" },
  mark_missing: { label: "Yo'qolgan deb belgilash", desc: "Buyum holatini 'Topilmagan (missing)' qilish" },
  ignore: { label: "E'tiborsiz qoldirish", desc: "Buyum kartochkasini o'zgartirmaslik" },
};

function fmtDateTime(val?: string | null) {
  if (!val) return "—";
  try {
    return new Date(val).toISOString().replace("T", " ").slice(0, 16);
  } catch {
    return String(val);
  }
}

// ============================================================================
// INDEXED-DB OFFLINE STORAGE FOR MOBILE SCANNER
// ============================================================================
const IDB_NAME = "ezan_vaqf_scanner_v1";
const STORE_CACHE = "count_cache";
const STORE_QUEUE = "scan_queue";

function openScannerDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: "countId" });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const qs = db.createObjectStore(STORE_QUEUE, { keyPath: "clientScanId" });
        qs.createIndex("by_count", "countId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveCountCacheToIdb(countId: number, data: any) {
  try {
    const db = await openScannerDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_CACHE, "readwrite");
      tx.objectStore(STORE_CACHE).put({ countId: Number(countId), data, savedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

async function loadCountCacheFromIdb(countId: number): Promise<any | null> {
  try {
    const db = await openScannerDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_CACHE, "readonly");
      const req = tx.objectStore(STORE_CACHE).get(Number(countId));
      req.onsuccess = () => resolve(req.result?.data || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export interface QueuedScanItem {
  clientScanId: string;
  countId: number;
  kind: "scan" | "extra";
  payload: any;
  createdAt: number;
}

async function enqueueScanToIdb(item: QueuedScanItem) {
  const db = await openScannerDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, "readwrite");
    tx.objectStore(STORE_QUEUE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function listQueuedScansFromIdb(countId: number): Promise<QueuedScanItem[]> {
  try {
    const db = await openScannerDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_QUEUE, "readonly");
      const idx = tx.objectStore(STORE_QUEUE).index("by_count");
      const req = idx.getAll(Number(countId));
      req.onsuccess = () => {
        const arr = (req.result || []) as QueuedScanItem[];
        arr.sort((a, b) => a.createdAt - b.createdAt);
        resolve(arr);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

async function removeQueuedScansFromIdb(clientScanIds: string[]) {
  if (!clientScanIds.length) return;
  try {
    const db = await openScannerDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_QUEUE, "readwrite");
      const store = tx.objectStore(STORE_QUEUE);
      for (const id of clientScanIds) store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

// ============================================================================
// AUDIO & VIBRATION FEEDBACK FOR MOBILE SCANNER
// ============================================================================
function playScanFeedback(kind: "found" | "moved" | "already_scanned" | "unknown_code") {
  try {
    if (navigator.vibrate) {
      if (kind === "found") navigator.vibrate(70);
      else if (kind === "moved") navigator.vibrate([90, 50, 90]);
      else if (kind === "already_scanned") navigator.vibrate(40);
      else navigator.vibrate([160, 70, 160]);
    }
  } catch {}

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.15, now);

    if (kind === "found") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1174, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (kind === "moved") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.setValueAtTime(520, now + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.start(now);
      osc.stop(now + 0.28);
    } else if (kind === "already_scanned") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.14);
    } else {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.setValueAtTime(180, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    }
  } catch {}
}

// ============================================================================
// STEP 4: MOBILE SCANNER PAGE (/vaqf/count/:id)
// ============================================================================
export function MobileCountScannerPage({
  countId,
  user,
  vaqfAccess,
  notify,
  onExitScanner,
  onBackToAdmin,
}: {
  countId: number;
  user?: any;
  vaqfAccess?: any;
  notify: (msg: string, type?: "ok" | "err") => void;
  onExitScanner?: () => void;
  onBackToAdmin?: () => void;
}) {
  const handleExit = onExitScanner || onBackToAdmin || (() => { window.location.href = "/vaqf/"; });
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [countData, setCountData] = useState<any>(null);
  const [selectedLocId, setSelectedLocId] = useState<number>(0);
  const [queueItems, setQueueItems] = useState<QueuedScanItem[]>([]);
  const [syncing, setSyncing] = useState(false);

  // Camera & Manual input state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string>("");
  const [manualCode, setManualCode] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastScanRef = useRef<{ code: string; time: number }>({ code: "", time: 0 });

  // Last scan visual feedback banner
  const [scanBanner, setScanBanner] = useState<{
    color: "green" | "yellow" | "blue" | "red";
    title: string;
    subtitle: string;
    code?: string;
    asset?: any;
    clientScanId?: string;
  } | null>(null);

  // Batch / Details modal after scan
  const [detailModal, setDetailModal] = useState<{
    open: boolean;
    asset: any;
    countedQty: string;
    condition: string;
    note: string;
    photoDataUrl: string;
    needsRelabel: boolean;
    isMoved: boolean;
  } | null>(null);

  // Extra (unlisted) item modal
  const [extraModal, setExtraModal] = useState<{
    open: boolean;
    scannedCode: string;
    name: string;
    category_id: string;
    counted_qty: string;
    unit: string;
    condition: string;
    note: string;
    photoDataUrl: string;
  } | null>(null);

  // Confirm location done modal
  const [confirmDoneModal, setConfirmDoneModal] = useState(false);

  const refreshQueueState = useCallback(async () => {
    const q = await listQueuedScansFromIdb(countId);
    setQueueItems(q);
    return q;
  }, [countId]);

  const loadMyCount = useCallback(async () => {
    try {
      const data = await apiFetch(`/vaqf-api/counts/${countId}/my`);
      setCountData(data);
      await saveCountCacheToIdb(countId, data);
      if (!selectedLocId && data.myLocations?.length > 0) {
        const firstActive = data.myLocations.find((l: any) => l.status !== "done") || data.myLocations[0];
        setSelectedLocId(Number(firstActive.location_id));
      }
    } catch (e: any) {
      const cached = await loadCountCacheFromIdb(countId);
      if (cached) {
        setCountData(cached);
        if (!selectedLocId && cached.myLocations?.length > 0) {
          setSelectedLocId(Number(cached.myLocations[0].location_id));
        }
      } else {
        notify(e.message || "Sanoq ma'lumotlarini yuklab bo'lmadi", "err");
      }
    } finally {
      setLoading(false);
    }
  }, [countId, selectedLocId, notify]);

  const flushOfflineQueue = useCallback(async () => {
    if (!navigator.onLine || syncing) return;
    const queued = await listQueuedScansFromIdb(countId);
    if (queued.length === 0) return;

    setSyncing(true);
    try {
      const normalScans = queued.filter((q) => q.kind === "scan");
      const extraScans = queued.filter((q) => q.kind === "extra");

      if (normalScans.length > 0) {
        await apiFetch(`/vaqf-api/counts/${countId}/scans`, {
          method: "POST",
          body: JSON.stringify({ scans: normalScans.map((s) => s.payload) }),
        });
        await removeQueuedScansFromIdb(normalScans.map((s) => s.clientScanId));
      }

      for (const ex of extraScans) {
        await apiFetch(`/vaqf-api/counts/${countId}/extra`, {
          method: "POST",
          body: JSON.stringify(ex.payload),
        });
        await removeQueuedScansFromIdb([ex.clientScanId]);
      }

      await refreshQueueState();
      await loadMyCount();
    } catch {
      // Keep items in IndexedDB queue until connection is stable
    } finally {
      setSyncing(false);
    }
  }, [countId, syncing, refreshQueueState, loadMyCount]);

  useEffect(() => {
    loadMyCount();
    refreshQueueState();
  }, [loadMyCount, refreshQueueState]);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      flushOfflineQueue();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const timer = setInterval(() => {
      if (navigator.onLine) flushOfflineQueue();
    }, 6000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(timer);
    };
  }, [flushOfflineQueue]);

  // Apply optimistic local state update so offline scanning immediately updates the room list & catalog
  const applyLocalOptimisticScan = useCallback(
    (asset: any, locId: number, countedQty: number, condition: string, note: string, needsRelabel: boolean) => {
      setCountData((prev: any) => {
        if (!prev) return prev;
        const isMoved = asset.expected_location_id && Number(asset.expected_location_id) !== Number(locId);
        const isQtyDiff = Math.abs(Number(countedQty) - Number(asset.expected_qty || asset.quantity || 1)) > 0.001;
        const result = condition === "damaged" ? "damaged" : isMoved ? "moved" : isQtyDiff ? "qty_diff" : "found";

        const nextCatalog = (prev.catalogAssets || []).map((ca: any) =>
          Number(ca.id) === Number(asset.id)
            ? { ...ca, result, found_location_id: locId, counted_qty: countedQty, scanned_at: new Date().toISOString() }
            : ca
        );

        const nextMyItems = [...(prev.myItems || [])];
        const existingIdx = nextMyItems.findIndex((it: any) => Number(it.asset_id) === Number(asset.id));
        const updatedItem = {
          ...(existingIdx >= 0 ? nextMyItems[existingIdx] : {}),
          id: asset.count_item_id || Date.now(),
          asset_id: asset.id,
          inventory_no: asset.inventory_no,
          asset_name: asset.name,
          category_name: asset.category_name,
          tracking: asset.tracking,
          unit: asset.unit || "dona",
          expected_location_id: asset.expected_location_id,
          expected_location_name: asset.expected_location_name,
          expected_qty: asset.expected_qty ?? asset.quantity ?? 1,
          found_location_id: locId,
          counted_qty: countedQty,
          condition,
          note,
          result,
          needs_relabel: needsRelabel,
          scanned_at: new Date().toISOString(),
        };
        if (existingIdx >= 0) nextMyItems[existingIdx] = updatedItem;
        else nextMyItems.push(updatedItem);

        return {
          ...prev,
          catalogAssets: nextCatalog,
          myItems: nextMyItems,
        };
      });
    },
    []
  );

  const commitScanRecord = useCallback(
    async (params: {
      asset: any;
      countedQty: number;
      condition: string;
      note: string;
      photoDataUrl?: string;
      needsRelabel?: boolean;
      updateExisting?: boolean;
    }) => {
      if (!selectedLocId) {
        notify("Avval sanash uchun joyni (xonani) tanlang!", "err");
        return;
      }
      const clientScanId = `scan_${countId}_${params.asset.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const payload = {
        clientScanId,
        assetId: params.asset.id,
        inventoryNo: params.asset.inventory_no,
        locationId: selectedLocId,
        countedQty: params.countedQty,
        condition: params.condition,
        note: params.note || null,
        photoDataUrl: params.photoDataUrl || null,
        needsRelabel: Boolean(params.needsRelabel),
        updateExisting: Boolean(params.updateExisting),
        scannedAt: new Date().toISOString(),
      };

      const isMoved =
        params.asset.expected_location_id &&
        Number(params.asset.expected_location_id) !== Number(selectedLocId);

      // 1. Update local state & IndexedDB immediately (works 100% offline!)
      applyLocalOptimisticScan(
        params.asset,
        selectedLocId,
        params.countedQty,
        params.condition,
        params.note,
        Boolean(params.needsRelabel)
      );
      await enqueueScanToIdb({
        clientScanId,
        countId,
        kind: "scan",
        payload,
        createdAt: Date.now(),
      });
      await refreshQueueState();

      if (isMoved) {
        playScanFeedback("moved");
        setScanBanner({
          color: "yellow",
          title: `⚠️ BOSHQA JOYDAN TOPILDI (${params.asset.inventory_no})`,
          subtitle: `${params.asset.name} — Kutilgan joy: "${params.asset.expected_location_name || "Noma'lum"}". Shu xonaga ko'chirildi deb belgilandi!`,
          code: params.asset.inventory_no,
          asset: params.asset,
          clientScanId,
        });
      } else {
        playScanFeedback("found");
        setScanBanner({
          color: "green",
          title: `✅ TOPILDI (${params.asset.inventory_no})`,
          subtitle: `${params.asset.name} — Miqdor: ${params.countedQty} ${params.asset.unit || "dona"}`,
          code: params.asset.inventory_no,
          asset: params.asset,
          clientScanId,
        });
      }

      // 2. If online, flush queue immediately in background
      if (navigator.onLine) {
        setTimeout(() => flushOfflineQueue(), 80);
      }
    },
    [countId, selectedLocId, applyLocalOptimisticScan, refreshQueueState, flushOfflineQueue, notify]
  );

  // Handle a raw scanned QR string or manually typed code
  const handleCodeDetected = useCallback(
    async (rawInput: string) => {
      const cleanRaw = String(rawInput || "").trim();
      if (!cleanRaw) return;

      // 1. Check if this QR code is a Location QR (`/vaqf/loc/12` or `LOC-...`)
      const locUrlMatch = cleanRaw.match(/\/vaqf\/loc\/(\d+)/i);
      if (locUrlMatch || /^LOC-/i.test(cleanRaw)) {
        const locIdFromUrl = locUrlMatch ? Number(locUrlMatch[1]) : 0;
        const codePart = cleanRaw.replace(/^LOC-/i, "").trim().toUpperCase();
        const matchedLoc = (countData?.myLocations || []).find(
          (l: any) =>
            (locIdFromUrl && Number(l.location_id) === locIdFromUrl) ||
            (l.location_code && String(l.location_code).toUpperCase() === codePart)
        );
        if (matchedLoc) {
          setSelectedLocId(Number(matchedLoc.location_id));
          playScanFeedback("found");
          notify(`📍 Joy tanlandi: ${matchedLoc.location_name}`);
          return;
        } else {
          playScanFeedback("unknown_code");
          notify("Bu joy sizga biriktirilmagan yoki sanoq qamrovida emas", "err");
          return;
        }
      }

      if (!selectedLocId) {
        notify("Iltimos, avval yuqoridan xonani (joyni) tanlang!", "err");
        return;
      }

      // 2. Extract inventory_no (`https://.../vaqf/a/EV-MZN-000001` or `EV-MZN-000001` or short digits `1`, `12`)
      let invNo = cleanRaw;
      const aMatch = cleanRaw.match(/\/vaqf\/a\/([^/?#\s]+)/i);
      if (aMatch) invNo = decodeURIComponent(aMatch[1]);
      invNo = invNo.trim().toUpperCase();
      if (/^\d{1,6}$/.test(invNo)) {
        invNo = `EV-${countData?.count?.institution_code || "MZN"}-${invNo.padStart(6, "0")}`;
      }

      // Look up in local catalogAssets
      const catalog: any[] = countData?.catalogAssets || [];
      const foundAsset = catalog.find((a) => String(a.inventory_no).toUpperCase() === invNo);

      if (!foundAsset) {
        playScanFeedback("unknown_code");
        setScanBanner({
          color: "red",
          title: `❌ KOD TOPILMADI: ${invNo}`,
          subtitle: "Ushbu inventar raqami bazada mavjud emas. Yangi buyum sifatida qo'shishingiz mumkin.",
          code: invNo,
        });
        return;
      }

      if (!foundAsset.in_scope) {
        playScanFeedback("already_scanned");
        setScanBanner({
          color: "blue",
          title: `ℹ️ QAMROVDAN TASHQARI (${foundAsset.inventory_no})`,
          subtitle: `${foundAsset.name} — Ushbu sanoq qamroviga kiritilmagan.`,
          code: foundAsset.inventory_no,
        });
        return;
      }

      // Check if already scanned
      if (foundAsset.result && foundAsset.result !== "pending" && foundAsset.scanned_at) {
        playScanFeedback("already_scanned");
        setScanBanner({
          color: "blue",
          title: `🔵 ALLAQACHON SKANERLANGAN (${foundAsset.inventory_no})`,
          subtitle: `${foundAsset.name} — Miqdor: ${foundAsset.counted_qty ?? foundAsset.expected_qty} ${foundAsset.unit || "dona"}`,
          code: foundAsset.inventory_no,
          asset: foundAsset,
        });
        return;
      }

      const isMoved =
        foundAsset.expected_location_id &&
        Number(foundAsset.expected_location_id) !== Number(selectedLocId);

      // If batch item, open quantity prompt modal immediately!
      if (foundAsset.tracking === "batch" || Number(foundAsset.expected_qty || 1) > 1) {
        playScanFeedback(isMoved ? "moved" : "found");
        setDetailModal({
          open: true,
          asset: foundAsset,
          countedQty: String(foundAsset.expected_qty ?? foundAsset.quantity ?? 1),
          condition: foundAsset.condition || "good",
          note: "",
          photoDataUrl: "",
          needsRelabel: false,
          isMoved: Boolean(isMoved),
        });
        return;
      }

      // Individual item -> record immediately!
      await commitScanRecord({
        asset: foundAsset,
        countedQty: 1,
        condition: foundAsset.condition || "good",
        note: "",
      });
    },
    [countData, selectedLocId, commitScanRecord, notify]
  );

  // Camera loop (BarcodeDetector with jsQR fallback)
  useEffect(() => {
    if (!cameraOpen) return;
    let stream: MediaStream | null = null;
    let animId = 0;
    let active = true;

    const startCam = async () => {
      setCameraError("");
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        let detector: any = null;
        if ("BarcodeDetector" in window) {
          try {
            detector = new window.BarcodeDetector({ formats: ["qr_code"] });
          } catch {}
        }

        const tick = async () => {
          if (!active) return;
          const video = videoRef.current;
          if (video && video.readyState >= 2) {
            let detectedText = "";
            if (detector) {
              try {
                const codes = await detector.detect(video);
                if (codes && codes.length > 0 && codes[0].rawValue) {
                  detectedText = String(codes[0].rawValue);
                }
              } catch {}
            }
            if (!detectedText && window.jsQR && canvasRef.current) {
              const canvas = canvasRef.current;
              const w = 480;
              const h = Math.floor((video.videoHeight / Math.max(1, video.videoWidth)) * w) || 360;
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext("2d");
              if (ctx) {
                ctx.drawImage(video, 0, 0, w, h);
                const imgData = ctx.getImageData(0, 0, w, h);
                const qr = window.jsQR(imgData.data, w, h);
                if (qr && qr.data) detectedText = qr.data;
              }
            }

            if (detectedText) {
              const now = Date.now();
              if (
                detectedText !== lastScanRef.current.code ||
                now - lastScanRef.current.time > 2500
              ) {
                lastScanRef.current = { code: detectedText, time: now };
                handleCodeDetected(detectedText);
              }
            }
          }
          animId = requestAnimationFrame(tick);
        };

        animId = requestAnimationFrame(tick);
      } catch (err: any) {
        setCameraError(
          "Kameraga ruxsat berilmadi yoki kamera topilmadi. Pastdagi maydondan inventar raqamini qo'lda kiriting."
        );
      }
    };

    startCam();
    return () => {
      active = false;
      if (animId) cancelAnimationFrame(animId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [cameraOpen, handleCodeDetected]);

  const myLocations: any[] = countData?.myLocations || [];
  const currentLocation = myLocations.find((l) => Number(l.location_id) === Number(selectedLocId));

  // Items in currently selected room
  const remainingInRoom = useMemo(() => {
    const cat: any[] = countData?.catalogAssets || [];
    return cat.filter(
      (a) =>
        a.in_scope &&
        Number(a.expected_location_id) === Number(selectedLocId) &&
        (!a.result || a.result === "pending")
    );
  }, [countData, selectedLocId]);

  const scannedInRoom = useMemo(() => {
    const items: any[] = countData?.myItems || [];
    return items.filter(
      (i) => Number(i.found_location_id) === Number(selectedLocId) && i.result !== "pending"
    );
  }, [countData, selectedLocId]);

  const handlePhotoInput = (e: React.ChangeEvent<HTMLInputElement>, target: "detail" | "extra") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (target === "detail" && detailModal) {
        setDetailModal({ ...detailModal, photoDataUrl: dataUrl });
      } else if (target === "extra" && extraModal) {
        setExtraModal({ ...extraModal, photoDataUrl: dataUrl });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveExtraItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extraModal || !selectedLocId) return;
    const clientScanId = `extra_${countId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const payload = {
      clientScanId,
      location_id: selectedLocId,
      name: extraModal.name.trim(),
      category_id: Number(extraModal.category_id) || 1,
      counted_qty: Number(extraModal.counted_qty) || 1,
      unit: extraModal.unit || "dona",
      condition: extraModal.condition || "good",
      note: extraModal.note || null,
      scanned_code: extraModal.scannedCode || null,
      photoDataUrl: extraModal.photoDataUrl || null,
    };

    await enqueueScanToIdb({
      clientScanId,
      countId,
      kind: "extra",
      payload,
      createdAt: Date.now(),
    });
    await refreshQueueState();

    // Optimistically add to myItems
    setCountData((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        myItems: [
          {
            id: Date.now(),
            asset_id: null,
            inventory_no: "(Yangi extra)",
            asset_name: payload.name,
            found_location_id: selectedLocId,
            counted_qty: payload.counted_qty,
            unit: payload.unit,
            condition: payload.condition,
            result: "extra",
            scanned_at: new Date().toISOString(),
          },
          ...(prev.myItems || []),
        ],
      };
    });

    setExtraModal(null);
    playScanFeedback("found");
    notify("Ro'yxatda yo'q buyum sanoqqa qo'shildi!");
    if (navigator.onLine) {
      setTimeout(() => flushOfflineQueue(), 80);
    }
  };

  const handleFinishLocation = async () => {
    if (!selectedLocId) return;
    try {
      await flushOfflineQueue();
      await apiFetch(`/vaqf-api/counts/${countId}/locations/${selectedLocId}/done`, {
        method: "POST",
      });
      setConfirmDoneModal(false);
      notify(`"${currentLocation?.location_name}" sanog'i yakunlandi!`);
      await loadMyCount();
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <RefreshCw className="spin" size={28} />
        <p style={{ marginTop: 12 }}>Sanoq ma'lumotlari yuklanmoqda...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 540, margin: "0 auto", padding: "12px 12px 80px" }}>
      {/* Top Bar */}
      <div
        className="card"
        style={{
          padding: "12px 14px",
          marginBottom: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {vaqfAccess?.canView && (
            <button className="btn btn-sm" onClick={handleExit} title="Direktor paneliga qaytish">
              <ArrowLeft size={16} />
            </button>
          )}
          <div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
              {countData?.count?.code} • {countData?.count?.institution_name}
            </div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>
              {countData?.count?.title || "Inventarizatsiya Skaneri"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            className={`badge ${isOnline ? "badge-emerald" : "badge-amber"}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
            {isOnline ? "Onlayn" : "Oflayn"}
          </span>

          <button
            className={`btn btn-sm ${queueItems.length > 0 ? "btn-primary" : ""}`}
            onClick={flushOfflineQueue}
            disabled={syncing || queueItems.length === 0}
            title="Oflayn navbatdagi skanerlarni yuborish"
          >
            <UploadCloud size={14} />
            <span>Yuborilmagan: {queueItems.length}</span>
          </button>
        </div>
      </div>

      {/* Room / Location Selector */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <label className="form-label" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
            <MapPin size={15} /> Sanalayotgan joy (xona):
          </label>
          {currentLocation && (
            <span className={`badge ${LOC_STATUS_META[currentLocation.status]?.badge || "badge-slate"}`}>
              {LOC_STATUS_META[currentLocation.status]?.label || currentLocation.status}
            </span>
          )}
        </div>

        <select
          className="select"
          value={selectedLocId || ""}
          onChange={(e) => {
            setSelectedLocId(Number(e.target.value));
            setScanBanner(null);
          }}
          style={{ fontSize: 15, fontWeight: 700, padding: "10px 12px" }}
        >
          <option value="">— Joyni (xonani) tanlang —</option>
          {myLocations.map((l: any) => (
            <option key={l.location_id} value={l.location_id}>
              {l.location_name} ({l.status === "done" ? "✓ Tugadi" : `Kutilgan: ${l.expected_count} ta`})
            </option>
          ))}
        </select>

        {currentLocation && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 8,
              marginTop: 10,
              textAlign: "center",
            }}
          >
            <div style={{ background: "var(--bg-subtle, rgba(148,163,184,0.1))", padding: 8, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Kutilgan</div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{currentLocation.expected_count}</div>
            </div>
            <div style={{ background: "rgba(16,185,129,0.12)", padding: 8, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "#10b981" }}>Skanerlandi</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#10b981" }}>{scannedInRoom.length}</div>
            </div>
            <div style={{ background: "rgba(245,158,11,0.12)", padding: 8, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "#f59e0b" }}>Qoldi</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#f59e0b" }}>{remainingInRoom.length}</div>
            </div>
          </div>
        )}
      </div>

      {/* Big One-Handed SCAN Button & Camera View */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setCameraOpen((v) => !v)}
          style={{
            width: "100%",
            padding: "16px 20px",
            fontSize: 17,
            fontWeight: 800,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 10,
            borderRadius: 12,
          }}
        >
          <Camera size={22} />
          {cameraOpen ? "Kamerani yopish" : "📷 QR SKANERLASH (Kamera)"}
        </button>

        {cameraOpen && (
          <div style={{ marginTop: 12, position: "relative" }}>
            <video
              ref={videoRef}
              playsInline
              muted
              style={{
                width: "100%",
                maxHeight: 280,
                objectFit: "cover",
                borderRadius: 12,
                border: "2px solid #f59e0b",
                background: "#000",
              }}
            />
            <canvas ref={canvasRef} style={{ display: "none" }} />
            {cameraError && (
              <div
                style={{
                  marginTop: 8,
                  padding: 10,
                  borderRadius: 8,
                  background: "rgba(244,63,94,0.15)",
                  color: "#f43f5e",
                  fontSize: 13,
                }}
              >
                {cameraError}
              </div>
            )}
          </div>
        )}

        {/* Manual Code Input (fallback or quick number entry) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!manualCode.trim()) return;
            handleCodeDetected(manualCode);
            setManualCode("");
          }}
          style={{ display: "flex", gap: 8, marginTop: 12 }}
        >
          <input
            className="input"
            placeholder="Inventar № (masalan: EV-MZN-000001 yoki 1)"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            style={{ flex: 1, fontSize: 15 }}
          />
          <button type="submit" className="btn btn-primary" style={{ padding: "0 16px", fontWeight: 700 }}>
            Tekshirish
          </button>
        </form>
      </div>

      {/* Color-Coded Instant Scan Feedback Banner */}
      {scanBanner && (
        <div
          className="card animate-in"
          style={{
            padding: 14,
            marginBottom: 12,
            borderLeft: `6px solid ${
              scanBanner.color === "green"
                ? "#10b981"
                : scanBanner.color === "yellow"
                ? "#f59e0b"
                : scanBanner.color === "blue"
                ? "#3b82f6"
                : "#f43f5e"
            }`,
            background:
              scanBanner.color === "green"
                ? "rgba(16,185,129,0.14)"
                : scanBanner.color === "yellow"
                ? "rgba(245,158,11,0.14)"
                : scanBanner.color === "blue"
                ? "rgba(59,130,246,0.14)"
                : "rgba(244,63,94,0.14)",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{scanBanner.title}</div>
          <div style={{ fontSize: 13, opacity: 0.92 }}>{scanBanner.subtitle}</div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {scanBanner.asset && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  setDetailModal({
                    open: true,
                    asset: scanBanner.asset,
                    countedQty: String(
                      scanBanner.asset.counted_qty ??
                        scanBanner.asset.expected_qty ??
                        scanBanner.asset.quantity ??
                        1
                    ),
                    condition: scanBanner.asset.condition || "good",
                    note: "",
                    photoDataUrl: "",
                    needsRelabel: false,
                    isMoved:
                      Number(scanBanner.asset.expected_location_id) !== Number(selectedLocId),
                  })
                }
              >
                ✏️ Miqdor / Holat / Rasm qo'shish
              </button>
            )}

            {scanBanner.color === "red" && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() =>
                  setExtraModal({
                    open: true,
                    scannedCode: scanBanner.code || "",
                    name: "",
                    category_id: String(countData?.categories?.[0]?.id || 1),
                    counted_qty: "1",
                    unit: "dona",
                    condition: "good",
                    note: scanBanner.code ? `Skanerlangan kod: ${scanBanner.code}` : "",
                    photoDataUrl: "",
                  })
                }
              >
                <PackagePlus size={14} /> Yangi buyum sifatida qo'shish
              </button>
            )}
          </div>
        </div>
      )}

      {/* Quick button to add unlisted (extra) item anytime */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          className="btn"
          style={{ flex: 1, justifyContent: "center" }}
          onClick={() => {
            if (!selectedLocId) {
              notify("Avval xonani tanlang!", "err");
              return;
            }
            setExtraModal({
              open: true,
              scannedCode: "",
              name: "",
              category_id: String(countData?.categories?.[0]?.id || 1),
              counted_qty: "1",
              unit: "dona",
              condition: "good",
              note: "",
              photoDataUrl: "",
            });
          }}
        >
          <PackagePlus size={16} /> Ro'yxatda yo'q buyum qo'shish
        </button>

        {currentLocation && currentLocation.status !== "done" && (
          <button
            type="button"
            className="btn btn-primary"
            style={{ background: "#059669", borderColor: "#059669" }}
            onClick={() => setConfirmDoneModal(true)}
          >
            <CheckCircle2 size={16} /> Joy tugadi
          </button>
        )}
      </div>

      {/* Remaining Unscanned Items in This Room */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <h4 style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>
          📋 Shu joyda qolganlar ({remainingInRoom.length} ta)
        </h4>
        {remainingInRoom.length === 0 ? (
          <div style={{ fontSize: 13, color: "#10b981", fontWeight: 600 }}>
            🎉 Shu joydagi barcha kutilgan buyumlar skanerlandi!
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {remainingInRoom.map((item: any) => (
              <div
                key={item.id}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border-color, rgba(148,163,184,0.2))",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    <code>{item.inventory_no}</code> • {item.expected_qty ?? item.quantity ?? 1}{" "}
                    {item.unit || "dona"}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  title="Yorlig'i yirtilgan yoki o'qilmasa qo'lda topildi deb belgilash"
                  onClick={() => {
                    if (item.tracking === "batch" || Number(item.expected_qty || 1) > 1) {
                      setDetailModal({
                        open: true,
                        asset: item,
                        countedQty: String(item.expected_qty ?? item.quantity ?? 1),
                        condition: item.condition || "good",
                        note: "Qo'lda topildi (yangi yorliq kerak)",
                        photoDataUrl: "",
                        needsRelabel: true,
                        isMoved: false,
                      });
                    } else {
                      commitScanRecord({
                        asset: item,
                        countedQty: 1,
                        condition: item.condition || "good",
                        note: "Qo'lda topildi (yangi yorliq kerak)",
                        needsRelabel: true,
                      });
                    }
                  }}
                >
                  <Tag size={13} /> Topildi (yorliqsiz)
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Already Scanned Items in This Room */}
      {scannedInRoom.length > 0 && (
        <div className="card" style={{ padding: 14 }}>
          <h4 style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>
            ✅ Shu joyda skanerlanganlar ({scannedInRoom.length} ta)
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {scannedInRoom.map((it: any) => (
              <div
                key={it.id || it.inventory_no}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "var(--bg-subtle, rgba(148,163,184,0.08))",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{it.asset_name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    <code>{it.inventory_no}</code> • {it.counted_qty ?? 1} {it.unit || "dona"}
                    {it.needs_relabel ? " • 🏷 Yangi yorliq kerak" : ""}
                  </div>
                </div>
                <span className={`badge ${RESULT_META[it.result]?.badge || "badge-emerald"}`}>
                  {RESULT_META[it.result]?.label || it.result}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: Batch Quantity / Condition / Note / Photo */}
      {detailModal && (
        <div className="modal-backdrop" onClick={() => setDetailModal(null)}>
          <div className="modal-box animate-in" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>
              {detailModal.asset.name} ({detailModal.asset.inventory_no})
            </h3>
            {detailModal.isMoved && (
              <div
                style={{
                  padding: 8,
                  borderRadius: 8,
                  background: "rgba(245,158,11,0.16)",
                  color: "#f59e0b",
                  fontSize: 12,
                  marginBottom: 10,
                }}
              >
                ⚠️ Kutilgan joy: <b>{detailModal.asset.expected_location_name}</b>. Shu joyga ko'chirildi deb yoziladi.
              </div>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await commitScanRecord({
                  asset: detailModal.asset,
                  countedQty: Number(detailModal.countedQty || 1),
                  condition: detailModal.condition,
                  note: detailModal.note,
                  photoDataUrl: detailModal.photoDataUrl || undefined,
                  needsRelabel: detailModal.needsRelabel,
                  updateExisting: true,
                });
                setDetailModal(null);
              }}
              className="form-grid"
            >
              <div className="form-field full">
                <label className="form-label">
                  Haqiqiy sanalgan miqdor (Kutilgan: {detailModal.asset.expected_qty ?? detailModal.asset.quantity ?? 1}{" "}
                  {detailModal.asset.unit || "dona"})
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  className="input"
                  value={detailModal.countedQty}
                  onChange={(e) => setDetailModal({ ...detailModal, countedQty: e.target.value })}
                  style={{ fontSize: 18, fontWeight: 800 }}
                  required
                />
              </div>

              <div className="form-field full">
                <label className="form-label">Buyum holati (yaroqliligi)</label>
                <select
                  className="select"
                  value={detailModal.condition}
                  onChange={(e) => setDetailModal({ ...detailModal, condition: e.target.value })}
                >
                  <option value="new">Yangi (new)</option>
                  <option value="good">Yaxshi (good)</option>
                  <option value="fair">O'rta (fair)</option>
                  <option value="poor">Yomon (poor)</option>
                  <option value="damaged">⚠️ Shikastlangan / Ta'mirtalab (damaged)</option>
                </select>
              </div>

              <div className="form-field full">
                <label className="form-label">Izoh (ixtiyoriy)</label>
                <input
                  className="input"
                  placeholder="Masalan: 2 ta stulning oyog'i singan..."
                  value={detailModal.note}
                  onChange={(e) => setDetailModal({ ...detailModal, note: e.target.value })}
                />
              </div>

              <div className="form-field full">
                <label className="form-label">Rasmga olish (ixtiyoriy)</label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handlePhotoInput(e, "detail")}
                />
              </div>

              <div className="form-field full" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  id="needsRelabelChk"
                  checked={detailModal.needsRelabel}
                  onChange={(e) => setDetailModal({ ...detailModal, needsRelabel: e.target.checked })}
                />
                <label htmlFor="needsRelabelChk" style={{ fontSize: 13 }}>
                  QR yorlig'i yirtilgan / yangi yorliq chop etish kerak
                </label>
              </div>

              <div className="form-field full" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="btn" onClick={() => setDetailModal(null)}>
                  Bekor qilish
                </button>
                <button type="submit" className="btn btn-primary">
                  Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Extra (Unlisted) Item */}
      {extraModal && (
        <div className="modal-backdrop" onClick={() => setExtraModal(null)}>
          <div className="modal-box animate-in" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>
              ➕ Ro'yxatda yo'q buyumni qo'shish
            </h3>
            <form onSubmit={handleSaveExtraItem} className="form-grid">
              <div className="form-field full">
                <label className="form-label">Buyum nomi *</label>
                <input
                  className="input"
                  placeholder="Masalan: Oq doska (120x200)"
                  value={extraModal.name}
                  onChange={(e) => setExtraModal({ ...extraModal, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-field full">
                <label className="form-label">Kategoriya *</label>
                <select
                  className="select"
                  value={extraModal.category_id}
                  onChange={(e) => setExtraModal({ ...extraModal, category_id: e.target.value })}
                >
                  {(countData?.categories || []).map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label className="form-label">Miqdori</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  className="input"
                  value={extraModal.counted_qty}
                  onChange={(e) => setExtraModal({ ...extraModal, counted_qty: e.target.value })}
                  required
                />
              </div>

              <div className="form-field">
                <label className="form-label">Holati</label>
                <select
                  className="select"
                  value={extraModal.condition}
                  onChange={(e) => setExtraModal({ ...extraModal, condition: e.target.value })}
                >
                  <option value="good">Yaxshi</option>
                  <option value="new">Yangi</option>
                  <option value="fair">O'rta</option>
                  <option value="poor">Yomon</option>
                  <option value="damaged">Shikastlangan</option>
                </select>
              </div>

              <div className="form-field full">
                <label className="form-label">Rasm (telefondan)</label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handlePhotoInput(e, "extra")}
                />
              </div>

              <div className="form-field full">
                <label className="form-label">Izoh</label>
                <input
                  className="input"
                  value={extraModal.note}
                  onChange={(e) => setExtraModal({ ...extraModal, note: e.target.value })}
                />
              </div>

              <div className="form-field full" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="btn" onClick={() => setExtraModal(null)}>
                  Bekor qilish
                </button>
                <button type="submit" className="btn btn-primary">
                  Qo'shish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Confirm Location Done */}
      {confirmDoneModal && (
        <div className="modal-backdrop" onClick={() => setConfirmDoneModal(false)}>
          <div className="modal-box animate-in" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>
              🏁 "{currentLocation?.location_name}" sanog'ini tugatish
            </h3>
            {remainingInRoom.length > 0 ? (
              <div
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: "rgba(244,63,94,0.14)",
                  color: "#f43f5e",
                  fontSize: 13.5,
                  marginBottom: 14,
                }}
              >
                ⚠️ <b>Diqqat!</b> Shu xonada hali skanerlanmagan <b>{remainingInRoom.length} ta</b> buyum qolgan. Joyni
                tugatishni tasdiqlasangiz, ular avtomatik ravishda <b>«Topilmadi (missing)»</b> deb belgilanadi!
              </div>
            ) : (
              <p style={{ fontSize: 14, marginBottom: 14 }}>
                Shu xonadagi barcha kutilgan buyumlar skanerlandi. Xona sanog'ini yakunlashni tasdiqlaysizmi?
              </p>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn" onClick={() => setConfirmDoneModal(false)}>
                Qaytish
              </button>
              <button className="btn btn-primary" onClick={handleFinishLocation}>
                ✅ Tasdiqlash va tugatish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// STEP 3: DIRECTOR INVENTORY COUNTS SECTION (IN apps/vaqf)
// ============================================================================
export function DirectorInventoryCountsSection({
  institutions = [],
  selectedInstitutionId,
  locations = [],
  categories = [],
  staff: staffProp,
  staffList = [],
  notify,
  onOpenMobileScanner,
}: {
  institutions?: any[];
  selectedInstitutionId?: number;
  locations: any[];
  categories: any[];
  staff?: any[];
  staffList?: any[];
  notify: (msg: string, type?: "ok" | "err") => void;
  onOpenMobileScanner: (countId: number) => void;
}) {
  const staff = Array.isArray(staffProp) && staffProp.length > 0 ? staffProp : Array.isArray(staffList) ? staffList : [];
  const defaultInstId = Number(selectedInstitutionId) || Number(institutions?.[0]?.id) || 1;
  const [counts, setCounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCountId, setActiveCountId] = useState<number | null>(null);
  const [countDetail, setCountDetail] = useState<any | null>(null);
  const [subTab, setSubTab] = useState<"progress" | "discrepancies">("progress");

  // 3-step New Count Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [wizardForm, setWizardForm] = useState<{
    institution_id: number;
    title: string;
    scopeType: "all" | "custom";
    location_ids: number[];
    category_ids: number[];
    assigneesByLoc: Record<number, { assignee_ref: string; assignee_name: string }>;
    committee: Array<{ name: string; role: string }>;
    notes: string;
  }>({
    institution_id: defaultInstId,
    title: `Yillik inventarizatsiya — ${new Date().toISOString().slice(0, 10)}`,
    scopeType: "all",
    location_ids: [],
    category_ids: [],
    assigneesByLoc: {},
    committee: [
      { name: "Muhammad Solih Tursunov", role: "Komissiya raisi (Direktor)" },
      { name: "Umarkhon Abdulhamidov", role: "Komissiya a'zosi (Idora)" },
    ],
    notes: "",
  });
  const [scopePreview, setScopePreview] = useState<any | null>(null);
  const [bulkStaffRef, setBulkStaffRef] = useState<string>("");

  // Discrepancies filtering & bulk selection
  const [discFilter, setDiscFilter] = useState<string>("all");
  const [selectedDiscIds, setSelectedDiscIds] = useState<number[]>([]);
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [cancelModal, setCancelModal] = useState<{ open: boolean; reason: string }>({ open: false, reason: "" });

  const loadCounts = useCallback(async () => {
    try {
      const d = await apiFetch("/vaqf-api/counts");
      setCounts(d.items || []);
    } catch (e: any) {
      notify(e.message, "err");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const loadActiveDetail = useCallback(
    async (id: number) => {
      try {
        const d = await apiFetch(`/vaqf-api/counts/${id}`);
        setCountDetail(d);
      } catch (e: any) {
        notify(e.message, "err");
      }
    },
    [notify]
  );

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  // Auto-refresh active count progress every 15 seconds (Step 3 requirement!)
  useEffect(() => {
    if (!activeCountId) return;
    loadActiveDetail(activeCountId);
    const timer = setInterval(() => {
      loadActiveDetail(activeCountId);
    }, 15000);
    return () => clearInterval(timer);
  }, [activeCountId, loadActiveDetail]);

  // Live preview of scope in Wizard Step 1 & 2
  useEffect(() => {
    if (!wizardOpen) return;
    const fetchPreview = async () => {
      try {
        const d = await apiFetch("/vaqf-api/counts/preview-scope", {
          method: "POST",
          body: JSON.stringify({
            institution_id: wizardForm.institution_id,
            location_ids: wizardForm.scopeType === "custom" ? wizardForm.location_ids : [],
            category_ids: wizardForm.scopeType === "custom" ? wizardForm.category_ids : [],
          }),
        });
        setScopePreview(d);
      } catch {}
    };
    fetchPreview();
  }, [
    wizardOpen,
    wizardForm.institution_id,
    wizardForm.scopeType,
    wizardForm.location_ids,
    wizardForm.category_ids,
  ]);

  const handleCreateCount = async (startImmediately: boolean) => {
    try {
      const locsPayload = (scopePreview?.locations || []).map((l: any) => ({
        location_id: l.location_id,
        assignee_ref: wizardForm.assigneesByLoc[l.location_id]?.assignee_ref || null,
        assignee_name: wizardForm.assigneesByLoc[l.location_id]?.assignee_name || null,
      }));
      const res = await apiFetch("/vaqf-api/counts", {
        method: "POST",
        body: JSON.stringify({
          institution_id: wizardForm.institution_id,
          title: wizardForm.title,
          scope: {
            type: wizardForm.scopeType,
            location_ids: wizardForm.scopeType === "custom" ? wizardForm.location_ids : [],
            category_ids: wizardForm.scopeType === "custom" ? wizardForm.category_ids : [],
          },
          locations: locsPayload,
          committee: wizardForm.committee,
          notes: wizardForm.notes,
          start_immediately: startImmediately,
        }),
      });
      setWizardOpen(false);
      notify(startImmediately ? "Sanoq yaratildi va boshlandi!" : "Sanoq qoralamasi saqlandi!");
      await loadCounts();
      if (res?.count?.id) {
        setActiveCountId(res.count.id);
        setCountDetail(res);
      }
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const handleStartDraftCount = async (id: number) => {
    try {
      const d = await apiFetch(`/vaqf-api/counts/${id}/start`, { method: "POST" });
      notify("Sanoq boshlandi! Mulk ro'yxati muzlatildi.");
      setCountDetail(d);
      loadCounts();
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const handleMarkLocDoneByDirector = async (locId: number) => {
    if (!activeCountId) return;
    try {
      await apiFetch(`/vaqf-api/counts/${activeCountId}/locations/${locId}/done`, { method: "POST" });
      notify("Joy sanog'i tugatildi!");
      loadActiveDetail(activeCountId);
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const handleSubmitForReview = async () => {
    if (!activeCountId) return;
    try {
      const d = await apiFetch(`/vaqf-api/counts/${activeCountId}/submit`, { method: "POST" });
      setCountDetail(d);
      setSubTab("discrepancies");
      notify("Sanoq ko'rib chiqish (review) bosqichiga o'tkazildi!");
      loadCounts();
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const handleSingleDecision = async (itemId: number, decision: string, decision_note?: string) => {
    if (!activeCountId) return;
    try {
      await apiFetch(`/vaqf-api/counts/${activeCountId}/items/${itemId}/decision`, {
        method: "PATCH",
        body: JSON.stringify({ decision, decision_note }),
      });
      loadActiveDetail(activeCountId);
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const handleBulkDecision = async (decision: string) => {
    if (!activeCountId || selectedDiscIds.length === 0) return;
    try {
      await apiFetch(`/vaqf-api/counts/${activeCountId}/decisions`, {
        method: "PATCH",
        body: JSON.stringify({ itemIds: selectedDiscIds, decision }),
      });
      notify(`${selectedDiscIds.length} ta qatorga qaror belgilandi!`);
      setSelectedDiscIds([]);
      loadActiveDetail(activeCountId);
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const handleApproveCount = async () => {
    if (!activeCountId) return;
    try {
      const d = await apiFetch(`/vaqf-api/counts/${activeCountId}/approve`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setApproveModalOpen(false);
      setCountDetail(d);
      notify("Inventarizatsiya tasdiqlandi va barcha o'zgarishlar mulk kartochkalariga qo'llandi!");
      loadCounts();
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const handleCancelCount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCountId) return;
    try {
      const d = await apiFetch(`/vaqf-api/counts/${activeCountId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: cancelModal.reason }),
      });
      setCancelModal({ open: false, reason: "" });
      setCountDetail(d);
      notify("Sanoq bekor qilindi.");
      loadCounts();
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  const discrepancies = useMemo(() => {
    const items: any[] = countDetail?.items || [];
    return items.filter((i) => ["missing", "moved", "extra", "qty_diff", "damaged"].includes(i.result));
  }, [countDetail]);

  const filteredDiscrepancies = useMemo(() => {
    if (discFilter === "all") return discrepancies;
    return discrepancies.filter((d) => d.result === discFilter);
  }, [discrepancies, discFilter]);

  const approvalPreviewStats = useMemo(() => {
    const toUpdate = discrepancies.filter((d) => d.decision === "apply" && d.result !== "extra" && d.result !== "missing");
    const toCreateExtra = discrepancies.filter((d) => d.decision === "apply" && d.result === "extra");
    const toMarkMissing = discrepancies.filter(
      (d) => d.decision === "mark_missing" || (d.result === "missing" && d.decision === "apply")
    );
    const toIgnore = discrepancies.filter((d) => d.decision === "ignore");
    const undecided = discrepancies.filter((d) => !d.decision);
    return {
      toUpdateCount: toUpdate.length,
      toCreateExtraCount: toCreateExtra.length,
      toMarkMissingCount: toMarkMissing.length,
      toIgnoreCount: toIgnore.length,
      undecidedCount: undecided.length,
    };
  }, [discrepancies]);

  // --- DETAIL VIEW OF A SELECTED COUNT ---
  if (activeCountId && countDetail) {
    const c = countDetail.count;
    const sum = countDetail.summary;
    const isReadOnly = c.status === "approved" || c.status === "cancelled";

    return (
      <div className="animate-in">
        {/* Header Bar */}
        <div
          className="card"
          style={{
            padding: 16,
            marginBottom: 16,
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              className="btn btn-sm"
              onClick={() => {
                setActiveCountId(null);
                setCountDetail(null);
              }}
            >
              <ArrowLeft size={16} /> Sanoqlar ro'yxati
            </button>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 18 }}>{c.code}</span>
                <span className={`badge ${COUNT_STATUS_META[c.status]?.badge || "badge-slate"}`}>
                  {COUNT_STATUS_META[c.status]?.label || c.status}
                </span>
              </div>
              <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
                {c.title} • {c.institution_name}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {c.status === "draft" && (
              <button className="btn btn-primary" onClick={() => handleStartDraftCount(c.id)}>
                <Play size={15} /> Sanoqni boshlash
              </button>
            )}

            {c.status === "in_progress" && (
              <>
                <button className="btn btn-primary" onClick={() => onOpenMobileScanner(c.id)}>
                  <Camera size={15} /> Mobil Skaner (/vaqf/count/{c.id})
                </button>
                <button className="btn" onClick={handleSubmitForReview}>
                  <CheckCircle2 size={15} /> Ko'rib chiqishga yuborish
                </button>
              </>
            )}

            {(c.status === "in_progress" || c.status === "review") && (
              <button
                className="btn btn-primary"
                style={{ background: "#059669", borderColor: "#059669" }}
                onClick={() => setApproveModalOpen(true)}
              >
                <Check size={15} /> Tasdiqlash (Approve)
              </button>
            )}

            <a
              href={`/vaqf-api/counts/${c.id}/report.pdf?lang=tr`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm"
            >
              <FileDown size={14} /> 🇹🇷 Tutanak (PDF)
            </a>
            <a
              href={`/vaqf-api/counts/${c.id}/report.pdf?lang=uz`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm"
            >
              <FileDown size={14} /> 🇺🇿 Dalolatnoma (PDF)
            </a>
            <a href={`/vaqf-api/counts/${c.id}/report.xlsx`} className="btn btn-sm">
              <FileSpreadsheet size={14} /> Excel (.xlsx)
            </a>

            {!isReadOnly && (
              <button
                className="btn btn-sm"
                style={{ color: "#f43f5e" }}
                onClick={() => setCancelModal({ open: true, reason: "" })}
              >
                <XCircle size={14} /> Bekor qilish
              </button>
            )}
          </div>
        </div>

        {/* Summary KPI Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Jami kutilgan mulk</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>
              {sum.expected_cards} ta{" "}
              <span style={{ fontSize: 13, fontWeight: 500 }}>({sum.expected_units} dona)</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
              Jarayon: <b>{sum.progress_pct}%</b> ({sum.locations_done}/{sum.locations_total} joy tugadi)
            </div>
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontSize: 12, color: "#10b981" }}>Haqiqatda topilganlar</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#10b981", marginTop: 4 }}>
              {sum.present_cards} ta
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
              Joyida: {sum.found_cards} • Boshqa joyda: {sum.moved_cards}
            </div>
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontSize: 12, color: "#f43f5e" }}>Topilmaganlar (Missing)</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#f43f5e", marginTop: 4 }}>
              {sum.missing_cards} ta
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
              Kutilmoqda (hali sanalmagan): {sum.pending_cards} ta
            </div>
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontSize: 12, color: "#06b6d4" }}>Ro'yxatda yo'q (Extra) va Farqlar</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#06b6d4", marginTop: 4 }}>
              +{sum.extra_cards} ta yangi
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
              Jami farqlar: <b>{sum.discrepancy_count} ta</b> (Qarorsiz: {sum.undecided_discrepancy_count})
            </div>
          </div>
        </div>

        {/* Sub-navigation: Jarayon paneli vs Farqlar sahifasi */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button
            className={`btn ${subTab === "progress" ? "btn-primary" : ""}`}
            onClick={() => setSubTab("progress")}
          >
            📊 Jarayon paneli (Joylar bo'yicha — har 15s yangilanadi)
          </button>
          <button
            className={`btn ${subTab === "discrepancies" ? "btn-primary" : ""}`}
            onClick={() => setSubTab("discrepancies")}
          >
            ⚖️ Farqlar va Qarorlar ({discrepancies.length})
          </button>
        </div>

        {subTab === "progress" ? (
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>
              Joylar bo'yicha sanoq holati ({countDetail.locations?.length || 0} ta joy)
            </h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Joy / Xona</th>
                    <th>Mas'ul xodim</th>
                    <th>Holat</th>
                    <th>Kutilgan</th>
                    <th>Topilgan</th>
                    <th>Ko'chirilgan</th>
                    <th>Topilmagan</th>
                    <th>Ortiqcha</th>
                    <th>Jarayon</th>
                    <th>Amal</th>
                  </tr>
                </thead>
                <tbody>
                  {(countDetail.locations || []).map((loc: any) => (
                    <tr key={loc.id}>
                      <td style={{ fontWeight: 700 }}>{loc.location_name}</td>
                      <td>{loc.assignee_name || <span style={{ opacity: 0.5 }}>Biriktirilmagan</span>}</td>
                      <td>
                        <span className={`badge ${LOC_STATUS_META[loc.status]?.badge || "badge-slate"}`}>
                          {LOC_STATUS_META[loc.status]?.label || loc.status}
                        </span>
                      </td>
                      <td>{loc.expected_count}</td>
                      <td style={{ color: "#10b981", fontWeight: 700 }}>{loc.found_count}</td>
                      <td style={{ color: "#f59e0b", fontWeight: 700 }}>{loc.moved_count}</td>
                      <td style={{ color: "#f43f5e", fontWeight: 700 }}>{loc.missing_count}</td>
                      <td style={{ color: "#06b6d4", fontWeight: 700 }}>{loc.extra_count}</td>
                      <td style={{ minWidth: 110 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div
                            style={{
                              flex: 1,
                              height: 7,
                              background: "rgba(148,163,184,0.2)",
                              borderRadius: 4,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${loc.progress_pct}%`,
                                height: "100%",
                                background: loc.status === "done" ? "#10b981" : "#f59e0b",
                              }}
                            />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700 }}>{loc.progress_pct}%</span>
                        </div>
                      </td>
                      <td>
                        {c.status === "in_progress" && loc.status !== "done" && (
                          <button
                            className="btn btn-sm"
                            onClick={() => handleMarkLocDoneByDirector(loc.location_id)}
                          >
                            ✅ Tugatish
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: 16 }}>
            {/* Discrepancy Group Filters */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[
                  { k: "all", label: `Barchasi (${discrepancies.length})` },
                  { k: "missing", label: `Topilmadi (${sum.missing_cards})` },
                  { k: "moved", label: `Boshqa joyda (${sum.moved_cards})` },
                  { k: "extra", label: `Ro'yxatda yo'q (${sum.extra_cards})` },
                  { k: "qty_diff", label: `Miqdor farqi (${sum.qty_diff_cards})` },
                  { k: "damaged", label: `Shikastlangan (${sum.damaged_cards})` },
                ].map((f) => (
                  <button
                    key={f.k}
                    className={`btn btn-sm ${discFilter === f.k ? "btn-primary" : ""}`}
                    onClick={() => setDiscFilter(f.k)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {!isReadOnly && selectedDiscIds.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>
                    Tanlangan {selectedDiscIds.length} ta qatorga:
                  </span>
                  <button className="btn btn-sm btn-primary" onClick={() => handleBulkDecision("apply")}>
                    ✅ Qo'llash (apply)
                  </button>
                  <button className="btn btn-sm" onClick={() => handleBulkDecision("mark_missing")}>
                    ❌ Yo'qolgan (mark_missing)
                  </button>
                  <button className="btn btn-sm" onClick={() => handleBulkDecision("ignore")}>
                    ⏭ E'tiborsiz (ignore)
                  </button>
                </div>
              )}
            </div>

            {filteredDiscrepancies.length === 0 ? (
              <div style={{ padding: 28, textAlign: "center", color: "var(--text-secondary)" }}>
                Ushbu guruhda farqlar topilmadi.
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      {!isReadOnly && (
                        <th style={{ width: 36 }}>
                          <input
                            type="checkbox"
                            checked={
                              filteredDiscrepancies.length > 0 &&
                              filteredDiscrepancies.every((d) => selectedDiscIds.includes(d.id))
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDiscIds(filteredDiscrepancies.map((d) => d.id));
                              } else {
                                setSelectedDiscIds([]);
                              }
                            }}
                          />
                        </th>
                      )}
                      <th>Inventar №</th>
                      <th>Buyum nomi</th>
                      <th>Kutilgan joy / miqdor</th>
                      <th>Topilgan joy / miqdor</th>
                      <th>Farq turi</th>
                      <th>Direktor qarori</th>
                      <th>Qaror izohi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDiscrepancies.map((d: any) => (
                      <tr key={d.id}>
                        {!isReadOnly && (
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedDiscIds.includes(d.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedDiscIds((prev) => [...prev, d.id]);
                                } else {
                                  setSelectedDiscIds((prev) => prev.filter((x) => x !== d.id));
                                }
                              }}
                            />
                          </td>
                        )}
                        <td>
                          <code>{d.inventory_no || d.created_inventory_no || "(Yangi extra)"}</code>
                        </td>
                        <td style={{ fontWeight: 700 }}>
                          {d.asset_name}
                          {d.note && (
                            <div style={{ fontSize: 11.5, color: "var(--text-secondary)", fontWeight: 400 }}>
                              💬 {d.note}
                            </div>
                          )}
                        </td>
                        <td>
                          {d.asset_id ? (
                            <>
                              {d.expected_location_name || "—"} ({d.expected_qty ?? 1} {d.unit || "dona"})
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {d.found_location_name ? (
                            <>
                              {d.found_location_name} ({d.counted_qty ?? 1} {d.unit || "dona"})
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <span className={`badge ${RESULT_META[d.result]?.badge || "badge-amber"}`}>
                            {RESULT_META[d.result]?.label || d.result}
                          </span>
                        </td>
                        <td>
                          {isReadOnly ? (
                            <span style={{ fontWeight: 700 }}>
                              {DECISION_META[d.decision]?.label || d.decision || "—"}
                            </span>
                          ) : (
                            <select
                              className="select"
                              value={d.decision || ""}
                              onChange={(e) =>
                                handleSingleDecision(d.id, e.target.value, d.decision_note || "")
                              }
                              style={{ minWidth: 175 }}
                            >
                              <option value="">— Qaror tanlang —</option>
                              <option value="apply">✅ Qo'llash (Yangilash)</option>
                              <option value="mark_missing">❌ Yo'qolgan deb belgilash</option>
                              <option value="ignore">⏭ E'tiborsiz qoldirish</option>
                            </select>
                          )}
                        </td>
                        <td>
                          {isReadOnly ? (
                            d.decision_note || "—"
                          ) : (
                            <input
                              className="input"
                              placeholder="Izoh..."
                              defaultValue={d.decision_note || ""}
                              onBlur={(e) => {
                                if (d.decision && e.target.value !== (d.decision_note || "")) {
                                  handleSingleDecision(d.id, d.decision, e.target.value);
                                }
                              }}
                              style={{ minWidth: 140 }}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* MODAL: Pre-Approval Summary & Confirmation */}
        {approveModalOpen && (
          <div className="modal-backdrop" onClick={() => setApproveModalOpen(false)}>
            <div className="modal-box animate-in" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 10 }}>
                ✅ Sanoqni tasdiqlash ({c.code})
              </h3>
              <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginBottom: 12 }}>
                Tasdiqlash tugmasini bossangiz, bitta tranzaksiyada quyidagi o'zgarishlar mulk bazasiga (`vaqf.assets`
                va `vaqf.asset_events`) qo'llanadi:
              </p>

              <div
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: "var(--bg-subtle, rgba(148,163,184,0.1))",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  fontSize: 13.5,
                  marginBottom: 14,
                }}
              >
                <div>
                  🔄 Joyi, miqdori yoki holati yangilanadigan buyumlar:{" "}
                  <b>{approvalPreviewStats.toUpdateCount} ta</b>
                </div>
                <div>
                  ➕ Yangi mulk kartochkasi ochiladigan (extra) buyumlar:{" "}
                  <b>{approvalPreviewStats.toCreateExtraCount} ta</b>
                </div>
                <div>
                  ❌ «Topilmagan (missing)» holatiga o'tkaziladigan buyumlar:{" "}
                  <b>{approvalPreviewStats.toMarkMissingCount} ta</b>
                </div>
                <div>
                  ⏭ O'zgarishsiz qoldiriladigan (ignore) farqlar:{" "}
                  <b>{approvalPreviewStats.toIgnoreCount} ta</b>
                </div>
                {approvalPreviewStats.undecidedCount > 0 && (
                  <div style={{ color: "#f43f5e", fontWeight: 700 }}>
                    ⚠️ Hali qaror berilmagan farqlar: {approvalPreviewStats.undecidedCount} ta (Avval barchasiga qaror
                    bering!)
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="btn" onClick={() => setApproveModalOpen(false)}>
                  Bekor qilish
                </button>
                <button
                  className="btn btn-primary"
                  disabled={approvalPreviewStats.undecidedCount > 0}
                  onClick={handleApproveCount}
                >
                  ✅ Tasdiqlash va Bazaga Qo'llash
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: Cancel Count */}
        {cancelModal.open && (
          <div className="modal-backdrop" onClick={() => setCancelModal({ open: false, reason: "" })}>
            <div className="modal-box animate-in" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Sanoqni bekor qilish</h3>
              <form onSubmit={handleCancelCount} className="form-grid">
                <div className="form-field full">
                  <label className="form-label">Bekor qilish sababi *</label>
                  <input
                    className="input"
                    placeholder="Sababini kiriting..."
                    value={cancelModal.reason}
                    onChange={(e) => setCancelModal({ ...cancelModal, reason: e.target.value })}
                    required
                  />
                </div>
                <div className="form-field full" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setCancelModal({ open: false, reason: "" })}
                  >
                    Qaytish
                  </button>
                  <button type="submit" className="btn btn-primary" style={{ background: "#e11d48" }}>
                    Bekor qilish
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- COUNTS LIST & 3-STEP WIZARD ---
  return (
    <div className="animate-in">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>Inventarizatsiya (Sanoq)</h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Xonama-xona QR skanerlash, kutilgan va haqiqiy mulkni solishtirish hamda rasmiy dalolatnoma shakllantirish
          </p>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => {
            setWizardStep(1);
            setWizardOpen(true);
          }}
        >
          <Plus size={16} /> Yangi sanoq boshlash
        </button>
      </div>

      <div className="card" style={{ padding: 16 }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: "center" }}>Yuklanmoqda...</div>
        ) : counts.length === 0 ? (
          <div style={{ padding: 36, textAlign: "center", color: "var(--text-secondary)" }}>
            <ClipboardCheck size={36} style={{ margin: "0 auto 10px", opacity: 0.5 }} />
            <div style={{ fontWeight: 700, fontSize: 15 }}>Hozircha sanoqlar o'tkazilmagan</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              Yuqoridagi «Yangi sanoq boshlash» tugmasi orqali 1-inventarizatsiyani yarating.
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Sanoq kodi</th>
                  <th>Sarlavha</th>
                  <th>Muassasa</th>
                  <th>Holat</th>
                  <th>Boshlangan</th>
                  <th>Jarayon</th>
                  <th>Farqlar</th>
                  <th>Amallar</th>
                </tr>
              </thead>
              <tbody>
                {counts.map((c: any) => (
                  <tr key={c.id}>
                    <td>
                      <code style={{ fontWeight: 800 }}>{c.code}</code>
                    </td>
                    <td style={{ fontWeight: 700 }}>{c.title}</td>
                    <td>{c.institution_name}</td>
                    <td>
                      <span className={`badge ${COUNT_STATUS_META[c.status]?.badge || "badge-slate"}`}>
                        {COUNT_STATUS_META[c.status]?.label || c.status}
                      </span>
                    </td>
                    <td>{fmtDateTime(c.started_at || c.created_at)}</td>
                    <td style={{ minWidth: 130 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div
                          style={{
                            flex: 1,
                            height: 7,
                            background: "rgba(148,163,184,0.2)",
                            borderRadius: 4,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${c.progress_pct || 0}%`,
                              height: "100%",
                              background: c.status === "approved" ? "#10b981" : "#f59e0b",
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>{c.progress_pct || 0}%</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                        {c.done_locations}/{c.total_locations} joy • {c.expected_items} buyum
                      </div>
                    </td>
                    <td>
                      {Number(c.discrepancy_count) > 0 ? (
                        <span className="badge badge-amber">{c.discrepancy_count} ta farq</span>
                      ) : (
                        <span style={{ fontSize: 12, opacity: 0.6 }}>Yo'q</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => {
                            setActiveCountId(c.id);
                            loadActiveDetail(c.id);
                          }}
                        >
                          <Eye size={14} /> Ochish
                        </button>
                        {c.status === "in_progress" && (
                          <button className="btn btn-sm" onClick={() => onOpenMobileScanner(c.id)}>
                            <Camera size={14} /> Skaner
                          </button>
                        )}
                        <a
                          href={`/vaqf-api/counts/${c.id}/report.pdf?lang=tr`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-sm"
                          title="Turkcha Dalolatnoma PDF"
                        >
                          <FileDown size={14} /> PDF
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: 3-STEP NEW COUNT WIZARD */}
      {wizardOpen && (
        <div className="modal-backdrop" onClick={() => setWizardOpen(false)}>
          <div
            className="modal-box animate-in"
            style={{ maxWidth: 680 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800 }}>
                Yangi inventarizatsiya (Sanoq) — {wizardStep}/3 qadam
              </h3>
              <button className="btn btn-sm" onClick={() => setWizardOpen(false)}>
                <X size={15} />
              </button>
            </div>

            {/* Live Scope Preview Banner */}
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                background: "rgba(245,158,11,0.12)",
                border: "1px solid rgba(245,158,11,0.3)",
                marginBottom: 14,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>📦 Sanoq qamrovi xulosasi:</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#f59e0b" }}>
                {scopePreview?.asset_cards_count ?? 0} ta kartochka ({scopePreview?.total_units_count ?? 0} dona) •{" "}
                {scopePreview?.locations?.length ?? 0} ta joy/xona
              </span>
            </div>

            {wizardStep === 1 && (
              <div className="form-grid">
                <div className="form-field full">
                  <label className="form-label">Sanoq nomi (sarlavhasi) *</label>
                  <input
                    className="input"
                    value={wizardForm.title}
                    onChange={(e) => setWizardForm({ ...wizardForm, title: e.target.value })}
                    required
                  />
                </div>

                <div className="form-field full">
                  <label className="form-label">Qamrov doirasi</label>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      type="button"
                      className={`btn ${wizardForm.scopeType === "all" ? "btn-primary" : ""}`}
                      onClick={() => setWizardForm({ ...wizardForm, scopeType: "all" })}
                    >
                      🏢 Butun muassasa
                    </button>
                    <button
                      type="button"
                      className={`btn ${wizardForm.scopeType === "custom" ? "btn-primary" : ""}`}
                      onClick={() => setWizardForm({ ...wizardForm, scopeType: "custom" })}
                    >
                      🎯 Tanlangan joylar / kategoriyalar
                    </button>
                  </div>
                </div>

                {wizardForm.scopeType === "custom" && (
                  <>
                    <div className="form-field full">
                      <label className="form-label">Joylarni tanlang (bino, qavat yoki xona)</label>
                      <div
                        style={{
                          maxHeight: 150,
                          overflowY: "auto",
                          border: "1px solid var(--border-color, rgba(148,163,184,0.2))",
                          borderRadius: 8,
                          padding: 8,
                          display: "grid",
                          gridTemplateColumns: "repeat(2, 1fr)",
                          gap: 6,
                        }}
                      >
                        {locations.map((l: any) => (
                          <label key={l.id} style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
                            <input
                              type="checkbox"
                              checked={wizardForm.location_ids.includes(l.id)}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...wizardForm.location_ids, l.id]
                                  : wizardForm.location_ids.filter((x) => x !== l.id);
                                setWizardForm({ ...wizardForm, location_ids: next });
                              }}
                            />
                            {l.name}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="form-field full">
                      <label className="form-label">Kategoriyalarni tanlang (ixtiyoriy)</label>
                      <div
                        style={{
                          maxHeight: 130,
                          overflowY: "auto",
                          border: "1px solid var(--border-color, rgba(148,163,184,0.2))",
                          borderRadius: 8,
                          padding: 8,
                          display: "grid",
                          gridTemplateColumns: "repeat(2, 1fr)",
                          gap: 6,
                        }}
                      >
                        {categories.map((cat: any) => (
                          <label key={cat.id} style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
                            <input
                              type="checkbox"
                              checked={wizardForm.category_ids.includes(cat.id)}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...wizardForm.category_ids, cat.id]
                                  : wizardForm.category_ids.filter((x) => x !== cat.id);
                                setWizardForm({ ...wizardForm, category_ids: next });
                              }}
                            />
                            {cat.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div className="form-field full" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button className="btn btn-primary" onClick={() => setWizardStep(2)}>
                    Keyingi: Mas'ullarni biriktirish →
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 10,
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700 }}>
                    Har bir joy uchun sanovchi mas'ul xodimni tanlang:
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <select
                      className="select"
                      value={bulkStaffRef}
                      onChange={(e) => setBulkStaffRef(e.target.value)}
                      style={{ fontSize: 12.5 }}
                    >
                      <option value="">— Barchasiga biriktirish —</option>
                      {staff.map((s: any) => (
                        <option key={s.ref} value={s.ref}>
                          {s.name} ({s.role})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        const st = staff.find((s: any) => s.ref === bulkStaffRef);
                        if (!st) return;
                        const next = { ...wizardForm.assigneesByLoc };
                        for (const l of scopePreview?.locations || []) {
                          next[l.location_id] = { assignee_ref: st.ref, assignee_name: st.name };
                        }
                        setWizardForm({ ...wizardForm, assigneesByLoc: next });
                      }}
                    >
                      Qo'llash
                    </button>
                  </div>
                </div>

                <div style={{ maxHeight: 280, overflowY: "auto", marginBottom: 14 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Joy / Xona</th>
                        <th>Kutilgan buyum</th>
                        <th>Mas'ul sanovchi xodim</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(scopePreview?.locations || []).map((l: any) => (
                        <tr key={l.location_id}>
                          <td style={{ fontWeight: 700 }}>{l.name}</td>
                          <td>{l.expected_cards} ta</td>
                          <td>
                            <select
                              className="select"
                              value={wizardForm.assigneesByLoc[l.location_id]?.assignee_ref || ""}
                              onChange={(e) => {
                                const st = staff.find((s: any) => s.ref === e.target.value);
                                setWizardForm({
                                  ...wizardForm,
                                  assigneesByLoc: {
                                    ...wizardForm.assigneesByLoc,
                                    [l.location_id]: st
                                      ? { assignee_ref: st.ref, assignee_name: st.name }
                                      : { assignee_ref: "", assignee_name: "" },
                                  },
                                });
                              }}
                            >
                              <option value="">— Tanlang —</option>
                              {staff.map((s: any) => (
                                <option key={s.ref} value={s.ref}>
                                  {s.name} ({s.role})
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <button className="btn" onClick={() => setWizardStep(1)}>
                    ← Orqaga
                  </button>
                  <button className="btn btn-primary" onClick={() => setWizardStep(3)}>
                    Keyingi: Komissiya va Boshlash →
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="form-grid">
                <div className="form-field full">
                  <label className="form-label">Sanoq komissiyasi a'zolari (Dalolatnoma uchun)</label>
                  {wizardForm.committee.map((m, idx) => (
                    <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                      <input
                        className="input"
                        placeholder="Ism Familiya"
                        value={m.name}
                        onChange={(e) => {
                          const next = [...wizardForm.committee];
                          next[idx] = { ...next[idx], name: e.target.value };
                          setWizardForm({ ...wizardForm, committee: next });
                        }}
                      />
                      <input
                        className="input"
                        placeholder="Lavozimi / Rol"
                        value={m.role}
                        onChange={(e) => {
                          const next = [...wizardForm.committee];
                          next[idx] = { ...next[idx], role: e.target.value };
                          setWizardForm({ ...wizardForm, committee: next });
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() =>
                          setWizardForm({
                            ...wizardForm,
                            committee: wizardForm.committee.filter((_, i) => i !== idx),
                          })
                        }
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() =>
                      setWizardForm({
                        ...wizardForm,
                        committee: [...wizardForm.committee, { name: "", role: "Komissiya a'zosi" }],
                      })
                    }
                  >
                    + A'zo qo'shish
                  </button>
                </div>

                <div className="form-field full">
                  <label className="form-label">Izoh</label>
                  <input
                    className="input"
                    placeholder="Sanoq bo'yicha qo'shimcha izoh..."
                    value={wizardForm.notes}
                    onChange={(e) => setWizardForm({ ...wizardForm, notes: e.target.value })}
                  />
                </div>

                <div
                  className="form-field full"
                  style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}
                >
                  <button className="btn" onClick={() => setWizardStep(2)}>
                    ← Orqaga
                  </button>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn" onClick={() => handleCreateCount(false)}>
                      Qoralama sifatida saqlash
                    </button>
                    <button className="btn btn-primary" onClick={() => handleCreateCount(true)}>
                      🚀 Boshlash ({scopePreview?.asset_cards_count ?? 0} ta buyum)
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
