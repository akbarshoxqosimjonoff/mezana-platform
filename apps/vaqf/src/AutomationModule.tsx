import React, { useState, useEffect, useCallback } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  Building2,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  ExternalLink,
  FileText,
  Layers,
  PieChart,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Wrench,
  X,
} from "lucide-react";

const fmtTRY = (val: number | string | null | undefined) => {
  const n = Math.round(Number(val) || 0);
  return `\u20BA${n.toLocaleString("tr-TR")}`;
};

const fmtUSD = (val: number | string | null | undefined) => {
  const n = Number(val) || 0;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
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
// 1. TOPBAR NOTIFICATIONS BELL & PREFERENCES MODAL
// ============================================================================
export function NotificationsBellPopover({
  onNavigate,
  notify,
}: {
  onNavigate: (page: string, extra?: any) => void;
  notify: (msg: string, type?: "ok" | "err") => void;
}) {
  const [open, setOpen] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [prefs, setPrefs] = useState<any>({
    enabled_events: ["*"],
    quiet_hours_enabled: true,
    quiet_start: "22:00",
    quiet_end: "07:00",
  });

  const loadNotifications = useCallback(async () => {
    try {
      const d = await apiFetch("/vaqf-api/notifications");
      setItems(d.items || []);
      setUnreadCount(Number(d.unreadCount || 0));
      if (d.prefs) setPrefs(d.prefs);
    } catch {}
  }, []);

  useEffect(() => {
    loadNotifications();
    const timer = setInterval(loadNotifications, 15000);
    return () => clearInterval(timer);
  }, [loadNotifications]);

  const markRead = async (id: number | "all") => {
    try {
      await apiFetch(`/vaqf-api/notifications/${id}/read`, { method: "POST" });
      await loadNotifications();
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const savePrefs = async () => {
    try {
      await apiFetch("/vaqf-api/notifications/prefs", {
        method: "PATCH",
        body: JSON.stringify(prefs),
      });
      notify("Xabarnoma sozlamalari saqlandi");
      setShowPrefs(false);
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const handleClickItem = async (it: any) => {
    if (!it.is_read) {
      markRead(it.id);
    }
    setOpen(false);
    const ev = it.event_type;
    if (ev === "approval_needed") onNavigate("approvals");
    else if (ev === "assigned_to_you") onNavigate("my_assets");
    else if (ev === "document_decided") onNavigate("documents");
    else if (ev === "fault_reported") onNavigate("faults_offboarding");
    else if (ev === "count_submitted" || ev === "count_location_assigned") onNavigate("counts");
    else if (ev === "unregistered_expense") onNavigate("pending_expenses");
    else if (ev === "schedule_due") onNavigate("schedules");
    else onNavigate("dashboard");
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) loadNotifications();
        }}
        style={{ position: "relative" }}
        title="Xabarnomalar"
      >
        <Bell size={15} />
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -5,
              right: -5,
              background: "#f43f5e",
              color: "#fff",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 800,
              padding: "1px 5px",
              minWidth: 17,
              textAlign: "center",
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="glass-card animate-in"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: 360,
            maxWidth: "92vw",
            zIndex: 250,
            padding: 14,
            boxShadow: "0 18px 40px rgba(0,0,0,0.55)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
              <Bell size={15} color="#fbcc42" /> Xabarnomalar ({unreadCount})
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {unreadCount > 0 && (
                <button className="btn btn-sm" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => markRead("all")}>
                  O'qildi
                </button>
              )}
              <button
                className="btn btn-sm"
                style={{ fontSize: 11, padding: "3px 8px" }}
                onClick={() => setShowPrefs((v) => !v)}
                title="Jim soatlar va xabar sozlamalari"
              >
                <Settings size={13} />
              </button>
              <button className="btn btn-sm" style={{ padding: "3px 6px" }} onClick={() => setOpen(false)}>
                <X size={13} />
              </button>
            </div>
          </div>

          {showPrefs ? (
            <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 8 }}>
                🌙 Telegram Jim Soatlar (Istanbul vaqti)
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={Boolean(prefs.quiet_hours_enabled)}
                  onChange={(e) => setPrefs({ ...prefs, quiet_hours_enabled: e.target.checked })}
                />
                22:00 — 07:00 oralig'ida shoshilinch bo'lmagan xabarlarni kechiktirish
              </label>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Boshlanishi</span>
                  <input
                    className="input"
                    value={prefs.quiet_start || "22:00"}
                    onChange={(e) => setPrefs({ ...prefs, quiet_start: e.target.value })}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Tugashi</span>
                  <input
                    className="input"
                    value={prefs.quiet_end || "07:00"}
                    onChange={(e) => setPrefs({ ...prefs, quiet_end: e.target.value })}
                  />
                </div>
              </div>
              <button className="btn btn-sm btn-primary" style={{ width: "100%" }} onClick={savePrefs}>
                <Check size={14} /> Sozlamalarni saqlash
              </button>
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              Hozircha xabarnomalar yo'q
            </div>
          ) : (
            <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              {items.slice(0, 25).map((it) => (
                <div
                  key={it.id}
                  onClick={() => handleClickItem(it)}
                  style={{
                    padding: "9px 11px",
                    borderRadius: 10,
                    background: it.is_read ? "var(--bg-subtle)" : "rgba(251,204,66,0.12)",
                    border: it.is_read
                      ? "1px solid var(--border-subtle)"
                      : "1px solid rgba(251,204,66,0.4)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: 12.5 }}>{it.title}</div>
                    <span className={`badge ${it.status === "sent" ? "badge-emerald" : it.status === "skipped" ? "badge-slate" : "badge-amber"}`} style={{ fontSize: 9.5 }}>
                      {it.status}
                    </span>
                  </div>
                  <div
                    style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 4 }}
                    dangerouslySetInnerHTML={{ __html: String(it.body || "").replace(/\n/g, "<br/>") }}
                  />
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 4 }}>
                    {new Date(it.created_at).toLocaleString("tr-TR")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 2. 5-QADAM: VAQF BOSH SAHIFASI (DIRECTOR DASHBOARD)
// ============================================================================
export function DirectorDashboardSection({
  institutionId,
  onNavigate,
  onFilterAssets,
}: {
  institutionId: number | string;
  onNavigate: (page: any) => void;
  onFilterAssets: (patch: Record<string, any>) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const d = await apiFetch(`/vaqf-api/dashboard?institution_id=${institutionId}`);
      setData(d);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [institutionId]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (loading && !data) {
    return (
      <div className="glass-card" style={{ padding: 36, textAlign: "center" }}>
        Bosh sahifa ko'rsatkichlari yuklanmoqda...
      </div>
    );
  }

  const tot = data?.totals || {};
  const att = data?.attention || {};
  const lastInv = data?.lastInventory || null;
  const gov = data?.governance || null;

  return (
    <div className="animate-in">
      {/* 1. Asosiy KPI Ko'rsatkichlar */}
      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="kpi-card" style={{ cursor: "pointer" }} onClick={() => onNavigate("assets")}>
          <div className="kpi-glow" style={{ background: "#fbcc42" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 700 }}>
              JAMI MULK SONI VA QIYMATI
            </span>
            <Layers size={18} color="#fbcc42" />
          </div>
          <div className="kpi-value" style={{ color: "#fbcc42" }}>
            {Number(tot.total_items || 0).toLocaleString("en-US")} <span style={{ fontSize: 14 }}>birlik</span>
          </div>
          <div className="kpi-sub">
            <span>{tot.total_cards || 0} ta kartochka</span>
            <span className="badge badge-emerald">{fmtTRY(tot.total_value_try)}</span>
            {Number(tot.total_value_usd) > 0 && <span className="badge badge-cyan">{fmtUSD(tot.total_value_usd)}</span>}
          </div>
        </div>

        <div className="kpi-card" style={{ cursor: "pointer" }} onClick={() => onNavigate("assets")}>
          <div className="kpi-glow" style={{ background: "#10b981" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 700 }}>
              BU YIL QO'SHILGANLAR ({new Date().getFullYear()})
            </span>
            <Plus size={18} color="#10b981" />
          </div>
          <div className="kpi-value" style={{ color: "#10b981" }}>
            +{Number(tot.added_this_year_items || 0).toLocaleString("en-US")} <span style={{ fontSize: 14 }}>birlik</span>
          </div>
          <div className="kpi-sub">
            <span>{tot.added_this_year_cards || 0} ta kartochka</span>
            <span className="badge badge-emerald">{fmtTRY(tot.added_this_year_try)}</span>
          </div>
        </div>

        <div className="kpi-card" style={{ cursor: "pointer" }} onClick={() => onNavigate("reports")}>
          <div className="kpi-glow" style={{ background: "#f43f5e" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 700 }}>
              BU YIL HISOBDAN CHIQARILGANLAR
            </span>
            <Trash2 size={18} color="#f43f5e" />
          </div>
          <div className="kpi-value" style={{ color: "#f43f5e" }}>
            {Number(tot.written_off_this_year_items || 0).toLocaleString("en-US")} <span style={{ fontSize: 14 }}>birlik</span>
          </div>
          <div className="kpi-sub">
            <span>{tot.written_off_this_year_cards || 0} ta dalolatnoma</span>
            <span className="badge badge-rose">{fmtTRY(tot.written_off_this_year_try)}</span>
          </div>
        </div>

        {/* Oxirgi inventarizatsiya kartochkasi */}
        <div className="kpi-card" style={{ cursor: "pointer" }} onClick={() => onNavigate("counts")}>
          <div className="kpi-glow" style={{ background: "#06b6d4" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 700 }}>
              OXIRGI INVENTARIZATSIYA
            </span>
            <ClipboardCheck size={18} color="#06b6d4" />
          </div>
          {lastInv ? (
            <>
              <div className="kpi-value" style={{ color: "#06b6d4", fontSize: 21 }}>
                {lastInv.match_pct}% topildi <span style={{ fontSize: 13 }}>({lastInv.code})</span>
              </div>
              <div className="kpi-sub">
                <span>Sana: <strong>{lastInv.approved_date}</strong></span>
                <span className="badge badge-cyan">Keyingisi: {lastInv.next_recommended_date}</span>
              </div>
            </>
          ) : (
            <>
              <div className="kpi-value" style={{ color: "#f59e0b", fontSize: 18 }}>
                Hali o'tkazilmagan
              </div>
              <div className="kpi-sub">
                <span>Sanoq boshlash uchun bosing</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 1.5. 5-BOSQICH: VAQF DARAJASIDAGI BOSHQARUV KO'RSATKICHLARI */}
      {gov && (
        <div className="glass-card" style={{ marginBottom: 18 }}>
          <div className="section-header">
            <div className="section-title">
              <Building2 size={18} color="#fbcc42" /> Ezan Vakfı — Vaqf boshqaruvi (Ko'chmas mulk, Hadyalar, Ijara, Arxiv va Kurul)
            </div>
            <button className="btn btn-sm btn-primary" onClick={() => onNavigate("annual_report")}>
              📊 Yillik vaqf hisoboti (PDF / Excel)
            </button>
          </div>
          <div className="kpi-grid">
            <div className="kpi-card" style={{ cursor: "pointer" }} onClick={() => onNavigate("properties")}>
              <div className="kpi-glow" style={{ background: "#fbcc42" }} />
              <div style={{ fontSize: 11.5, color: "var(--text-secondary)", fontWeight: 700 }}>
                🏢 KO'CHMAS MULK VA VAQF UMUMIY QIYMATI
              </div>
              <div className="kpi-value" style={{ color: "#fbcc42", fontSize: 20 }}>
                {fmtTRY((gov.realEstate?.total_real_estate_try || 0) + (tot.total_value_try || 0))}
              </div>
              <div className="kpi-sub">
                <span>Ko'chmas mulk ({gov.realEstate?.properties_count || 0} ta): {fmtTRY(gov.realEstate?.total_real_estate_try)}</span>
              </div>
            </div>

            <div className="kpi-card" style={{ cursor: "pointer" }} onClick={() => onNavigate("donations")}>
              <div className="kpi-glow" style={{ background: "#10b981" }} />
              <div style={{ fontSize: 11.5, color: "var(--text-secondary)", fontWeight: 700 }}>
                💝 BU YILGI HADYALAR (BAĞIŞLAR)
              </div>
              <div className="kpi-value" style={{ color: "#10b981", fontSize: 20 }}>
                {fmtTRY(gov.donationsYtd?.ytd_total_try)} <span style={{ fontSize: 13 }}>({gov.donationsYtd?.ytd_count || 0} ta)</span>
              </div>
              <div className="kpi-sub">
                <span>Pul: {fmtTRY(gov.donationsYtd?.cash_try)} • Buyum: {fmtTRY(gov.donationsYtd?.in_kind_try)}</span>
                {gov.donationsYtd?.restricted_count > 0 && (
                  <span className="badge badge-amber">Maqsadli qoldiq: {fmtTRY(gov.donationsYtd?.restricted_remaining_try)}</span>
                )}
              </div>
            </div>

            <div className="kpi-card" style={{ cursor: "pointer" }} onClick={() => onNavigate("properties")}>
              <div className="kpi-glow" style={{ background: "#06b6d4" }} />
              <div style={{ fontSize: 11.5, color: "var(--text-secondary)", fontWeight: 700 }}>
                🔑 IJARA TUSHUMI VA QARZDORLIK
              </div>
              <div className="kpi-value" style={{ color: "#06b6d4", fontSize: 20 }}>
                {fmtTRY(gov.leases?.monthly_expected_rent_income_try)} <span style={{ fontSize: 13 }}>/ oy</span>
              </div>
              <div className="kpi-sub">
                <span>Faol ijara: {gov.leases?.active_out_leases || 0} ta</span>
                {gov.leases?.overdue_payments_count > 0 ? (
                  <span className="badge badge-rose">Kechikkan ({gov.leases.overdue_payments_count}): {fmtTRY(gov.leases.rent_arrears_try)}</span>
                ) : (
                  <span className="badge badge-emerald">Qarzdorlik yo'q</span>
                )}
              </div>
            </div>

            <div className="kpi-card" style={{ cursor: "pointer" }} onClick={() => onNavigate("board")}>
              <div className="kpi-glow" style={{ background: "#a855f7" }} />
              <div style={{ fontSize: 11.5, color: "var(--text-secondary)", fontWeight: 700 }}>
                ⚖️ YÖNETİM KURULU VA ARXIV MUDDATLARI
              </div>
              <div className="kpi-value" style={{ color: "#c084fc", fontSize: 20 }}>
                {gov.board?.adopted_ytd_count || 0} ta qaror <span style={{ fontSize: 13 }}>({new Date().getFullYear()})</span>
              </div>
              <div className="kpi-sub">
                <span>Kutilayotgan qaror: <strong>{gov.board?.draft_decisions_count || 0}</strong></span>
                <span className="badge badge-amber" onClick={(e) => { e.stopPropagation(); onNavigate("archive"); }}>
                  Muddati yaqin hujjat: {gov.archive?.expiring_60d_count || 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. "Diqqat talab qiladi" bloki (6 ta harakatli kartochka) */}
      <div className="glass-card" style={{ marginBottom: 18 }}>
        <div className="section-header">
          <div className="section-title">
            <AlertTriangle size={18} color="#fbcc42" /> Diqqat talab qiladi (Tezkor nazorat)
          </div>
          <button className="btn btn-sm" onClick={loadDashboard}>
            <RefreshCw size={14} /> Yangilash
          </button>
        </div>

        <div className="resp-grid-3">
          {/* 1. Kutilayotgan tasdiqlar */}
          <div
            onClick={() => onNavigate("approvals")}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              background: att.pending_approvals_count > 0 ? "rgba(251,204,66,0.12)" : "var(--bg-subtle)",
              border: att.pending_approvals_count > 0 ? "1px solid rgba(251,204,66,0.45)" : "1px solid var(--border-subtle)",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>✅ Kutilayotgan tasdiqlar</div>
              <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                Hisobdan chiqarish va ko'chirish so'rovlari
              </div>
            </div>
            <span className={`badge ${att.pending_approvals_count > 0 ? "badge-amber" : "badge-slate"}`} style={{ fontSize: 14 }}>
              {att.pending_approvals_count || 0} ta
            </span>
          </div>

          {/* 2. Ochiq nosozlik xabarlari */}
          <div
            onClick={() => onNavigate("faults_offboarding")}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              background: att.open_faults_count > 0 ? "rgba(244,63,94,0.12)" : "var(--bg-subtle)",
              border: att.open_faults_count > 0 ? "1px solid rgba(244,63,94,0.45)" : "1px solid var(--border-subtle)",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>🛠 Ochiq nosozlik xabarlari</div>
              <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                Xodimlar yuborgan ta'mirtalab buyumlar
              </div>
            </div>
            <span className={`badge ${att.open_faults_count > 0 ? "badge-rose" : "badge-slate"}`} style={{ fontSize: 14 }}>
              {att.open_faults_count || 0} ta
            </span>
          </div>

          {/* 3. Moliya'dan kelgan, ro'yxatga olinmagan xaridlar */}
          <div
            onClick={() => onNavigate("pending_expenses")}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              background:
                att.unregistered_over_7d_count > 0
                  ? "rgba(244,63,94,0.16)"
                  : att.unregistered_expenses_count > 0
                  ? "rgba(6,182,212,0.12)"
                  : "var(--bg-subtle)",
              border:
                att.unregistered_over_7d_count > 0
                  ? "1px solid rgba(244,63,94,0.6)"
                  : att.unregistered_expenses_count > 0
                  ? "1px solid rgba(6,182,212,0.45)"
                  : "1px solid var(--border-subtle)",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>📦 Ro'yxatga olinmagan xaridlar</div>
              <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                Moliya'da tasdiqlangan jihoz xarajatlari
                {att.unregistered_over_7d_count > 0 && (
                  <span style={{ color: "#f43f5e", fontWeight: 700, marginLeft: 6 }}>
                    ({att.unregistered_over_7d_count} tasi 7+ kun!)
                  </span>
                )}
              </div>
            </div>
            <span className={`badge ${att.unregistered_expenses_count > 0 ? "badge-cyan" : "badge-slate"}`} style={{ fontSize: 14 }}>
              {att.unregistered_expenses_count || 0} ta
            </span>
          </div>

          {/* 4. Muddati o'tgan va 14 kunda tugaydigan muddatlar */}
          <div
            onClick={() => onNavigate("schedules")}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              background:
                att.overdue_schedules_count > 0
                  ? "rgba(244,63,94,0.15)"
                  : att.due_14d_schedules_count > 0
                  ? "rgba(245,158,11,0.12)"
                  : "var(--bg-subtle)",
              border:
                att.overdue_schedules_count > 0
                  ? "1px solid rgba(244,63,94,0.55)"
                  : "1px solid var(--border-subtle)",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>⏰ Ko'rik va Kafolat muddatlari</div>
              <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                Muddati o'tgan: <strong style={{ color: att.overdue_schedules_count > 0 ? "#f43f5e" : "inherit" }}>{att.overdue_schedules_count || 0}</strong> • Yaqin 14 kun: <strong>{att.due_14d_schedules_count || 0}</strong>
              </div>
            </div>
            <span className={`badge ${att.overdue_schedules_count > 0 ? "badge-rose" : "badge-amber"}`} style={{ fontSize: 14 }}>
              {(att.overdue_schedules_count || 0) + (att.due_14d_schedules_count || 0)} ta
            </span>
          </div>

          {/* 5. Joyi yoki javobgari belgilanmagan buyumlar */}
          <div
            onClick={() => {
              onFilterAssets({
                location_id: att.unassigned_location_count > 0 ? "unassigned" : "",
                responsible: att.unassigned_location_count === 0 && att.unassigned_responsible_count > 0 ? "unassigned" : "",
              });
            }}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              background: "var(--bg-subtle)",
              border: "1px solid var(--border-subtle)",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>📍 Joyi / Javobgari yo'q buyumlar</div>
              <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                Joysiz: <strong>{att.unassigned_location_count || 0}</strong> • Javobgarsiz: <strong>{att.unassigned_responsible_count || 0}</strong>
              </div>
            </div>
            <span className="badge badge-amber" style={{ fontSize: 14 }}>
              {(att.unassigned_location_count || 0) + (att.unassigned_responsible_count || 0)}
            </span>
          </div>

          {/* 6. Oxirgi sanoqda "topilmadi" qolgan buyumlar */}
          <div
            onClick={() => onFilterAssets({ status: "missing" })}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              background: att.missing_assets_count > 0 ? "rgba(244,63,94,0.12)" : "var(--bg-subtle)",
              border: att.missing_assets_count > 0 ? "1px solid rgba(244,63,94,0.45)" : "1px solid var(--border-subtle)",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>🔍 Topilmadi ('missing') buyumlar</div>
              <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                Inventarizatsiyada topilmagan mulklar
              </div>
            </div>
            <span className={`badge ${att.missing_assets_count > 0 ? "badge-rose" : "badge-slate"}`} style={{ fontSize: 14 }}>
              {att.missing_assets_count || 0} ta
            </span>
          </div>
        </div>
      </div>

      {/* 3. Taqsimot: Kategoriyalar va Joylar kesimida */}
      <div className="resp-grid-2" style={{ marginBottom: 18 }}>
        <div className="glass-card">
          <div className="section-header">
            <div className="section-title">
              <PieChart size={18} color="#fbcc42" /> Kategoriyalar bo'yicha taqsimot
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(data?.byCategory || []).slice(0, 8).map((c: any) => {
              const maxVal = Math.max(1, Number(data?.byCategory?.[0]?.value_try || 1));
              const pct = Math.min(100, Math.round((Number(c.value_try || 0) / maxVal) * 100));
              return (
                <div
                  key={c.category_id}
                  onClick={() => onFilterAssets({ category_id: String(c.category_id) })}
                  style={{
                    padding: "9px 12px",
                    borderRadius: 10,
                    background: "var(--bg-subtle)",
                    border: "1px solid var(--border-subtle)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>
                      {c.category_name} ({c.items_count} birlik)
                    </span>
                    <strong style={{ color: "#10b981", fontSize: 13 }}>{fmtTRY(c.value_try)}</strong>
                  </div>
                  <div style={{ height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 99 }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "#fbcc42", borderRadius: 99 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass-card">
          <div className="section-header">
            <div className="section-title">
              <Building2 size={18} color="#06b6d4" /> Joylar va xonalar kesimida
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(data?.byLocation || []).slice(0, 8).map((l: any) => (
              <div
                key={l.location_id}
                onClick={() =>
                  onFilterAssets({
                    location_id: l.location_id ? String(l.location_id) : "unassigned",
                  })
                }
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "9px 12px",
                  borderRadius: 10,
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border-subtle)",
                  cursor: "pointer",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{l.location_name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                    {l.cards_count} ta kartochka • {l.items_count} birlik
                  </div>
                </div>
                <span className="badge badge-cyan">{fmtTRY(l.value_try)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Oylar kesimida dinamika: Xaridlar, Hisobdan chiqarishlar, Ta'mir xarajatlari */}
      <div className="resp-grid-3">
        <div className="glass-card">
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10, color: "#10b981" }}>
            📈 Oylar kesimida yangi kirimlar
          </div>
          {(data?.trends?.acquisitions || []).map((m: any) => (
            <div key={m.month} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: 12.5 }}>
              <span>{m.month} ({m.count} ta)</span>
              <strong>{fmtTRY(m.value_try)}</strong>
            </div>
          ))}
        </div>

        <div className="glass-card">
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10, color: "#f43f5e" }}>
            📉 Oylar kesimida hisobdan chiqarish
          </div>
          {(data?.trends?.writeoffs || []).length === 0 ? (
            <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Ma'lumot yo'q</div>
          ) : (
            (data?.trends?.writeoffs || []).map((m: any) => (
              <div key={m.month} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: 12.5 }}>
                <span>{m.month} ({m.count} ta)</span>
                <strong>{fmtTRY(m.value_try)}</strong>
              </div>
            ))
          )}
        </div>

        <div className="glass-card">
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10, color: "#f59e0b" }}>
            🛠 Oylar kesimida ta'mir xarajatlari
          </div>
          {(data?.trends?.repairs || []).length === 0 ? (
            <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Ma'lumot yo'q</div>
          ) : (
            (data?.trends?.repairs || []).map((m: any) => (
              <div key={m.month} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: 12.5 }}>
                <span>{m.month} ({m.count} ta)</span>
                <strong>{fmtTRY(m.value_try)}</strong>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 3. 3-QADAM: MOLIYA BILAN BOG'LANISH ("RO'YXATGA OLINISHI KERAK" NAVBATI)
// ============================================================================
export function PendingFinanceExpensesSection({
  categories,
  locations,
  staffList,
  isDirector,
  notify,
  onOpenAsset,
}: {
  categories: any[];
  locations: any[];
  staffList: any[];
  isDirector: boolean;
  notify: (msg: string, type?: "ok" | "err") => void;
  onOpenAsset: (id: number) => void;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [finSettings, setFinSettings] = useState<any>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Registration modal state
  const [regModal, setRegModal] = useState<any>(null);
  const [notInvModal, setNotInvModal] = useState<any>(null);
  const [notInvReason, setNotInvReason] = useState("");
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [listRes, setRes] = await Promise.all([
        apiFetch(`/vaqf-api/finance/pending-expenses${statusFilter ? `?status=${statusFilter}` : ""}`),
        apiFetch("/vaqf-api/finance/settings"),
      ]);
      setItems(listRes.items || []);
      setFinSettings(setRes);
    } catch (e: any) {
      notify(e.message, "err");
    }
  }, [statusFilter, notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openRegisterModal = (p: any) => {
    setRegModal({
      pending: p,
      name: p.title,
      category_id: categories[0]?.id || 1,
      location_id: "",
      split_cards: false,
      cards_count: 1,
      tracking: "individual",
      quantity: 1,
      unit: "dona",
      purchase_price: p.amount,
      currency: p.currency || "TRY",
      acquired_at: p.expense_date_str || new Date().toISOString().slice(0, 10),
      responsible_name: p.buyer_name || "",
      responsible_ref: p.buyer_employee_id || "",
      brand: "",
      model: "",
      serial_no: "",
      warranty_until: "",
      notes: p.description || "",
    });
  };

  const submitRegister = async () => {
    if (!regModal) return;
    try {
      setBusy(true);
      const res = await apiFetch(`/vaqf-api/finance/pending-expenses/${regModal.pending.id}/register`, {
        method: "POST",
        body: JSON.stringify(regModal),
      });
      notify(
        `${res.assets?.length || 1} ta mulk kartochkasi (${(res.assets || []).map((a: any) => a.inventory_no).join(", ")}) muvaffaqiyatli yaratildi!`
      );
      setRegModal(null);
      await loadData();
    } catch (e: any) {
      notify(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  const submitNotInventory = async () => {
    if (!notInvModal) return;
    try {
      setBusy(true);
      await apiFetch(`/vaqf-api/finance/pending-expenses/${notInvModal.id}/not-inventory`, {
        method: "POST",
        body: JSON.stringify({ reason: notInvReason }),
      });
      notify("Xarajat 'Bu inventar emas' deb belgilandi");
      setNotInvModal(null);
      setNotInvReason("");
      await loadData();
    } catch (e: any) {
      notify(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  const toggleFinanceCategory = (catId: string, catName: string) => {
    if (!finSettings) return;
    const ids = new Set<string>(finSettings.inventory_category_ids || []);
    const names = new Set<string>(finSettings.inventory_category_names || []);
    if (ids.has(catId)) {
      ids.delete(catId);
      names.delete(catName);
    } else {
      ids.add(catId);
      names.add(catName);
    }
    setFinSettings({
      ...finSettings,
      inventory_category_ids: Array.from(ids),
      inventory_category_names: Array.from(names),
    });
  };

  const saveFinanceSettings = async () => {
    try {
      await apiFetch("/vaqf-api/finance/settings", {
        method: "PATCH",
        body: JSON.stringify(finSettings),
      });
      notify("Moliya integratsiyasi sozlamalari saqlandi");
      setShowSettingsModal(false);
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  return (
    <div className="animate-in">
      <div className="glass-card">
        <div className="section-header">
          <div className="section-title">
            <Sparkles size={18} color="#fbcc42" /> Ro'yxatga olinishi kerak (Moliya'dan kelgan jihoz xaridlari)
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select
              className="select"
              style={{ width: "auto" }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="pending">⏳ Kutilayotganlar (Pending)</option>
              <option value="registered">✅ Inventarga olinganlar</option>
              <option value="not_inventory">🚫 Inventar emas deb belgilanganlar</option>
              <option value="">Barchasi</option>
            </select>
            {isDirector && (
              <button className="btn btn-sm" onClick={() => setShowSettingsModal(true)}>
                <Settings size={14} /> Xarajat kategoriyalari sozlamasi
              </button>
            )}
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sana / Kutish</th>
                <th>Xarajat nomi / Izoh</th>
                <th>Moliya kategoriyasi</th>
                <th>Xarid qiluvchi</th>
                <th>Summa</th>
                <th>Holati / Inventar №</th>
                <th>Amallar</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 28, color: "var(--text-muted)" }}>
                    Ushbu holatda moliya xaridlari yo'q
                  </td>
                </tr>
              ) : (
                items.map((p) => {
                  const over7d = p.status === "pending" && Number(p.days_waiting || 0) >= 7;
                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.expense_date_str || "—"}</div>
                        {p.status === "pending" && (
                          <span className={`badge ${over7d ? "badge-rose" : "badge-amber"}`} style={{ fontSize: 10 }}>
                            {p.days_waiting || 0} kun kutmoqda {over7d ? "⚠️" : ""}
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{p.title}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>ID: {p.expense_id}</div>
                      </td>
                      <td>
                        <span className="badge badge-cyan">{p.category_name || "Jihozlar"}</span>
                      </td>
                      <td>{p.buyer_name || "—"}</td>
                      <td>
                        <strong>
                          {p.currency === "USD" ? fmtUSD(p.amount) : fmtTRY(p.amount)}
                        </strong>
                      </td>
                      <td>
                        {p.status === "pending" && <span className="badge badge-amber">Ro'yxatga olinishi kerak</span>}
                        {p.status === "registered" && (
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {(p.registered_inventory_nos || []).map((inv: string, i: number) => (
                              <span
                                key={inv}
                                className="badge badge-emerald"
                                style={{ cursor: "pointer" }}
                                onClick={() => {
                                  const aid = p.registered_asset_ids?.[i];
                                  if (aid) onOpenAsset(Number(aid));
                                }}
                              >
                                {inv}
                              </span>
                            ))}
                          </div>
                        )}
                        {p.status === "not_inventory" && (
                          <div>
                            <span className="badge badge-slate">Inventar emas</span>
                            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                              {p.not_inventory_reason}
                            </div>
                          </div>
                        )}
                      </td>
                      <td>
                        {p.status === "pending" && (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button className="btn btn-sm btn-primary" onClick={() => openRegisterModal(p)}>
                              <Plus size={13} /> Ro'yxatga olish
                            </button>
                            <button
                              className="btn btn-sm"
                              onClick={() => {
                                setNotInvModal(p);
                                setNotInvReason("");
                              }}
                            >
                              Inventar emas
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ro'yxatga olish Modal */}
      {regModal && (
        <div className="modal-backdrop" onClick={() => setRegModal(null)}>
          <div className="modal-box" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="section-header">
              <div className="section-title">
                <Plus size={18} color="#fbcc42" /> Xaridni Vaqf inventariga ro'yxatga olish
              </div>
              <button className="btn btn-sm" onClick={() => setRegModal(null)}>
                <X size={15} />
              </button>
            </div>

            <div className="resp-grid-2" style={{ marginBottom: 12 }}>
              <div>
                <label className="field-label">Buyum nomi *</label>
                <input
                  className="input"
                  value={regModal.name}
                  onChange={(e) => setRegModal({ ...regModal, name: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Vaqf kategoriyasi *</label>
                <select
                  className="select"
                  value={regModal.category_id}
                  onChange={(e) => setRegModal({ ...regModal, category_id: Number(e.target.value) })}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Joy / Xona</label>
                <select
                  className="select"
                  value={regModal.location_id}
                  onChange={(e) => setRegModal({ ...regModal, location_id: e.target.value })}
                >
                  <option value="">— Keyinroq belgilanadi —</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Javobgar xodim</label>
                <input
                  className="input"
                  value={regModal.responsible_name}
                  onChange={(e) => setRegModal({ ...regModal, responsible_name: e.target.value })}
                />
              </div>
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 10,
                background: "rgba(251,204,66,0.08)",
                border: "1px solid rgba(251,204,66,0.3)",
                marginBottom: 12,
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={Boolean(regModal.split_cards)}
                  onChange={(e) => setRegModal({ ...regModal, split_cards: e.target.checked })}
                />
                Bitta xaridni bir nechta alohida individual kartochkaga bo'lish (masalan: 5 ta noutbuk)
              </label>

              {regModal.split_cards ? (
                <div className="resp-grid-2">
                  <div>
                    <label className="field-label">Alohida kartochkalar soni (dona)</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      className="input"
                      value={regModal.cards_count}
                      onChange={(e) => {
                        const cnt = Math.max(1, Number(e.target.value) || 1);
                        setRegModal({
                          ...regModal,
                          cards_count: cnt,
                          purchase_price: Number((Number(regModal.pending.amount || 0) / cnt).toFixed(2)),
                        });
                      }}
                    />
                  </div>
                  <div>
                    <label className="field-label">Har bir donasining narxi ({regModal.currency})</label>
                    <input
                      type="number"
                      className="input"
                      value={regModal.purchase_price}
                      onChange={(e) => setRegModal({ ...regModal, purchase_price: e.target.value })}
                    />
                  </div>
                </div>
              ) : (
                <div className="resp-grid-3">
                  <div>
                    <label className="field-label">Hisob turi</label>
                    <select
                      className="select"
                      value={regModal.tracking}
                      onChange={(e) => setRegModal({ ...regModal, tracking: e.target.value })}
                    >
                      <option value="individual">Donalab (Individual)</option>
                      <option value="batch">Partiya / Miqdoriy (Batch)</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Miqdori</label>
                    <input
                      type="number"
                      min={1}
                      className="input"
                      disabled={regModal.tracking === "individual"}
                      value={regModal.tracking === "individual" ? 1 : regModal.quantity}
                      onChange={(e) => setRegModal({ ...regModal, quantity: Number(e.target.value) || 1 })}
                    />
                  </div>
                  <div>
                    <label className="field-label">Birlik narxi ({regModal.currency})</label>
                    <input
                      type="number"
                      className="input"
                      value={regModal.purchase_price}
                      onChange={(e) => setRegModal({ ...regModal, purchase_price: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="resp-grid-2" style={{ marginBottom: 14 }}>
              <div>
                <label className="field-label">Kafolat muddati (ixtiyoriy, avtomatik eslatma yaratadi)</label>
                <input
                  type="date"
                  className="input"
                  value={regModal.warranty_until}
                  onChange={(e) => setRegModal({ ...regModal, warranty_until: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Olingan sana</label>
                <input
                  type="date"
                  className="input"
                  value={regModal.acquired_at}
                  onChange={(e) => setRegModal({ ...regModal, acquired_at: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn" onClick={() => setRegModal(null)}>
                Bekor qilish
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={submitRegister}>
                <Check size={15} /> Inventarga qo'shish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* "Bu inventar emas" Modal */}
      {notInvModal && (
        <div className="modal-backdrop" onClick={() => setNotInvModal(null)}>
          <div className="modal-box" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>
              "Bu inventar emas" deb belgilash
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>
              <strong>{notInvModal.title}</strong> ({fmtTRY(notInvModal.amount)}) nima sababdan inventarga kiritilmasligini yozing:
            </p>
            <textarea
              className="textarea"
              rows={3}
              placeholder="Masalan: Bir martalik sarflanuvchi xo'jalik materiali..."
              value={notInvReason}
              onChange={(e) => setNotInvReason(e.target.value)}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button className="btn" onClick={() => setNotInvModal(null)}>
                Bekor qilish
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={submitNotInventory}>
                Saqlash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Moliya Kategoriyalari Sozlamasi Modal */}
      {showSettingsModal && finSettings && (
        <div className="modal-backdrop" onClick={() => setShowSettingsModal(false)}>
          <div className="modal-box" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="section-header">
              <div className="section-title">
                <Settings size={18} color="#fbcc42" /> Inventarga tushadigan Moliya kategoriyalari
              </div>
              <button className="btn btn-sm" onClick={() => setShowSettingsModal(false)}>
                <X size={14} />
              </button>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 12 }}>
              Tanlangan kategoriyalar bo'yicha Moliya tizimida xarajat tasdiqlanganda avtomatik ravishda Vaqf "Ro'yxatga olinishi kerak" navbatiga tushadi:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14, maxHeight: "52vh", overflowY: "auto", paddingRight: 4 }}>
              {(finSettings.available_finance_categories || []).map((c: any) => {
                const checked = (finSettings.inventory_category_ids || []).includes(c.id);
                return (
                  <label
                    key={c.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "var(--bg-subtle)",
                      border: "1px solid var(--border-subtle)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleFinanceCategory(c.id, c.name)}
                    />
                    <span style={{ fontWeight: 600 }}>{c.name}</span>
                  </label>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn" onClick={() => setShowSettingsModal(false)}>
                Yopish
              </button>
              <button className="btn btn-primary" onClick={saveFinanceSettings}>
                <Check size={14} /> Saqlash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 4. 4-QADAM: MUDDATLAR VA ESLATMALAR (SCHEDULES & REMINDERS)
// ============================================================================
export function SchedulesAndRemindersSection({
  institutionId,
  assets,
  locations,
  staffList,
  canEdit,
  notify,
}: {
  institutionId: number | string;
  assets: any[];
  locations: any[];
  staffList: any[];
  canEdit: boolean;
  notify: (msg: string, type?: "ok" | "err") => void;
}) {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [newModal, setNewModal] = useState<any>(null);
  const [doneModal, setDoneModal] = useState<any>(null);
  const [doneNote, setDoneNote] = useState("");

  const loadSchedules = useCallback(async () => {
    try {
      const d = await apiFetch(`/vaqf-api/schedules?institution_id=${institutionId}`);
      setSchedules(d.items || []);
      setTemplates(d.templates || []);
    } catch (e: any) {
      notify(e.message, "err");
    }
  }, [institutionId, notify]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  const openCreateFromTemplate = (tpl?: any) => {
    const defaultNext = new Date(Date.now() + 30 * 86400 * 1000).toISOString().slice(0, 10);
    setNewModal({
      template_code: tpl?.code || "",
      title: tpl?.title || "",
      kind: tpl?.kind || "maintenance",
      interval_months: tpl?.interval_months ?? 6,
      next_due: defaultNext,
      asset_id: "",
      location_id: locations[0]?.id || "",
      responsible_name: staffList[0]?.name || "Inventar mas'uli",
      responsible_ref: staffList[0]?.ref || "role:inventory_manager",
      notes: tpl?.notes || "",
    });
  };

  const submitCreateSchedule = async () => {
    if (!newModal) return;
    try {
      await apiFetch("/vaqf-api/schedules", {
        method: "POST",
        body: JSON.stringify({
          ...newModal,
          institution_id: institutionId === "all" ? 1 : Number(institutionId),
        }),
      });
      notify("Yangi muddat va eslatma saqlandi");
      setNewModal(null);
      await loadSchedules();
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const submitMarkDone = async () => {
    if (!doneModal) return;
    try {
      await apiFetch(`/vaqf-api/schedules/${doneModal.id}/done`, {
        method: "POST",
        body: JSON.stringify({ note: doneNote }),
      });
      notify("Muddat bajarildi deb belgilandi va keyingi sana hisoblandi!");
      setDoneModal(null);
      setDoneNote("");
      await loadSchedules();
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const handleSnooze = async (id: number) => {
    try {
      await apiFetch(`/vaqf-api/schedules/${id}/snooze`, {
        method: "POST",
        body: JSON.stringify({ days: 3 }),
      });
      notify("Muddat 3 kunga keyinga surildi");
      await loadSchedules();
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  // Group by YYYY-MM for calendar view
  const byMonth = schedules.reduce((acc: Record<string, any[]>, s: any) => {
    const m = String(s.next_due_str || "").slice(0, 7) || "Noma'lum";
    if (!acc[m]) acc[m] = [];
    acc[m].push(s);
    return acc;
  }, {});

  return (
    <div className="animate-in">
      <div className="glass-card" style={{ marginBottom: 16 }}>
        <div className="section-header">
          <div className="section-title">
            <Calendar size={18} color="#fbcc42" /> Muddatlar, Kafolat va Texnik Ko'rik Eslatmalari
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className={`btn btn-sm ${viewMode === "list" ? "btn-primary" : ""}`}
              onClick={() => setViewMode("list")}
            >
              📋 Ro'yxat
            </button>
            <button
              className={`btn btn-sm ${viewMode === "calendar" ? "btn-primary" : ""}`}
              onClick={() => setViewMode("calendar")}
            >
              📅 Taqvim (Oylar)
            </button>
            {canEdit && (
              <button className="btn btn-sm btn-primary" onClick={() => openCreateFromTemplate()}>
                <Plus size={14} /> Yangi muddat qo'shish
              </button>
            )}
          </div>
        </div>

        {/* Tayyor shablonlar qatori */}
        {canEdit && templates.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 6, fontWeight: 700 }}>
              TAYYOR SHABLONLAR (1-bosishda yaratish):
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {templates.map((tpl) => (
                <button
                  key={tpl.code}
                  className="btn btn-sm"
                  style={{ fontSize: 11.5 }}
                  onClick={() => openCreateFromTemplate(tpl)}
                >
                  + {tpl.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {viewMode === "list" ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Keyingi muddat</th>
                  <th>Vazifa / Ko'rik nomi</th>
                  <th>Turi va Davriylik</th>
                  <th>Buyum / Joy</th>
                  <th>Mas'ul xodim</th>
                  <th>Oxirgi bajarilgan</th>
                  <th>Amallar</th>
                </tr>
              </thead>
              <tbody>
                {schedules.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: 28, color: "var(--text-muted)" }}>
                      Hozircha muddatlar yo'q
                    </td>
                  </tr>
                ) : (
                  schedules.map((s) => {
                    const days = Number(s.days_until_due ?? 99);
                    const isOverdue = s.status === "active" && days < 0;
                    const isSoon = s.status === "active" && days >= 0 && days <= 14;
                    return (
                      <tr
                        key={s.id}
                        style={
                          isOverdue
                            ? { background: "rgba(244,63,94,0.12)" }
                            : isSoon
                            ? { background: "rgba(245,158,11,0.07)" }
                            : undefined
                        }
                      >
                        <td>
                          <div style={{ fontWeight: 800, color: isOverdue ? "#f43f5e" : isSoon ? "#f59e0b" : "inherit" }}>
                            {s.next_due_str}
                          </div>
                          {s.status === "completed" ? (
                            <span className="badge badge-emerald">Yakunlangan</span>
                          ) : isOverdue ? (
                            <span className="badge badge-rose">🚨 {Math.abs(days)} kun o'tib ketdi!</span>
                          ) : isSoon ? (
                            <span className="badge badge-amber">⏰ {days} kun qoldi</span>
                          ) : (
                            <span className="badge badge-slate">{days} kun qoldi</span>
                          )}
                        </td>
                        <td>
                          <div style={{ fontWeight: 700 }}>{s.title}</div>
                          {s.notes && <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{s.notes}</div>}
                        </td>
                        <td>
                          <span className="badge badge-cyan">{s.kind}</span>
                          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>
                            {s.interval_months ? `Har ${s.interval_months} oyda` : "Bir martalik"}
                          </div>
                        </td>
                        <td>
                          {s.inventory_no ? (
                            <span>
                              <strong>{s.inventory_no}</strong> — {s.asset_name}
                            </span>
                          ) : (
                            <span>📍 {s.location_name || "Umumiy"}</span>
                          )}
                        </td>
                        <td>{s.responsible_name || s.responsible_ref || "—"}</td>
                        <td>
                          {s.last_done_at ? (
                            <div style={{ fontSize: 12 }}>
                              <div>{new Date(s.last_done_at).toLocaleDateString("tr-TR")}</div>
                              <div style={{ color: "var(--text-muted)", fontSize: 11 }}>{s.last_done_by_name}</div>
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {s.status === "active" && (
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => {
                                  setDoneModal(s);
                                  setDoneNote("");
                                }}
                              >
                                <Check size={13} /> Bajarildi
                              </button>
                              <button className="btn btn-sm" onClick={() => handleSnooze(s.id)}>
                                ⏰ +3 kun
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="resp-grid-2">
            {Object.entries(byMonth).map(([month, list]) => (
              <div key={month} className="glass-card" style={{ background: "var(--bg-subtle)" }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#fbcc42", marginBottom: 10 }}>
                  📅 {month} ({list.length} ta)
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {list.map((s: any) => {
                    const isOverdue = s.status === "active" && Number(s.days_until_due) < 0;
                    return (
                      <div
                        key={s.id}
                        style={{
                          padding: "9px 12px",
                          borderRadius: 10,
                          border: isOverdue ? "1px solid #f43f5e" : "1px solid var(--border-subtle)",
                          background: isOverdue ? "rgba(244,63,94,0.12)" : "var(--bg-subtle)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{s.title}</div>
                          <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                            {s.next_due_str} • {s.asset_name || s.location_name || "Muassasa"}
                          </div>
                        </div>
                        {s.status === "active" && (
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => {
                              setDoneModal(s);
                              setDoneNote("");
                            }}
                          >
                            ✔️ Bajarildi
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Yangi muddat yaratish modal */}
      {newModal && (
        <div className="modal-backdrop" onClick={() => setNewModal(null)}>
          <div className="modal-box" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="section-header">
              <div className="section-title">
                <Calendar size={18} color="#fbcc42" /> Yangi ko'rik / eslatma muddati
              </div>
              <button className="btn btn-sm" onClick={() => setNewModal(null)}>
                <X size={14} />
              </button>
            </div>

            <div className="resp-grid-2" style={{ marginBottom: 12 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="field-label">Sarlavha *</label>
                <input
                  className="input"
                  value={newModal.title}
                  onChange={(e) => setNewModal({ ...newModal, title: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Turi</label>
                <select
                  className="select"
                  value={newModal.kind}
                  onChange={(e) => setNewModal({ ...newModal, kind: e.target.value })}
                >
                  <option value="inspection">Texnik ko'rik (inspection)</option>
                  <option value="maintenance">Profilaktika / Xizmat (maintenance)</option>
                  <option value="warranty">Kafolat muddati (warranty)</option>
                  <option value="insurance">Sug'urta (insurance)</option>
                  <option value="license">Litsenziya (license)</option>
                  <option value="other">Boshqa (other)</option>
                </select>
              </div>
              <div>
                <label className="field-label">Davriyligi (oy, bir martalik bo'lsa bo'sh)</label>
                <input
                  type="number"
                  className="input"
                  placeholder="Masalan: 6 yoki 12"
                  value={newModal.interval_months ?? ""}
                  onChange={(e) => setNewModal({ ...newModal, interval_months: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Keyingi muddat sanasi *</label>
                <input
                  type="date"
                  className="input"
                  value={newModal.next_due}
                  onChange={(e) => setNewModal({ ...newModal, next_due: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Mas'ul xodim</label>
                <input
                  className="input"
                  value={newModal.responsible_name}
                  onChange={(e) => setNewModal({ ...newModal, responsible_name: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Joy / Xona</label>
                <select
                  className="select"
                  value={newModal.location_id}
                  onChange={(e) => setNewModal({ ...newModal, location_id: e.target.value })}
                >
                  <option value="">— Tanlanmagan —</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Yoki aniq buyum (ixtiyoriy)</label>
                <select
                  className="select"
                  value={newModal.asset_id}
                  onChange={(e) => setNewModal({ ...newModal, asset_id: e.target.value })}
                >
                  <option value="">— Tanlanmagan —</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.inventory_no} — {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn" onClick={() => setNewModal(null)}>
                Bekor qilish
              </button>
              <button className="btn btn-primary" onClick={submitCreateSchedule}>
                <Check size={14} /> Saqlash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bajarildi Modal */}
      {doneModal && (
        <div className="modal-backdrop" onClick={() => setDoneModal(null)}>
          <div className="modal-box" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>
              ✔️ "{doneModal.title}" bajarildi
            </h3>
            <p style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 10 }}>
              {doneModal.interval_months
                ? `Tasdiqlangach, keyingi muddat avtomatik ravishda +${doneModal.interval_months} oyga o'tkaziladi.`
                : "Bir martalik vazifa yakunlangan deb belgilanadi."}
            </p>
            <textarea
              className="textarea"
              rows={3}
              placeholder="Bajarilgan ish bo'yicha qisqa izoh..."
              value={doneNote}
              onChange={(e) => setDoneNote(e.target.value)}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button className="btn" onClick={() => setDoneModal(null)}>
                Bekor qilish
              </button>
              <button className="btn btn-primary" onClick={submitMarkDone}>
                <Check size={14} /> Tasdiqlash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 5. 2-QADAM: UNAUTHENTICATED QR LANDING CARD & TELEGRAM MINI APP SCANNER
// ============================================================================
export function UnauthenticatedQrLandingCard({ inventoryNo }: { inventoryNo: string }) {
  const [info, setInfo] = useState<any>(null);

  useEffect(() => {
    fetch(`/vaqf-api/public/qr-info/${encodeURIComponent(inventoryNo)}`)
      .then((r) => r.json())
      .then((d) => setInfo(d))
      .catch(() => {});
  }, [inventoryNo]);

  const tgLink = info?.tg_deep_link || `https://t.me/ezanvakfitizimbot?start=a_${encodeURIComponent(inventoryNo)}`;
  const loginLink = `/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="glass-card" style={{ maxWidth: 440, width: "100%", textAlign: "center", padding: 28 }}>
        <img src="/vaqf/ezan-logo.svg" alt="Ezan Vakfı" style={{ width: 52, height: 64, margin: "0 auto 12px" }} />
        <div className="badge badge-amber" style={{ marginBottom: 8, fontSize: 12 }}>
          {inventoryNo}
        </div>
        <h2 style={{ fontSize: 19, fontWeight: 800, marginBottom: 6 }}>
          {info?.asset?.name || "Ezan Vakfı Mulk Kartochkasi"}
        </h2>
        {info?.asset?.location_name && (
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
            📍 {info.asset.location_name} ({info.asset.institution_name})
          </div>
        )}
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
          Buyum kartochkasini ko'rish, nosozlik xabar qilish yoki zimmatni tasdiqlash uchun Telegram bot (@ezanvakfitizimbot) orqali oching yoki tizimga kiring:
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <a
            href={tgLink}
            className="btn btn-primary"
            style={{
              textDecoration: "none",
              justifyContent: "center",
              padding: "12px 18px",
              fontSize: 14,
              background: "linear-gradient(135deg, #0088cc, #06b6d4)",
              color: "#fff",
              border: "none",
            }}
          >
            ✈️ Telegram orqali ochish (@ezanvakfitizimbot)
          </a>
          <a
            href={loginLink}
            className="btn"
            style={{ textDecoration: "none", justifyContent: "center", padding: "11px 18px", fontSize: 13.5 }}
          >
            🔐 Web tizimga kirish
          </a>
        </div>
      </div>
    </div>
  );
}

export function TelegramMiniAppScannerPage({
  notify,
  onExitMiniApp,
}: {
  notify: (msg: string, type?: "ok" | "err") => void;
  onExitMiniApp: () => void;
}) {
  const [manualCode, setManualCode] = useState("");
  const [scannedAsset, setScannedAsset] = useState<any>(null);
  const [faultDesc, setFaultDesc] = useState("");
  const [showFaultForm, setShowFaultForm] = useState(false);

  const lookupCode = async (raw: string) => {
    const clean = raw
      .trim()
      .replace(/^.*\/vaqf\/a\//i, "")
      .replace(/\?.*$/, "")
      .trim()
      .toUpperCase();
    if (!clean) return;
    try {
      const res = await apiFetch(`/vaqf-api/assets/by-code/${encodeURIComponent(clean)}`);
      setScannedAsset(res.asset);
      setShowFaultForm(false);
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const triggerNativeTelegramQrScanner = () => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.showScanQrPopup) {
      tg.showScanQrPopup({ text: "Ezan Vakfı QR yorlig'ini kameraga tuting" }, (text: string) => {
        if (text) {
          tg.closeScanQrPopup?.();
          lookupCode(text);
          return true;
        }
        return false;
      });
    } else {
      notify("Inventar raqamini quyidagi maydonga kiriting", "ok");
    }
  };

  const submitQuickFault = async () => {
    if (!scannedAsset || !faultDesc.trim()) return;
    try {
      await apiFetch(`/vaqf-api/assets/${scannedAsset.id}/fault`, {
        method: "POST",
        body: JSON.stringify({ description: faultDesc }),
      });
      notify("Nosozlik xabari yuborildi!");
      setShowFaultForm(false);
      setFaultDesc("");
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: 16 }}>
      <div className="glass-card" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#fbcc42" }}>
            📷 Ezan Vakfı — QR Skaner
          </div>
          <button className="btn btn-sm" onClick={onExitMiniApp}>
            To'liq sayt
          </button>
        </div>

        <button
          className="btn btn-primary"
          style={{ width: "100%", justifyContent: "center", padding: "14px", fontSize: 15, marginBottom: 12 }}
          onClick={triggerNativeTelegramQrScanner}
        >
          <Camera size={18} /> Kamerada QR skanerlash
        </button>

        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="input"
            placeholder="Yoki inventar № (EV-MZN-000001)..."
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
          />
          <button className="btn" onClick={() => lookupCode(manualCode)}>
            <Search size={15} /> Topish
          </button>
        </div>
      </div>

      {scannedAsset && (
        <div className="glass-card animate-in">
          <div className="badge badge-amber" style={{ marginBottom: 6 }}>
            {scannedAsset.inventory_no}
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>{scannedAsset.name}</h3>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
            <div>📂 Kategoriya: <strong>{scannedAsset.category_name}</strong></div>
            <div>📍 Joylashuv: <strong>{scannedAsset.location_name || "Belgilanmagan"}</strong></div>
            <div>👤 Javobgar: <strong>{scannedAsset.responsible_name || "Biriktirilmagan"}</strong></div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-sm btn-primary" onClick={() => setShowFaultForm((v) => !v)}>
              ⚠️ Nosozlik xabar qilish
            </button>
          </div>

          {showFaultForm && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
              <textarea
                className="textarea"
                rows={3}
                placeholder="Nosozlik tavsifini yozing..."
                value={faultDesc}
                onChange={(e) => setFaultDesc(e.target.value)}
              />
              <button
                className="btn btn-sm btn-primary"
                style={{ marginTop: 8, width: "100%", justifyContent: "center" }}
                onClick={submitQuickFault}
              >
                Yuborish
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 6-BOSQICH: VAQF BOT BANNER ("Vaqf botini oching") & TELEGRAM LINK MODAL
// ============================================================================
export function VaqfBotBannerAndLinkBar({
  botStatus,
  onRefreshBotStatus,
  notify,
}: {
  botStatus: any;
  onRefreshBotStatus: () => void;
  notify: (msg: string, type?: "ok" | "err") => void;
}) {
  const [linkModal, setLinkModal] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const openLinkCodeModal = async () => {
    try {
      setBusy(true);
      const data = await apiFetch("/vaqf-api/me/telegram-link-code", { method: "POST" });
      setLinkModal(data);
    } catch (e: any) {
      notify(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  const botUsername = botStatus?.bot_username || "ezanvakfitizimbot";
  const botUrl = botStatus?.bot_url || `https://t.me/${botUsername}`;
  const needsStart = !botStatus?.bot_started || botStatus?.bot_blocked;

  return (
    <>
      {needsStart && (
        <div
          className="glass-card animate-in"
          style={{
            marginBottom: 14,
            padding: "12px 16px",
            borderColor: "rgba(6, 182, 212, 0.45)",
            background: "var(--bg-banner-cyan)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>🤖</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 13.5, color: "var(--accent-cyan)" }}>
                Vaqf botini oching (@{botUsername})
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {!botStatus?.telegram_linked
                  ? "Telegram hisobingiz hali bog'lanmagan. 10 daqiqalik bir martalik kod orqali bog'lang:"
                  : botStatus?.bot_blocked
                  ? "Siz @ezanvakfitizimbot ni bloklagansiz. Xabarnomalar kelishi uchun botni qayta /start qiling."
                  : "Zimmat, tasdiq va eslatma xabarlari kelishi uchun yangi @ezanvakfitizimbot da /start bosing."}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a
              href={botUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm btn-cyan"
              style={{ textDecoration: "none" }}
              onClick={() => setTimeout(onRefreshBotStatus, 4000)}
            >
              <ExternalLink size={14} /> @{botUsername} ni ochish
            </a>
            <button className="btn btn-sm btn-primary" onClick={openLinkCodeModal} disabled={busy}>
              🔗 Telegram'ni bog'lash
            </button>
          </div>
        </div>
      )}

      {!needsStart && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button className="btn btn-sm" onClick={openLinkCodeModal} disabled={busy} title="Telegram hisobni qayta bog'lash">
            🔗 Telegram bog'langan (@{botUsername})
          </button>
        </div>
      )}

      {linkModal && (
        <div className="modal-backdrop" onClick={() => setLinkModal(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440, textAlign: "center" }}>
            <div className="section-header">
              <div className="section-title">🔗 Telegram'ni bog'lash (@{linkModal.bot_username})</div>
              <button className="btn btn-sm" onClick={() => setLinkModal(null)}>
                <X size={15} />
              </button>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 14 }}>
              Quyidagi bir martalik kod <strong>10 daqiqa</strong> davomida amal qiladi. Tugmani bosing yoki botga{" "}
              <code>/start link_{linkModal.code}</code> yuboring:
            </p>
            <div
              style={{
                padding: "14px",
                borderRadius: 10,
                background: "rgba(251, 204, 66, 0.12)",
                border: "1px dashed rgba(251, 204, 66, 0.5)",
                fontFamily: "monospace",
                fontSize: 22,
                fontWeight: 800,
                color: "#fbcc42",
                letterSpacing: "0.12em",
                marginBottom: 16,
              }}
            >
              {linkModal.code}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <a
                href={linkModal.deep_link}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary"
                style={{ textDecoration: "none", justifyContent: "center", padding: "11px 16px" }}
                onClick={() => {
                  setTimeout(() => {
                    onRefreshBotStatus();
                  }, 5000);
                }}
              >
                ✈️ @{linkModal.bot_username} orqali avtomatik bog'lash
              </a>
              <button
                className="btn"
                onClick={() => {
                  setLinkModal(null);
                  onRefreshBotStatus();
                }}
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================================
// 6-BOSQICH: TIZIM HOLATI (HEALTH) & 5 SHABLONLI EXCEL IMPORT
// ============================================================================
const MULTI_TEMPLATES = [
  {
    type: "locations",
    title: "1. Joylar va xonalar (Bina / Kat / Oda)",
    desc: "Muassasa kodi, bino, qavat va xonalar ierarxiyasi (3 ta namuna bilan)",
  },
  {
    type: "assets",
    title: "2. Mavjud buyumlar (Demirbaş / Eşya)",
    desc: "Buyum nomi, kategoriya, joylashuv, javobgar va qiymati (3 ta namuna bilan)",
  },
  {
    type: "roles",
    title: "3. Xodimlar va rollar (Kullanıcı Rolleri)",
    desc: "Foydalanuvchi identifikatori, F.I.Sh. va Vaqf roli (director, inventory_manager, accountant, staff)",
  },
  {
    type: "properties",
    title: "4. Ko'chmas mulk (Gayrimenkul / Taşınmaz)",
    desc: "Vaqf binolari, yer uchastkalari, Ada/Parsel va kadastr ma'lumotlari",
  },
  {
    type: "schedules",
    title: "5. Muddatli ishlar (Periyodik Bakım / Kontroller)",
    desc: "Kafolat, kombi, o't o'chirgich va davriy texnik ko'rik muddatlari",
  },
];

export function SystemHealthAndMultiImportSection({
  isDirector,
  notify,
}: {
  isDirector: boolean;
  notify: (msg: string, type?: "ok" | "err") => void;
}) {
  const [health, setHealth] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [activeImportType, setActiveImportType] = useState<string>("locations");
  const [importFile, setImportFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const [preview, setPreview] = useState<any>(null);

  const loadHealth = useCallback(async () => {
    if (!isDirector) return;
    try {
      const h = await apiFetch("/vaqf-api/health");
      setHealth(h);
    } catch {}
  }, [isDirector]);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  const triggerOpsAction = async (endpoint: string, body: any = {}, okMsg: string) => {
    try {
      setBusy(true);
      const res = await apiFetch(endpoint, { method: "POST", body: JSON.stringify(body) });
      notify(okMsg);
      await loadHealth();
      return res;
    } catch (e: any) {
      notify(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  const handleSelectMultiExcel = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || "");
      setImportFile({ name: file.name, dataUrl });
      try {
        setBusy(true);
        const endpoint =
          activeImportType === "assets" ? "/vaqf-api/import/assets" : `/vaqf-api/import/${activeImportType}`;
        const res = await apiFetch(endpoint, {
          method: "POST",
          body: JSON.stringify({ mode: "preview", dataUrl, fileName: file.name }),
        });
        setPreview(res);
      } catch (e: any) {
        notify(e.message, "err");
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCommitMultiExcel = async () => {
    if (!importFile) return;
    try {
      setBusy(true);
      const endpoint =
        activeImportType === "assets" ? "/vaqf-api/import/assets" : `/vaqf-api/import/${activeImportType}`;
      const res = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({ mode: "commit", skipInvalid: true, dataUrl: importFile.dataUrl, fileName: importFile.name }),
      });
      notify(`Muvaffaqiyatli saqlandi: ${res.importedCount} ta qator!`);
      setPreview(null);
      setImportFile(null);
    } catch (e: any) {
      notify(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 18 }}>
      {/* 5-QADAM: TIZIM HOLATI (SYSTEM HEALTH) */}
      {isDirector && health && (
        <div className="glass-card">
          <div className="section-header">
            <div className="section-title">
              <Activity size={18} color="#10b981" /> Tizim holati va Monitoring (6-bosqich)
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn btn-sm"
                disabled={busy}
                onClick={() => triggerOpsAction("/vaqf-api/ops/backup", {}, "Zaxira nusxa (Backup) olindi!")}
              >
                💾 Hozir Backup olish
              </button>
              <button
                className="btn btn-sm"
                disabled={busy}
                onClick={() =>
                  triggerOpsAction(
                    "/vaqf-api/ops/restore-test",
                    {},
                    "Haftalik Restore test muvaffaqiyatli yakunlandi!"
                  )
                }
              >
                🧪 Restore test o'tkazish
              </button>
              <button
                className="btn btn-sm"
                disabled={busy}
                onClick={() =>
                  triggerOpsAction("/vaqf-api/ops/verify-pii-key", {}, "VAQF_PII_KEY shifrlash kaliti tasdiqlandi!")
                }
              >
                🔑 PII kalitni tekshirish
              </button>
              <button
                className="btn btn-sm btn-cyan"
                disabled={busy}
                onClick={() =>
                  triggerOpsAction(
                    "/vaqf-api/ops/migration-broadcast",
                    {},
                    "@mezanatizimbot orqali bir martalik o'tish e'loni yuborildi!"
                  )
                }
              >
                📣 Bot ko'chgani haqida e'lon yuborish
              </button>
              <button className="btn btn-sm" onClick={loadHealth}>
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          <div className="resp-grid-4">
            <div style={{ padding: 12, borderRadius: 10, background: "var(--bg-subtle)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Oxirgi zaxira nusxa (Backup)</div>
              <div style={{ fontWeight: 800, fontSize: 14, marginTop: 4, color: health.backup?.ok ? "#10b981" : "#f59e0b" }}>
                {health.backup?.last_backup_at
                  ? `${new Date(health.backup.last_backup_at).toLocaleString("uz-UZ")} (${health.backup.age_hours} soat oldin)`
                  : "Hali olinmagan"}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 4 }}>
                Disk bo'sh joyi: <strong>{health.backup?.disk_free_percent}%</strong> | 4TB /backup:{" "}
                <strong>{health.backup?.separate_disk_mounted ? "Ulangan" : "Asosiy diskda"}</strong>
              </div>
            </div>

            <div style={{ padding: 12, borderRadius: 10, background: "var(--bg-subtle)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Outbox xabarnomalar navbati</div>
              <div style={{ fontWeight: 800, fontSize: 14, marginTop: 4 }}>
                Yuborilgan: <span style={{ color: "#10b981" }}>{health.outbox?.sent || 0}</span> | Kutilmoqda:{" "}
                <span style={{ color: "#fbcc42" }}>{health.outbox?.pending || 0}</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 4 }}>
                Xato (failed): <strong>{health.outbox?.failed || 0}</strong> | Skipped (bot ochilmagan):{" "}
                <strong>{health.outbox?.skipped || 0}</strong>
              </div>
            </div>

            <div style={{ padding: 12, borderRadius: 10, background: "var(--bg-subtle)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Vaqf Telegram Boti</div>
              <div style={{ fontWeight: 800, fontSize: 14, marginTop: 4, color: "#22d3ee" }}>
                @{health.bot?.username} ({health.bot?.token_masked})
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 4 }}>
                PM2: <strong>{health.bot?.pm2_status}</strong> | Faol chatlar:{" "}
                <strong>{health.bot?.started_chats || 0} ta</strong> (Bloklangan: {health.bot?.blocked_chats || 0})
              </div>
            </div>

            <div style={{ padding: 12, borderRadius: 10, background: "var(--bg-subtle)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Dastur versiyasi va Shifrlash</div>
              <div style={{ fontWeight: 800, fontSize: 14, marginTop: 4, fontFamily: "monospace", color: "#fbcc42" }}>
                {health.version?.branch} @ {health.version?.commit}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 4 }}>
                PII Key: <strong>{health.pii_key?.ok ? `✅ OK (${health.pii_key?.keyFingerprint})` : "⚠️ Xato"}</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6-QADAM: 5 TA IKKI TILLI (TR+UZ) EXCEL SHABLONLAR VA IMPORT */}
      <div className="glass-card">
        <div className="section-header">
          <div className="section-title">
            <FileText size={18} color="#fbcc42" /> Boshlang'ich ma'lumotlarni yuklash (5 ta TR+UZ Excel shablon)
          </div>
        </div>

        <div className="resp-grid-3" style={{ marginBottom: 14 }}>
          {MULTI_TEMPLATES.map((tpl) => (
            <div
              key={tpl.type}
              onClick={() => {
                setActiveImportType(tpl.type);
                setPreview(null);
                setImportFile(null);
              }}
              style={{
                padding: 12,
                borderRadius: 10,
                cursor: "pointer",
                background: activeImportType === tpl.type ? "rgba(251, 204, 66, 0.14)" : "var(--bg-subtle)",
                border:
                  activeImportType === tpl.type
                    ? "1px solid rgba(251, 204, 66, 0.65)"
                    : "1px solid var(--border-subtle)",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 13.5, color: activeImportType === tpl.type ? "#fbcc42" : "var(--text-primary)" }}>
                {tpl.title}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 4, marginBottom: 10 }}>
                {tpl.desc}
              </div>
              <a
                href={`/vaqf-api/import/templates/${tpl.type}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-sm"
                style={{ textDecoration: "none" }}
                onClick={(e) => e.stopPropagation()}
              >
                📥 Shablonni yuklab olish (.xlsx)
              </a>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label className="btn btn-cyan" style={{ cursor: "pointer" }}>
            📂 "{MULTI_TEMPLATES.find((t) => t.type === activeImportType)?.title}" uchun Excel fayl tanlash
            <input
              type="file"
              accept=".xlsx,.xls"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleSelectMultiExcel(f);
                e.target.value = "";
              }}
            />
          </label>

          {preview && preview.validCount > 0 && (
            <button className="btn btn-primary" disabled={busy} onClick={handleCommitMultiExcel}>
              <Check size={15} /> Bazaga yozish ({preview.validCount} ta to'g'ri qator)
            </button>
          )}
        </div>

        {preview && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              Oldindan ko'rish ({importFile?.name}): Jami {preview.totalRows} qator —{" "}
              <span style={{ color: "#10b981" }}>{preview.validCount} ta yaroqli</span>,{" "}
              <span style={{ color: "#f43f5e" }}>{preview.errorCount} ta xatolik</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Qator</th>
                    <th>Ma'lumotlar</th>
                    <th>Holati / Xatolar</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview.rows || []).map((r: any) => (
                    <tr key={r.rowNumber}>
                      <td>#{r.rowNumber}</td>
                      <td style={{ fontSize: 12, fontFamily: "monospace" }}>
                        {JSON.stringify(
                          Object.fromEntries(
                            Object.entries(r).filter(([k]) => !["rowNumber", "valid", "errors"].includes(k))
                          )
                        )}
                      </td>
                      <td>
                        {r.valid ? (
                          <span className="badge badge-emerald">Tayyor</span>
                        ) : (
                          <span style={{ color: "#fb7185", fontSize: 12 }}>{(r.errors || []).join("; ")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
