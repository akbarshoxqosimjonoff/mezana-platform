"use client";

import React, { useEffect, useState } from "react";

const CHUNK_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
const IDB_NAME = "ezan_dala_offline_queue";
const IDB_STORE = "uploads";

function openUploadIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "animalId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveQueueItemToIdb(item: any) {
  try {
    const db = await openUploadIndexedDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB unavailable fallback
  }
}

async function loadAllQueueItemsFromIdb(): Promise<any[]> {
  try {
    const db = await openUploadIndexedDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export default function DalaMobilePortalPage() {
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState("field@ezanvakfi.org");
  const [password, setPassword] = useState("EzanField!2027");
  const [totpCode, setTotpCode] = useState("");
  const [loginError, setLoginError] = useState("");

  const [tagSearch, setTagSearch] = useState("");
  const [animals, setAnimals] = useState<any[]>([]);
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [statusMessage, setStatusMessage] = useState("");

  const fetchAnimals = async (query = tagSearch) => {
    try {
      const res = await fetch(`/api/dala?tagNo=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setAnimals(data.animals || []);
      }
    } catch {
      // Offline or unauthenticated
    }
  };

  useEffect(() => {
    fetchAnimals("");
    loadAllQueueItemsFromIdb().then(setQueueItems);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    const res = await fetch("/api/dala", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email, password, totpCode })
    });
    const data = await res.json();
    if (!res.ok) {
      setLoginError(data.error || "Login failed");
      return;
    }
    await fetchAnimals("");
  };

  const handleMarkSlaughtered = async (animalId: number) => {
    setStatusMessage("");
    const res = await fetch("/api/dala", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_slaughtered", animalId })
    });
    const data = await res.json();
    if (res.ok) {
      setStatusMessage(`✓ Tag ${data.tagNo}: Kesildi deb belgilandi va hissedorlarga 2-xabar yuborildi.`);
      await fetchAnimals(tagSearch);
    } else {
      setStatusMessage(`Xato: ${data.error || "Failed"}`);
    }
  };

  const handleVideoFileSelect = async (animal: any, file: File | null) => {
    if (!file) return;
    setStatusMessage("");

    const ext = file.name.toLowerCase();
    if (!ext.endsWith(".mp4") && !ext.endsWith(".mov")) {
      setStatusMessage("Xato: Faqat MP4 yoki MOV video fayl yuklash mumkin.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_VIDEO_BYTES) {
      setStatusMessage("Xato: Video hajmi 2 GB dan oshmasligi shart.");
      return;
    }

    // 1. Multipart upload sessiyasini boshlaymiz
    const initRes = await fetch("/api/dala", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "initiate_upload",
        animalId: animal.id,
        fileName: file.name,
        mimeType: file.type || (ext.endsWith(".mov") ? "video/quicktime" : "video/mp4"),
        totalSizeBytes: file.size
      })
    });
    const initData = await initRes.json();
    if (!initRes.ok) {
      setStatusMessage(`Xato: ${initData.error || "Upload init failed"}`);
      return;
    }

    const { uploadId, totalParts } = initData;
    await saveQueueItemToIdb({
      animalId: animal.id,
      tagNo: animal.tag_no,
      uploadId,
      fileName: file.name,
      totalSizeBytes: file.size,
      totalParts,
      completedParts: 0,
      status: "uploading"
    });
    setQueueItems(await loadAllQueueItemsFromIdb());

    // 2. 8 MB bo'laklarga bo'lib yuklaymiz (uzilsa davom ettirish mumkin)
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const start = (partNumber - 1) * CHUNK_SIZE_BYTES;
      const end = Math.min(file.size, start + CHUNK_SIZE_BYTES);
      const blob = file.slice(start, end);
      const arrayBuf = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]!);
      }
      const chunkDataBase64 = btoa(binary);

      const partRes = await fetch("/api/dala", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upload_part",
          uploadId,
          partNumber,
          sizeBytes: bytes.byteLength,
          chunkDataBase64
        })
      });
      if (!partRes.ok) {
        setStatusMessage(`Qism #${partNumber} uzildi — navbat IndexedDB'da saqlandi.`);
        return;
      }

      await saveQueueItemToIdb({
        animalId: animal.id,
        tagNo: animal.tag_no,
        uploadId,
        fileName: file.name,
        totalSizeBytes: file.size,
        totalParts,
        completedParts: partNumber,
        status: "uploading"
      });
      setQueueItems(await loadAllQueueItemsFromIdb());
    }

    // 3. Yakunlash va FFmpeg worker navbatiga qo'shish
    const finRes = await fetch("/api/dala", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "finalize_upload",
        uploadId
      })
    });
    const finData = await finRes.json();
    if (finRes.ok) {
      await saveQueueItemToIdb({
        animalId: animal.id,
        tagNo: animal.tag_no,
        uploadId,
        fileName: file.name,
        totalSizeBytes: file.size,
        totalParts,
        completedParts: totalParts,
        status: "completed"
      });
      setQueueItems(await loadAllQueueItemsFromIdb());
      setStatusMessage(`✓ ${finData.coordinatorAlert}`);
      await fetchAnimals(tagSearch);
    }
  };

  if (!user) {
    return (
      <main className="min-h-screen bg-surface px-4 py-10">
        <div className="max-w-md mx-auto bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4" data-testid="dala-login-card">
          <span className="inline-block px-3 py-1 rounded-full bg-emerald-100 text-emerald-950 text-xs font-bold">
            Saha Kurban Ekibi Portalı (/dala)
          </span>
          <h1 className="text-2xl font-heading font-extrabold text-brand">
            Dala Jamoasi Kirish (2FA • 4 Kunlik Sessiya)
          </h1>
          {loginError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-300 text-xs font-bold text-red-900" role="alert">
              {loginError}
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label htmlFor="dala-email" className="block text-xs font-bold text-brand mb-1">
                E-posta (field roli)
              </label>
              <input
                id="dala-email"
                data-testid="dala-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="dala-password" className="block text-xs font-bold text-brand mb-1">
                Parol
              </label>
              <input
                id="dala-password"
                data-testid="dala-password-input"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="dala-totp" className="block text-xs font-bold text-brand mb-1">
                6 Xonali 2FA (TOTP) Kod
              </label>
              <input
                id="dala-totp"
                data-testid="dala-totp-input"
                type="text"
                required
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-center text-base font-bold text-brand"
              />
            </div>
            <button
              type="submit"
              data-testid="dala-login-submit"
              className="w-full py-3 rounded-xl bg-brand text-white font-extrabold text-sm"
            >
              Kirish / Giriş Yap
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface px-4 py-6" data-testid="dala-portal-main">
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-xs font-bold text-emerald-900">
              Dala Jamoasi: {user.email} ({user.assignedCountryCode || "ALL"})
            </span>
            <h1 className="text-xl font-heading font-extrabold text-brand">
              Qurbonlik Kesim va Video Yuklash (/dala)
            </h1>
          </div>
          <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-950 text-xs font-bold">
            8 MB Resumable • IndexedDB
          </span>
        </div>

        {statusMessage && (
          <div
            className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-xs font-bold text-emerald-950"
            data-testid="dala-status-banner"
          >
            {statusMessage}
          </div>
        )}

        {/* TagNo bo'yicha qidiruv */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 flex gap-2">
          <label htmlFor="dala-tag-search" className="sr-only">
            Tag No Qidiruv
          </label>
          <input
            id="dala-tag-search"
            data-testid="dala-tag-search-input"
            type="text"
            placeholder="Tag No bo'yicha qidirish (masalan: TD-2027-B001)..."
            value={tagSearch}
            onChange={(e) => {
              setTagSearch(e.target.value);
              fetchAnimals(e.target.value);
            }}
            className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
          />
          <button
            type="button"
            onClick={() => fetchAnimals(tagSearch)}
            className="px-4 py-2.5 rounded-xl bg-brand text-white font-bold text-xs"
          >
            Qidirish
          </button>
        </div>

        {/* IndexedDB yuklash navbati */}
        {queueItems.length > 0 && (
          <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-2" data-testid="dala-idb-queue">
            <h2 className="text-xs font-extrabold text-brand uppercase">
              Video Yuklash Navbati (IndexedDB)
            </h2>
            {queueItems.map((q) => (
              <div key={q.animalId} className="text-xs flex items-center justify-between p-2 rounded-lg bg-slate-50">
                <span className="font-mono font-bold text-brand">
                  {q.tagNo} ({q.fileName})
                </span>
                <span className="font-bold text-emerald-900">
                  {q.completedParts}/{q.totalParts} qism ({q.status})
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Hayvonlar ro'yxati */}
        <div className="space-y-4">
          {animals.map((animal) => (
            <div
              key={animal.id}
              data-testid={`dala-animal-card-${animal.tag_no}`}
              className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3"
            >
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div>
                  <span className="font-mono text-base font-extrabold text-brand">{animal.tag_no}</span>
                  <span className="ms-2 text-xs font-bold text-slate-700">
                    ({animal.country_code} • {animal.animal_type} • {animal.shares_capacity} hisse)
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-950 text-xs font-bold">
                  {animal.status}
                </span>
              </div>

              <div className="space-y-1">
                <div className="text-xs font-bold text-brand">Hissedorlar (Ovoz chiqarib o'qish uchun):</div>
                {(animal.shares || []).map((sh: any, i: number) => (
                  <div key={sh.id || i} className="text-xs text-slate-800 pl-2">
                    {i + 1}. <strong>{sh.ownerName}</strong> — [{String(sh.intentionType).toUpperCase()}]
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleMarkSlaughtered(animal.id)}
                  data-testid={`dala-slaughter-btn-${animal.tag_no}`}
                  className="px-4 py-2.5 rounded-xl bg-accent text-brand font-extrabold text-xs"
                >
                  ✓ Kesildi deb belgilash
                </button>

                <label
                  htmlFor={`video-upload-${animal.id}`}
                  className="px-4 py-2.5 rounded-xl bg-brand text-white font-bold text-xs cursor-pointer"
                >
                  Video Yuklash (MP4/MOV ≤ 2GB)
                  <input
                    id={`video-upload-${animal.id}`}
                    data-testid={`dala-video-input-${animal.tag_no}`}
                    type="file"
                    accept="video/mp4,video/quicktime,.mp4,.mov"
                    onChange={(e) => handleVideoFileSelect(animal, e.target.files?.[0] || null)}
                    className="sr-only"
                  />
                </label>

                {animal.video_status && (
                  <span className="text-xs font-bold text-emerald-900" data-testid={`dala-video-status-${animal.tag_no}`}>
                    Video: {animal.video_status}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
