import React, { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Camera,
  Check,
  CheckCircle2,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  History,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserMinus,
  Users,
  Wrench,
  X,
} from "lucide-react";

export const DOC_TYPE_META: Record<string, { label: string; trLabel: string; badge: string; color: string }> = {
  assignment: {
    label: "Zimmatga berish",
    trLabel: "Zimmet Tutanağı",
    badge: "badge-emerald",
    color: "#10b981",
  },
  return: {
    label: "Zimmatdan qaytarish",
    trLabel: "Zimmet İade Tutanağı",
    badge: "badge-cyan",
    color: "#06b6d4",
  },
  transfer: {
    label: "Ko'chirish (Joylashuv)",
    trLabel: "Devir-Teslim Tutanağı",
    badge: "badge-violet",
    color: "#a855f7",
  },
  repair: {
    label: "Ta'mirlash",
    trLabel: "Bakım-Onarım Formu",
    badge: "badge-amber",
    color: "#f59e0b",
  },
  writeoff: {
    label: "Hisobdan chiqarish",
    trLabel: "Hurdaya Ayırma / Kayıttan Düşme",
    badge: "badge-rose",
    color: "#f43f5e",
  },
};

export const DOC_STATUS_META: Record<string, { label: string; badge: string }> = {
  draft: { label: "Qoralama", badge: "badge-slate" },
  pending_approval: { label: "Direktor tasdig'ida", badge: "badge-amber" },
  approved: { label: "Tasdiqlangan (Jarayonda)", badge: "badge-cyan" },
  completed: { label: "Yakunlangan", badge: "badge-emerald" },
  rejected: { label: "Rad etilgan", badge: "badge-rose" },
  cancelled: { label: "Bekor qilingan", badge: "badge-slate" },
};

export const ROLE_META: Record<string, { label: string; badge: string; desc: string }> = {
  director: {
    label: "Direktor",
    badge: "badge-amber",
    desc: "To'liq huquq: barcha amallar, hisobdan chiqarish va ko'chirishlarni tasdiqlash, rollarni boshqarish",
  },
  inventory_manager: {
    label: "Inventar mas'uli",
    badge: "badge-emerald",
    desc: "Kartochka qo'shish/tahrirlash, ko'chirish, zimmatga berish, ta'mir, hisobdan chiqarish so'rovi, sanoq o'tkazish",
  },
  accountant: {
    label: "Hisobchi (Muhasib)",
    badge: "badge-cyan",
    desc: "Mulk va qarorlarni o'qish; hadyalar (bağış) va ijara shartnomalarini kiritish hamda tahrirlash",
  },
  board_member: {
    label: "Yönetim Kurulu a'zosi",
    badge: "badge-violet",
    desc: "Faqat o'qish: vaqf bosh sahifasi, hisobotlar, mulk, hadyalar, ijara va Yönetim Kurulu qarorlarini ko'rish",
  },
  staff: {
    label: "Xodim (Staff)",
    badge: "badge-slate",
    desc: "Faqat o'z zimmasidagi buyumlarni ko'rish, qabul qilishni tasdiqlash va nosozlik xabar qilish",
  },
};

export const WRITEOFF_REASON_LABELS: Record<string, string> = {
  broken: "Yaroqsiz / Singan (tuzatib bo'lmaydi)",
  lost: "Yo'qolgan / Topilmadi",
  stolen: "O'g'irlangan",
  obsolete: "Ma'naviy yoki jismoniy eskirgan",
  sold: "Sotilgan",
  donated_out: "Boshqa muassasaga / shaxsga hadya qilingan",
  other: "Boshqa sabab",
};

export const REPAIR_RESULT_LABELS: Record<string, string> = {
  fixed: "Tuzatildi (Foydalanishga qaytarildi)",
  not_fixable: "Tuzatib bo'lmaydi (Yaroqsiz)",
  replaced: "Almashtirildi (Yangi qism / buyum bilan)",
};

