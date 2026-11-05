import React, { useState, useEffect, useCallback } from "react";
import {
  Building2,
  Check,
  Download,
  FileSpreadsheet,
  FileText,
  FolderArchive,
  Gift,
  Lock,
  Plus,
  RefreshCw,
  Scale,
  ShieldAlert,
  Users,
  X,
} from "lucide-react";

const fmtTRY = (val: number | string | null | undefined) => {
  const n = Math.round(Number(val) || 0);
  return `\u20BA${n.toLocaleString("tr-TR")}`;
};

async function apiFetch(path: string, options: RequestInit = {}) {
  const tgInitData = (window as any).Telegram?.WebApp?.initData || "";
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(tgInitData ? { "X-Telegram-Init-Data": tgInitData } : {}),
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

// ============================================================================
// 1. 1-QADAM: HADYALAR (BAĞIŞ) REESTRI VA DONORLAR PANELI
// ============================================================================
export function DonationsRegistryPanel({
  institutionId,
  categories,
  locations,
  permissions,
  notify,
}: {
  institutionId: number | "all";
  categories: any[];
  locations: any[];
  permissions: any;
  notify: (msg: string, type?: "ok" | "err") => void;
}) {
  const [subTab, setSubTab] = useState<"donations" | "restricted" | "online" | "donors">("donations");
  const [donations, setDonations] = useState<any[]>([]);
  const [donors, setDonors] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [spendModal, setSpendModal] = useState<any>(null);
  const [spendForm, setSpendForm] = useState({ title: "", amount: "", currency: "TRY", expense_ref: "" });
  const [donorDetail, setDonorDetail] = useState<any>(null);

  const canWrite = Boolean(permissions?.isDirector || permissions?.canManageDonationsLeases);
  const canViewPii = Boolean(permissions?.isDirector || permissions?.canViewPii || permissions?.role === "accountant");

  const [form, setForm] = useState<any>({
    kind: "cash",
    amount: "",
    currency: "TRY",
    purpose: "Umumiy vaqf faoliyati",
    restricted: false,
    received_at: new Date().toISOString().slice(0, 10),
    income_ref: "",
    donor: {
      type: "person",
      full_name: "",
      phone: "",
      email: "",
      tax_or_id_no: "",
      is_anonymous: false,
    },
    item_name: "",
    category_id: categories[0]?.id || 1,
    location_id: locations[0]?.id || "",
    quantity: 1,
    unit: "dona",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [donRes, dnrRes] = await Promise.all([
        apiFetch(`/vaqf-api/donations?institution_id=${institutionId}`),
        apiFetch(`/vaqf-api/donors`),
      ]);
      setDonations(donRes.items || []);
      setDonors(dnrRes.items || []);
    } catch (e: any) {
      notify(e.message, "err");
    } finally {
      setLoading(false);
    }
  }, [institutionId, notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const submitDonation = async () => {
    try {
      const payload: any = {
        institution_id: institutionId === "all" ? 1 : Number(institutionId),
        kind: form.kind,
        amount: Number(form.amount || 0),
        currency: form.currency,
        purpose: form.purpose,
        restricted: Boolean(form.restricted),
        received_at: form.received_at,
        income_ref: form.income_ref || null,
        donor: form.donor,
      };
      if (form.kind === "in_kind") {
        payload.items = [
          {
            name: form.item_name || form.purpose || "Hadya buyum",
            category_id: Number(form.category_id || categories[0]?.id || 1),
            location_id: form.location_id ? Number(form.location_id) : null,
            quantity: Number(form.quantity || 1),
            unit: form.unit || "dona",
            estimated_value: Number(form.amount || 0),
            currency: form.currency,
          },
        ];
      }
      await apiFetch("/vaqf-api/donations", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      notify("Hadya (bağış) muvaffaqiyatli qayd etildi!");
      setShowCreateModal(false);
      await loadData();
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const submitSpendLink = async () => {
    if (!spendModal) return;
    try {
      await apiFetch(`/vaqf-api/donations/${spendModal.id}/spend`, {
        method: "POST",
        body: JSON.stringify({
          title: spendForm.title,
          amount: Number(spendForm.amount || 0),
          currency: spendForm.currency,
          expense_ref: spendForm.expense_ref || null,
        }),
      });
      notify("Maqsadli hadya xarajati bog'landi!");
      setSpendModal(null);
      await loadData();
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const handleAnonymizeDonor = async (donorId: number) => {
    if (!window.confirm("KVKK talabiga binoan ushbu donorning shaxsiy ma'lumotlari o'chirilsinmi? (Moliyaviy summalar saqlab qolinadi)")) {
      return;
    }
    try {
      await apiFetch(`/vaqf-api/donors/${donorId}/anonymize`, { method: "POST" });
      notify("Donor ma'lumotlari KVKK bo'yicha anonimlashtirildi");
      setDonorDetail(null);
      await loadData();
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const openDonorDetail = async (id: number) => {
    try {
      const res = await apiFetch(`/vaqf-api/donors/${id}`);
      setDonorDetail(res.donor);
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const displayedDonations = subTab === "restricted" ? donations.filter((d) => d.restricted) : subTab === "online" ? donations.filter((d) => d.source === "online") : donations;

  return (
    <div className="animate-in">
      <div
        className="glass-card"
        style={{
          marginBottom: 14,
          border: "1px solid rgba(245,158,11,0.45)",
          background: "rgba(245,158,11,0.08)",
          padding: "10px 14px",
          fontSize: 12.5,
        }}
      >
        ⚠️ <strong>MUHASIB TASDIQLASHI KERAK:</strong> Bağış makbuzu rasmiy seriyasi, VGM / soliq imtiyozi yozuvlari va moliya kategoriyalari vaqf muhasibi tomonidan tasdiqlangach Sozlamalardan yangilanadi.
      </div>

      <div className="glass-card">
        <div className="section-header">
          <div className="section-title">
            <Gift size={18} color="#10b981" /> Hadyalar (Bağış) Reestri va Maqsadli Fondlar
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className={`btn btn-sm ${subTab === "donations" ? "btn-primary" : ""}`}
              onClick={() => setSubTab("donations")}
            >
              📋 Barcha hadyalar ({donations.length})
            </button>
            <button
              className={`btn btn-sm ${subTab === "restricted" ? "btn-primary" : ""}`}
              onClick={() => setSubTab("restricted")}
            >
              🎯 Maqsadli / Şartlı ({donations.filter((d) => d.restricted).length})
            </button>
            <button
              className={`btn btn-sm ${subTab === "online" ? "btn-primary" : ""}`}
              onClick={() => setSubTab("online")}
            >
              🌐 Onlayn ({donations.filter((d) => d.source === "online").length})
            </button>
            <button
              className={`btn btn-sm ${subTab === "donors" ? "btn-primary" : ""}`}
              onClick={() => setSubTab("donors")}
            >
              👥 Hadya qiluvchilar ({donors.length})
            </button>
            <a
              href={`/vaqf-api/donations/export.xlsx?institution_id=${institutionId}`}
              className="btn btn-sm"
              style={{ textDecoration: "none" }}
            >
              <FileSpreadsheet size={14} /> Excel
            </a>
            {canWrite && (
              <button className="btn btn-sm btn-primary" onClick={() => setShowCreateModal(true)}>
                <Plus size={14} /> Yangi hadya qayd etish
              </button>
            )}
          </div>
        </div>

        {subTab !== "donors" ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hadya № / Sana</th>
                  <th>Hadya qiluvchi (Bağışçı)</th>
                  <th>Turi va Buyumlar</th>
                  <th>Summa / Qiymat</th>
                  <th>Maqsadi va Balans</th>
                  <th>Holat va Makbuz</th>
                </tr>
              </thead>
              <tbody>
                {displayedDonations.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 28, color: "var(--text-muted)" }}>
                      {loading ? "Yuklanmoqda..." : "Hadyalar topilmadi"}
                    </td>
                  </tr>
                ) : (
                  displayedDonations.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <div style={{ fontWeight: 800, color: "#fbcc42" }}>{d.donation_no}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                          {String(d.received_at).slice(0, 10)}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{d.donor?.full_name || "Anonim"}</div>
                        {canViewPii && d.donor?.tax_or_id_masked && (
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            TCKN/VKN: {d.donor.tax_or_id_masked}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="badge badge-cyan">{d.kind}</span> {d.source === "online" && <span className="badge badge-emerald" style={{ marginLeft: 4 }}>🌐 Onlayn</span>}
                        {Array.isArray(d.items) && d.items.length > 0 && (
                          <div style={{ fontSize: 11.5, marginTop: 4 }}>
                            {d.items.map((it: any) => (
                              <div key={it.id}>
                                📦 {it.name} {it.inventory_no && <strong>({it.inventory_no})</strong>}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 800, color: "#10b981" }}>
                          {Number(d.amount || 0).toLocaleString("tr-TR")} {d.currency}
                        </div>
                        {d.income_ref && (
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Moliya: {d.income_ref}</div>
                        )}
                      </td>
                      <td>
                        <div>{d.purpose}</div>
                        {d.restricted && (
                          <div style={{ fontSize: 11.5, marginTop: 4 }}>
                            <span className="badge badge-amber">🎯 Maqsadli</span>{" "}
                            <span>Sarflandi: {fmtTRY(d.spent_try)}</span> •{" "}
                            <strong style={{ color: "#10b981" }}>Qoldiq: {fmtTRY(d.remaining_try)}</strong>
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <a
                            href={`/vaqf-api/donations/${d.id}/receipt.pdf?lang=tr`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-sm"
                            style={{ textDecoration: "none" }}
                          >
                            <FileText size={13} /> Makbuz (TR)
                          </a>
                          <a
                            href={`/vaqf-api/donations/${d.id}/receipt.pdf?lang=uz`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-sm"
                            style={{ textDecoration: "none" }}
                          >
                            UZ
                          </a>
                          {d.restricted && canWrite && (
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => {
                                setSpendModal(d);
                                setSpendForm({ title: "", amount: "", currency: d.currency || "TRY", expense_ref: "" });
                              }}
                            >
                              + Sarflash
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hadya qiluvchi</th>
                  <th>Turi</th>
                  <th>TCKN/VKN (Oxirgi 4)</th>
                  <th>Telefon (Oxirgi 4)</th>
                  <th>Hadyalar soni / Jami</th>
                  <th>KVKK va Amallar</th>
                </tr>
              </thead>
              <tbody>
                {donors.map((dn) => (
                  <tr key={dn.id}>
                    <td style={{ fontWeight: 700 }}>{dn.full_name}</td>
                    <td>{dn.type === "organization" ? "Tashkilot" : "Jismoniy shaxs"}</td>
                    <td>{dn.tax_or_id_masked || "—"}</td>
                    <td>{dn.phone_masked || "—"}</td>
                    <td>
                      {dn.donations_count} ta ({fmtTRY(dn.total_donated_try)})
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        {canViewPii && (
                          <button className="btn btn-sm" onClick={() => openDonorDetail(dn.id)}>
                            Ko'rish (KVKK)
                          </button>
                        )}
                        {canWrite && !dn.anonymized_at && (
                          <button className="btn btn-sm" onClick={() => handleAnonymizeDonor(dn.id)}>
                            Anonimlashtirish
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Donation Modal */}
      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="modal-box" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="section-header">
              <div className="section-title">
                <Gift size={18} color="#10b981" /> Yangi hadya (bağış) qayd etish
              </div>
              <button className="btn btn-sm" onClick={() => setShowCreateModal(false)}>
                <X size={14} />
              </button>
            </div>

            <div className="resp-grid-2" style={{ marginBottom: 12 }}>
              <div>
                <label className="field-label">Hadya turi *</label>
                <select
                  className="select"
                  value={form.kind}
                  onChange={(e) => setForm({ ...form, kind: e.target.value })}
                >
                  <option value="cash">💵 Pul hadyasi (Nakit Bağış)</option>
                  <option value="in_kind">📦 Buyum / Jihoz hadyasi (Ayni Bağış — Avto-inventar)</option>
                  <option value="property">🏢 Ko'chmas mulk hadyasi (Taşınmaz)</option>
                  <option value="other">Boshqa (Other)</option>
                </select>
              </div>
              <div>
                <label className="field-label">Qabul sanasi *</label>
                <input
                  type="date"
                  className="input"
                  value={form.received_at}
                  onChange={(e) => setForm({ ...form, received_at: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Summa yoki Taxminiy qiymat *</label>
                <input
                  type="number"
                  className="input"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Valyuta</label>
                <select
                  className="select"
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                >
                  <option value="TRY">TRY (₺)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </div>

              {form.kind === "in_kind" && (
                <>
                  <div>
                    <label className="field-label">Buyum nomi (Avtomatik kartochka ochiladi) *</label>
                    <input
                      className="input"
                      placeholder="Masalan: Konditsioner Vestel 24000 BTU"
                      value={form.item_name}
                      onChange={(e) => setForm({ ...form, item_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="field-label">Kategoriya va Miqdor</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <select
                        className="select"
                        value={form.category_id}
                        onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        className="input"
                        style={{ width: 90 }}
                        value={form.quantity}
                        onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="field-label">Hadya qiluvchi F.I.Sh / Tashkilot *</label>
                <input
                  className="input"
                  placeholder="Ism-sharif yoki tashkilot"
                  value={form.donor.full_name}
                  onChange={(e) => setForm({ ...form, donor: { ...form.donor, full_name: e.target.value } })}
                />
              </div>
              <div>
                <label className="field-label">TCKN / Vergi No (Shifrlanadi, ro'yxatda ***1234)</label>
                <input
                  className="input"
                  placeholder="11 xonali TCKN yoki VKN"
                  value={form.donor.tax_or_id_no}
                  onChange={(e) => setForm({ ...form, donor: { ...form.donor, tax_or_id_no: e.target.value } })}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="field-label">Maqsad (Purpose)</label>
                <input
                  className="input"
                  value={form.purpose}
                  onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                />
              </div>
              <div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={form.restricted}
                    onChange={(e) => setForm({ ...form, restricted: e.target.checked })}
                  />
                  🎯 Maqsadli / Şartlı hadya (alohida balans yuritiladi)
                </label>
              </div>
              <div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={form.donor.is_anonymous}
                    onChange={(e) =>
                      setForm({ ...form, donor: { ...form.donor, is_anonymous: e.target.checked } })
                    }
                  />
                  🕵️ Anonim hadya qiluvchi
                </label>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn" onClick={() => setShowCreateModal(false)}>
                Bekor qilish
              </button>
              <button className="btn btn-primary" onClick={submitDonation}>
                <Check size={14} /> Saqlash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spend Link Modal */}
      {spendModal && (
        <div className="modal-backdrop" onClick={() => setSpendModal(null)}>
          <div className="modal-box" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>
              🎯 Maqsadli hadyadan xarajat bog'lash ({spendModal.donation_no})
            </h3>
            <div style={{ marginBottom: 10 }}>
              <label className="field-label">Xarajat tavsifi *</label>
              <input
                className="input"
                value={spendForm.title}
                onChange={(e) => setSpendForm({ ...spendForm, title: e.target.value })}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label className="field-label">Sarflangan summa ({spendModal.currency}) *</label>
              <input
                type="number"
                className="input"
                value={spendForm.amount}
                onChange={(e) => setSpendForm({ ...spendForm, amount: e.target.value })}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn" onClick={() => setSpendModal(null)}>
                Bekor qilish
              </button>
              <button className="btn btn-primary" onClick={submitSpendLink}>
                Saqlash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Donor KVKK Detail Modal */}
      {donorDetail && (
        <div className="modal-backdrop" onClick={() => setDonorDetail(null)}>
          <div className="modal-box" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>
              👤 Donor ma'lumotlari (KVKK himoyalangan)
            </h3>
            <div style={{ fontSize: 13, lineHeight: 1.8 }}>
              <div><strong>F.I.Sh / Nomi:</strong> {donorDetail.full_name}</div>
              <div><strong>TCKN / Vergi No:</strong> {donorDetail.tax_or_id_no || donorDetail.tax_or_id_masked || "—"}</div>
              <div><strong>Telefon:</strong> {donorDetail.phone || donorDetail.phone_masked || "—"}</div>
              <div><strong>Email:</strong> {donorDetail.email || donorDetail.email_masked || "—"}</div>
              <div><strong>Manzil:</strong> {donorDetail.address || "—"}</div>
              <div><strong>KVKK Rozilik vaqti:</strong> {donorDetail.kvkk_consent_at ? new Date(donorDetail.kvkk_consent_at).toLocaleString("tr-TR") : "—"}</div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button className="btn" onClick={() => setDonorDetail(null)}>
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 2. 2-QADAM: KO'CHMAS MULK VA IJARA PANELI
// ============================================================================
export function PropertiesAndLeasesPanel({
  institutionId,
  permissions,
  notify,
}: {
  institutionId: number | "all";
  permissions: any;
  notify: (msg: string, type?: "ok" | "err") => void;
}) {
  const [properties, setProperties] = useState<any[]>([]);
  const [leases, setLeases] = useState<any[]>([]);
  const [selectedLease, setSelectedLease] = useState<any>(null);
  const [showPropModal, setShowPropModal] = useState(false);
  const [showLeaseModal, setShowLeaseModal] = useState(false);
  const canWrite = Boolean(permissions?.isDirector || permissions?.canManageDonationsLeases);

  const [propForm, setPropForm] = useState({
    name: "",
    kind: "building",
    address: "",
    parcel_ada: "",
    parcel_no: "",
    deed_no: "",
    area_m2: "",
    ownership: "owned",
    usage: "own_use",
    value: "",
    currency: "TRY",
  });

  const [leaseForm, setLeaseForm] = useState({
    property_id: "",
    direction: "out",
    counterparty_name: "",
    counterparty_tax_or_id: "",
    counterparty_phone: "",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
    monthly_rent: "",
    currency: "TRY",
    payment_day: 5,
    deposit_amount: "",
  });

  const loadData = useCallback(async () => {
    try {
      const [pRes, lRes] = await Promise.all([
        apiFetch(`/vaqf-api/properties?institution_id=${institutionId}`),
        apiFetch(`/vaqf-api/leases?institution_id=${institutionId}`),
      ]);
      setProperties(pRes.items || []);
      setLeases(lRes.items || []);
    } catch (e: any) {
      notify(e.message, "err");
    }
  }, [institutionId, notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const submitProperty = async () => {
    try {
      await apiFetch("/vaqf-api/properties", {
        method: "POST",
        body: JSON.stringify({
          ...propForm,
          institution_id: institutionId === "all" ? 1 : Number(institutionId),
          value: Number(propForm.value || 0),
          area_m2: propForm.area_m2 ? Number(propForm.area_m2) : null,
        }),
      });
      notify("Ko'chmas mulk obyekti qo'shildi!");
      setShowPropModal(false);
      await loadData();
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const submitLease = async () => {
    try {
      await apiFetch("/vaqf-api/leases", {
        method: "POST",
        body: JSON.stringify({
          ...leaseForm,
          property_id: Number(leaseForm.property_id || properties[0]?.id),
          monthly_rent: Number(leaseForm.monthly_rent || 0),
          payment_day: Number(leaseForm.payment_day || 5),
          deposit_amount: Number(leaseForm.deposit_amount || 0),
        }),
      });
      notify("Ijara shartnomasi va oylik to'lov jadvali yaratildi!");
      setShowLeaseModal(false);
      await loadData();
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const openLeasePayments = async (leaseId: number) => {
    try {
      const res = await apiFetch(`/vaqf-api/leases/${leaseId}`);
      setSelectedLease(res.lease);
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const markPaymentPaid = async (leaseId: number, paymentId: number, amount: number) => {
    try {
      const res = await apiFetch(`/vaqf-api/leases/${leaseId}/payments/${paymentId}`, {
        method: "POST",
        body: JSON.stringify({ paid_amount: amount, status: "paid" }),
      });
      setSelectedLease(res.lease);
      notify("Ijara to'lovi qayd etildi!");
      await loadData();
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  return (
    <div className="animate-in">
      <div className="glass-card" style={{ marginBottom: 16 }}>
        <div className="section-header">
          <div className="section-title">
            <Building2 size={18} color="#fbcc42" /> Ko'chmas mulk reestri (Gayrimenkul / Tapu)
          </div>
          {canWrite && (
            <button className="btn btn-sm btn-primary" onClick={() => setShowPropModal(true)}>
              <Plus size={14} /> Ko'chmas mulk qo'shish
            </button>
          )}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kod va Nomi</th>
                <th>Turi / Maydon</th>
                <th>Tapu (Ada / Parsel)</th>
                <th>Egalik va Holat</th>
                <th>Qiymati</th>
                <th>Bog'langan joylar va jihozlar</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div style={{ fontWeight: 800, color: "#fbcc42" }}>{p.code}</div>
                    <div style={{ fontWeight: 700 }}>{p.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{p.address}</div>
                  </td>
                  <td>
                    <span className="badge badge-cyan">{p.kind}</span>
                    {p.area_m2 && <div style={{ fontSize: 12, marginTop: 4 }}>{p.area_m2} m²</div>}
                  </td>
                  <td>
                    {p.parcel_ada || p.parcel_no ? (
                      <span>Ada: {p.parcel_ada || "—"} / Parsel: {p.parcel_no || "—"}</span>
                    ) : (
                      "—"
                    )}
                    {p.deed_no && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Tapu №: {p.deed_no}</div>}
                  </td>
                  <td>
                    <div>{p.ownership}</div>
                    <span className={`badge ${p.usage === "leased_out" ? "badge-emerald" : "badge-amber"}`}>
                      {p.usage}
                    </span>
                  </td>
                  <td style={{ fontWeight: 800, color: "#10b981" }}>
                    {Number(p.value || 0).toLocaleString("tr-TR")} {p.currency}
                  </td>
                  <td>
                    <span>📍 {p.locations_count || 0} ta joy</span> •{" "}
                    <span>📦 {p.assets_count || 0} ta buyum</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leases Card */}
      <div className="glass-card">
        <div className="section-header">
          <div className="section-title">
            🔑 Ijara shartnomalari va Oylik to'lovlar nazorati
          </div>
          {canWrite && (
            <button
              className="btn btn-sm btn-primary"
              onClick={() => {
                setLeaseForm({ ...leaseForm, property_id: String(properties[0]?.id || "") });
                setShowLeaseModal(true);
              }}
            >
              <Plus size={14} /> Yangi ijara shartnomasi
            </button>
          )}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Shartnoma №</th>
                <th>Mulk obyekti</th>
                <th>Yo'nalish va Ikkinchi tomon</th>
                <th>Muddat</th>
                <th>Oylik ijara</th>
                <th>Qarzdorlik</th>
                <th>To'lovlar</th>
              </tr>
            </thead>
            <tbody>
              {leases.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}>
                    Ijara shartnomalari yo'q
                  </td>
                </tr>
              ) : (
                leases.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 800, color: "#fbcc42" }}>{l.lease_no}</td>
                    <td>{l.property_name}</td>
                    <td>
                      <span className={`badge ${l.direction === "out" ? "badge-emerald" : "badge-cyan"}`}>
                        {l.direction === "out" ? "Ijaraga berilgan (Tushum)" : "Ijaraga olingan (Xarajat)"}
                      </span>
                      <div style={{ fontWeight: 700, marginTop: 3 }}>{l.counterparty_name}</div>
                      {l.counterparty_tax_masked && (
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          TCKN/VKN: {l.counterparty_tax_masked}
                        </div>
                      )}
                    </td>
                    <td>
                      {String(l.start_date).slice(0, 10)} → <strong>{String(l.end_date).slice(0, 10)}</strong>
                    </td>
                    <td style={{ fontWeight: 800 }}>
                      {Number(l.monthly_rent || 0).toLocaleString("tr-TR")} {l.currency}
                    </td>
                    <td>
                      {l.overdue_payments_count > 0 ? (
                        <span className="badge badge-rose">
                          🚨 {l.overdue_payments_count} oy ({fmtTRY(l.overdue_amount)})
                        </span>
                      ) : (
                        <span className="badge badge-emerald">Vaqtida</span>
                      )}
                    </td>
                    <td>
                      <button className="btn btn-sm btn-primary" onClick={() => openLeasePayments(l.id)}>
                        To'lovlar jadvali
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Property Create Modal */}
      {showPropModal && (
        <div className="modal-backdrop" onClick={() => setShowPropModal(false)}>
          <div className="modal-box" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>🏢 Yangi ko'chmas mulk qo'shish</h3>
            <div className="resp-grid-2" style={{ marginBottom: 12 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="field-label">Nomi *</label>
                <input
                  className="input"
                  value={propForm.name}
                  onChange={(e) => setPropForm({ ...propForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Turi</label>
                <select
                  className="select"
                  value={propForm.kind}
                  onChange={(e) => setPropForm({ ...propForm, kind: e.target.value })}
                >
                  <option value="building">Bino (building)</option>
                  <option value="land">Yer uchastkasi (land)</option>
                  <option value="apartment">Kvartira (apartment)</option>
                  <option value="shop">Do'kon / Tijorat joyi (shop)</option>
                  <option value="other">Boshqa</option>
                </select>
              </div>
              <div>
                <label className="field-label">Foydalanish holati</label>
                <select
                  className="select"
                  value={propForm.usage}
                  onChange={(e) => setPropForm({ ...propForm, usage: e.target.value })}
                >
                  <option value="own_use">Vaqf muassasasi foydalanmoqda (own_use)</option>
                  <option value="leased_out">Ijaraga berilgan (leased_out)</option>
                  <option value="vacant">Bo'sh (vacant)</option>
                  <option value="under_renovation">Ta'mirda (under_renovation)</option>
                </select>
              </div>
              <div>
                <label className="field-label">Ada / Parsel</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    className="input"
                    placeholder="Ada"
                    value={propForm.parcel_ada}
                    onChange={(e) => setPropForm({ ...propForm, parcel_ada: e.target.value })}
                  />
                  <input
                    className="input"
                    placeholder="Parsel"
                    value={propForm.parcel_no}
                    onChange={(e) => setPropForm({ ...propForm, parcel_no: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="field-label">Baholangan qiymati (TRY)</label>
                <input
                  type="number"
                  className="input"
                  value={propForm.value}
                  onChange={(e) => setPropForm({ ...propForm, value: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn" onClick={() => setShowPropModal(false)}>Bekor qilish</button>
              <button className="btn btn-primary" onClick={submitProperty}>Saqlash</button>
            </div>
          </div>
        </div>
      )}

      {/* Lease Create Modal */}
      {showLeaseModal && (
        <div className="modal-backdrop" onClick={() => setShowLeaseModal(false)}>
          <div className="modal-box" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>🔑 Yangi ijara shartnomasi</h3>
            <div className="resp-grid-2" style={{ marginBottom: 12 }}>
              <div>
                <label className="field-label">Ko'chmas mulk *</label>
                <select
                  className="select"
                  value={leaseForm.property_id}
                  onChange={(e) => setLeaseForm({ ...leaseForm, property_id: e.target.value })}
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Yo'nalish</label>
                <select
                  className="select"
                  value={leaseForm.direction}
                  onChange={(e) => setLeaseForm({ ...leaseForm, direction: e.target.value })}
                >
                  <option value="out">Vaqf ijaraga berdi (Ijara tushumi)</option>
                  <option value="in">Vaqf ijaraga oldi (Ijara xarajati)</option>
                </select>
              </div>
              <div>
                <label className="field-label">Ijarachi / Mulk egasi F.I.Sh *</label>
                <input
                  className="input"
                  value={leaseForm.counterparty_name}
                  onChange={(e) => setLeaseForm({ ...leaseForm, counterparty_name: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">TCKN / Vergi No (KVKK shifrlanadi)</label>
                <input
                  className="input"
                  value={leaseForm.counterparty_tax_or_id}
                  onChange={(e) => setLeaseForm({ ...leaseForm, counterparty_tax_or_id: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Boshlanish sanasi *</label>
                <input
                  type="date"
                  className="input"
                  value={leaseForm.start_date}
                  onChange={(e) => setLeaseForm({ ...leaseForm, start_date: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Tugash sanasi *</label>
                <input
                  type="date"
                  className="input"
                  value={leaseForm.end_date}
                  onChange={(e) => setLeaseForm({ ...leaseForm, end_date: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Oylik ijara summasi (TRY) *</label>
                <input
                  type="number"
                  className="input"
                  value={leaseForm.monthly_rent}
                  onChange={(e) => setLeaseForm({ ...leaseForm, monthly_rent: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Har oyning to'lov kuni (1-28)</label>
                <input
                  type="number"
                  className="input"
                  value={leaseForm.payment_day}
                  onChange={(e) => setLeaseForm({ ...leaseForm, payment_day: Number(e.target.value) })}
                />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn" onClick={() => setShowLeaseModal(false)}>Bekor qilish</button>
              <button className="btn btn-primary" onClick={submitLease}>Saqlash</button>
            </div>
          </div>
        </div>
      )}

      {/* Lease Payments Modal */}
      {selectedLease && (
        <div className="modal-backdrop" onClick={() => setSelectedLease(null)}>
          <div className="modal-box" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
            <div className="section-header">
              <div className="section-title">
                📅 {selectedLease.lease_no} — {selectedLease.counterparty_name} (Oylik to'lovlar)
              </div>
              <button className="btn btn-sm" onClick={() => setSelectedLease(null)}>
                <X size={14} />
              </button>
            </div>
            <div className="table-wrap" style={{ maxHeight: 400, overflowY: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Oy</th>
                    <th>Kutilgan sana</th>
                    <th>Summa</th>
                    <th>Holat</th>
                    <th>Amal</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedLease.payments || []).map((p: any) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 700 }}>{p.period_month}</td>
                      <td>{String(p.expected_date).slice(0, 10)}</td>
                      <td>{Number(p.expected_amount).toLocaleString("tr-TR")} {p.currency}</td>
                      <td>
                        <span
                          className={`badge ${
                            p.status === "paid"
                              ? "badge-emerald"
                              : p.status === "overdue"
                              ? "badge-rose"
                              : "badge-amber"
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td>
                        {p.status !== "paid" && canWrite && (
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => markPaymentPaid(selectedLease.id, p.id, Number(p.expected_amount))}
                          >
                            <Check size={13} /> To'landi
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 3. 3-QADAM: SHARTNOMALAR VA HUJJATLAR ARXIVI PANELI
// ============================================================================
export function ArchiveDocumentsPanel({
  institutionId,
  permissions,
  notify,
}: {
  institutionId: number | "all";
  permissions: any;
  notify: (msg: string, type?: "ok" | "err") => void;
}) {
  const [docs, setDocs] = useState<any[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [detailDoc, setDetailDoc] = useState<any>(null);
  const [form, setForm] = useState({
    title: "",
    category: "contract",
    counterparty: "",
    valid_until: "",
    confidentiality: "normal",
    file_name: "shartnoma.pdf",
    file_text: "",
  });

  const canWrite = Boolean(permissions?.isDirector || permissions?.canEdit || permissions?.canManageDonationsLeases);

  const loadArchive = useCallback(async () => {
    try {
      const res = await apiFetch(`/vaqf-api/archive?institution_id=${institutionId}`);
      setDocs(res.items || []);
    } catch (e: any) {
      notify(e.message, "err");
    }
  }, [institutionId, notify]);

  useEffect(() => {
    loadArchive();
  }, [loadArchive]);

  const submitArchiveDoc = async () => {
    try {
      await apiFetch("/vaqf-api/archive", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          institution_id: institutionId === "all" ? 1 : Number(institutionId),
          valid_until: form.valid_until || null,
        }),
      });
      notify("Hujjat arxivga yuklandi (amal qilish muddati bo'lsa, eslatma yaratildi)!");
      setShowUpload(false);
      await loadArchive();
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const openDetail = async (id: number) => {
    try {
      const res = await apiFetch(`/vaqf-api/archive/${id}`);
      setDetailDoc(res.document);
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  return (
    <div className="animate-in">
      <div className="glass-card">
        <div className="section-header">
          <div className="section-title">
            <FolderArchive size={18} color="#fbcc42" /> Shartnomalar va Hujjatlar Arxivi (Ko'p versiyali)
          </div>
          {canWrite && (
            <button className="btn btn-sm btn-primary" onClick={() => setShowUpload(true)}>
              <Plus size={14} /> Hujjat yuklash
            </button>
          )}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Hujjat kodi va Nomi</th>
                <th>Kategoriya</th>
                <th>Ikkinchi tomon</th>
                <th>Amal qilish muddati</th>
                <th>Maxfiylik va Versiya</th>
                <th>Amallar</th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 28, color: "var(--text-muted)" }}>
                    Arxivda hujjatlar yo'q
                  </td>
                </tr>
              ) : (
                docs.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div style={{ fontWeight: 800, color: "#fbcc42" }}>{d.doc_code}</div>
                      <div style={{ fontWeight: 700 }}>{d.title}</div>
                    </td>
                    <td>
                      <span className="badge badge-cyan">{d.category}</span>
                    </td>
                    <td>{d.counterparty || "—"}</td>
                    <td>{d.valid_until ? String(d.valid_until).slice(0, 10) : "Muddatsiz"}</td>
                    <td>
                      <span className={`badge ${d.confidentiality === "restricted" ? "badge-rose" : "badge-emerald"}`}>
                        {d.confidentiality === "restricted" ? "🔒 Maxfiy (Direktor)" : "Ochiq (Normal)"}
                      </span>{" "}
                      <span className="badge badge-slate">v{d.current_version}</span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        {d.can_download ? (
                          <>
                            <a
                              href={`/vaqf-api/archive/${d.id}/download`}
                              className="btn btn-sm btn-primary"
                              style={{ textDecoration: "none" }}
                            >
                              <Download size={13} /> Yuklab olish
                            </a>
                            <button className="btn btn-sm" onClick={() => openDetail(d.id)}>
                              Versiyalar / Jurnal
                            </button>
                          </>
                        ) : (
                          <span style={{ fontSize: 12, color: "#f43f5e" }}>🔒 Faqat Direktor uchun</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showUpload && (
        <div className="modal-backdrop" onClick={() => setShowUpload(false)}>
          <div className="modal-box" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>🗄 Arxivga yangi hujjat yuklash</h3>
            <div className="resp-grid-2" style={{ marginBottom: 12 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="field-label">Hujjat nomi *</label>
                <input
                  className="input"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Kategoriya</label>
                <select
                  className="select"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  <option value="charter">Vaqf ustavi (Vakıf senedi / charter)</option>
                  <option value="deed">Mulk hujjati (Tapu / deed)</option>
                  <option value="contract">Shartnoma (contract)</option>
                  <option value="permit">Ruxsatnoma / Litsenziya (permit)</option>
                  <option value="tax">Soliq va VGM hujjati (tax)</option>
                  <option value="insurance">Sug'urta polisi (insurance)</option>
                  <option value="protocol">Bayonnoma (protocol)</option>
                </select>
              </div>
              <div>
                <label className="field-label">Maxfiylik darajasi</label>
                <select
                  className="select"
                  value={form.confidentiality}
                  onChange={(e) => setForm({ ...form, confidentiality: e.target.value })}
                >
                  <option value="normal">Normal (Mas'ullar ko'ra oladi)</option>
                  {permissions?.isDirector && (
                    <option value="restricted">🔒 Restricted (Faqat Direktor + Audit log)</option>
                  )}
                </select>
              </div>
              <div>
                <label className="field-label">Ikkinchi tomon (Counterparty)</label>
                <input
                  className="input"
                  value={form.counterparty}
                  onChange={(e) => setForm({ ...form, counterparty: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Amal qilish muddati (Eslatma uchun)</label>
                <input
                  type="date"
                  className="input"
                  value={form.valid_until}
                  onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn" onClick={() => setShowUpload(false)}>Bekor qilish</button>
              <button className="btn btn-primary" onClick={submitArchiveDoc}>Saqlash</button>
            </div>
          </div>
        </div>
      )}

      {detailDoc && (
        <div className="modal-backdrop" onClick={() => setDetailDoc(null)}>
          <div className="modal-box" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
            <div className="section-header">
              <div className="section-title">
                {detailDoc.doc_code} — Versiyalar ({detailDoc.versions?.length || 1}) va Yuklab olish jurnali
              </div>
              <button className="btn btn-sm" onClick={() => setDetailDoc(null)}>
                <X size={14} />
              </button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <strong>Versiyalar tarixi:</strong>
              {(detailDoc.versions || []).map((v: any) => (
                <div key={v.id} style={{ fontSize: 12.5, padding: "4px 0" }}>
                  • <strong>v{v.version_no}</strong> — {v.file_name} ({v.change_note}) —{" "}
                  <a href={`/vaqf-api/archive/${detailDoc.id}/download?version=${v.version_no}`}>Yuklab olish</a>
                </div>
              ))}
            </div>
            <div>
              <strong>Yuklab olishlar audit jurnali ({detailDoc.access_logs?.length || 0}):</strong>
              {(detailDoc.access_logs || []).map((lg: any) => (
                <div key={lg.id} style={{ fontSize: 12, color: "var(--text-secondary)", padding: "3px 0" }}>
                  • {new Date(lg.accessed_at).toLocaleString("tr-TR")} — <strong>{lg.user_name}</strong> ({lg.user_role}) [v{lg.version_no}]
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 4. 4-QADAM: YÖNETİM KURULU QARORLARI (KARAR DEFTERİ) PANELI
// ============================================================================
export function BoardDecisionsPanel({
  permissions,
  notify,
}: {
  permissions: any;
  notify: (msg: string, type?: "ok" | "err") => void;
}) {
  const [decisions, setDecisions] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [rules, setRules] = useState<any>({});
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [form, setForm] = useState({
    decision_no: "",
    decision_date: new Date().toISOString().slice(0, 10),
    title: "",
    body_text: "",
    vote_for: 5,
    vote_against: 0,
    vote_abstain: 0,
    status: "adopted",
  });

  const isDirector = Boolean(permissions?.isDirector);

  const loadBoard = useCallback(async () => {
    try {
      const [dRes, mRes, sRes] = await Promise.all([
        apiFetch("/vaqf-api/board/decisions"),
        apiFetch("/vaqf-api/board/members"),
        apiFetch("/vaqf-api/governance/settings"),
      ]);
      setDecisions(dRes.items || []);
      setMembers(mRes.items || []);
      setRules(sRes.board_decision_rules || {});
    } catch (e: any) {
      notify(e.message, "err");
    }
  }, [notify]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const submitDecision = async () => {
    try {
      await apiFetch("/vaqf-api/board/decisions", {
        method: "POST",
        body: JSON.stringify(form),
      });
      notify("Yönetim Kurulu qarori Karar Defteri'ga kiritildi!");
      setShowDecisionModal(false);
      await loadBoard();
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const toggleRuleMode = async (key: string) => {
    if (!isDirector) return;
    const nextVal = rules[key] === "mandatory" ? "recommended" : "mandatory";
    const updated = { ...rules, [key]: nextVal };
    try {
      await apiFetch("/vaqf-api/governance/settings", {
        method: "PATCH",
        body: JSON.stringify({ key: "board_decision_rules", value: updated }),
      });
      setRules(updated);
      notify(`Qoida yangilandi: ${key} -> ${nextVal}`);
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  return (
    <div className="animate-in">
      <div className="glass-card" style={{ marginBottom: 16 }}>
        <div className="section-header">
          <div className="section-title">
            <Scale size={18} color="#fbcc42" /> Yönetim Kurulu Qarorlari (Karar Defteri)
          </div>
          {isDirector && (
            <button className="btn btn-sm btn-primary" onClick={() => setShowDecisionModal(true)}>
              <Plus size={14} /> Yangi qaror kiritish
            </button>
          )}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Qaror №</th>
                <th>Sana</th>
                <th>Mavzu va Qaror matni</th>
                <th>Ovozlar (Ha/Yo'q/Betaraf)</th>
                <th>Holat</th>
                <th>Karar Metni PDF</th>
              </tr>
            </thead>
            <tbody>
              {decisions.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}>
                    Hozircha qarorlar kiritilmagan
                  </td>
                </tr>
              ) : (
                decisions.map((d) => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 800, color: "#fbcc42" }}>{d.decision_no}</td>
                    <td>{String(d.decision_date).slice(0, 10)}</td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{d.title}</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{d.body_text}</div>
                    </td>
                    <td>
                      ✅ {d.vote_for} / ❌ {d.vote_against} / ⚪ {d.vote_abstain}
                    </td>
                    <td>
                      <span className={`badge ${d.status === "adopted" ? "badge-emerald" : "badge-amber"}`}>
                        {d.status}
                      </span>
                    </td>
                    <td>
                      <a
                        href={`/vaqf-api/board/decisions/${d.id}/pdf?lang=tr`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-sm"
                        style={{ textDecoration: "none" }}
                      >
                        <FileText size={13} /> Karar PDF (TR)
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Configurable Board Decision Rules */}
      <div className="glass-card">
        <div className="section-header">
          <div className="section-title">
            ⚙️ Qaysi amallar uchun Yönetim Kurulu qarori talab qilinadi? ({rules.status_notice || "MUHASIB va kurul tasdiqlashi kerak"})
          </div>
        </div>
        <div className="resp-grid-2">
          {[
            { key: "writeoff_above_threshold", label: `Yuqori qiymatli hisobdan chiqarish (>= ${fmtTRY(rules.writeoff_threshold_try || 50000)})` },
            { key: "property_transaction", label: "Ko'chmas mulk sotib olish, sotish yoki hadya qabul qilish" },
            { key: "lease_contract", label: "Ijara shartnomasi tuzish va bekor qilish" },
            { key: "restricted_donation_acceptance", label: "Maqsadli / Şartlı hadyani qabul qilish" },
          ].map((item) => (
            <div
              key={item.key}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-subtle)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 13 }}>{item.label}</span>
              <button
                className={`btn btn-sm ${rules[item.key] === "mandatory" ? "btn-primary" : ""}`}
                onClick={() => toggleRuleMode(item.key)}
                disabled={!isDirector}
              >
                {rules[item.key] === "mandatory" ? "🔒 Majburiy (Bloklaydi)" : "💡 Tavsiyaviy"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {showDecisionModal && (
        <div className="modal-backdrop" onClick={() => setShowDecisionModal(false)}>
          <div className="modal-box" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>⚖️ Yangi Yönetim Kurulu qarori</h3>
            <div style={{ marginBottom: 10 }}>
              <label className="field-label">Qaror sarlavhasi (Konu) *</label>
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label className="field-label">Qaror matni (Karar Metni) *</label>
              <textarea
                className="textarea"
                rows={4}
                value={form.body_text}
                onChange={(e) => setForm({ ...form, body_text: e.target.value })}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn" onClick={() => setShowDecisionModal(false)}>Bekor qilish</button>
              <button className="btn btn-primary" onClick={submitDecision}>Tasdiqlash (Karar Defteri)</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 5. 5-QADAM: YILLIK VAQF HISOBOTI (SOZLANADIGAN SHABLON + PDF / EXCEL)
// ============================================================================
export function AnnualVaqfReportPanel({
  notify,
}: {
  notify: (msg: string, type?: "ok" | "err") => void;
}) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [report, setReport] = useState<any>(null);

  const loadReport = useCallback(async () => {
    try {
      const res = await apiFetch(`/vaqf-api/reports/annual?year=${year}`);
      setReport(res);
    } catch (e: any) {
      notify(e.message, "err");
    }
  }, [year, notify]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  return (
    <div className="animate-in">
      <div
        className="glass-card"
        style={{
          marginBottom: 14,
          border: "1px solid rgba(245,158,11,0.45)",
          background: "rgba(245,158,11,0.08)",
          padding: "10px 14px",
          fontSize: 12.5,
        }}
      >
        ⚠️ <strong>MUHASIB TASDIQLASHI KERAK:</strong> {report?.template?.accountant_disclaimer || "Ushbu yillik hisobot shakli va VGM beyanname bandlari vaqf muhasibi tomonidan tasdiqlanishi lozim."}
      </div>

      <div className="glass-card">
        <div className="section-header">
          <div className="section-title">
            📊 Ezan Vakfı — Yillik Faoliyat va Mulk Hisoboti ({year})
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a
              href={`/vaqf-api/reports/annual.pdf?year=${year}&lang=tr`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm btn-primary"
              style={{ textDecoration: "none" }}
            >
              <FileText size={14} /> Yillik Hisobot PDF (Turkcha)
            </a>
            <a
              href={`/vaqf-api/reports/annual.pdf?year=${year}&lang=uz`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm"
              style={{ textDecoration: "none" }}
            >
              <FileText size={14} /> PDF (O'zbekcha)
            </a>
            <a
              href={`/vaqf-api/reports/annual.xlsx?year=${year}`}
              className="btn btn-sm"
              style={{ textDecoration: "none" }}
            >
              <FileSpreadsheet size={14} /> Excel (.xlsx)
            </a>
          </div>
        </div>

        {report && (
          <div className="resp-grid-2">
            <div className="glass-card" style={{ background: "var(--bg-subtle)" }}>
              <h4 style={{ fontWeight: 800, color: "#fbcc42", marginBottom: 8 }}>1-3. Muassasalar, Ko'chmas mulk va Inventar</h4>
              <div>Muassasalar: <strong>{report.general?.institutions?.length || 0} ta</strong></div>
              <div>Ko'chmas mulk obyektlari: <strong>{report.real_estate?.length || 0} ta</strong></div>
              {(report.inventory_summary || []).map((inv: any) => (
                <div key={inv.institution_id} style={{ fontSize: 12.5, marginTop: 4 }}>
                  • <strong>{inv.institution_name}:</strong> {inv.active_cards} kartochka ({inv.active_units} birlik) — {fmtTRY(inv.active_value_try)}
                </div>
              ))}
            </div>

            <div className="glass-card" style={{ background: "var(--bg-subtle)" }}>
              <h4 style={{ fontWeight: 800, color: "#10b981", marginBottom: 8 }}>4-7. Hadyalar, Ijara va Kurul Qarorlari</h4>
              <div>Jami hadyalar ({year}): <strong>{report.donations_summary?.total_count || 0} ta ({fmtTRY(report.donations_summary?.total_try)})</strong></div>
              <div>Faol ijara shartnomalari (Out): <strong>{report.leases_summary?.active_out_count || 0} ta ({fmtTRY(report.leases_summary?.monthly_rent_out_try)}/oy)</strong></div>
              <div>Qabul qilingan Yönetim Kurulu qarorlari: <strong>{report.board_decisions?.length || 0} ta</strong></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