async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err: any = new Error(data?.error || data?.message || `Xatolik (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Faylni o'qishda xatolik"));
    reader.readAsDataURL(file);
  });
}

const fmtTRY = (val: number | string | null | undefined) => {
  const n = Math.round(Number(val) || 0);
  return `\u20BA${n.toLocaleString("tr-TR")}`;
};

// ============================================================================
// NEW DOCUMENT MODAL (Supports all 5 types + Asset Search / QR Code lookup)
// ============================================================================
export function NewDocumentModal({
  open,
  onClose,
  initialType = "assignment",
  initialAssets = [],
  initialReason = "",
  initialToPersonRef = "",
  initialToPersonName = "",
  initialFromPersonRef = "",
  initialFromPersonName = "",
  initialFaultReportId = null,
  institutionId = 1,
  institutions = [],
  flatLocations = [],
  staffList = [],
  notify,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  initialType?: string;
  initialAssets?: any[];
  initialReason?: string;
  initialToPersonRef?: string;
  initialToPersonName?: string;
  initialFromPersonRef?: string;
  initialFromPersonName?: string;
  initialFaultReportId?: number | null;
  institutionId?: number;
  institutions?: any[];
  flatLocations?: { id: number; label: string; kind: string }[];
  staffList?: any[];
  notify: (msg: string, type?: "ok" | "err") => void;
  onCreated: (doc: any) => void;
}) {
  const [docType, setDocType] = useState(initialType || "assignment");
  const [items, setItems] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const [toPersonName, setToPersonName] = useState(initialToPersonName || "");
  const [toPersonRef, setToPersonRef] = useState(initialToPersonRef || "");
  const [fromPersonName, setFromPersonName] = useState(initialFromPersonName || "");
  const [fromPersonRef, setFromPersonRef] = useState(initialFromPersonRef || "");
  const [toLocationId, setToLocationId] = useState("");
  const [toInstitutionId, setToInstitutionId] = useState("");
  const [expectedReturnAt, setExpectedReturnAt] = useState("");
  const [reason, setReason] = useState(initialReason || "");
  const [notes, setNotes] = useState("");

  // Repair fields
  const [vendor, setVendor] = useState("");
  const [repairCost, setRepairCost] = useState("");
  const [repairCurrency, setRepairCurrency] = useState("TRY");
  const [expenseRef, setExpenseRef] = useState("");
  const [repairResult, setRepairResult] = useState("");

  // Writeoff fields
  const [writeoffReason, setWriteoffReason] = useState("broken");
  const [saleAmount, setSaleAmount] = useState("");

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDocType(initialType || "assignment");
    setReason(initialReason || "");
    setToPersonName(initialToPersonName || "");
    setToPersonRef(initialToPersonRef || "");
    setFromPersonName(initialFromPersonName || "");
    setFromPersonRef(initialFromPersonRef || "");
    setItems(
      (initialAssets || []).map((a: any) => ({
        asset_id: a.asset_id || a.id,
        inventory_no: a.inventory_no,
        name: a.asset_name || a.name,
        tracking: a.tracking || "individual",
        max_qty: Number(a.qty ?? a.quantity ?? 1),
        qty: Number(a.qty ?? (a.tracking === "batch" ? a.quantity || 1 : 1)),
        unit: a.unit || "dona",
        condition_before: a.condition || "good",
        condition_after: a.condition || "good",
        purchase_price: a.purchase_price,
        currency: a.currency || "TRY",
        location_name: a.location_name,
        responsible_name: a.responsible_name,
      }))
    );
  }, [open, initialType, initialAssets, initialReason, initialToPersonName, initialToPersonRef, initialFromPersonName, initialFromPersonRef]);

  const handleSearchAssets = async (qStr: string) => {
    setSearchQuery(qStr);
    if (!qStr.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await apiFetch(
        `/vaqf-api/assets?institution_id=${institutionId}&search=${encodeURIComponent(qStr.trim())}&limit=12`
      );
      setSearchResults((res.items || []).filter((a: any) => a.status !== "written_off"));
    } catch {
    } finally {
      setSearching(false);
    }
  };

  const addAssetToDoc = (a: any) => {
    if (items.some((x) => Number(x.asset_id) === Number(a.id))) {
      notify("Bu buyum allaqachon ro'yxatga qo'shilgan", "err");
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        asset_id: a.id,
        inventory_no: a.inventory_no,
        name: a.name,
        tracking: a.tracking || "individual",
        max_qty: Number(a.quantity || 1),
        qty: a.tracking === "batch" ? Number(a.quantity || 1) : 1,
        unit: a.unit || "dona",
        condition_before: a.condition || "good",
        condition_after: a.condition || "good",
        purchase_price: a.purchase_price,
        currency: a.currency || "TRY",
        location_name: a.location_name,
        responsible_name: a.responsible_name,
      },
    ]);
    if (!fromPersonName && a.responsible_name) {
      setFromPersonName(a.responsible_name);
      setFromPersonRef(a.responsible_ref || a.responsible_name);
    }
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleSubmit = async (submitImmediately: boolean) => {
    if (items.length === 0) {
      notify("Hujjatga kamida bitta buyum qo'shing", "err");
      return;
    }
    if (docType === "assignment" && !toPersonName.trim() && !toPersonRef.trim()) {
      notify("Zimmatga oluvchi xodimni tanlang", "err");
      return;
    }
    if (docType === "transfer" && !toLocationId && !toInstitutionId) {
      notify("Ko'chirish uchun maqsad xona/joyni yoki muassasani tanlang", "err");
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = {
        type: docType,
        institution_id: institutionId,
        to_location_id: toLocationId ? Number(toLocationId) : null,
        to_institution_id: toInstitutionId ? Number(toInstitutionId) : null,
        to_person_ref: toPersonRef || toPersonName || null,
        to_person_name: toPersonName || toPersonRef || null,
        from_person_ref: fromPersonRef || fromPersonName || null,
        from_person_name: fromPersonName || fromPersonRef || null,
        expected_return_at: expectedReturnAt || null,
        reason: reason || null,
        notes: notes || null,
        submit: submitImmediately,
        items: items.map((it) => ({
          asset_id: it.asset_id,
          qty: Number(it.qty || 1),
          condition_before: it.condition_before || "good",
          condition_after: it.condition_after || "good",
        })),
      };

      if (docType === "repair") {
        payload.vendor = vendor || null;
        if (repairCost !== "") payload.cost = Number(repairCost);
        payload.currency = repairCurrency;
        payload.expense_ref = expenseRef || null;
        if (repairResult) payload.result = repairResult;
        if (initialFaultReportId) payload.fault_report_id = initialFaultReportId;
      }

      if (docType === "writeoff") {
        payload.writeoff_reason = writeoffReason;
        if (saleAmount !== "") payload.sale_amount = Number(saleAmount);
      }

      const created = await apiFetch("/vaqf-api/documents", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      notify(
        submitImmediately
          ? `Hujjat rasmiylashtirildi: ${created.doc_no} (${DOC_STATUS_META[created.status]?.label || created.status})`
          : `Qoralama saqlandi: ${created.doc_no}`
      );
      onCreated(created);
      onClose();
    } catch (e: any) {
      notify(e.message, "err");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 250,
        background: "rgba(2, 6, 23, 0.82)",
        backdropFilter: "blur(6px)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        overflowY: "auto",
      }}
    >
      <div className="glass-card" style={{ width: "100%", maxWidth: 820, maxHeight: "92vh", overflowY: "auto" }}>
        <div className="section-header">
          <div className="section-title">
            <FileText size={18} color="#fbcc42" /> Yangi dalolatnoma / hujjat yaratish
          </div>
          <button className="btn btn-sm" onClick={onClose}>
            <X size={15} /> Yopish
          </button>
        </div>

        {/* Document Type Selector */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 16 }}>
          {Object.entries(DOC_TYPE_META).map(([k, meta]) => (
            <button
              key={k}
              type="button"
              onClick={() => setDocType(k)}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: docType === k ? `2px solid ${meta.color}` : "1px solid var(--border-subtle)",
                background: docType === k ? "rgba(251, 204, 66, 0.12)" : "rgba(15, 23, 42, 0.45)",
                color: "var(--text-primary)",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13, color: docType === k ? meta.color : "var(--text-primary)" }}>
                {meta.label}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{meta.trLabel}</div>
            </button>
          ))}
        </div>

        {/* Asset Search & Add */}
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 12, background: "rgba(15,23,42,0.45)", border: "1px solid var(--border-subtle)" }}>
          <label className="form-label" style={{ marginBottom: 6, display: "block" }}>
            Buyumlarni qidirish yoki inventar raqamini (QR) kiritish *
          </label>
          <div style={{ position: "relative" }}>
            <input
              className="input"
              placeholder="Inventar № (masalan: VQF-MZN-2026-00001) yoki buyum nomi..."
              value={searchQuery}
              onChange={(e) => handleSearchAssets(e.target.value)}
            />
            {searchResults.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  zIndex: 40,
                  marginTop: 4,
                  borderRadius: 10,
                  background: "#0f172a",
                  border: "1px solid rgba(251,204,66,0.35)",
                  maxHeight: 240,
                  overflowY: "auto",
                  boxShadow: "0 12px 28px rgba(0,0,0,0.6)",
                }}
              >
                {searchResults.map((a) => (
                  <div
                    key={a.id}
                    onClick={() => addAssetToDoc(a)}
                    style={{
                      padding: "9px 12px",
                      borderBottom: "1px solid var(--border-subtle)",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <span style={{ fontFamily: "monospace", color: "#fbcc42", fontWeight: 700, marginRight: 8 }}>
                        {a.inventory_no}
                      </span>
                      <strong>{a.name}</strong>
                      <span style={{ fontSize: 11.5, color: "var(--text-muted)", marginLeft: 8 }}>
                        ({a.location_name || "Joysiz"} • {a.responsible_name || "Javobgarsiz"})
                      </span>
                    </div>
                    <span className="badge badge-emerald">+ Qo'shish ({a.quantity} {a.unit})</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Selected items list */}
          {items.length === 0 ? (
            <div style={{ padding: 14, textAlign: "center", color: "var(--text-muted)", fontSize: 12.5, marginTop: 8 }}>
              Hali buyum tanlanmagan. Yuqoridagi qidiruv orqali buyum qo'shing.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
              {items.map((it, idx) => (
                <div
                  key={it.asset_id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "rgba(2,6,23,0.5)",
                    border: "1px solid var(--border-subtle)",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <span style={{ fontFamily: "monospace", color: "#fbcc42", fontWeight: 700, marginRight: 8 }}>
                      {it.inventory_no}
                    </span>
                    <strong>{it.name}</strong>
                    {it.purchase_price ? (
                      <span style={{ fontSize: 11.5, color: "#10b981", marginLeft: 8 }}>
                        ({fmtTRY(it.purchase_price)})
                      </span>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {it.tracking === "batch" && (
                      <input
                        type="number"
                        min="1"
                        max={it.max_qty}
                        className="input"
                        style={{ width: 80, padding: "4px 8px" }}
                        value={it.qty}
                        onChange={(e) => {
                          const v = Number(e.target.value || 1);
                          setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, qty: v } : x)));
                        }}
                      />
                    )}
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {it.tracking === "individual" ? `1 ${it.unit}` : `${it.unit} (maks: ${it.max_qty})`}
                    </span>
                    {docType === "return" && (
                      <select
                        className="select"
                        style={{ width: 130, padding: "4px 8px", fontSize: 12 }}
                        value={it.condition_after}
                        onChange={(e) => {
                          const v = e.target.value;
                          setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, condition_after: v } : x)));
                        }}
                      >
                        <option value="new">Holati: Yangi</option>
                        <option value="good">Holati: Yaxshi</option>
                        <option value="fair">Holati: O'rtacha</option>
                        <option value="poor">Holati: Yaroqsiz</option>
                      </select>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dynamic Type Fields */}
        <div className="form-grid">
          {docType === "assignment" && (
            <>
              <div className="form-field">
                <label className="form-label">Zimmatga oluvchi xodim *</label>
                <input
                  className="input"
                  list="vaqf-staff-datalist"
                  placeholder="Xodim ismini tanlang yoki yozing..."
                  value={toPersonName}
                  onChange={(e) => {
                    const val = e.target.value;
                    const matched = staffList.find((s) => s.name === val);
                    setToPersonName(val);
                    setToPersonRef(matched ? matched.ref : val);
                  }}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Foydalanish xonasi / joyi (ixtiyoriy)</label>
                <select className="select" value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
                  <option value="">— O'zgarmaydi —</option>
                  {flatLocations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Qaytarish muddati (vaqtinchalik zimmat bo'lsa)</label>
                <input
                  type="date"
                  className="input"
                  value={expectedReturnAt}
                  onChange={(e) => setExpectedReturnAt(e.target.value)}
                />
              </div>
            </>
          )}

          {docType === "return" && (
            <>
              <div className="form-field">
                <label className="form-label">Topshiruvchi xodim</label>
                <input
                  className="input"
                  list="vaqf-staff-datalist"
                  placeholder="Xodim ismi..."
                  value={fromPersonName}
                  onChange={(e) => {
                    const val = e.target.value;
                    const matched = staffList.find((s) => s.name === val);
                    setFromPersonName(val);
                    setFromPersonRef(matched ? matched.ref : val);
                  }}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Qabul qilinadigan xona yoki ombor</label>
                <select className="select" value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
                  <option value="">— Omborga (in_storage) —</option>
                  {flatLocations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {docType === "transfer" && (
            <>
              <div className="form-field">
                <label className="form-label">Qaysi xona / joyga ko'chiriladi *</label>
                <select className="select" value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
                  <option value="">— Joyni tanlang —</option>
                  {flatLocations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Yangi javobgar xodim (ixtiyoriy)</label>
                <input
                  className="input"
                  list="vaqf-staff-datalist"
                  placeholder="O'zgarmasa bo'sh qoldiring..."
                  value={toPersonName}
                  onChange={(e) => {
                    const val = e.target.value;
                    const matched = staffList.find((s) => s.name === val);
                    setToPersonName(val);
                    setToPersonRef(matched ? matched.ref : val);
                  }}
                />
              </div>
              {institutions.length > 1 && (
                <div className="form-field">
                  <label className="form-label">Boshqa muassasaga o'tkazish (Direktor tasdig'i bilan)</label>
                  <select className="select" value={toInstitutionId} onChange={(e) => setToInstitutionId(e.target.value)}>
                    <option value="">— Shu muassasa ichida —</option>
                    {institutions
                      .filter((inst) => Number(inst.id) !== Number(institutionId))
                      .map((inst) => (
                        <option key={inst.id} value={inst.id}>
                          {inst.name} ({inst.code})
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </>
          )}

          {docType === "repair" && (
            <>
              <div className="form-field">
                <label className="form-label">Usta / Servis markazi (Vendor)</label>
                <input
                  className="input"
                  placeholder="Masalan: Teknik Servis / Usta Ahmad..."
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Ta'mir xarajati va valyuta (ixtiyoriy)</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className="input"
                    placeholder="0"
                    value={repairCost}
                    onChange={(e) => setRepairCost(e.target.value)}
                  />
                  <select
                    className="select"
                    style={{ width: 95 }}
                    value={repairCurrency}
                    onChange={(e) => setRepairCurrency(e.target.value)}
                  >
                    <option value="TRY">TRY (₺)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>
              <div className="form-field">
                <label className="form-label">Moliya xarajat havolasi (expense_ref, ixtiyoriy)</label>
                <input
                  className="input"
                  placeholder="Masalan: EXP-2026-042"
                  value={expenseRef}
                  onChange={(e) => setExpenseRef(e.target.value)}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Ta'mir holati / natijasi</label>
                <select className="select" value={repairResult} onChange={(e) => setRepairResult(e.target.value)}>
                  <option value="">⏳ Ta'mirga yuborilmoqda (Jarayonda)</option>
                  <option value="fixed">✅ Tuzatildi (Darhol yakunlash)</option>
                  <option value="not_fixable">❌ Tuzatib bo'lmaydi (Yaroqsiz)</option>
                  <option value="replaced">🔄 Almashtirildi</option>
                </select>
              </div>
            </>
          )}

          {docType === "writeoff" && (
            <>
              <div className="form-field">
                <label className="form-label">Hisobdan chiqarish sababi *</label>
                <select className="select" value={writeoffReason} onChange={(e) => setWriteoffReason(e.target.value)}>
                  {Object.entries(WRITEOFF_REASON_LABELS).map(([k, lbl]) => (
                    <option key={k} value={k}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>
              {writeoffReason === "sold" && (
                <div className="form-field">
                  <label className="form-label">Sotuv summasi (TRY)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className="input"
                    placeholder="Sotilgan narxi..."
                    value={saleAmount}
                    onChange={(e) => setSaleAmount(e.target.value)}
                  />
                </div>
              )}
            </>
          )}

          <div className="form-field" style={{ gridColumn: "1 / -1" }}>
            <label className="form-label">
              {docType === "repair" ? "Nosozlik tavsifi / Shikoyat *" : "Asos / Sabab va izoh"}
            </label>
            <input
              className="input"
              placeholder="Batafsil izoh yozing..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
          <button type="button" className="btn" onClick={onClose} disabled={submitting}>
            Bekor qilish
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => handleSubmit(false)}
            disabled={submitting}
          >
            Qoralama sifatida saqlash
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => handleSubmit(true)}
            disabled={submitting}
          >
            <Check size={16} /> Rasmiylashtirish va Yuborish
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 1. HUJJATLAR VA TASDIQLAR SECTION
// ============================================================================
export function DocumentsAndApprovalsSection({
  mode = "documents",
  institutionId = 1,
  institutions = [],
  flatLocations = [],
  staffList = [],
  vAccess = {},
  notify,
  onOpenAsset,
}: {
  mode?: "documents" | "approvals";
  institutionId?: number;
  institutions?: any[];
  flatLocations?: any[];
  staffList?: any[];
  vAccess?: any;
  notify: (msg: string, type?: "ok" | "err") => void;
  onOpenAsset?: (assetId: number) => void;
}) {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState(mode === "approvals" ? "pending_approval" : "");
  const [searchFilter, setSearchFilter] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [newModalOpen, setNewModalOpen] = useState(false);

  // Repair completion modal state
  const [repairModalDoc, setRepairModalDoc] = useState<any>(null);
  const [repResult, setRepResult] = useState("fixed");
  const [repCost, setRepCost] = useState("");
  const [repVendor, setRepVendor] = useState("");
  const [repExpenseRef, setRepExpenseRef] = useState("");

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === "approvals") {
        const res = await apiFetch("/vaqf-api/approvals");
        setDocs(res.items || []);
      } else {
        const q = new URLSearchParams();
        q.set("institution_id", String(institutionId));
        if (typeFilter) q.set("type", typeFilter);
        if (statusFilter) q.set("status", statusFilter);
        if (searchFilter) q.set("person", searchFilter);
        const res = await apiFetch(`/vaqf-api/documents?${q.toString()}`);
        setDocs(res.items || []);
      }
    } catch (e: any) {
      notify(e.message, "err");
    } finally {
      setLoading(false);
    }
  }, [mode, institutionId, typeFilter, statusFilter, searchFilter, notify]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const openDetail = async (id: number) => {
    try {
      const d = await apiFetch(`/vaqf-api/documents/${id}`);
      setSelectedDoc(d);
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const handleAction = async (docId: number, action: "submit" | "approve" | "reject" | "cancel" | "confirm") => {
    let body: any = {};
    if (action === "reject") {
      const r = window.prompt("Rad etish sababini kiriting:");
      if (r === null) return;
      body.reason = r || "Direktor tomonidan rad etildi";
    }
    try {
      const updated = await apiFetch(`/vaqf-api/documents/${docId}/${action}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      notify(`Amal bajarildi: ${updated.doc_no} (${DOC_STATUS_META[updated.status]?.label || updated.status})`);
      if (selectedDoc?.id === docId) setSelectedDoc(updated);
      loadDocs();
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const submitCompleteRepair = async () => {
    if (!repairModalDoc) return;
    try {
      const updated = await apiFetch(`/vaqf-api/documents/${repairModalDoc.id}/complete-repair`, {
        method: "POST",
        body: JSON.stringify({
          result: repResult,
          cost: repCost !== "" ? Number(repCost) : undefined,
          vendor: repVendor || undefined,
          expense_ref: repExpenseRef || undefined,
        }),
      });
      notify(`Ta'mir hujjati yakunlandi: ${updated.doc_no}`);
      setRepairModalDoc(null);
      if (selectedDoc?.id === updated.id) setSelectedDoc(updated);
      loadDocs();
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  return (
    <div className="animate-in">
      <div className="glass-card" style={{ marginBottom: 18 }}>
        <div className="section-header" style={{ flexWrap: "wrap", gap: 10 }}>
          <div>
            <div className="section-title">
              {mode === "approvals" ? (
                <>
                  <ShieldCheck size={19} color="#fbcc42" /> Direktor tasdig'ini kutayotgan hujjatlar ({docs.length})
                </>
              ) : (
                <>
                  <FileText size={19} color="#fbcc42" /> Mulk harakati hujjatlari va dalolatnomalar ({docs.length})
                </>
              )}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 2 }}>
              {mode === "approvals"
                ? "Hisobdan chiqarish, muassasalar arasi ko'chirish va yuqori qiymatli buyumlar harakati tasdig'i"
                : "Zimmatga berish, qaytarish, ko'chirish, ta'mirlash va hisobdan chiqarish dalolatnomalari (TR / UZ PDF)"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {vAccess.canEdit && mode === "documents" && (
              <button className="btn btn-primary" onClick={() => setNewModalOpen(true)}>
                <Plus size={15} /> Yangi hujjat yaratish
              </button>
            )}
            <button className="btn btn-sm" onClick={loadDocs}>
              <RefreshCw size={14} className={loading ? "pulse-dot" : ""} /> Yangilash
            </button>
          </div>
        </div>

        {mode === "documents" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 14 }}>
            <select className="select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">Barcha hujjat turlari</option>
              {Object.entries(DOC_TYPE_META).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label} ({v.trLabel})
                </option>
              ))}
            </select>
            <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Barcha holatlar</option>
              {Object.entries(DOC_STATUS_META).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
            <input
              className="input"
              placeholder="Xodim ismi bo'yicha qidirish..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
          </div>
        )}

        {docs.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
            {mode === "approvals"
              ? "Hozirda tasdiqlash kutilayotgan hujjatlar yo'q."
              : "Hujjatlar topilmadi. 'Yangi hujjat yaratish' tugmasi orqali zimmat, ko'chirish yoki ta'mir dalolatnomasi yarating."}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hujjat №</th>
                  <th>Turi</th>
                  <th>Buyumlar</th>
                  <th>Yo'nalish / Xodim / Joy</th>
                  <th>Holati</th>
                  <th>Sana</th>
                  <th style={{ textAlign: "right" }}>Amallar va PDF</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => {
                  const tMeta = DOC_TYPE_META[d.type] || { label: d.type, badge: "badge-slate" };
                  const sMeta = DOC_STATUS_META[d.status] || { label: d.status, badge: "badge-slate" };
                  return (
                    <tr key={d.id}>
                      <td>
                        <button
                          type="button"
                          onClick={() => openDetail(d.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#fbcc42",
                            fontFamily: "monospace",
                            fontWeight: 800,
                            fontSize: 13,
                            cursor: "pointer",
                            textDecoration: "underline",
                          }}
                        >
                          {d.doc_no}
                        </button>
                      </td>
                      <td>
                        <span className={`badge ${tMeta.badge}`}>{tMeta.label}</span>
                      </td>
                      <td>
                        <div style={{ fontSize: 12.5 }}>
                          {(d.items_preview || []).slice(0, 2).map((it: any) => (
                            <div key={it.asset_id}>
                              <span style={{ fontFamily: "monospace", color: "var(--text-muted)" }}>{it.inventory_no}</span>{" "}
                              <strong>{it.name}</strong> ({it.qty})
                            </div>
                          ))}
                          {(d.items_preview || []).length > 2 && (
                            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                              +{d.items_preview.length - 2} ta buyum
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        {d.type === "assignment" && (
                          <div>
                            👤 Zimmatga oluvchi: <strong>{d.to_person_name || d.to_person_ref}</strong>
                          </div>
                        )}
                        {d.type === "return" && (
                          <div>
                            ↩️ Topshiruvchi: <strong>{d.from_person_name || d.from_person_ref || "Xodim"}</strong> →{" "}
                            {d.to_location_name || "Ombor"}
                          </div>
                        )}
                        {d.type === "transfer" && (
                          <div>
                            🚚 {d.from_location_name || "Oldingi joy"} →{" "}
                            <strong>{d.to_location_name || d.to_institution_name || "Yangi joy"}</strong>
                          </div>
                        )}
                        {d.type === "repair" && (
                          <div>
                            🔧 Usta: <strong>{d.metadata?.vendor || "Servis"}</strong>
                            {d.metadata?.cost ? ` • ${fmtTRY(d.metadata.cost)}` : ""}
                          </div>
                        )}
                        {d.type === "writeoff" && (
                          <div>
                            🗑️ Sabab: <strong>{WRITEOFF_REASON_LABELS[d.metadata?.writeoff_reason] || d.reason || "Yaroqsiz"}</strong>
                          </div>
                        )}
                        {d.reason && <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{d.reason}</div>}
                      </td>
                      <td>
                        <span className={`badge ${sMeta.badge}`}>{sMeta.label}</span>
                        {d.type === "assignment" && d.status === "approved" && (
                          <div style={{ fontSize: 11, color: "#06b6d4", marginTop: 3 }}>
                            Xodim "Qabul qildim" bosishi kutilmoqda
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        {new Date(d.created_at).toLocaleDateString("uz-UZ")}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {d.status === "draft" && vAccess.canEdit && (
                            <button className="btn btn-sm btn-primary" onClick={() => handleAction(d.id, "submit")}>
                              Yuborish
                            </button>
                          )}
                          {d.status === "pending_approval" && vAccess.canApprove && (
                            <>
                              <button className="btn btn-sm btn-primary" onClick={() => handleAction(d.id, "approve")}>
                                <Check size={13} /> Tasdiqlash
                              </button>
                              <button className="btn btn-sm btn-danger" onClick={() => handleAction(d.id, "reject")}>
                                <X size={13} /> Rad etish
                              </button>
                            </>
                          )}
                          {d.type === "repair" && d.status === "approved" && vAccess.canEdit && (
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => {
                                setRepairModalDoc(d);
                                setRepResult("fixed");
                                setRepCost(d.metadata?.cost ? String(d.metadata.cost) : "");
                                setRepVendor(d.metadata?.vendor || "");
                                setRepExpenseRef(d.metadata?.expense_ref || "");
                              }}
                            >
                              <Wrench size={13} /> Ta'mirdan qaytdi
                            </button>
                          )}
                          <a
                            href={`/vaqf-api/documents/${d.id}/pdf?lang=tr`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-sm btn-cyan"
                            style={{ textDecoration: "none" }}
                            title="Turkcha PDF dalolatnoma"
                          >
                            <Download size={13} /> TR PDF
                          </a>
                          <a
                            href={`/vaqf-api/documents/${d.id}/pdf?lang=uz`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-sm"
                            style={{ textDecoration: "none" }}
                            title="O'zbekcha PDF dalolatnoma"
                          >
                            UZ PDF
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Document Detail Drawer / Modal */}
      {selectedDoc && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 240,
            background: "rgba(2,6,23,0.8)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div className="glass-card" style={{ width: "100%", maxWidth: 760, maxHeight: "90vh", overflowY: "auto" }}>
            <div className="section-header">
              <div>
                <span style={{ fontFamily: "monospace", color: "#fbcc42", fontWeight: 800, fontSize: 15 }}>
                  {selectedDoc.doc_no}
                </span>
                <span className={`badge ${DOC_TYPE_META[selectedDoc.type]?.badge || "badge-slate"}`} style={{ marginLeft: 8 }}>
                  {DOC_TYPE_META[selectedDoc.type]?.label || selectedDoc.type}
                </span>
                <span className={`badge ${DOC_STATUS_META[selectedDoc.status]?.badge || "badge-slate"}`} style={{ marginLeft: 6 }}>
                  {DOC_STATUS_META[selectedDoc.status]?.label || selectedDoc.status}
                </span>
              </div>
              <button className="btn btn-sm" onClick={() => setSelectedDoc(null)}>
                <X size={15} /> Yopish
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, padding: 12, borderRadius: 10, background: "rgba(15,23,42,0.45)", marginBottom: 14, fontSize: 13 }}>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Yaratuvchi:</span>{" "}
                <strong>{selectedDoc.created_by_name || selectedDoc.created_by || "—"}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Sana:</span>{" "}
                <strong>{new Date(selectedDoc.created_at).toLocaleString("uz-UZ")}</strong>
              </div>
              {selectedDoc.to_person_name && (
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Qabul qiluvchi:</span>{" "}
                  <strong>{selectedDoc.to_person_name}</strong>
                </div>
              )}
              {selectedDoc.from_person_name && (
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Topshiruvchi:</span>{" "}
                  <strong>{selectedDoc.from_person_name}</strong>
                </div>
              )}
              {selectedDoc.to_location_name && (
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Maqsad joy:</span>{" "}
                  <strong>{selectedDoc.to_location_name}</strong>
                </div>
              )}
              {selectedDoc.reason && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <span style={{ color: "var(--text-muted)" }}>Sabab / Izoh:</span>{" "}
                  <strong>{selectedDoc.reason}</strong>
                </div>
              )}
            </div>

            <h4 style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>Hujjatdagi buyumlar ({selectedDoc.items?.length || 0})</h4>
            <div className="table-wrap" style={{ marginBottom: 14 }}>
              <table>
                <thead>
                  <tr>
                    <th>Inventar №</th>
                    <th>Buyum nomi</th>
                    <th>Miqdori</th>
                    <th>Oldingi holati</th>
                    <th>Keyingi holati</th>
                    <th>Qiymati</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedDoc.items || []).map((it: any) => (
                    <tr key={it.id}>
                      <td style={{ fontFamily: "monospace", color: "#fbcc42", fontWeight: 700 }}>{it.inventory_no}</td>
                      <td>{it.asset_name}</td>
                      <td>
                        {it.qty} {it.unit}
                      </td>
                      <td>{it.condition_before || "—"}</td>
                      <td>{it.condition_after || "—"}</td>
                      <td>{it.purchase_price ? fmtTRY(Number(it.purchase_price) * Number(it.qty || 1)) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(selectedDoc.confirmations || []).length > 0 && (
              <div style={{ padding: 12, borderRadius: 10, background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.35)", marginBottom: 14 }}>
                <div style={{ fontWeight: 700, color: "#10b981", fontSize: 13, marginBottom: 4 }}>
                  ✅ Elektron tasdiqlangan (Qabul qilindi)
                </div>
                {selectedDoc.confirmations.map((c: any) => (
                  <div key={c.id} style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                    Tasdiqladi: <strong>{c.person_name}</strong> • Vaqt: {new Date(c.confirmed_at).toLocaleString("uz-UZ")} • IP: {c.ip || "—"}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <a
                  href={`/vaqf-api/documents/${selectedDoc.id}/pdf?lang=tr`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-cyan"
                  style={{ textDecoration: "none" }}
                >
                  <Download size={15} /> Dalolatnoma PDF (Turkcha)
                </a>
                <a
                  href={`/vaqf-api/documents/${selectedDoc.id}/pdf?lang=uz`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn"
                  style={{ textDecoration: "none" }}
                >
                  <Download size={15} /> Dalolatnoma PDF (O'zbekcha)
                </a>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {selectedDoc.status !== "completed" && selectedDoc.status !== "cancelled" && vAccess.canEdit && (
                  <button className="btn btn-danger" onClick={() => handleAction(selectedDoc.id, "cancel")}>
                    Hujjatni bekor qilish
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Complete Repair Modal */}
      {repairModalDoc && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 260,
            background: "rgba(2,6,23,0.82)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div className="glass-card" style={{ width: "100%", maxWidth: 480 }}>
            <div className="section-header">
              <div className="section-title">
                <Wrench size={18} color="#f59e0b" /> Ta'mir natijasini kiritish ({repairModalDoc.doc_no})
              </div>
              <button className="btn btn-sm" onClick={() => setRepairModalDoc(null)}>
                <X size={14} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="form-field">
                <label className="form-label">Ta'mir natijasi *</label>
                <select className="select" value={repResult} onChange={(e) => setRepResult(e.target.value)}>
                  <option value="fixed">✅ Tuzatildi (Foydalanishga qaytariladi)</option>
                  <option value="not_fixable">❌ Tuzatib bo'lmaydi (Yaroqsiz — hisobdan chiqarish tavsiya etiladi)</option>
                  <option value="replaced">🔄 Almashtirildi</option>
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Usta / Servis</label>
                <input className="input" value={repVendor} onChange={(e) => setRepVendor(e.target.value)} />
              </div>
              <div className="form-field">
                <label className="form-label">Ta'mir xarajati (TRY)</label>
                <input type="number" min="0" step="any" className="input" value={repCost} onChange={(e) => setRepCost(e.target.value)} />
              </div>
              <div className="form-field">
                <label className="form-label">Moliya xarajat havolasi (expense_ref)</label>
                <input className="input" value={repExpenseRef} onChange={(e) => setRepExpenseRef(e.target.value)} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                <button className="btn" onClick={() => setRepairModalDoc(null)}>
                  Bekor qilish
                </button>
                <button className="btn btn-primary" onClick={submitCompleteRepair}>
                  <Check size={15} /> Saqlash va Yakunlash
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <NewDocumentModal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        institutionId={institutionId}
        institutions={institutions}
        flatLocations={flatLocations}
        staffList={staffList}
        notify={notify}
        onCreated={() => loadDocs()}
      />
    </div>
  );
}

// ============================================================================
// 5. MENING BUYUMLARIM (Staff mobile-friendly self-service page)
// ============================================================================
export function MyAssetsSection({
  notify,
}: {
  notify: (msg: string, type?: "ok" | "err") => void;
}) {
  const [myAssets, setMyAssets] = useState<any[]>([]);
  const [pendingDocs, setPendingDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Fault report modal
  const [faultAsset, setFaultAsset] = useState<any>(null);
  const [faultDesc, setFaultDesc] = useState("");
  const [faultFile, setFaultFile] = useState<File | null>(null);
  const [submittingFault, setSubmittingFault] = useState(false);

  const loadMyData = useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, pRes] = await Promise.all([
        apiFetch("/vaqf-api/my/assets"),
        apiFetch("/vaqf-api/my/pending"),
      ]);
      setMyAssets(aRes.items || []);
      setPendingDocs(pRes.items || []);
    } catch (e: any) {
      notify(e.message, "err");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadMyData();
  }, [loadMyData]);

  const handleConfirmReceipt = async (docId: number) => {
    try {
      await apiFetch(`/vaqf-api/documents/${docId}/confirm`, {
        method: "POST",
        body: JSON.stringify({ comment: "Qabul qildim" }),
      });
      notify("Zimmat hujjati tasdiqlandi! Buyumlar sizning zimmangizga o'tdi.");
      loadMyData();
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const handleReportFault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!faultAsset || !faultDesc.trim()) {
      notify("Nosozlik tavsifini kiriting", "err");
      return;
    }
    setSubmittingFault(true);
    try {
      let dataUrl: string | undefined;
      if (faultFile) {
        dataUrl = await readFileAsDataUrl(faultFile);
      }
      await apiFetch(`/vaqf-api/assets/${faultAsset.asset_id || faultAsset.id}/fault`, {
        method: "POST",
        body: JSON.stringify({
          description: faultDesc.trim(),
          dataUrl,
          fileName: faultFile?.name,
        }),
      });
      notify("Nosozlik haqida xabar inventar mas'uliga yuborildi!");
      setFaultAsset(null);
      setFaultDesc("");
      setFaultFile(null);
      loadMyData();
    } catch (err: any) {
      notify(err.message, "err");
    } finally {
      setSubmittingFault(false);
    }
  };

  return (
    <div className="animate-in">
      {/* Pending Confirmations */}
      {pendingDocs.length > 0 && (
        <div
          className="glass-card"
          style={{
            marginBottom: 18,
            borderColor: "rgba(251, 204, 66, 0.5)",
            background: "linear-gradient(135deg, rgba(251, 204, 66, 0.14), rgba(15, 23, 42, 0.85))",
          }}
        >
          <div className="section-header">
            <div className="section-title" style={{ color: "#fbcc42" }}>
              <PackageCheck size={20} color="#fbcc42" /> Sizga zimmatga berilgan buyumlar — Tasdiqlash kutilmoqda ({pendingDocs.length})
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {pendingDocs.map((doc) => (
              <div
                key={doc.id}
                style={{
                  padding: 14,
                  borderRadius: 12,
                  background: "rgba(2, 6, 23, 0.65)",
                  border: "1px solid rgba(251, 204, 66, 0.35)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14.5, color: "#fbcc42", fontFamily: "monospace" }}>
                    {doc.doc_no} — Zimmat dalolatnomasi (Zimmet Tutanağı)
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    {(doc.items_preview || []).map((it: any) => (
                      <div key={it.asset_id}>
                        • <strong>{it.inventory_no}</strong> — {it.name} ({it.qty} dona)
                      </div>
                    ))}
                  </div>
                  {doc.expected_return_at && (
                    <div style={{ fontSize: 12, color: "#f59e0b", marginTop: 4 }}>
                      Qaytarish muddati: {String(doc.expected_return_at).slice(0, 10)}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <a
                    href={`/vaqf-api/documents/${doc.id}/pdf?lang=tr`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-sm"
                    style={{ textDecoration: "none" }}
                  >
                    <Download size={14} /> PDF ko'rish
                  </a>
                  <button className="btn btn-primary" onClick={() => handleConfirmReceipt(doc.id)}>
                    <CheckCircle2 size={16} /> Qabul qildim (Tasdiqlash)
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Assigned Assets */}
      <div className="glass-card">
        <div className="section-header">
          <div>
            <div className="section-title">
              <UserCheck size={19} color="#10b981" /> Mening zimmamdagi buyumlar ({myAssets.length})
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 2 }}>
              Sizning javobgarligingizga biriktirilgan vaqf mulki va jihozlari
            </div>
          </div>
          <button className="btn btn-sm" onClick={loadMyData}>
            <RefreshCw size={14} className={loading ? "pulse-dot" : ""} /> Yangilash
          </button>
        </div>

        {myAssets.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
            Hozirda sizning zimmangizda faol buyumlar yo'q.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14 }}>
            {myAssets.map((a) => (
              <div
                key={a.assignment_id || a.asset_id}
                style={{
                  padding: 14,
                  borderRadius: 14,
                  background: "rgba(15, 23, 42, 0.55)",
                  border: "1px solid var(--border-subtle)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontFamily: "monospace", color: "#fbcc42", fontWeight: 800, fontSize: 13 }}>
                      {a.inventory_no}
                    </span>
                    <span className="badge badge-emerald">
                      {a.remaining_qty || a.qty || 1} {a.unit || "dona"}
                    </span>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 15.5, marginBottom: 4 }}>{a.asset_name}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                    📍 Joy: <strong>{a.location_name || "Belgilanmagan"}</strong>
                  </div>
                  {a.assign_doc_no && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                      📄 Hujjat: <strong>{a.assign_doc_no}</strong> ({new Date(a.assigned_at).toLocaleDateString("uz-UZ")})
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid var(--border-subtle)" }}>
                  {a.assign_doc_id && (
                    <a
                      href={`/vaqf-api/documents/${a.assign_doc_id}/pdf?lang=tr`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-sm btn-cyan"
                      style={{ textDecoration: "none" }}
                    >
                      <Download size={13} /> Zimmet PDF
                    </a>
                  )}
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ borderColor: "rgba(245, 158, 11, 0.45)", color: "#f59e0b" }}
                    onClick={() => {
                      setFaultAsset(a);
                      setFaultDesc("");
                      setFaultFile(null);
                    }}
                  >
                    <Wrench size={13} /> Nosozlik xabar qilish
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fault Report Modal */}
      {faultAsset && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 260,
            background: "rgba(2,6,23,0.82)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <form onSubmit={handleReportFault} className="glass-card" style={{ width: "100%", maxWidth: 460 }}>
            <div className="section-header">
              <div className="section-title">
                <AlertTriangle size={18} color="#f59e0b" /> Nosozlik haqida xabar berish
              </div>
              <button type="button" className="btn btn-sm" onClick={() => setFaultAsset(null)}>
                <X size={14} />
              </button>
            </div>
            <div style={{ fontSize: 13, marginBottom: 12 }}>
              Buyum: <strong style={{ color: "#fbcc42" }}>{faultAsset.inventory_no}</strong> — {faultAsset.asset_name || faultAsset.name}
            </div>
            <div className="form-field" style={{ marginBottom: 12 }}>
              <label className="form-label">Nosozlik tavsifi (nima bo'ldi?) *</label>
              <input
                className="input"
                placeholder="Masalan: Ekran yonmayapti, oyog'i sindi..."
                value={faultDesc}
                onChange={(e) => setFaultDesc(e.target.value)}
                required
              />
            </div>
            <div className="form-field" style={{ marginBottom: 16 }}>
              <label className="form-label">Rasm biriktirish (ixtiyoriy)</label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="input"
                onChange={(e) => setFaultFile(e.target.files?.[0] || null)}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn" onClick={() => setFaultAsset(null)}>
                Bekor qilish
              </button>
              <button type="submit" className="btn btn-primary" disabled={submittingFault}>
                Yuborish
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 6. NOSOZLIKLAR VA XODIM ISHDAN KETGANDA (Faults & Employee Offboarding)
// ============================================================================
export function FaultsAndOffboardingSection({
  institutionId = 1,
  institutions = [],
  flatLocations = [],
  staffList = [],
  notify,
}: {
  institutionId?: number;
  institutions?: any[];
  flatLocations?: any[];
  staffList?: any[];
  notify: (msg: string, type?: "ok" | "err") => void;
}) {
  const [faults, setFaults] = useState<any[]>([]);
  const [selectedPersonRef, setSelectedPersonRef] = useState("");
  const [personAssets, setPersonAssets] = useState<any[]>([]);
  const [loadingPerson, setLoadingPerson] = useState(false);

  // Pre-filled modal state for 1-click Repair or 1-click Return all
  const [modalConfig, setModalConfig] = useState<any>(null);

  const loadFaults = useCallback(async () => {
    try {
      const res = await apiFetch("/vaqf-api/faults");
      setFaults(res.items || []);
    } catch (e: any) {
      notify(e.message, "err");
    }
  }, [notify]);

  useEffect(() => {
    loadFaults();
  }, [loadFaults]);

  const loadPersonAssets = async (ref: string) => {
    setSelectedPersonRef(ref);
    if (!ref) {
      setPersonAssets([]);
      return;
    }
    setLoadingPerson(true);
    try {
      const res = await apiFetch(`/vaqf-api/people/${encodeURIComponent(ref)}/assets`);
      setPersonAssets(res.items || []);
    } catch (e: any) {
      notify(e.message, "err");
    } finally {
      setLoadingPerson(false);
    }
  };

  return (
    <div className="animate-in">
      {/* Offboarding: Xodim ishdan ketganda */}
      <div className="glass-card" style={{ marginBottom: 18 }}>
        <div className="section-header">
          <div>
            <div className="section-title">
              <UserMinus size={19} color="#06b6d4" /> Xodim ishdan ketganda / Zimmatni yopish
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 2 }}>
              Xodimni tanlang — uning zimmasidagi barcha buyumlar chiqadi va bir tugma bilan bitta qaytarish hujjatiga yig'iladi
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          <select
            className="select"
            style={{ maxWidth: 360 }}
            value={selectedPersonRef}
            onChange={(e) => loadPersonAssets(e.target.value)}
          >
            <option value="">— Xodimni tanlang —</option>
            {staffList.map((s) => (
              <option key={s.ref} value={s.ref}>
                {s.name} ({s.position})
              </option>
            ))}
          </select>

          {personAssets.length > 0 && (
            <button
              className="btn btn-primary"
              onClick={() => {
                const st = staffList.find((x) => x.ref === selectedPersonRef);
                setModalConfig({
                  type: "return",
                  assets: personAssets.map((pa) => ({
                    asset_id: pa.asset_id,
                    inventory_no: pa.inventory_no,
                    name: pa.asset_name,
                    tracking: pa.tracking,
                    qty: pa.remaining_qty || pa.qty || 1,
                    unit: pa.unit,
                    condition: pa.condition,
                    purchase_price: pa.purchase_price,
                  })),
                  fromPersonRef: selectedPersonRef,
                  fromPersonName: st?.name || personAssets[0]?.person_name || selectedPersonRef,
                  reason: "Xodim zimmasidagi barcha buyumlarni qaytarib olish",
                });
              }}
            >
              <PackageCheck size={16} /> Barchasini bitta qaytarish hujjatiga yig'ish ({personAssets.length} ta)
            </button>
          )}
        </div>

        {selectedPersonRef && (
          personAssets.length === 0 && !loadingPerson ? (
            <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13 }}>
              Ushbu xodim zimmasida faol buyumlar topilmadi.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Inventar №</th>
                    <th>Buyum nomi</th>
                    <th>Miqdor</th>
                    <th>Joylashuvi</th>
                    <th>Zimmat hujjati</th>
                    <th>Berilgan sana</th>
                  </tr>
                </thead>
                <tbody>
                  {personAssets.map((pa) => (
                    <tr key={pa.assignment_id}>
                      <td style={{ fontFamily: "monospace", color: "#fbcc42", fontWeight: 700 }}>{pa.inventory_no}</td>
                      <td>{pa.asset_name}</td>
                      <td>
                        {pa.remaining_qty} {pa.unit}
                      </td>
                      <td>{pa.location_name || "—"}</td>
                      <td>{pa.assign_doc_no || "—"}</td>
                      <td>{new Date(pa.assigned_at).toLocaleDateString("uz-UZ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Fault Reports List */}
      <div className="glass-card">
        <div className="section-header">
          <div>
            <div className="section-title">
              <Wrench size={19} color="#f59e0b" /> Xodimlardan kelgan nosozlik xabarlari ({faults.length})
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 2 }}>
              Bir tugma bilan nosoz buyum uchun ta'mir hujjati (TMR) yaratish
            </div>
          </div>
          <button className="btn btn-sm" onClick={loadFaults}>
            <RefreshCw size={14} /> Yangilash
          </button>
        </div>

        {faults.length === 0 ? (
          <div style={{ padding: 28, textAlign: "center", color: "var(--text-muted)" }}>
            Nosozlik xabarlari yo'q.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Buyum</th>
                  <th>Nosozlik tavsifi</th>
                  <th>Xabar beruvchi</th>
                  <th>Holati</th>
                  <th>Sana</th>
                  <th style={{ textAlign: "right" }}>Amal</th>
                </tr>
              </thead>
              <tbody>
                {faults.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <span style={{ fontFamily: "monospace", color: "#fbcc42", fontWeight: 700 }}>{f.inventory_no}</span>{" "}
                      <strong>{f.asset_name}</strong>
                    </td>
                    <td>
                      {f.description}
                      {f.photo_url && (
                        <div>
                          <a href={f.photo_url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: "#06b6d4" }}>
                            📷 Rasmni ko'rish
                          </a>
                        </div>
                      )}
                    </td>
                    <td>{f.reported_by_name || f.reported_by}</td>
                    <td>
                      <span className={`badge ${f.status === "new" ? "badge-amber" : f.status === "in_repair" ? "badge-cyan" : "badge-emerald"}`}>
                        {f.status === "new" ? "Yangi" : f.status === "in_repair" ? "Ta'mirda" : f.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{new Date(f.created_at).toLocaleDateString("uz-UZ")}</td>
                    <td style={{ textAlign: "right" }}>
                      {f.status === "new" ? (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() =>
                            setModalConfig({
                              type: "repair",
                              assets: [
                                {
                                  asset_id: f.asset_id,
                                  inventory_no: f.inventory_no,
                                  name: f.asset_name,
                                  qty: 1,
                                },
                              ],
                              reason: f.description,
                              faultReportId: f.id,
                            })
                          }
                        >
                          <Wrench size={13} /> Ta'mir hujjati yaratish
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{f.doc_no || "Rasmiylashtirilgan"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalConfig && (
        <NewDocumentModal
          open={true}
          onClose={() => setModalConfig(null)}
          initialType={modalConfig.type}
          initialAssets={modalConfig.assets}
          initialReason={modalConfig.reason}
          initialFromPersonRef={modalConfig.fromPersonRef}
          initialFromPersonName={modalConfig.fromPersonName}
          initialFaultReportId={modalConfig.faultReportId}
          institutionId={institutionId}
          institutions={institutions}
          flatLocations={flatLocations}
          staffList={staffList}
          notify={notify}
          onCreated={() => {
            loadFaults();
            if (selectedPersonRef) loadPersonAssets(selectedPersonRef);
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// 6-QADAM: HISOBOTLAR (Employee assignments, movement journal, writeoffs, repairs, expiring warranty)
// ============================================================================
export function LifecycleReportsSection({
  institutionId = 1,
  notify,
}: {
  institutionId?: number;
  notify: (msg: string, type?: "ok" | "err") => void;
}) {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/vaqf-api/reports/lifecycle?institution_id=${institutionId}`);
      setReport(res);
    } catch (e: any) {
      notify(e.message, "err");
    } finally {
      setLoading(false);
    }
  }, [institutionId, notify]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  return (
    <div className="animate-in">
      {/* 1. Xodimlar bo'yicha zimmatdagi buyumlar */}
      <div className="glass-card" style={{ marginBottom: 18 }}>
        <div className="section-header" style={{ flexWrap: "wrap", gap: 10 }}>
          <div>
            <div className="section-title">
              <Users size={19} color="#fbcc42" /> Xodimlar bo'yicha zimmatdagi buyumlar hisoboti
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 2 }}>
              Har bir xodim zimmasidagi buyumlar soni va umumiy qiymati (Excel va PDF yuklab olish)
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a
              href={`/vaqf-api/reports/assignments.xlsx?institution_id=${institutionId}`}
              className="btn btn-sm btn-primary"
              style={{ textDecoration: "none" }}
            >
              <FileSpreadsheet size={14} /> Excel (.xlsx)
            </a>
            <a
              href={`/vaqf-api/reports/assignments.pdf?institution_id=${institutionId}&lang=tr`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm btn-cyan"
              style={{ textDecoration: "none" }}
            >
              <Download size={14} /> PDF (Turkcha)
            </a>
            <a
              href={`/vaqf-api/reports/assignments.pdf?institution_id=${institutionId}&lang=uz`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm"
              style={{ textDecoration: "none" }}
            >
              <Download size={14} /> PDF (O'zbekcha)
            </a>
          </div>
        </div>

        {(report?.employeeAssignments || []).length === 0 ? (
          <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 13 }}>Hozircha faol zimmat yozuvlari yo'q.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Xodim</th>
                  <th>Zimmatlar soni</th>
                  <th>Jami birlik</th>
                  <th>Umumiy qiymat (TRY)</th>
                </tr>
              </thead>
              <tbody>
                {(report?.employeeAssignments || []).map((r: any, i: number) => (
                  <tr key={i}>
                    <td>
                      <strong>{r.person_name}</strong>
                    </td>
                    <td>{r.assignments_count} ta kartochka</td>
                    <td>{r.total_units} dona</td>
                    <td style={{ fontWeight: 700, color: "#10b981" }}>{fmtTRY(r.total_value_try)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 2. Hisobdan chiqarilganlar & Ta'mir statistikasi */}
      <div className="resp-grid-2" style={{ marginBottom: 18 }}>
        <div className="glass-card">
          <div className="section-header">
            <div className="section-title">
              <Trash2 size={18} color="#f43f5e" /> Hisobdan chiqarilgan buyumlar ({report?.writeoffs?.totals?.total_count || 0})
            </div>
            <span className="badge badge-rose">Zarar/Qiymat: {fmtTRY(report?.writeoffs?.totals?.total_book_value)}</span>
          </div>
          {(report?.writeoffs?.items || []).length === 0 ? (
            <div style={{ padding: 18, color: "var(--text-muted)", fontSize: 13 }}>Hisobdan chiqarilgan buyumlar yo'q.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(report?.writeoffs?.items || []).slice(0, 10).map((w: any) => (
                <div key={w.id} style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(15,23,42,0.4)", fontSize: 12.5, display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <strong style={{ color: "#fbcc42", fontFamily: "monospace" }}>{w.inventory_no}</strong> — {w.asset_name} ({WRITEOFF_REASON_LABELS[w.reason] || w.reason})
                  </div>
                  <span style={{ color: "#f43f5e", fontWeight: 700 }}>{fmtTRY(w.book_value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card">
          <div className="section-header">
            <div className="section-title">
              <Wrench size={18} color="#f59e0b" /> Ta'mir xarajatlari ({report?.repairs?.summary?.repairs_count || 0} marta)
            </div>
            <span className="badge badge-amber">Jami: {fmtTRY(report?.repairs?.summary?.total_cost_try)}</span>
          </div>
          {(report?.repairs?.topFailingAssets || []).length === 0 ? (
            <div style={{ padding: 18, color: "var(--text-muted)", fontSize: 13 }}>Ta'mir yozuvlari yo'q.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(report?.repairs?.topFailingAssets || []).map((a: any) => (
                <div key={a.id} style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(15,23,42,0.4)", fontSize: 12.5, display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <strong style={{ color: "#fbcc42", fontFamily: "monospace" }}>{a.inventory_no}</strong> — {a.name} ({a.repair_count} marta buzilgan)
                  </div>
                  <span style={{ color: "#f59e0b", fontWeight: 700 }}>{fmtTRY(a.total_repair_cost)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. Kafolat muddati 30 kun ichida tugaydigan buyumlar */}
      <div className="glass-card">
        <div className="section-header">
          <div className="section-title">
            <AlertTriangle size={18} color="#06b6d4" /> Kafolat muddati yaqin 30 kun ichida tugaydigan buyumlar ({(report?.expiringWarrantyAssets || []).length})
          </div>
        </div>
        {(report?.expiringWarrantyAssets || []).length === 0 ? (
          <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13 }}>
            Yaqin 30 kun ichida kafolat muddati tugaydigan buyumlar yo'q.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Inventar №</th>
                  <th>Buyum nomi</th>
                  <th>Joy</th>
                  <th>Kafolat tugash sanasi</th>
                  <th>Qolgan kun</th>
                </tr>
              </thead>
              <tbody>
                {(report?.expiringWarrantyAssets || []).map((w: any) => (
                  <tr key={w.id}>
                    <td style={{ fontFamily: "monospace", color: "#fbcc42", fontWeight: 700 }}>{w.inventory_no}</td>
                    <td>{w.name}</td>
                    <td>{w.location_name || "—"}</td>
                    <td>{w.warranty_until_str}</td>
                    <td>
                      <span className="badge badge-amber">{w.days_remaining} kun qoldi</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 1-QADAM: SOZLAMALAR -> FOYDALANUVCHILAR VA ROLLAR + TASDIQLASH QOIDALARI
// ============================================================================
export function RolesAndSettingsSection({
  institutions = [],
  notify,
}: {
  institutions?: any[];
  notify: (msg: string, type?: "ok" | "err") => void;
}) {
  const [roles, setRoles] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [approvalRules, setApprovalRules] = useState<any>({
    high_value_transfer_threshold_try: 10000,
    writeoff_always_director: true,
    inter_institution_transfer_director: true,
    intra_institution_transfer_no_approval: true,
  });

  const [selectedStaffRef, setSelectedStaffRef] = useState("");
  const [customUserName, setCustomUserName] = useState("");
  const [selectedRole, setSelectedRole] = useState("inventory_manager");
  const [selectedInstId, setSelectedInstId] = useState("");
  const [roleNote, setRoleNote] = useState("");

  const loadAll = useCallback(async () => {
    try {
      const [rRes, sRes] = await Promise.all([
        apiFetch("/vaqf-api/roles"),
        apiFetch("/vaqf-api/settings"),
      ]);
      setRoles(rRes.roles || []);
      setEvents(rRes.events || []);
      setStaff(rRes.staff || []);
      if (sRes.approval_rules) setApprovalRules(sRes.approval_rules);
    } catch (e: any) {
      notify(e.message, "err");
    }
  }, [notify]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleGrantRole = async (e: React.FormEvent) => {
    e.preventDefault();
    const matched = staff.find((s) => s.ref === selectedStaffRef);
    const userRef = matched ? matched.ref : customUserName.trim();
    const userName = matched ? matched.name : customUserName.trim();
    if (!userRef) {
      notify("Xodimni tanlang", "err");
      return;
    }
    try {
      await apiFetch("/vaqf-api/roles", {
        method: "POST",
        body: JSON.stringify({
          user_ref: userRef,
          user_name: userName,
          role: selectedRole,
          institution_id: selectedInstId ? Number(selectedInstId) : null,
          note: roleNote || null,
        }),
      });
      notify(`Rol biriktirildi: ${userName} → ${ROLE_META[selectedRole]?.label || selectedRole}`);
      setRoleNote("");
      loadAll();
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  const handleRevokeRole = async (id: number, name: string) => {
    if (!window.confirm(`${name} foydalanuvchisidan vaqf rolini olib tashlashni tasdiqlaysizmi?`)) return;
    try {
      await apiFetch(`/vaqf-api/roles/${id}`, { method: "DELETE" });
      notify("Rol bekor qilindi");
      loadAll();
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await apiFetch("/vaqf-api/settings", {
        method: "PATCH",
        body: JSON.stringify(approvalRules),
      });
      setApprovalRules(updated.approval_rules);
      notify("Tasdiqlash qoidalari saqlandi!");
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  return (
    <div className="animate-in">
      <div className="resp-grid-2" style={{ marginBottom: 18 }}>
        {/* Grant Role Form */}
        <form onSubmit={handleGrantRole} className="glass-card">
          <div className="section-header">
            <div className="section-title">
              <Users size={18} color="#fbcc42" /> Xodimga Vaqf rolini berish
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="form-field">
              <label className="form-label">Xodimni tanlang *</label>
              <select
                className="select"
                value={selectedStaffRef}
                onChange={(e) => {
                  setSelectedStaffRef(e.target.value);
                  const st = staff.find((x) => x.ref === e.target.value);
                  if (st) setCustomUserName(st.name);
                }}
              >
                <option value="">— Mavjud xodimlardan tanlang —</option>
                {staff.map((s) => (
                  <option key={s.ref} value={s.ref}>
                    {s.name} ({s.position}) [{s.ref}]
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label className="form-label">Rol turi *</label>
              <select className="select" value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>
                {Object.entries(ROLE_META).map(([k, m]) => (
                  <option key={k} value={k}>
                    {m.label} — {m.desc.slice(0, 60)}...
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 4 }}>
                {ROLE_META[selectedRole]?.desc}
              </div>
            </div>

            <div className="form-field">
              <label className="form-label">Muassasa qamrovi</label>
              <select className="select" value={selectedInstId} onChange={(e) => setSelectedInstId(e.target.value)}>
                <option value="">Butun Vaqf bo'yicha (Barcha muassasalar)</option>
                {institutions.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    Faqat: {inst.name} ({inst.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label className="form-label">Izoh (ixtiyoriy)</label>
              <input
                className="input"
                placeholder="Masalan: Akademiya ombor va inventar mas'uli"
                value={roleNote}
                onChange={(e) => setRoleNote(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-primary">
              <Check size={16} /> Rolni biriktirish va saqlash
            </button>
          </div>
        </form>

        {/* Approval Rules Settings */}
        <form onSubmit={handleSaveSettings} className="glass-card">
          <div className="section-header">
            <div className="section-title">
              <Settings size={18} color="#06b6d4" /> Tasdiqlash qoidalari (Direktor nazorati)
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
            <div style={{ padding: 10, borderRadius: 10, background: "rgba(15,23,42,0.45)", border: "1px solid var(--border-subtle)" }}>
              ✅ <strong>Hisobdan chiqarish (Write-off):</strong> Har doim Direktor tasdig'i talab etiladi.
            </div>
            <div style={{ padding: 10, borderRadius: 10, background: "rgba(15,23,42,0.45)", border: "1px solid var(--border-subtle)" }}>
              ✅ <strong>Muassasalar arasi ko'chirish:</strong> Har doim Direktor tasdig'i talab etiladi.
            </div>
            <div style={{ padding: 10, borderRadius: 10, background: "rgba(15,23,42,0.45)", border: "1px solid var(--border-subtle)" }}>
              ✅ <strong>Muassasa ichida xonadan xonaga ko'chirish:</strong> Tasdiqsiz, inventar mas'uli bajaradi (qiymati chegaradan oshmasa).
            </div>

            <div className="form-field" style={{ marginTop: 4 }}>
              <label className="form-label">
                Direktor tasdig'i talab etiladigan buyum qiymati chegarasi (TRY) *
              </label>
              <input
                type="number"
                min="0"
                step="500"
                className="input"
                value={approvalRules.high_value_transfer_threshold_try}
                onChange={(e) =>
                  setApprovalRules({
                    ...approvalRules,
                    high_value_transfer_threshold_try: Number(e.target.value || 0),
                  })
                }
              />
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 }}>
                Standart: 10 000 TRY. Qiymati ushbu summadan yuqori bo'lgan buyumni xonadan xonaga ko'chirishda ham Direktor tasdig'i so'raladi.
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: 6 }}>
              <Check size={16} /> Qoidalarni saqlash
            </button>
          </div>
        </form>
      </div>

      {/* Active Roles Table */}
      <div className="glass-card" style={{ marginBottom: 18 }}>
        <div className="section-header">
          <div className="section-title">
            <ShieldCheck size={18} color="#10b981" /> Faol foydalanuvchi rollari ({roles.length})
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Foydalanuvchi</th>
                <th>Identifikator (Ref)</th>
                <th>Rol</th>
                <th>Muassasa</th>
                <th>Berilgan sana</th>
                <th style={{ textAlign: "right" }}>Amal</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.user_name}</strong>
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-secondary)" }}>{r.user_ref}</td>
                  <td>
                    <span className={`badge ${ROLE_META[r.role]?.badge || "badge-slate"}`}>
                      {ROLE_META[r.role]?.label || r.role}
                    </span>
                  </td>
                  <td>{r.institution_name || "Butun Vaqf bo'yicha"}</td>
                  <td style={{ fontSize: 12 }}>{new Date(r.updated_at || r.created_at).toLocaleString("uz-UZ")}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-sm btn-danger" onClick={() => handleRevokeRole(r.id, r.user_name)}>
                      <Trash2 size={13} /> Olib tashlash
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role Audit History */}
      <div className="glass-card">
        <div className="section-header">
          <div className="section-title">
            <History size={18} color="#fbcc42" /> Rol o'zgarishlari tarixi (Audit log)
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vaqt</th>
                <th>Xodim</th>
                <th>Amal</th>
                <th>Oldingi rol</th>
                <th>Yangi rol</th>
                <th>Bajaruvchi</th>
              </tr>
            </thead>
            <tbody>
              {events.slice(0, 30).map((ev) => (
                <tr key={ev.id}>
                  <td style={{ fontSize: 12 }}>{new Date(ev.created_at).toLocaleString("uz-UZ")}</td>
                  <td>
                    <strong>{ev.target_user_name || ev.target_user_ref}</strong>
                  </td>
                  <td>{ev.action}</td>
                  <td>{ev.old_role || "—"}</td>
                  <td>{ev.new_role || "—"}</td>
                  <td>{ev.actor_name || ev.actor_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
