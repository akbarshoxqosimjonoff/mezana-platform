import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { UnifiedModules, UnifiedTabId } from "./UnifiedModules";
import { AiAssistantModal } from "./AiAssistantModal";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  Filter,
  Globe,
  History,
  Layers,
  Link2,
  LogOut,
  Moon,
  PieChart,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Sun,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
  X,
  XCircle,
} from "lucide-react";

const fmtTL = (val: number | string | null | undefined) => {
  const n = Math.round(Number(val) || 0);
  return `\u20BA${n.toLocaleString("tr-TR")}`;
};

const fmtUSD = (val: number | string | null | undefined) => {
  const n = Number(val) || 0;
  const hasCents = Math.abs(n - Math.round(n)) > 0.005;
  return "\u0024" + n.toLocaleString("en-US", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  });
};


function StudentAvatar({ student, size = 36 }: { student: any; size?: number }) {
  const [imgErr, setImgErr] = useState(false);
  const pic = student?.profilePicture || student?.photo || "";
  const fullname = String(student?.fullname || student?.studentName || "T");
  const initials = fullname
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase())
    .join("");
  const isFemale = student?.gender === "FEMALE";
  const radius = Math.round(size * 0.28);

  if (pic && !imgErr) {
    return (
      <img
        src={pic}
        alt={fullname}
        title={`${fullname} — rasmni kattalashtirish uchun bosing`}
        onError={() => setImgErr(true)}
        onClick={(e) => {
          e.stopPropagation();
          window.dispatchEvent(
            new CustomEvent("mezana:preview-student-photo", {
              detail: {
                url: pic,
                fullname,
                group: student?.group?.name || (typeof student?.group === "string" ? student.group : "") || student?.studentGroup || "",
                room: student?.roomNumber || student?.room?.roomNumber || (typeof student?.room === "string" ? student.room : "") || "",
                studyPlace: student?.studyPlace || "",
              },
            })
          );
        }}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          objectFit: "cover",
          flexShrink: 0,
          border: "1px solid rgba(148, 163, 184, 0.28)",
          background: "var(--bg-input)",
          cursor: "zoom-in",
          transition: "transform 0.15s ease, box-shadow 0.15s ease",
        }}
      />
    );
  }

  return (
    <div
      className="stu-avatar"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        fontSize: Math.max(11, Math.round(size * 0.36)),
        background: isFemale ? "rgba(236,72,153,0.15)" : "rgba(6,182,212,0.15)",
        color: isFemale ? "#f472b6" : "#06b6d4",
      }}
    >
      {initials}
    </div>
  );
}

const METHOD_MAP: Record<string, { label: string; badge: string }> = {
  naqt: { label: "Naqd", badge: "badge-emerald" },
  karta: { label: "Karta", badge: "badge-cyan" },
  otkazma: { label: "O'tkazma", badge: "badge-violet" },
};

const EXPENSE_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  PENDING: { label: "Kutilmoqda", badge: "badge-amber" },
  APPROVED: { label: "Tasdiqlangan", badge: "badge-cyan" },
  PAID: { label: "To'langan", badge: "badge-emerald" },
  REJECTED: { label: "Rad / Bekor", badge: "badge-rose" },
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
    throw new Error(data?.error || data?.message || `Xatolik (${res.status})`);
  }
  return data;
}

// --- Custom Zero-Overhead SVG Charts ---
function CashFlowChart({ data }: { data: any[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  if (!data || data.length === 0) {
    return <div style={{ padding: 32, color: "var(--text-muted)", textAlign: "center" }}>Ma'lumot yo'q</div>;
  }
  const maxVal = Math.max(
    1000,
    ...data.map((d) => Math.max(Number(d.totalInflow || 0), Number(d.erpExpense || 0)))
  );
  const width = 760;
  const height = 230;
  const padLeft = 58;
  const padRight = 18;
  const padTop = 18;
  const padBottom = 32;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const stepX = chartW / Math.max(data.length, 1);

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", overflow: "visible" }}>
        <defs>
          <linearGradient id="inflowGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.35" />
          </linearGradient>
          <linearGradient id="outflowGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.88" />
            <stop offset="100%" stopColor="#e11d48" stopOpacity="0.3" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
          const y = padTop + chartH * (1 - ratio);
          const val = Math.round(maxVal * ratio);
          return (
            <g key={idx}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="rgba(148,163,184,0.12)"
                strokeDasharray="4 4"
              />
              <text x={padLeft - 8} y={y + 4} textAnchor="end" fontSize="10" fill="var(--text-muted)">
                ${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const cx = padLeft + i * stepX + stepX / 2;
          const barW = Math.min(16, stepX * 0.34);
          const inH = Math.max(2, (Number(d.totalInflow || 0) / maxVal) * chartH);
          const outH = Math.max(2, (Number(d.erpExpense || 0) / maxVal) * chartH);
          const inY = padTop + chartH - inH;
          const outY = padTop + chartH - outH;
          const isHovered = hoverIdx === i;

          return (
            <g
              key={d.month}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              style={{ cursor: "pointer" }}
            >
              {isHovered && (
                <rect
                  x={cx - stepX / 2 + 2}
                  y={padTop}
                  width={stepX - 4}
                  height={chartH}
                  rx={6}
                  fill="rgba(148,163,184,0.07)"
                />
              )}
              <rect x={cx - barW - 2} y={inY} width={barW} height={inH} rx={4} fill="url(#inflowGrad)" />
              <rect x={cx + 2} y={outY} width={barW} height={outH} rx={4} fill="url(#outflowGrad)" />
              <text x={cx} y={height - 10} textAnchor="middle" fontSize="10.5" fill="var(--text-secondary)">
                {String(d.month).slice(5)}
              </text>
            </g>
          );
        })}
      </svg>

      {hoverIdx !== null && data[hoverIdx] && (
        <div
          style={{
            position: "absolute",
            top: 4,
            right: 12,
            background: "var(--bg-surface-elevated)",
            border: "1px solid var(--border-glow)",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 12,
            boxShadow: "var(--shadow-card)",
            display: "flex",
            gap: 14,
          }}
        >
          <strong>{data[hoverIdx].month}</strong>
          <span style={{ color: "#34d399" }}>Kirim: {fmtUSD(data[hoverIdx].totalInflow)}</span>
          <span style={{ color: "#fb7185" }}>Chiqim: {fmtUSD(data[hoverIdx].erpExpense)} ({fmtTL(data[hoverIdx].erpExpenseTl)})</span>
          <span style={{ color: "#22d3ee" }}>Sof: {fmtUSD(data[hoverIdx].net)}</span>
        </div>
      )}
    </div>
  );
}

function MethodDonut({ byMethod }: { byMethod: any[] }) {
  const filteredMethods = (byMethod || []).filter((x) => x.method === "naqt" || x.method === "karta" || x.method === "otkazma");
  const total = filteredMethods.reduce((s, x) => s + Number(x.amount || 0), 0);
  const colors: Record<string, string> = {
    naqt: "#10b981",
    karta: "#06b6d4",
    otkazma: "#8b5cf6",
  };
  let acc = 0;
  const radius = 50;
  const circum = 2 * Math.PI * radius;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
      <svg width="136" height="136" viewBox="0 0 136 136">
        <circle cx="68" cy="68" r={radius} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="14" />
        {total > 0 &&
          filteredMethods.map((m) => {
            const frac = Number(m.amount || 0) / total;
            const dash = frac * circum;
            const offset = -acc * circum;
            acc += frac;
            return (
              <circle
                key={m.method}
                cx="68"
                cy="68"
                r={radius}
                fill="none"
                stroke={colors[m.method] || "#10b981"}
                strokeWidth="14"
                strokeDasharray={`${dash} ${circum - dash}`}
                strokeDashoffset={offset}
                transform="rotate(-90 68 68)"
              />
            );
          })}
        <text x="68" y="64" textAnchor="middle" fontSize="11" fill="var(--text-secondary)">
          Tushum
        </text>
        <text x="68" y="80" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--text-primary)">
          {fmtUSD(total)}
        </text>
      </svg>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        {["naqt", "karta", "otkazma"].map((key) => {
          const row = (byMethod || []).find((x) => x.method === key) || { amount: 0, count: 0 };
          const pct = total > 0 ? Math.round((Number(row.amount || 0) / total) * 100) : 0;
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: colors[key],
                    display: "inline-block",
                  }}
                />
                {METHOD_MAP[key]?.label || key} ({row.count || 0})
              </span>
              <strong>
                {fmtUSD(row.amount)} <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>({pct}%)</span>
              </strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Main Application ---
function App() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [auth, setAuth] = useState<any>({ loading: true, authenticated: false });
  const [loginForm, setLoginForm] = useState({ identifier: "", password: "", error: "", busy: false });

  const [activeTab, setActiveTab] = useState<
    "dashboard" | "payments" | "debtors" | "expenses" | "wallets" | "planning" | "reports" | UnifiedTabId
  >("dashboard");

  const [dateRange, setDateRange] = useState(() => {
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
    return { from: "2026-07-01", to: today };
  });

  const [toast, setToast] = useState<{ text: string; type: "ok" | "err" } | null>(null);
  const notify = useCallback((text: string, type: "ok" | "err" = "ok") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Data states
  const [overview, setOverview] = useState<any>(null);
  const [paymentsData, setPaymentsData] = useState<any>({ items: [], total: 0, totalAmount: 0, byMethod: [], groups: [] });
  const [debtorsData, setDebtorsData] = useState<any>({ debtors: [], summary: null, groups: [] });
  const [studentsList, setStudentsList] = useState<any[]>([]);
  const [expensesData, setExpensesData] = useState<any>({ items: [], categories: [], wallets: [] });
  const [expenseSubTab, setExpenseSubTab] = useState<"expenses" | "requests">("expenses");
  const [expenseRequestsData, setExpenseRequestsData] = useState<any>({ items: [], summary: {}, usdRate: 49.63 });
  const [walletsData, setWalletsData] = useState<any>({ wallets: [], statements: [], year: 2026, month: 10 });
  const [incomeData, setIncomeData] = useState<any>({ items: [], offices: [] });
  const [budgetsData, setBudgetsData] = useState<any>({ items: [], categories: [] });
  const [currenciesData, setCurrenciesData] = useState<any>({ items: [] });
  const [reportData, setReportData] = useState<any>({ rows: [], totalInflow: 0, totalOutflow: 0, netFlow: 0 });
  const [busyLoading, setBusyLoading] = useState(false);

  // Filters
  const [payFilter, setPayFilter] = useState({
    search: "",
    method: "",
    gender: "",
    groupId: "",
    year: "",
    from: "",
    to: "",
    includeVoided: false,
  });
  const [debtorFilter, setDebtorFilter] = useState({
    search: "",
    signal: "ACTIVE",
    gender: "",
    groupId: "",
    year: "",
  });
  const [expFilter, setExpFilter] = useState({
    status: "",
    categoryId: "",
    employeeId: "",
    dateField: "expenseDate" as "expenseDate" | "createdDate" | "approvedDate" | "paidDate",
    sortBy: "createdAt" as "createdAt" | "expenseDate" | "approvedAt" | "paidAt" | "amount",
    from: "",
    to: "",
    search: "",
  });
  const [reqFilter, setReqFilter] = useState({
    status: "",
    categoryId: "",
    employeeId: "",
    urgency: "",
    dateField: "neededDate" as "neededDate" | "createdDate" | "approvedDate" | "completedDate",
    from: "",
    to: "",
    search: "",
  });
  const [campusSubTab, setCampusSubTab] = useState<"overview" | "canteen" | "mosque" | "gate">("overview");
  const [campusKpiView, setCampusKpiView] = useState<"both" | "canteen" | "mosque">("both");
  const [walletMonth, setWalletMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });

  // Modals
  const [paymentModal, setPaymentModal] = useState<{
    open: boolean;
    studentId: string;
    amount: string;
    paymentMethod: string;
    paidAt: string;
    nextDueDate: string;
    plannedPayment: string;
    note: string;
    studentSearch: string;
    onlyDueDate?: boolean;
  } | null>(null);

  const [voidPayModal, setVoidPayModal] = useState<{ payment: any; reason: string } | null>(null);
  const [studentHistoryModal, setStudentHistoryModal] = useState<any | null>(null);
  const [receiptPrintModal, setReceiptPrintModal] = useState<any | null>(null);
  const [previewStudentPhoto, setPreviewStudentPhoto] = useState<{
    url: string;
    fullname: string;
    group?: string;
    room?: string;
    studyPlace?: string;
  } | null>(null);

  useEffect(() => {
    const onPreview = (ev: Event) => {
      const detail = (ev as CustomEvent).detail;
      if (detail?.url) {
        setPreviewStudentPhoto(detail);
      }
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setPreviewStudentPhoto(null);
      }
    };
    window.addEventListener("mezana:preview-student-photo", onPreview);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mezana:preview-student-photo", onPreview);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const [newExpenseModal, setNewExpenseModal] = useState<{
    employeeId?: string;
    categoryId: string;
    amount: string;
    currency: string;
    expenseDate: string;
    description: string;
    status?: string;
    receiptFile?: { fileName: string; mimeType: string; dataUrl: string } | null;
  } | null>(null);

  const [expenseReceiptModal, setExpenseReceiptModal] = useState<any | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  const [expActionModal, setExpActionModal] = useState<{
    expense: any;
    action: "reject" | "adjust" | "void";
    amount: string;
    description: string;
    reason: string;
  } | null>(null);

  const [expenseRequestModal, setExpenseRequestModal] = useState<{
    id?: string;
    employeeId?: string;
    categoryId: string;
    amount: string;
    currency: string;
    neededDate: string;
    urgency: "NORMAL" | "URGENT";
    description: string;
  } | null>(null);

  const [reqActionModal, setReqActionModal] = useState<{
    reqItem: any;
    action: "approve" | "reject" | "complete";
    amount: string;
    description: string;
    noteOrReason: string;
    receiptBase64?: string | null;
    receiptFileName?: string;
  } | null>(null);

  const [assignWalletModal, setAssignWalletModal] = useState<{
    wallet: any;
    amount: string;
    currency: string;
    date: string;
    description: string;
  } | null>(null);

  const [walletTxModal, setWalletTxModal] = useState<{ wallet: any; items: any[] } | null>(null);
  const [changePwdModalOpen, setChangePwdModalOpen] = useState(false);
  const [pwdForm, setPwdForm] = useState({ newPassword: "", confirmPassword: "", busy: false, error: "" });

  // Command Palette (Ctrl+K) & AI Drawer & Mobile Menu
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiMessages, setAiMessages] = useState<
    { role: "user" | "ai"; text: string; pendingAction?: any; actionStatus?: "pending" | "executed" | "cancelled" }[]
  >([]);
  const [aiBusy, setAiBusy] = useState(false);

  // Theme effect
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light");
      root.classList.remove("dark");
    } else {
      root.classList.add("dark");
      root.classList.remove("light");
    }
  }, [theme]);

  // Keyboard shortcut Ctrl+K & Escape to close active modals
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      } else if (e.key === "Escape") {
        setSearchOpen(false);
        setMobileMenuOpen(false);
        setReceiptPrintModal(null);
        setExpenseReceiptModal(null);
        setVoidPayModal(null);
        setExpActionModal(null);
        setAssignWalletModal(null);
        setWalletTxModal(null);
        setPaymentModal(null);
        setNewExpenseModal(null);
        setExpenseRequestModal(null);
        setReqActionModal(null);
        setStudentHistoryModal(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Check session
  const checkAuth = useCallback(async () => {
    try {
      const d = await apiFetch("/fin-api/auth/me");
      setAuth({ loading: false, ...d });
    } catch {
      setAuth({ loading: false, authenticated: false });
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Loaders
  const loadOverview = useCallback(async () => {
    const d = await apiFetch(`/fin-api/overview?from=${dateRange.from}&to=${dateRange.to}`);
    setOverview(d);
  }, [dateRange.from, dateRange.to]);

  const loadPayments = useCallback(async () => {
    const q = new URLSearchParams();
    if (payFilter.search) q.set("search", payFilter.search);
    if (payFilter.method) q.set("method", payFilter.method);
    if (payFilter.gender) q.set("gender", payFilter.gender);
    if (payFilter.groupId) q.set("groupId", payFilter.groupId);
    if (payFilter.year) q.set("year", payFilter.year);
    if (payFilter.from) q.set("from", payFilter.from);
    if (payFilter.to) q.set("to", payFilter.to);
    if (payFilter.includeVoided) q.set("includeVoided", "true");
    const d = await apiFetch(`/fin-api/crm/payments?${q.toString()}`);
    setPaymentsData(d);
  }, [payFilter]);

  const loadDebtors = useCallback(async () => {
    const q = new URLSearchParams();
    if (debtorFilter.year) q.set("year", debtorFilter.year);
    const d = await apiFetch(`/fin-api/crm/debtors${q.toString() ? `?${q.toString()}` : ""}`);
    setDebtorsData(d);
  }, [debtorFilter.year]);

  const loadStudentsList = useCallback(async () => {
    try {
      const d = await apiFetch("/fin-api/crm/students");
      setStudentsList(d.students || []);
    } catch {}
  }, []);

  const loadExpenses = useCallback(async () => {
    const q = new URLSearchParams();
    if (expFilter.status) q.set("status", expFilter.status);
    if (expFilter.categoryId) q.set("categoryId", expFilter.categoryId);
    const d = await apiFetch(`/fin-api/erp/expenses?${q.toString()}`);
    setExpensesData(d);
  }, [expFilter.status, expFilter.categoryId]);

  const loadExpenseRequests = useCallback(async () => {
    try {
      const d = await apiFetch("/fin-api/erp/expense-requests");
      setExpenseRequestsData(d);
    } catch {}
  }, []);

  const loadWallets = useCallback(async () => {
    const d = await apiFetch(`/fin-api/erp/wallets?year=${walletMonth.year}&month=${walletMonth.month}`);
    setWalletsData(d);
  }, [walletMonth.year, walletMonth.month]);

  const loadPlanning = useCallback(async () => {
    const [inc, bud, cur] = await Promise.all([
      apiFetch("/fin-api/erp/income").catch(() => ({ items: [], offices: [] })),
      apiFetch("/fin-api/erp/budgets").catch(() => ({ items: [], categories: [] })),
      apiFetch("/fin-api/erp/currencies").catch(() => ({ items: [] })),
    ]);
    setIncomeData(inc);
    setBudgetsData(bud);
    setCurrenciesData(cur);
  }, []);

  const loadReports = useCallback(async () => {
    const d = await apiFetch(`/fin-api/reports/cashflow?from=${dateRange.from}&to=${dateRange.to}&format=json`);
    setReportData(d);
  }, [dateRange.from, dateRange.to]);

  const refreshCurrentTab = useCallback(async () => {
    if (!auth.authenticated) return;
    setBusyLoading(true);
    try {
      await loadOverview();
      if (activeTab === "payments") await loadPayments();
      if (activeTab === "debtors") await loadDebtors();
      if (activeTab === "expenses") {
        await Promise.all([loadExpenses(), loadExpenseRequests()]);
      }
      if (activeTab === "wallets") await loadWallets();
      if (activeTab === "planning") await loadPlanning();
      if (activeTab === "reports") await loadReports();
    } catch (e: any) {
      notify(e.message, "err");
    } finally {
      setBusyLoading(false);
    }
  }, [
    auth.authenticated,
    activeTab,
    loadOverview,
    loadPayments,
    loadDebtors,
    loadExpenses,
    loadWallets,
    loadPlanning,
    loadReports,
    notify,
  ]);

  useEffect(() => {
    if (auth.authenticated) {
      loadOverview().catch(() => {});
      loadStudentsList();
      loadExpenseRequests();
      if (!expensesData.categories?.length) {
        loadExpenses().catch(() => {});
      }
    }
  }, [auth.authenticated, dateRange.from, dateRange.to]);

  useEffect(() => {
    if (!auth.authenticated) return;
    setMobileMenuOpen(false);
    if (activeTab === "debtors") loadDebtors().catch(() => {});
    if (activeTab === "wallets") loadWallets().catch(() => {});
    if (activeTab === "planning") loadPlanning().catch(() => {});
    if (activeTab === "reports") loadReports().catch(() => {});
  }, [auth.authenticated, activeTab, walletMonth.year, walletMonth.month, dateRange.from, dateRange.to]);

  useEffect(() => {
    if (!auth.authenticated || activeTab !== "payments") return;
    const t = setTimeout(() => {
      loadPayments().catch(() => {});
    }, 180);
    return () => clearTimeout(t);
  }, [auth.authenticated, activeTab, payFilter, loadPayments]);

  useEffect(() => {
    if (!auth.authenticated || activeTab !== "expenses") return;
    loadExpenses().catch(() => {});
    loadExpenseRequests();
  }, [auth.authenticated, activeTab, expFilter.status, expFilter.categoryId, loadExpenses, loadExpenseRequests]);

  // Global search effect
  useEffect(() => {
    if (!searchOpen || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const d = await apiFetch(`/fin-api/search?q=${encodeURIComponent(searchQuery.trim())}`);
        setSearchResults(d.results || []);
      } catch {}
    }, 180);
    return () => clearTimeout(timer);
  }, [searchOpen, searchQuery]);

  // Login submit
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginForm((s) => ({ ...s, error: "", busy: true }));
    try {
      const d = await apiFetch("/fin-api/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier: loginForm.identifier, password: loginForm.password }),
      });
      setLoginForm((s) => ({ ...s, error: "", busy: false }));
      setAuth({ loading: false, ...d });
      if (d?.user?.mustChangePassword || d?.access?.mustChangePassword) {
        notify("Xush kelibsiz! Davom etish uchun yangi shaxsiy parol o'rnating.");
      } else {
        notify("Tizimga muvaffaqiyatli kirdingiz!");
      }
    } catch (err: any) {
      setLoginForm((s) => ({ ...s, error: err.message, busy: false }));
    }
  };

  const handleLogout = async () => {
    await apiFetch("/fin-api/auth/logout", { method: "POST" });
    setAuth({ loading: false, authenticated: false });
  };

  // Record Student Payment / Update Due Date
  const openPaymentModal = (student?: any, onlyDueDate = false) => {
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
    setPaymentModal({
      open: true,
      studentId: student ? String(student.id) : "",
      amount: onlyDueDate ? "0" : student?.plannedPayment ? String(student.plannedPayment) : "",
      paymentMethod: "naqt",
      paidAt: today,
      nextDueDate: student?.paidUntilDate ? String(student.paidUntilDate).slice(0, 10) : "",
      plannedPayment: student?.plannedPayment ? String(student.plannedPayment) : "",
      note: "",
      studentSearch: "",
      onlyDueDate,
    });
  };

  const submitPaymentModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModal) return;
    try {
      const res = await apiFetch("/fin-api/crm/payments", {
        method: "POST",
        body: JSON.stringify({
          studentId: paymentModal.studentId,
          amount: paymentModal.onlyDueDate ? 0 : Number(paymentModal.amount || 0),
          paymentMethod: paymentModal.paymentMethod,
          paidAt: paymentModal.paidAt || undefined,
          nextDueDate: paymentModal.nextDueDate || undefined,
          plannedPayment: paymentModal.plannedPayment ? Number(paymentModal.plannedPayment) : undefined,
          note: paymentModal.note || undefined,
        }),
      });
      notify(res.message || "Muvaffaqiyatli saqlandi!");
      setPaymentModal(null);
      refreshCurrentTab();
      loadStudentsList();
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  const submitVoidPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidPayModal) return;
    try {
      const res = await apiFetch(`/fin-api/crm/payments/${voidPayModal.payment.id}/void`, {
        method: "POST",
        body: JSON.stringify({ reason: voidPayModal.reason }),
      });
      notify(res.message || "To'lov bekor qilindi!");
      setVoidPayModal(null);
      setStudentHistoryModal(null);
      refreshCurrentTab();
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  // ERP Expense actions
  const handleQuickExpenseAction = async (id: string, action: "approve" | "pay" | "delete") => {
    try {
      if (action === "delete") {
        await apiFetch(`/fin-api/erp/expenses/${id}`, { method: "DELETE" });
        notify("Xarajat o'chirildi");
      } else {
        await apiFetch(`/fin-api/erp/expenses/${id}/${action}`, { method: "POST", body: JSON.stringify({}) });
        notify(action === "approve" ? "Xarajat tasdiqlandi!" : "Xarajat to'landi!");
      }
      refreshCurrentTab();
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  const submitExpActionModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expActionModal) return;
    const { expense, action, amount, description, reason } = expActionModal;
    try {
      const body: any = { reason };
      if (action === "reject") {
        body.rejectionReason = reason;
      } else if (action === "adjust") {
        if (amount) body.amount = Number(amount);
        if (description) body.description = description;
      }
      await apiFetch(`/fin-api/erp/expenses/${expense.id}/${action}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      notify(
        action === "reject"
          ? "Xarajat rad etildi"
          : action === "adjust"
          ? "Xarajat summasi muvaffaqiyatli o'zgartirildi"
          : "Xarajat bekor qilindi va mablag' hamyonga qaytarildi"
      );
      setExpActionModal(null);
      refreshCurrentTab();
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  const openEditExpense = async (e: any) => {
    let cats = expensesData.categories || [];
    if (!cats.length) {
      try {
        const d = await apiFetch("/fin-api/erp/expenses");
        setExpensesData(d);
        cats = d.categories || [];
      } catch {}
    }
    const cleanDesc = String(e.description || e.title || "").replace(/\s*\[Manba:[^\]]+\]/gi, "").trim();
    setNewExpenseModal({
      id: e.id,
      employeeId: e.employeeId || e.employee?.id || access.employeeId || "",
      categoryId: e.categoryId || e.category?.id || cats[0]?.id || "",
      amount: String(e.amount || e.amountInDefault || ""),
      currency: e.currency === "TL" ? "TRY" : (e.currency || "TRY"),
      expenseDate: String(e.expenseDate || e.date || e.createdAt || "").slice(0, 10),
      description: cleanDesc,
    });
  };

  const submitNewExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpenseModal) return;
    try {
      if (newExpenseModal.id) {
        await apiFetch(`/fin-api/erp/expenses/${newExpenseModal.id}`, {
          method: "PUT",
          body: JSON.stringify({
            categoryId: newExpenseModal.categoryId,
            amount: Number(newExpenseModal.amount),
            currency: newExpenseModal.currency || "TRY",
            expenseDate: newExpenseModal.expenseDate,
            description: newExpenseModal.description,
          }),
        });
        if (newExpenseModal.receiptFile) {
          await apiFetch(`/fin-api/erp/expenses/${newExpenseModal.id}/receipt`, {
            method: "POST",
            body: JSON.stringify(newExpenseModal.receiptFile),
          });
        }
        notify("Xarajat muvaffaqiyatli tahrirlandi!");
      } else {
        const created = await apiFetch("/fin-api/erp/expenses", {
          method: "POST",
          body: JSON.stringify({
            employeeId: newExpenseModal.employeeId || undefined,
            categoryId: newExpenseModal.categoryId,
            amount: Number(newExpenseModal.amount),
            currency: newExpenseModal.currency || "TRY",
            expenseDate: newExpenseModal.expenseDate,
            description: newExpenseModal.description,
            status: newExpenseModal.status || "PAID",
          }),
        });
        if (newExpenseModal.receiptFile && created?.id) {
          await apiFetch(`/fin-api/erp/expenses/${created.id}/receipt`, {
            method: "POST",
            body: JSON.stringify(newExpenseModal.receiptFile),
          });
        }
        notify("Yangi xarajat qo'shildi!");
      }
      setNewExpenseModal(null);
      refreshCurrentTab();
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  const handleAttachExpenseReceipt = async (expenseId: string, file: File) => {
    if (!file) return;
    setUploadingReceipt(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Faylni o'qishda xatolik"));
        reader.readAsDataURL(file);
      });
      const res = await apiFetch(`/fin-api/erp/expenses/${expenseId}/receipt`, {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || "image/jpeg",
          dataUrl,
        }),
      });
      notify("Chek rasmi muvaffaqiyatli biriktirildi!");
      if (expenseReceiptModal && expenseReceiptModal.id === expenseId && res?.receipt) {
        setExpenseReceiptModal({
          ...expenseReceiptModal,
          receipts: [res.receipt, ...(expenseReceiptModal.receipts || [])],
        });
      }
      refreshCurrentTab();
    } catch (err: any) {
      notify(err.message, "err");
    } finally {
      setUploadingReceipt(false);
    }
  };

  // Expense Request actions
  const openExpenseRequestModal = async (reqItem?: any) => {
    let cats = expensesData.categories || [];
    if (!cats.length) {
      try {
        const d = await apiFetch("/fin-api/erp/expenses");
        setExpensesData(d);
        cats = d.categories || [];
      } catch {}
    }
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
    if (reqItem) {
      setExpenseRequestModal({
        id: reqItem.id,
        employeeId: reqItem.employeeId || access.employeeId || "",
        categoryId: reqItem.categoryId || cats[0]?.id || "",
        amount: String(reqItem.amount || ""),
        currency: reqItem.currency || "TRY",
        neededDate: String(reqItem.neededDate || today).slice(0, 10),
        urgency: reqItem.urgency === "URGENT" ? "URGENT" : "NORMAL",
        description: reqItem.description || "",
      });
    } else {
      setExpenseRequestModal({
        employeeId: access.employeeId || expensesData.wallets?.[0]?.employeeId || "",
        categoryId: cats[0]?.id || "",
        amount: "",
        currency: "TRY",
        neededDate: today,
        urgency: "NORMAL",
        description: "",
      });
    }
  };

  const submitExpenseRequestModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseRequestModal) return;
    try {
      if (expenseRequestModal.id) {
        await apiFetch(`/fin-api/erp/expense-requests/${expenseRequestModal.id}`, {
          method: "PUT",
          body: JSON.stringify({
            categoryId: expenseRequestModal.categoryId,
            amount: Number(expenseRequestModal.amount),
            currency: expenseRequestModal.currency || "TRY",
            neededDate: expenseRequestModal.neededDate,
            urgency: expenseRequestModal.urgency,
            description: expenseRequestModal.description,
          }),
        });
        notify("Talabnoma muvaffaqiyatli tahrirlandi!");
      } else {
        await apiFetch("/fin-api/erp/expense-requests", {
          method: "POST",
          body: JSON.stringify({
            employeeId: expenseRequestModal.employeeId || undefined,
            categoryId: expenseRequestModal.categoryId,
            amount: Number(expenseRequestModal.amount),
            currency: expenseRequestModal.currency || "TRY",
            neededDate: expenseRequestModal.neededDate,
            urgency: expenseRequestModal.urgency,
            description: expenseRequestModal.description,
          }),
        });
        notify("Talabnoma yaratildi va Direktorga Telegram bot orqali yuborildi!");
      }
      setExpenseRequestModal(null);
      setExpenseSubTab("requests");
      refreshCurrentTab();
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  const handleQuickRequestAction = async (id: string, action: "approve" | "delete") => {
    try {
      if (action === "delete") {
        await apiFetch(`/fin-api/erp/expense-requests/${id}`, { method: "DELETE" });
        notify("Talabnoma o'chirildi");
      } else {
        await apiFetch(`/fin-api/erp/expense-requests/${id}/approve`, {
          method: "POST",
          body: JSON.stringify({}),
        });
        notify("Talabnoma tasdiqlandi va xodimga xabar yuborildi!");
      }
      refreshCurrentTab();
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  const submitReqActionModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqActionModal) return;
    const { reqItem, action, amount, description, noteOrReason, receiptBase64, receiptFileName } = reqActionModal;
    try {
      if (action === "approve") {
        await apiFetch(`/fin-api/erp/expense-requests/${reqItem.id}/approve`, {
          method: "POST",
          body: JSON.stringify({
            approvedAmount: amount ? Number(amount) : undefined,
            directorNote: noteOrReason || undefined,
          }),
        });
        notify("Talabnoma tasdiqlandi va xodimga Telegram orqali xabar yuborildi!");
      } else if (action === "reject") {
        await apiFetch(`/fin-api/erp/expense-requests/${reqItem.id}/reject`, {
          method: "POST",
          body: JSON.stringify({
            rejectionReason: noteOrReason || "Rahbar tomonidan rad etildi",
          }),
        });
        notify("Talabnoma rad etildi va xodimga xabar yuborildi");
      } else if (action === "complete") {
        await apiFetch(`/fin-api/erp/expense-requests/${reqItem.id}/complete`, {
          method: "POST",
          body: JSON.stringify({
            actualAmount: amount ? Number(amount) : undefined,
            description: description || undefined,
            receiptBase64: receiptBase64 || undefined,
            receiptFileName: receiptFileName || undefined,
          }),
        });
        notify("Xarid yakunlandi, haqiqiy xarajatga o'tkazildi va hamyondan yechildi!");
      }
      setReqActionModal(null);
      refreshCurrentTab();
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  const submitAssignWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignWalletModal) return;
    try {
      await apiFetch(`/fin-api/erp/wallets/${assignWalletModal.wallet.employeeId}/assign`, {
        method: "POST",
        body: JSON.stringify({
          amount: Number(assignWalletModal.amount),
          currency: assignWalletModal.currency,
          date: assignWalletModal.date,
          description: assignWalletModal.description,
        }),
      });
      notify("Hamyonga mablag' o'tkazildi!");
      setAssignWalletModal(null);
      refreshCurrentTab();
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  const openWalletTransactions = async (wallet: any) => {
    try {
      const d = await apiFetch(`/fin-api/erp/wallets/${wallet.employeeId}/transactions?limit=50`);
      setWalletTxModal({ wallet, items: d.items || [] });
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  // AI Ask & Action Execution
  const askAi = async (customPrompt?: string) => {
    const q = (customPrompt || aiQuestion).trim();
    if (!q) return;
    setAiQuestion("");
    const currentHistory = aiMessages.map((m) => ({ role: m.role, text: m.text }));
    setAiMessages((m) => [...m, { role: "user", text: q }]);
    setAiBusy(true);
    try {
      const d = await apiFetch("/fin-api/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question: q, history: currentHistory }),
      });
      setAiMessages((m) => [
        ...m,
        {
          role: "ai",
          text: d.answer,
          pendingAction: d.pendingAction || null,
          actionStatus: d.pendingAction ? "pending" : undefined,
        },
      ]);
    } catch (err: any) {
      setAiMessages((m) => [...m, { role: "ai", text: `Xatolik: ${err.message}` }]);
    } finally {
      setAiBusy(false);
    }
  };

  const executeAiAction = async (idx: number, pendingAction: any) => {
    setAiBusy(true);
    try {
      const res = await apiFetch("/fin-api/ai/execute-action", {
        method: "POST",
        body: JSON.stringify({
          actionType: pendingAction.actionType,
          payload: pendingAction.payload,
        }),
      });
      setAiMessages((prev) =>
        prev.map((m, i) => (i === idx ? { ...m, actionStatus: "executed" } : m)).concat({
          role: "ai",
          text: `✅ ${res.message || "Ma'lumot muvaffaqiyatli kiritildi!"}`,
        })
      );
      notify(res.message || "Ma'lumot muvaffaqiyatli kiritildi!");
      refreshCurrentTab();
      loadStudentsList();
    } catch (err: any) {
      notify(err.message, "err");
      setAiMessages((prev) => [...prev, { role: "ai", text: `❌ Xatolik: ${err.message}` }]);
    } finally {
      setAiBusy(false);
    }
  };

  const cancelAiAction = (idx: number) => {
    setAiMessages((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, actionStatus: "cancelled" } : m)).concat({
        role: "ai",
        text: "Amal bekor qilindi. Ma'lumotlar o'zgarishsiz qoldi.",
      })
    );
  };

  // Computed filtered debtors
  const filteredDebtors = useMemo(() => {
    const today = overview?.asOf || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
    const soon = new Date(Date.now() + 7 * 86400 * 1000).toISOString().slice(0, 10);
    return (debtorsData.debtors || []).filter((st: any) => {
      if (debtorFilter.gender && st.gender !== debtorFilter.gender) return false;
      if (debtorFilter.groupId && String(st.groupId) !== String(debtorFilter.groupId)) return false;
      if (debtorFilter.year === "2025-2026" || debtorFilter.year === "2026-2027") {
        const is2025 = st.isArchived || !st.isActive || String(st.studyPlace || "").startsWith("2025-2026");
        const stYear = is2025 ? "2025-2026" : "2026-2027";
        if (stYear !== debtorFilter.year) return false;
      }
      if (debtorFilter.search) {
        const q = debtorFilter.search.toLowerCase();
        const match =
          st.fullname?.toLowerCase().includes(q) ||
          st.phone?.toLowerCase().includes(q) ||
          st.username?.toLowerCase().includes(q);
        if (!match) return false;
      }
      const due = st.paidUntilDate ? String(st.paidUntilDate).slice(0, 10) : null;
      const isArchived = Boolean(st.isArchived || !st.isActive || st.isDeleted);
      if (debtorFilter.signal === "ARCHIVED") return isArchived;
      if (isArchived && debtorFilter.signal !== "ALL" && debtorFilter.year !== "2025-2026") return false;
      if (debtorFilter.signal === "ACTIVE") return !isArchived;
      if (debtorFilter.signal === "OVERDUE") return due && due < today;
      if (debtorFilter.signal === "DUESOON") return due && due >= today && due <= soon;
      if (debtorFilter.signal === "NODATE") return !due;
      return true;
    });
  }, [debtorsData.debtors, debtorFilter, overview?.asOf]);

  const matchExpenseNonEmployeeFilters = useCallback(
    (e: any, ignoreStatus = false) => {
      if (!ignoreStatus && expFilter.status && e.status !== expFilter.status) return false;
      if (expFilter.categoryId && e.categoryId !== expFilter.categoryId && e.category?.id !== expFilter.categoryId) return false;

      let targetDate = "";
      if (expFilter.dateField === "createdDate") {
        targetDate = String(e.createdDate || e.createdAt || "").slice(0, 10);
      } else if (expFilter.dateField === "approvedDate") {
        targetDate = String(e.approvedDate || e.approvedAt || "").slice(0, 10);
        if (!targetDate) return false;
      } else if (expFilter.dateField === "paidDate") {
        targetDate = String(e.paidDate || e.paidAt || "").slice(0, 10);
        if (!targetDate) return false;
      } else {
        targetDate = String(e.expenseDate || e.date || e.createdAt || "").slice(0, 10);
      }

      if (expFilter.from && (!targetDate || targetDate < expFilter.from)) return false;
      if (expFilter.to && (!targetDate || targetDate > expFilter.to)) return false;

      if (!expFilter.search) return true;
      const q = expFilter.search.toLowerCase();
      return Boolean(
        e.title?.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q) ||
          e.category?.name?.toLowerCase().includes(q) ||
          e.employee?.firstName?.toLowerCase().includes(q) ||
          e.employee?.fullName?.toLowerCase().includes(q)
      );
    },
    [expFilter.status, expFilter.categoryId, expFilter.dateField, expFilter.from, expFilter.to, expFilter.search]
  );

  // Filtered expenses & employee breakdown (reacts to active date/status/category/search filters)
  const expensesMatchingNonEmployee = useMemo(() => {
    return (expensesData.items || []).filter((e: any) => matchExpenseNonEmployeeFilters(e, false));
  }, [expensesData.items, matchExpenseNonEmployeeFilters]);

  const employeeExpenseStats = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number; totalTl: number; totalUsd: number }>();
    // Seed all known employees so their chips stay visible even when 0 in the selected date/filter
    for (const e of expensesData.items || []) {
      const empId = e.employeeId || e.employee?.id || "other";
      const empName = (e.employee?.fullName || e.employee?.firstName || "Xodim").trim();
      if (!map.has(empId)) {
        map.set(empId, { id: empId, name: empName, count: 0, totalTl: 0, totalUsd: 0 });
      }
    }
    for (const e of expensesMatchingNonEmployee) {
      const empId = e.employeeId || e.employee?.id || "other";
      const empName = (e.employee?.fullName || e.employee?.firstName || "Xodim").trim();
      if (!map.has(empId)) {
        map.set(empId, { id: empId, name: empName, count: 0, totalTl: 0, totalUsd: 0 });
      }
      const st = map.get(empId)!;
      st.count += 1;
      const shouldSum = expFilter.status ? e.status === expFilter.status : e.status === "PAID";
      if (shouldSum) {
        st.totalTl += Number(e.amountInDefault || e.amount || 0);
        st.totalUsd += Number(e.amountUsd || 0);
      }
    }
    return [...map.values()].sort((a, b) => b.totalUsd - a.totalUsd || b.count - a.count);
  }, [expensesData.items, expensesMatchingNonEmployee, expFilter.status]);

  const allEmployeesFilteredTotals = useMemo(() => {
    let totalTl = 0;
    let totalUsd = 0;
    for (const emp of employeeExpenseStats) {
      totalTl += emp.totalTl;
      totalUsd += emp.totalUsd;
    }
    return { count: expensesMatchingNonEmployee.length, totalTl, totalUsd };
  }, [employeeExpenseStats, expensesMatchingNonEmployee.length]);

  const filteredExpenseKpis = useMemo(() => {
    let paidCount = 0,
      paidTl = 0,
      paidUsd = 0;
    let pendingCount = 0,
      pendingTl = 0,
      pendingUsd = 0;
    let approvedCount = 0,
      approvedTl = 0,
      approvedUsd = 0;

    for (const e of expensesData.items || []) {
      if (expFilter.employeeId && e.employeeId !== expFilter.employeeId && e.employee?.id !== expFilter.employeeId) continue;
      if (!matchExpenseNonEmployeeFilters(e, true)) continue;
      const tl = Number(e.amountInDefault || e.amount || 0);
      const usd = Number(e.amountUsd || 0);
      if (e.status === "PAID") {
        paidCount += 1;
        paidTl += tl;
        paidUsd += usd;
      } else if (e.status === "PENDING") {
        pendingCount += 1;
        pendingTl += tl;
        pendingUsd += usd;
      } else if (e.status === "APPROVED") {
        approvedCount += 1;
        approvedTl += tl;
        approvedUsd += usd;
      }
    }
    return { paidCount, paidTl, paidUsd, pendingCount, pendingTl, pendingUsd, approvedCount, approvedTl, approvedUsd };
  }, [expensesData.items, expFilter.employeeId, matchExpenseNonEmployeeFilters]);

  const filteredExpenses = useMemo(() => {
    const list = expensesMatchingNonEmployee.filter((e: any) => {
      if (expFilter.employeeId && e.employeeId !== expFilter.employeeId && e.employee?.id !== expFilter.employeeId) return false;
      return true;
    });

    const sortMode = expFilter.sortBy || "createdAt";
    return [...list].sort((a: any, b: any) => {
      if (sortMode === "amount") {
        return Number(b.amountInDefault || b.amount || 0) - Number(a.amountInDefault || a.amount || 0);
      }
      if (sortMode === "expenseDate") {
        const da = String(a.expenseDate || a.date || "");
        const db = String(b.expenseDate || b.date || "");
        if (db !== da) return db.localeCompare(da);
      } else if (sortMode === "approvedAt") {
        const da = String(a.approvedAtText || a.approvedAt || "");
        const db = String(b.approvedAtText || b.approvedAt || "");
        if (db !== da) return db.localeCompare(da);
      } else if (sortMode === "paidAt") {
        const da = String(a.paidAtText || a.paidAt || "");
        const db = String(b.paidAtText || b.paidAt || "");
        if (db !== da) return db.localeCompare(da);
      }
      const ca = String(a.createdAtText || a.createdAt || "");
      const cb = String(b.createdAtText || b.createdAt || "");
      return cb.localeCompare(ca);
    });
  }, [expensesMatchingNonEmployee, expFilter.employeeId, expFilter.sortBy]);

  const requestsMatchingNonStatus = useMemo(() => {
    return (expenseRequestsData.items || []).filter((r: any) => {
      if (reqFilter.urgency && r.urgency !== reqFilter.urgency) return false;
      if (reqFilter.employeeId && r.employeeId !== reqFilter.employeeId) return false;
      if (reqFilter.categoryId && r.categoryId !== reqFilter.categoryId) return false;

      let targetDate = "";
      if (reqFilter.dateField === "createdDate") {
        targetDate = String(r.createdDate || r.createdAt || "").slice(0, 10);
      } else if (reqFilter.dateField === "approvedDate") {
        targetDate = String(r.approvedDate || r.approvedAt || "").slice(0, 10);
        if (!targetDate) return false;
      } else if (reqFilter.dateField === "completedDate") {
        targetDate = String(r.completedDate || r.completedAt || "").slice(0, 10);
        if (!targetDate) return false;
      } else {
        targetDate = String(r.neededDate || r.createdDate || r.createdAt || "").slice(0, 10);
      }

      if (reqFilter.from && (!targetDate || targetDate < reqFilter.from)) return false;
      if (reqFilter.to && (!targetDate || targetDate > reqFilter.to)) return false;

      if (!reqFilter.search) return true;
      const q = reqFilter.search.toLowerCase();
      return Boolean(
        r.requestCode?.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q) ||
          r.categoryName?.toLowerCase().includes(q) ||
          r.requesterName?.toLowerCase().includes(q) ||
          r.employeeName?.toLowerCase().includes(q) ||
          r.sourceLabel?.toLowerCase().includes(q)
      );
    });
  }, [expenseRequestsData.items, reqFilter.urgency, reqFilter.employeeId, reqFilter.categoryId, reqFilter.dateField, reqFilter.from, reqFilter.to, reqFilter.search]);

  const filteredRequestKpis = useMemo(() => {
    let pendingCount = 0,
      pendingTry = 0,
      pendingUsd = 0;
    let approvedCount = 0,
      approvedTry = 0,
      approvedUsd = 0;
    let completedCount = 0,
      completedTry = 0,
      completedUsd = 0;
    let rejectedCount = 0;

    for (const r of requestsMatchingNonStatus) {
      const tryAmt = Number(r.amountInTry || r.amount || 0);
      const usdAmt = Number(r.amountUsd || 0);
      if (r.status === "PENDING") {
        pendingCount += 1;
        pendingTry += tryAmt;
        pendingUsd += usdAmt;
      } else if (r.status === "APPROVED") {
        approvedCount += 1;
        approvedTry += tryAmt;
        approvedUsd += usdAmt;
      } else if (r.status === "COMPLETED") {
        completedCount += 1;
        completedTry += tryAmt;
        completedUsd += usdAmt;
      } else if (r.status === "REJECTED") {
        rejectedCount += 1;
      }
    }
    return {
      pendingCount,
      pendingTry,
      pendingUsd,
      approvedCount,
      approvedTry,
      approvedUsd,
      completedCount,
      completedTry,
      completedUsd,
      rejectedCount,
      totalCount: requestsMatchingNonStatus.length,
    };
  }, [requestsMatchingNonStatus]);

  const filteredExpenseRequests = useMemo(() => {
    return requestsMatchingNonStatus.filter((r: any) => {
      if (reqFilter.status && r.status !== reqFilter.status) return false;
      return true;
    });
  }, [requestsMatchingNonStatus, reqFilter.status]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwdForm.newPassword || pwdForm.newPassword.trim().length < 4) {
      setPwdForm((s) => ({ ...s, error: "Yangi parol kamida 4 ta belgidan iborat bo'lishi kerak" }));
      return;
    }
    if (pwdForm.newPassword !== pwdForm.confirmPassword) {
      setPwdForm((s) => ({ ...s, error: "Kiritilgan parollar bir-biriga mos kelmadi" }));
      return;
    }
    setPwdForm((s) => ({ ...s, busy: true, error: "" }));
    try {
      const d = await apiFetch("/fin-api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          newPassword: pwdForm.newPassword,
          confirmPassword: pwdForm.confirmPassword,
        }),
      });
      setPwdForm({ newPassword: "", confirmPassword: "", busy: false, error: "" });
      setChangePwdModalOpen(false);
      setAuth({ loading: false, ...d });
      notify("Parolingiz muvaffaqiyatli yangilandi!");
    } catch (err: any) {
      setPwdForm((s) => ({ ...s, busy: false, error: err.message || "Parolni saqlashda xatolik" }));
    }
  };

  if (auth.loading) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center" }}>
        <div className="hi-tech-bg" />
        <div className="glass-card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <RefreshCw size={20} className="pulse-dot" color="#10b981" />
          <span>Mezana Moliya Markazi yuklanmoqda...</span>
        </div>
      </div>
    );
  }

  if (!auth.authenticated) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div className="hi-tech-bg" />
        <div className="hi-tech-grid" />
        <div className="glass-card animate-in" style={{ maxWidth: 440, width: "100%", padding: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
            <div className="brand-orb">₺</div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800 }}>MEZANA BOSHQARUV</h1>
              <p style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                Yagona Boshqaruv va Moliya Tizimi
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            <span className="badge badge-emerald">O'quv markazi va Moliya</span>
            <span className="badge badge-cyan">Xodim hamyonlari va Xazina</span>
            <span className="badge badge-violet">Aqlli Yordamchi (AI)</span>
          </div>

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="form-field">
              <label className="form-label">Login (foydalanuvchi nomi) yoki elektron pochta</label>
              <input
                className="input"
                placeholder="Masalan: dev, mezana yoki akbar"
                value={loginForm.identifier}
                onChange={(e) => setLoginForm({ ...loginForm, identifier: e.target.value })}
                autoFocus
                required
              />
            </div>
            <div className="form-field">
              <label className="form-label">Parol</label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                required
              />
            </div>

            {loginForm.error && (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "rgba(244,63,94,0.14)",
                  border: "1px solid rgba(244,63,94,0.35)",
                  color: "#fb7185",
                  fontSize: 13,
                }}
              >
                {loginForm.error}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={loginForm.busy} style={{ marginTop: 6, padding: 12 }}>
              {loginForm.busy ? "Tekshirilmoqda..." : "Tizimga kirish"}
            </button>
          </form>

          <p style={{ marginTop: 18, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
            Barcha bo'limlar, moliya va arxiv ma'lumotlari yagona oynada birlashtirilgan.
          </p>
        </div>
      </div>
    );
  }

  if (auth.user?.mustChangePassword || auth.access?.mustChangePassword) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div className="hi-tech-bg" />
        <div className="hi-tech-grid" />
        <div className="glass-card animate-in" style={{ maxWidth: 460, width: "100%", padding: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <div className="brand-orb" style={{ background: "linear-gradient(135deg, #f59e0b, #10b981)" }}>🔒</div>
            <div>
              <h1 style={{ fontSize: 19, fontWeight: 800 }}>SHAXSIY PAROL O'RNATISH</h1>
              <p style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                Xush kelibsiz, <b>{auth.user?.name || "Xodim"}</b>!
              </p>
            </div>
          </div>

          <div
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              background: "rgba(245, 158, 11, 0.12)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              fontSize: 12.5,
              color: "var(--text-primary)",
              marginBottom: 18,
              lineHeight: 1.5,
            }}
          >
            Tizimga birinchi marta kirganingiz (yoki vaqtinchalik parol berilgani) sababli, xavfsizlik uchun o'zingizning yangi shaxsiy parolingizni o'rnating.
          </div>

          <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="form-field">
              <label className="form-label">Yangi shaxsiy parol *</label>
              <input
                type="password"
                className="input"
                placeholder="Kamida 4 ta belgi kiriting..."
                value={pwdForm.newPassword}
                onChange={(e) => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
                autoFocus
                required
              />
            </div>
            <div className="form-field">
              <label className="form-label">Yangi parolni tasdiqlang *</label>
              <input
                type="password"
                className="input"
                placeholder="Parolni qayta kiriting..."
                value={pwdForm.confirmPassword}
                onChange={(e) => setPwdForm({ ...pwdForm, confirmPassword: e.target.value })}
                required
              />
            </div>

            {pwdForm.error && (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "rgba(244,63,94,0.14)",
                  border: "1px solid rgba(244,63,94,0.35)",
                  color: "#fb7185",
                  fontSize: 13,
                }}
              >
                {pwdForm.error}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={pwdForm.busy} style={{ marginTop: 4, padding: 12 }}>
              {pwdForm.busy ? "Saqlanmoqda..." : "💾 Yangi parolni saqlash va Tizimga kirish"}
            </button>
            <button type="button" className="btn" onClick={handleLogout} style={{ padding: 10 }}>
              Chiqish
            </button>
          </form>
        </div>
      </div>
    );
  }

  const u = overview?.unified || {};
  const crm = overview?.crm || {};
  const erp = overview?.erp || {};
  const campusSummary = overview?.campusSummary || {};
  const canteenSum = campusSummary.canteen || {};
  const mosqueSum = campusSummary.mosque || {};
  const gateSum = campusSummary.gate || {};
  const access = auth.access || {
    isDirector: auth.user?.role === "DIRECTOR" || auth.user?.role === "root",
    employeeId: null,
    walletId: null,
    accountName: auth.user?.name || "Boshqaruvchi",
    sourceLabel: auth.user?.name || "Boshqaruvchi",
    gender: null,
    allowedTabs: [],
  };
  const canSeeTab = (tabId: string) => {
    if (access.isDirector) return true;
    if (Array.isArray(access.allowedTabs) && access.allowedTabs.length > 0) {
      return access.allowedTabs.includes(tabId);
    }
    if (["planning", "reports", "org_catalog", "system_admin"].includes(tabId)) return false;
    return true;
  };

  return (
    <div className="app-shell">
      <div className="hi-tech-bg" />
      <div className="hi-tech-grid" />

      {/* Notification Toast */}
      {toast && (
        <div
          className="animate-in"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 200,
            padding: "12px 18px",
            borderRadius: 12,
            background: toast.type === "err" ? "rgba(244,63,94,0.95)" : "rgba(16,185,129,0.95)",
            color: "#fff",
            fontWeight: 600,
            fontSize: 13.5,
            boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
          }}
        >
          {toast.text}
        </div>
      )}

      {/* Sidebar */}
      <div
        className={`sidebar-overlay ${mobileMenuOpen ? "mobile-open" : ""}`}
        onClick={() => setMobileMenuOpen(false)}
      />
      <aside className={`sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}>
        <div className="brand-box">
          <div className="brand-orb">₺</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15.5, letterSpacing: "-0.01em" }}>MEZANA BOSHQARUV</div>
            <div style={{ fontSize: 11.5, color: "var(--accent-emerald)", display: "flex", alignItems: "center", gap: 5 }}>
              <span
                className="pulse-dot"
                style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", display: "inline-block" }}
              />
              Yagona Boshqaruv Markazi
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", padding: "4px 10px 4px", letterSpacing: "0.06em" }}>
            MOLIYA VA HISOB-KITOB
          </div>
          {canSeeTab("dashboard") && (
            <button className={`nav-btn ${activeTab === "dashboard" ? "active" : ""}`} onClick={() => setActiveTab("dashboard")}>
              <Activity size={17} /> Boshqaruv paneli
            </button>
          )}

          {canSeeTab("payments") && (
            <button className={`nav-btn ${activeTab === "payments" ? "active" : ""}`} onClick={() => setActiveTab("payments")}>
              <CreditCard size={17} /> Talaba to'lovlari
              {crm.collectedCount > 0 && (
                <span className="nav-badge badge-emerald">{crm.collectedCount}</span>
              )}
            </button>
          )}

          {canSeeTab("debtors") && (
            <button className={`nav-btn ${activeTab === "debtors" ? "active" : ""}`} onClick={() => setActiveTab("debtors")}>
              <Users size={17} /> Qarzdor talabalar
              {crm.debtorCount > 0 && (
                <span className={`nav-badge ${crm.overdueCount > 0 ? "badge-rose" : "badge-amber"}`}>
                  {crm.debtorCount}
                </span>
              )}
            </button>
          )}

          {canSeeTab("expenses") && (
            <button className={`nav-btn ${activeTab === "expenses" ? "active" : ""}`} onClick={() => setActiveTab("expenses")}>
              <TrendingDown size={17} /> Xarajatlar
              {erp.pendingCount > 0 && (
                <span className="nav-badge badge-amber">{erp.pendingCount}</span>
              )}
            </button>
          )}

          {canSeeTab("wallets") && (
            <button className={`nav-btn ${activeTab === "wallets" ? "active" : ""}`} onClick={() => setActiveTab("wallets")}>
              <Wallet size={17} /> {access.isDirector ? "Xodim hamyonlari" : "Mening hamyonim"}
            </button>
          )}

          {canSeeTab("planning") && (
            <button className={`nav-btn ${activeTab === "planning" ? "active" : ""}`} onClick={() => setActiveTab("planning")}>
              <Layers size={17} /> Daromad, Byudjet va Kurs
            </button>
          )}

          {canSeeTab("reports") && (
            <button className={`nav-btn ${activeTab === "reports" ? "active" : ""}`} onClick={() => setActiveTab("reports")}>
              <FileSpreadsheet size={17} /> Pul oqimi hisoboti
            </button>
          )}

          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", padding: "12px 10px 4px", letterSpacing: "0.06em" }}>
            O'QUV BO'LIMI
          </div>
          {canSeeTab("students_dir") && (
            <button className={`nav-btn ${activeTab === "students_dir" ? "active" : ""}`} onClick={() => setActiveTab("students_dir")}>
              <Users size={17} /> Talabalar va Iqoma
            </button>
          )}
          {canSeeTab("groups_courses") && (
            <button className={`nav-btn ${activeTab === "groups_courses" ? "active" : ""}`} onClick={() => setActiveTab("groups_courses")}>
              <Layers size={17} /> Guruhlar va Ustozlar
            </button>
          )}
          {canSeeTab("attendance") && (
            <button className={`nav-btn ${activeTab === "attendance" ? "active" : ""}`} onClick={() => setActiveTab("attendance")}>
              <Calendar size={17} /> Davomat va Darslar
            </button>
          )}

          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", padding: "12px 10px 4px", letterSpacing: "0.06em" }}>
            YOTOQXONA VA NAZORAT TIZIMI
          </div>
          {canSeeTab("canteen_mosque") && (
            <button className={`nav-btn ${activeTab === "canteen_mosque" ? "active" : ""}`} onClick={() => setActiveTab("canteen_mosque")}>
              <Activity size={17} /> Oshxona, Masjid va Kirish
            </button>
          )}
          {canSeeTab("discipline_rooms") && (
            <button className={`nav-btn ${activeTab === "discipline_rooms" ? "active" : ""}`} onClick={() => setActiveTab("discipline_rooms")}>
              <Building2 size={17} /> Xonalar, Telefon va Navbat
            </button>
          )}

          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", padding: "12px 10px 4px", letterSpacing: "0.06em" }}>
            XODIMLAR VA BOSHQARUV
          </div>
          {canSeeTab("hr_tasks") && (
            <button className={`nav-btn ${activeTab === "hr_tasks" ? "active" : ""}`} onClick={() => setActiveTab("hr_tasks")}>
              <UserCheck size={17} /> Xodimlar va Huquqlar
            </button>
          )}
          {canSeeTab("org_catalog") && (
            <button className={`nav-btn ${activeTab === "org_catalog" ? "active" : ""}`} onClick={() => setActiveTab("org_catalog")}>
              <Globe size={17} /> Filiallar va Xarajat turlari
            </button>
          )}
          {canSeeTab("system_admin") && (
            <button className={`nav-btn ${activeTab === "system_admin" ? "active" : ""}`} onClick={() => setActiveTab("system_admin")}>
              <ShieldAlert size={17} /> Boshqaruv, Yil va Tarix
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}>
          <div style={{ fontSize: 12.5 }}>
            <div style={{ fontWeight: 700 }}>{auth.user?.name}</div>
            <div style={{ color: "var(--text-muted)", fontSize: 11, display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", marginTop: 2 }}>
              <span>{access.isDirector ? "Bosh rahbar (Direktor)" : `Hisob: ${access.accountName}`}</span>
              {!access.isDirector && access.gender && (
                <span className={`badge ${access.gender === "FEMALE" ? "badge-rose" : "badge-cyan"}`} style={{ fontSize: 10, padding: "1px 6px" }}>
                  {access.gender === "FEMALE" ? "Ayollar bo'limi" : "Erkaklar bo'limi"}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="btn btn-sm"
              onClick={() => {
                setPwdForm({ newPassword: "", confirmPassword: "", busy: false, error: "" });
                setChangePwdModalOpen(true);
              }}
              title="Parolni o'zgartirish"
            >
              🔑
            </button>
            <button className="btn btn-sm btn-danger" onClick={handleLogout} title="Chiqish">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Voluntary Password Change Modal */}
      {changePwdModalOpen && (
        <div className="modal-backdrop" onClick={() => setChangePwdModalOpen(false)}>
          <div className="modal-box modal-card animate-in" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>🔑 Parolni o'zgartirish</h3>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14 }}>
              <b>{auth.user?.name}</b> hisobingiz uchun yangi parol kiriting:
            </div>
            <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Yangi parol *</label>
                <input
                  type="password"
                  className="input"
                  required
                  placeholder="Kamida 4 ta belgi"
                  value={pwdForm.newPassword}
                  onChange={(e) => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Yangi parolni tasdiqlang *</label>
                <input
                  type="password"
                  className="input"
                  required
                  placeholder="Parolni qayta kiriting"
                  value={pwdForm.confirmPassword}
                  onChange={(e) => setPwdForm({ ...pwdForm, confirmPassword: e.target.value })}
                />
              </div>
              {pwdForm.error && (
                <div style={{ color: "#fb7185", fontSize: 12.5 }}>{pwdForm.error}</div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
                <button type="button" className="btn" onClick={() => setChangePwdModalOpen(false)}>Bekor qilish</button>
                <button type="submit" className="btn btn-primary" disabled={pwdForm.busy}>
                  {pwdForm.busy ? "Saqlanmoqda..." : "💾 Parolni yangilash"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="main-area">
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-sm mobile-menu-btn"
              onClick={() => setMobileMenuOpen((v) => !v)}
              title="Menyu"
            >
              <Layers size={16} /> Menyu
            </button>
            <button className="btn" onClick={() => setSearchOpen(true)} style={{ minWidth: 230, justifyContent: "space-between", color: "var(--text-secondary)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Search size={15} /> Tezkor qidiruv...
              </span>
              <span className="badge badge-slate">Ctrl+K</span>
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Calendar size={15} color="var(--text-secondary)" />
              <input
                type="date"
                className="input"
                value={dateRange.from}
                onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                style={{ padding: "6px 10px", fontSize: 12.5 }}
              />
              <span style={{ color: "var(--text-muted)" }}>—</span>
              <input
                type="date"
                className="input"
                value={dateRange.to}
                onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                style={{ padding: "6px 10px", fontSize: 12.5 }}
              />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {canSeeTab("payments") && (
              <button className="btn btn-primary" onClick={() => openPaymentModal()}>
                <Plus size={15} /> Talaba to'lovi
              </button>
            )}
            <button
              className="btn btn-cyan"
              onClick={async () => {
                let cats = expensesData.categories || [];
                let emps = expensesData.employees || [];
                if (!cats.length || !emps.length) {
                  try {
                    const d = await apiFetch("/fin-api/erp/expenses");
                    setExpensesData(d);
                    cats = d.categories || [];
                    emps = d.employees || [];
                  } catch {}
                }
                const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
                setNewExpenseModal({
                  categoryId: cats[0]?.id || "",
                  employeeId: access.employeeId || emps[0]?.id || "",
                  amount: "",
                  currency: "TRY",
                  expenseDate: today,
                  description: "",
                });
              }}
            >
              <Plus size={15} /> Xarajat
            </button>
            <button className="btn" onClick={() => setAiOpen(true)} style={{ borderColor: "rgba(139,92,246,0.45)" }}>
              <Sparkles size={15} color="#c084fc" /> Aqlli Yordamchi (AI)
            </button>
            <button className="btn btn-sm" onClick={refreshCurrentTab} title="Yangilash">
              <RefreshCw size={15} className={busyLoading ? "pulse-dot" : ""} />
            </button>
            <button className="btn btn-sm" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Mavzuni o'zgartirish">
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </header>

        <main className="content-wrap">
          {/* TAB 1: DASHBOARD */}
          {(activeTab === "students_dir" ||
            activeTab === "groups_courses" ||
            activeTab === "attendance" ||
            activeTab === "canteen_mosque" ||
            activeTab === "discipline_rooms" ||
            activeTab === "hr_tasks" ||
            activeTab === "org_catalog" ||
            activeTab === "system_admin") && (
            <UnifiedModules
              activeTab={activeTab}
              notify={notify}
              openPaymentModal={(st) => openPaymentModal(st)}
              campusSubTab={campusSubTab}
              access={access}
            />
          )}

          {activeTab === "dashboard" && !access.isDirector && !canSeeTab("payments") && (
            <div className="animate-in">
              <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                {/* 1: MENING HAMYONIM BALANSI */}
                <div className="kpi-card" style={{ cursor: "pointer" }} onClick={() => setActiveTab("wallets")}>
                  <div className="kpi-glow" style={{ background: "#10b981" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 700 }}>
                      MENING HAMYONIM ({access.accountName || "Hamyon"})
                    </span>
                    <Wallet size={18} color="#10b981" />
                  </div>
                  <div className="kpi-value" style={{ color: Number(erp.walletsTotalBalance || 0) >= 0 ? "#10b981" : "#f43f5e" }}>
                    {fmtTL(erp.walletsTotalBalance)}
                  </div>
                  <div className="kpi-sub">
                    <span>Joriy qoldiq (Turk lirasida)</span>
                  </div>
                </div>

                {/* 2: TASDIQLASH KUTILMOQDA (PENDING) */}
                <div className="kpi-card" style={{ cursor: "pointer" }} onClick={() => setActiveTab("expenses")}>
                  <div className="kpi-glow" style={{ background: "#f59e0b" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 700 }}>
                      TASDIQLASH KUTILMOQDA
                    </span>
                    <AlertTriangle size={18} color="#f59e0b" />
                  </div>
                  <div className="kpi-value" style={{ color: "#f59e0b" }}>
                    {fmtTL(erp.pendingTl)}
                  </div>
                  <div className="kpi-sub">
                    <span><strong>{erp.pendingCount || 0} ta</strong> xarajat direktor tasdig'ida</span>
                  </div>
                </div>

                {/* 3: TASDIQLANGAN / TO'LOV KUTILMOQDA (APPROVED) */}
                <div className="kpi-card" style={{ cursor: "pointer" }} onClick={() => setActiveTab("expenses")}>
                  <div className="kpi-glow" style={{ background: "#06b6d4" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 700 }}>
                      TO'LOV KUTILMOQDA (TASDIQLANGAN)
                    </span>
                    <CheckCircle2 size={18} color="#06b6d4" />
                  </div>
                  <div className="kpi-value" style={{ color: "#06b6d4" }}>
                    {fmtTL(erp.approvedTl)}
                  </div>
                  <div className="kpi-sub">
                    <span><strong>{erp.approvedCount || 0} ta</strong> tasdiqlangan xarajat</span>
                  </div>
                </div>

                {/* 4: TO'LANGAN XARAJATLARIM (PAID) */}
                <div className="kpi-card" style={{ cursor: "pointer" }} onClick={() => setActiveTab("expenses")}>
                  <div className="kpi-glow" style={{ background: "#f43f5e" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 700 }}>
                      TO'LANGAN XARAJATLARIM
                    </span>
                    <ArrowDownRight size={18} color="#f43f5e" />
                  </div>
                  <div className="kpi-value" style={{ color: "#f43f5e" }}>
                    {fmtTL(u.periodOutflowTl)}
                  </div>
                  <div className="kpi-sub">
                    <span>Davrda: <strong>{u.periodPaidCount || 0} ta</strong></span>
                    <span>•</span>
                    <span>Jami: <strong>{fmtTL(u.allTimeOutflowTl)}</strong></span>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 18 }}>
                <div className="glass-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <h3 style={{ fontSize: 15.5, fontWeight: 700 }}>💼 Mening Hamyonim ({access.accountName})</h3>
                    <button className="btn btn-sm" onClick={() => setActiveTab("wallets")}>Hamyon tarixi →</button>
                  </div>
                  {(overview?.wallets || []).map((w: any) => (
                    <div key={w.id} style={{ padding: 16, borderRadius: 12, background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", marginBottom: 14 }}>
                      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Joriy balans:</div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: Number(w.balance || 0) >= 0 ? "#10b981" : "#f43f5e", margin: "4px 0" }}>
                        {fmtTL(w.balance)}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--text-secondary)", marginTop: 10 }}>
                        <span>Kutilayotgan xarajatlar:</span>
                        <strong style={{ color: "#f59e0b" }}>{fmtTL(w.pendingAmount)}</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--text-secondary)", marginTop: 6 }}>
                        <span>Jami ajratilgan mablag':</span>
                        <strong style={{ color: "#10b981" }}>{fmtTL(w.totalAssigned)}</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--text-secondary)", marginTop: 6 }}>
                        <span>Jami sarflangan (PAID):</span>
                        <strong style={{ color: "#f43f5e" }}>{fmtTL(w.totalSpent)}</strong>
                      </div>
                    </div>
                  ))}
                  <button
                    className="btn btn-primary"
                    style={{ width: "100%", justifyContent: "center", padding: "11px 16px" }}
                    onClick={async () => {
                      let cats = expensesData.categories || [];
                      let emps = expensesData.employees || [];
                      if (!cats.length || !emps.length) {
                        try {
                          const d = await apiFetch("/fin-api/erp/expenses");
                          setExpensesData(d);
                          cats = d.categories || [];
                          emps = d.employees || [];
                        } catch {}
                      }
                      const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
                      setNewExpenseModal({
                        categoryId: cats[0]?.id || "",
                        employeeId: access.employeeId || emps[0]?.id || "",
                        amount: "",
                        currency: "TRY",
                        expenseDate: today,
                        description: "",
                      });
                    }}
                  >
                    <Plus size={16} /> Yangi xarajat kiritish
                  </button>
                </div>

                <div className="glass-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h3 style={{ fontSize: 15.5, fontWeight: 700 }}>🧾 Mening so'nggi xarajatlarim</h3>
                    <button className="btn btn-sm" onClick={() => setActiveTab("expenses")}>Barcha xarajatlarim →</button>
                  </div>
                  <div className="table-wrap">
                    <table className="fin-table">
                      <thead>
                        <tr>
                          <th>Sanalar (Xarajat / Kiritildi)</th>
                          <th>Tavsif / Toifa</th>
                          <th>Holati</th>
                          <th>Summa (TL)</th>
                          <th style={{ textAlign: "right" }}>Amallar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(overview?.recentExpenses || []).map((e: any) => {
                          const expD = String(e.expenseDate || e.date || "").slice(0, 10);
                          const crtD = String(e.createdDate || e.createdAt || "").slice(0, 10);
                          const crtTxt = e.createdAtText || (e.createdAt ? String(e.createdAt).slice(0, 16).replace("T", " ") : expD);
                          const isBackdated = expD && crtD && expD !== crtD;
                          return (
                          <tr key={e.id}>
                            <td style={{ whiteSpace: "nowrap" }}>
                              <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--text-primary)" }}>
                                📅 Xarajat: {expD}
                              </div>
                              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                                🕒 Kiritildi: {crtTxt}
                              </div>
                              {isBackdated && (
                                <span className="badge badge-amber" style={{ fontSize: 9.5, padding: "1px 5px", marginTop: 2 }}>
                                  Oldingi kun uchun
                                </span>
                              )}
                            </td>
                            <td>
                              <div style={{ fontWeight: 600 }}>{e.description || "Xarajat"}</div>
                              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{e.category?.name || "Toifa"}</div>
                            </td>
                            <td>
                              <span className={`badge ${EXPENSE_STATUS_MAP[e.status]?.badge || "badge-slate"}`}>
                                {EXPENSE_STATUS_MAP[e.status]?.label || e.status}
                              </span>
                            </td>
                            <td style={{ fontWeight: 700, color: "#f43f5e" }}>
                              <div>-{fmtTL(e.amountInDefault || e.amount)}</div>
                            </td>
                            <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                              {(e.status === "PENDING" || e.status === "REJECTED") && (
                                <div style={{ display: "inline-flex", gap: 6 }}>
                                  <button className="btn btn-sm" onClick={() => openEditExpense(e)}>
                                    <Edit3 size={12} /> Tahrirlash
                                  </button>
                                  <button className="btn btn-sm btn-danger" onClick={() => handleQuickExpenseAction(e.id, "delete")}>
                                    O'chirish
                                  </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {(overview?.recentExpenses || []).length === 0 && (
                          <tr>
                            <td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}>
                              Hozircha xarajatlar yo'q
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "dashboard" && (access.isDirector || canSeeTab("payments")) && (
            <div className="animate-in">
              <div className="kpi-grid">
                {/* 1-BOX: JAMI TUSHUM (TALABA TO'LOVLARI) */}
                <div
                  className="kpi-card"
                  style={{ cursor: "pointer" }}
                  title="Talaba to'lovlari oynasiga o'tish"
                  onClick={() => {
                    setPayFilter((f) => ({ ...f, from: dateRange.from, to: dateRange.to }));
                    setActiveTab("payments");
                  }}
                >
                  <div className="kpi-glow" style={{ background: "#10b981" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 600 }}>JAMI TUSHUM (TALABA TO'LOVLARI)</span>
                    <ArrowUpRight size={18} color="#10b981" />
                  </div>
                  <div className="kpi-value" style={{ color: "#10b981" }}>{fmtUSD(u.periodStudentInflow)}</div>
                  <div className="kpi-sub">
                    <span>Tanlangan davrda: <strong>{u.periodStudentCount || 0} ta to'lov</strong></span>
                    <span>•</span>
                    <span>Umumiy: <strong>{fmtUSD(u.allTimeStudentPaid)}</strong></span>
                  </div>
                </div>

                {/* 2-BOX: JAMI XARAJAT (TO'LANGAN) */}
                <div
                  className="kpi-card"
                  style={{ cursor: "pointer" }}
                  title="Xarajatlar oynasiga o'tish"
                  onClick={() => setActiveTab("expenses")}
                >
                  <div className="kpi-glow" style={{ background: "#f43f5e" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 600 }}>
                      {access.isDirector ? "JAMI XARAJAT (TO'LANGAN)" : "MENING XARAJATLARIM (TO'LANGAN)"}
                    </span>
                    <ArrowDownRight size={18} color="#f43f5e" />
                  </div>
                  <div className="kpi-value" style={{ color: "#f43f5e" }}>
                    {access.isDirector ? fmtUSD(u.periodOutflowUsd) : fmtTL(u.periodOutflowTl)}
                  </div>
                  <div className="kpi-sub">
                    {access.isDirector ? (
                      <>
                        <span>Asl summasi: <strong>{fmtTL(u.periodOutflowTl)}</strong> ({u.periodPaidCount || 0} ta)</span>
                        <span>•</span>
                        <span>{erp.pendingCount || 0} ta tasdiq kutmoqda</span>
                      </>
                    ) : (
                      <>
                        <span>Davrda: <strong>{u.periodPaidCount || 0} ta</strong></span>
                        <span>•</span>
                        <span>{erp.pendingCount || 0} ta tasdiq kutmoqda ({fmtTL(erp.pendingTl)})</span>
                      </>
                    )}
                  </div>
                </div>

                {/* 3-BOX: QARZDOR TALABALAR */}
                <div
                  className="kpi-card"
                  style={{ cursor: "pointer" }}
                  title="Qarzdor talabalar oynasiga o'tish"
                  onClick={() => setActiveTab("debtors")}
                >
                  <div className="kpi-glow" style={{ background: "#f59e0b" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 600 }}>QARZDOR TALABALAR</span>
                    <AlertTriangle size={18} color="#f59e0b" />
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <div className="kpi-value" style={{ color: "#f59e0b" }}>{fmtUSD(crm.totalDebt)}</div>
                    <span className="badge badge-amber" style={{ fontSize: 11 }}>{crm.debtorCount || 0} nafar</span>
                  </div>
                  <div className="kpi-sub">
                    <span style={{ color: "#f43f5e", fontWeight: 600 }}>Muddati o'tgan: {fmtUSD(crm.overdueAmount)} ({crm.overdueCount || 0} ta)</span>
                    {crm.dueSoonCount > 0 && <span>• 7 kunda: {crm.dueSoonCount} ta</span>}
                  </div>
                </div>

                {/* 4-BOX: OSHXONA VA MASJID DAVOMADI (FOIZLARDA, INTERAKTIV) */}
                <div
                  className="kpi-card"
                  style={{ cursor: "pointer", paddingBottom: 12 }}
                  title="Oshxona va Masjid davomati tahliliga o'tish"
                  onClick={() => {
                    setCampusSubTab(campusKpiView === "canteen" ? "canteen" : campusKpiView === "mosque" ? "mosque" : "overview");
                    setActiveTab("canteen_mosque");
                  }}
                >
                  <div className="kpi-glow" style={{ background: "#06b6d4" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 11.5, color: "var(--text-secondary)", fontWeight: 700, letterSpacing: "0.01em" }}>
                      OSHXONA VA MASJID (%)
                    </span>
                    <div
                      style={{ display: "flex", gap: 3, background: "var(--bg-input)", padding: 2, borderRadius: 8, border: "1px solid var(--border-subtle)" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(["both", "canteen", "mosque"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setCampusKpiView(mode)}
                          style={{
                            border: "none",
                            padding: "2px 7px",
                            borderRadius: 6,
                            fontSize: 10.5,
                            fontWeight: 700,
                            cursor: "pointer",
                            background: campusKpiView === mode ? "#06b6d4" : "transparent",
                            color: campusKpiView === mode ? "#fff" : "var(--text-secondary)",
                            transition: "all 0.15s",
                          }}
                        >
                          {mode === "both" ? "Umumiy" : mode === "canteen" ? "Oshxona" : "Masjid"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {campusKpiView === "both" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 4 }}>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setCampusSubTab("canteen");
                          setActiveTab("canteen_mosque");
                        }}
                        style={{ padding: "5px 8px", borderRadius: 8, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.22)" }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, fontWeight: 700 }}>
                          <span style={{ color: "#10b981" }}>Oshxona (kunlik)</span>
                          <span style={{ color: "#10b981", fontSize: 14, fontWeight: 800 }}>{canteenSum.latestStudentPct ?? 0}%</span>
                        </div>
                        <div className="progress-track" style={{ height: 5, marginTop: 4, marginBottom: 3 }}>
                          <div className="progress-fill" style={{ width: `${Math.min(100, canteenSum.latestStudentPct || 0)}%`, background: "#10b981" }} />
                        </div>
                        <div style={{ fontSize: 10.5, color: "var(--text-secondary)", display: "flex", justifyContent: "space-between" }}>
                          <span>Non: {canteenSum.latestBreakfastPct ?? 0}%</span>
                          <span>Tush: {canteenSum.latestLunchPct ?? 0}%</span>
                          <span>Kech: {canteenSum.latestDinnerPct ?? 0}%</span>
                        </div>
                      </div>

                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setCampusSubTab("mosque");
                          setActiveTab("canteen_mosque");
                        }}
                        style={{ padding: "5px 8px", borderRadius: 8, background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.22)" }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, fontWeight: 700 }}>
                          <span style={{ color: "#06b6d4" }}>Masjid (5 mahal)</span>
                          <span style={{ color: "#06b6d4", fontSize: 14, fontWeight: 800 }}>{mosqueSum.overallPct ?? mosqueSum.studentPct ?? 0}%</span>
                        </div>
                        <div className="progress-track" style={{ height: 5, marginTop: 4, marginBottom: 3 }}>
                          <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(2, mosqueSum.overallPct ?? mosqueSum.studentPct ?? 0))}%`, background: "#06b6d4" }} />
                        </div>
                        <div style={{ fontSize: 10.5, color: "var(--text-secondary)", display: "flex", justifyContent: "space-between" }}>
                          <span>Bomdod: {mosqueSum.fajrPct ?? 0}%</span>
                          <span>Asr: {mosqueSum.asrPct ?? 0}%</span>
                          <span>Shom: {mosqueSum.maghribPct ?? 0}%</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {campusKpiView === "canteen" && (
                    <div style={{ marginTop: 2 }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                        <div className="kpi-value" style={{ color: "#10b981", fontSize: 22 }}>{canteenSum.latestStudentPct ?? 0}%</div>
                        <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>
                          {canteenSum.latestStudentsAttended ?? 0}/{campusSummary.totalActiveStudents ?? 129} talaba ({canteenSum.latestDate || ""})
                        </span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                        {[
                          { label: "Nonushta", pct: canteenSum.latestBreakfastPct ?? 0, cnt: canteenSum.latestBreakfastServed ?? 0, color: "#10b981" },
                          { label: "Tushlik", pct: canteenSum.latestLunchPct ?? 0, cnt: canteenSum.latestLunchServed ?? 0, color: "#06b6d4" },
                          { label: "Kechki", pct: canteenSum.latestDinnerPct ?? 0, cnt: canteenSum.latestDinnerServed ?? 0, color: "#8b5cf6" },
                        ].map((m) => (
                          <div key={m.label} style={{ fontSize: 11 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                              <span>{m.label}</span>
                              <span>{m.pct}% ({m.cnt} ta)</span>
                            </div>
                            <div className="progress-track" style={{ height: 4, marginTop: 2 }}>
                              <div className="progress-fill" style={{ width: `${Math.min(100, m.pct)}%`, background: m.color }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {campusKpiView === "mosque" && (
                    <div style={{ marginTop: 2 }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                        <div className="kpi-value" style={{ color: "#06b6d4", fontSize: 22 }}>{mosqueSum.overallPct ?? mosqueSum.studentPct ?? 0}%</div>
                        <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>
                          Jami: {mosqueSum.totalPrayers ?? 0} ta kirish
                        </span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, marginTop: 6 }}>
                        {[
                          { label: "Bom", pct: mosqueSum.fajrPct ?? 0 },
                          { label: "Pesh", pct: mosqueSum.dhuhrPct ?? 0 },
                          { label: "Asr", pct: mosqueSum.asrPct ?? 0 },
                          { label: "Shom", pct: mosqueSum.maghribPct ?? 0 },
                          { label: "Xuf", pct: mosqueSum.ishaPct ?? 0 },
                        ].map((p) => (
                          <div
                            key={p.label}
                            style={{
                              textAlign: "center",
                              padding: "4px 2px",
                              borderRadius: 6,
                              background: "rgba(6,182,212,0.1)",
                              border: "1px solid rgba(6,182,212,0.22)",
                            }}
                          >
                            <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{p.label}</div>
                            <div style={{ fontSize: 11.5, fontWeight: 800, color: "#06b6d4" }}>{p.pct}%</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 5-BOX: KECH KELGAN TALABALAR */}
                <div
                  className="kpi-card"
                  style={{ cursor: "pointer" }}
                  title="Kech kelgan talabalar va kirish kamerasi oynasiga o'tish"
                  onClick={() => {
                    setCampusSubTab("gate");
                    setActiveTab("canteen_mosque");
                  }}
                >
                  <div className="kpi-glow" style={{ background: "#8b5cf6" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 600 }}>KECH KELGAN TALABALAR</span>
                    <ShieldAlert size={18} color="#f43f5e" />
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <div className="kpi-value" style={{ color: "#f43f5e" }}>
                      {gateSum.confirmedCount ?? 0} ta
                    </div>
                    <span className="badge badge-rose" style={{ fontSize: 11 }}>
                      {gateSum.uniqueLateStudentsCount ?? 0} nafar talaba
                    </span>
                  </div>
                  <div className="kpi-sub" style={{ marginBottom: 4 }}>
                    <span style={{ color: "#f59e0b", fontWeight: 600 }}>Surunkali (2+): {gateSum.chronicCount ?? 0}</span>
                    <span>•</span>
                    <span>Botda kutmoqda: <strong>{gateSum.pendingCount ?? 0} ta</strong></span>
                  </div>
                  {(gateSum.leaderboard || []).length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
                      {(gateSum.leaderboard || []).slice(0, 2).map((st: any, idx: number) => (
                        <span
                          key={idx}
                          style={{
                            fontSize: 10.5,
                            padding: "2px 7px",
                            borderRadius: 6,
                            background: st.count >= 2 ? "rgba(244,63,94,0.14)" : "rgba(245,158,11,0.14)",
                            color: st.count >= 2 ? "#f43f5e" : "#f59e0b",
                            fontWeight: 700,
                          }}
                        >
                          {st.studentName} ({st.count}x)
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Charts Row */}
              <div style={{ display: "grid", gridTemplateColumns: "1.65fr 1fr", gap: 18, marginBottom: 20 }}>
                <div className="glass-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div>
                      <h3 style={{ fontSize: 15.5, fontWeight: 700 }}>12 Oylik Pul Oqimi Dinamikasi ($)</h3>
                      <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        Yashil: Talaba to'lovlari va daromadlar • Qizil: To'langan xarajatlar
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <span className="badge badge-emerald">Kirim</span>
                      <span className="badge badge-rose">Chiqim</span>
                    </div>
                  </div>
                  <CashFlowChart data={overview?.monthlyCashFlow || []} />
                </div>

                <div className="glass-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div>
                    <h3 style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 4 }}>To'lov Usullari va Shartnoma</h3>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
                      Tanlangan davr bo'yicha tushum taqsimoti
                    </p>
                    <MethodDonut byMethod={crm.byMethod || []} />
                  </div>

                  <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 6 }}>
                      <span>Shartnoma bajarilishi ({crm.contractCount || 0} talaba)</span>
                      <strong>
                        {fmtUSD(crm.totalPaid)} / {fmtUSD(crm.totalContract)} (
                        {crm.totalContract > 0 ? Math.round((crm.totalPaid / crm.totalContract) * 100) : 0}%)
                      </strong>
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${Math.min(100, crm.totalContract > 0 ? (crm.totalPaid / crm.totalContract) * 100 : 0)}%`,
                          background: "linear-gradient(90deg, #10b981, #06b6d4)",
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>
                      <span>Shu oy kutilayotgan: <strong>{fmtUSD(crm.expectedThisMonth)}</strong></span>
                      {crm.archivedDebtorCount > 0 && (
                        <span style={{ color: "#fbbf24" }}>
                          O'tgan yil arxivi: {fmtUSD(crm.archivedDebtAmount)} ({crm.archivedDebtorCount})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Alerts & Anomalies */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 20 }}>
                <div className="glass-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                      <ShieldAlert size={17} color="#fbbf24" /> Muhim Bildirishnomalar va Eslatmalar
                    </h3>
                    <span className="badge badge-amber">{(overview?.alerts || []).length} ta eslatma</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {(overview?.alerts || []).map((a: any) => (
                      <div
                        key={a.id}
                        onClick={() => a.tab && setActiveTab(a.tab)}
                        style={{
                          padding: "11px 14px",
                          borderRadius: 12,
                          background:
                            a.severity === "critical"
                              ? "rgba(244,63,94,0.1)"
                              : a.severity === "warning"
                              ? "rgba(245,158,11,0.1)"
                              : "rgba(6,182,212,0.1)",
                          border: `1px solid ${
                            a.severity === "critical"
                              ? "rgba(244,63,94,0.3)"
                              : a.severity === "warning"
                              ? "rgba(245,158,11,0.3)"
                              : "rgba(6,182,212,0.3)"
                          }`,
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{a.title}</div>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{a.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="glass-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                      <Sparkles size={17} color="#c084fc" /> O'rtachadan Yuqori Xarajatlar
                    </h3>
                    <button className="btn btn-sm" onClick={() => { setAiOpen(true); askAi("Eng katta xarajatlarni va o'rtachadan yuqori sarflarni tahlil qilib ber."); }}>
                      AI Tahlil
                    </button>
                  </div>
                  {(overview?.anomalies || []).length === 0 ? (
                    <div style={{ color: "var(--text-muted)", fontSize: 13, padding: 16 }}>
                      O'rtachadan keskin yuqori xarajatlar aniqlanmadi.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {(overview?.anomalies || []).map((an: any) => (
                        <div
                          key={an.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "9px 12px",
                            borderRadius: 10,
                            background: "rgba(139,92,246,0.08)",
                            border: "1px solid rgba(139,92,246,0.25)",
                            fontSize: 13,
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600 }}>{an.description}</div>
                            <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                              {an.category} • O'rtacha: {fmtTL(an.categoryAvg)} • {an.date}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontWeight: 700, color: "#fb7185" }}>{fmtTL(an.amount)}</div>
                            <span className="badge badge-violet">{an.ratio} barobar ko'p</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Payments & Expenses */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                <div className="glass-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700 }}>So'nggi Talaba To'lovlari</h3>
                    <button className="btn btn-sm" onClick={() => setActiveTab("payments")}>Barchasi →</button>
                  </div>
                  <div className="table-wrap">
                    <table className="fin-table">
                      <thead>
                        <tr>
                          <th>Talaba</th>
                          <th>Sana</th>
                          <th>Usul</th>
                          <th>Summa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(overview?.recentStudentPayments || []).map((p: any) => (
                          <tr key={p.id}>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <StudentAvatar student={p.student || { fullname: `#${p.studentId}` }} size={32} />
                                <div>
                                  <div style={{ fontWeight: 600 }}>{p.student?.fullname || `#${p.studentId}`}</div>
                                  <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{p.student?.group?.name || ""}</div>
                                </div>
                              </div>
                            </td>
                            <td>{String(p.paidAt || "").slice(0, 10)}</td>
                            <td>
                              <span className={`badge ${METHOD_MAP[p.method]?.badge || "badge-slate"}`}>
                                {METHOD_MAP[p.method]?.label || p.method}
                              </span>
                            </td>
                            <td style={{ fontWeight: 700, color: "#10b981" }}>+{fmtUSD(p.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="glass-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700 }}>So'nggi xarajatlar</h3>
                    <button className="btn btn-sm" onClick={() => setActiveTab("expenses")}>Barchasi →</button>
                  </div>
                  <div className="table-wrap">
                    <table className="fin-table">
                      <thead>
                        <tr>
                          <th>Tavsif / Toifa</th>
                          <th>Holati</th>
                          <th>Summa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(overview?.recentExpenses || []).map((e: any) => (
                          <tr key={e.id}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{e.description || "Xarajat"}</div>
                              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                                {e.category?.name} • {e.employee?.firstName || ""}
                              </div>
                            </td>
                            <td>
                              <span className={`badge ${EXPENSE_STATUS_MAP[e.status]?.badge || "badge-slate"}`}>
                                {EXPENSE_STATUS_MAP[e.status]?.label || e.status}
                              </span>
                            </td>
                            <td style={{ fontWeight: 700, color: "#f43f5e" }}>
                              <div>-{fmtTL(e.amountInDefault || e.amount)}</div>
                              {access.isDirector && (
                                <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)" }}>
                                  ≈ {fmtUSD(e.amountUsd)} • 1$ = {Number(e.usdRate || 49.63).toFixed(2)} ₺
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: STUDENT PAYMENTS LEDGER */}
          {activeTab === "payments" && (
            <div className="animate-in glass-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800 }}>Talaba to'lovlari daftari</h2>
                  <p style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                    Har bir to'lov alohida qayd sifatida saqlanadi. Bekor qilingan to'lovlar ham sababi bilan arxivda qoladi.
                  </p>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span className="badge badge-emerald" style={{ fontSize: 13, padding: "6px 12px" }}>
                    Jami ({paymentsData.total || 0}): {fmtUSD(paymentsData.totalAmount)}
                  </span>
                  <button className="btn btn-primary" onClick={() => openPaymentModal()}>
                    <Plus size={16} /> To'lov qo'shish
                  </button>
                </div>
              </div>

              <div className="filter-bar">
                <input
                  className="input"
                  placeholder="Ism yoki telefon bo'yicha qidirish..."
                  value={payFilter.search}
                  onChange={(e) => setPayFilter({ ...payFilter, search: e.target.value })}
                  style={{ minWidth: 220 }}
                />
                <select
                  className="select"
                  value={payFilter.year}
                  onChange={(e) => setPayFilter({ ...payFilter, year: e.target.value })}
                >
                  <option value="">Barcha o'quv yillari</option>
                  <option value="2026-2027">2026-2027 (Joriy yil)</option>
                  <option value="2025-2026">2025-2026 (Arxiv yil)</option>
                </select>
                <select
                  className="select"
                  value={payFilter.method}
                  onChange={(e) => setPayFilter({ ...payFilter, method: e.target.value })}
                >
                  <option value="">Barcha to'lov usullari</option>
                  <option value="naqt">Naqd pul</option>
                  <option value="karta">Bank kartasi</option>
                  <option value="otkazma">O'tkazma</option>
                </select>
                <select
                  className="select"
                  value={!access.isDirector && access.gender ? access.gender : payFilter.gender}
                  disabled={!access.isDirector && Boolean(access.gender)}
                  onChange={(e) => setPayFilter({ ...payFilter, gender: e.target.value })}
                >
                  <option value="">Barcha jinslar</option>
                  <option value="MALE">O'g'il bolalar</option>
                  <option value="FEMALE">Qiz bolalar</option>
                </select>
                <select
                  className="select"
                  value={payFilter.groupId}
                  onChange={(e) => setPayFilter({ ...payFilter, groupId: e.target.value })}
                >
                  <option value="">Barcha guruhlar</option>
                  {(paymentsData.groups || []).map((g: any) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                <input
                  type="date"
                  className="input"
                  value={payFilter.from}
                  onChange={(e) => setPayFilter({ ...payFilter, from: e.target.value })}
                />
                <input
                  type="date"
                  className="input"
                  value={payFilter.to}
                  onChange={(e) => setPayFilter({ ...payFilter, to: e.target.value })}
                />
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={payFilter.includeVoided}
                    onChange={(e) => setPayFilter({ ...payFilter, includeVoided: e.target.checked })}
                  />
                  Bekor qilinganlar
                </label>
                <button className="btn btn-sm" onClick={loadPayments}>Qo'llash</button>
              </div>

              <div className="table-wrap">
                <table className="fin-table">
                  <thead>
                    <tr>
                      <th>Raqam</th>
                      <th>Talaba</th>
                      <th>Guruh</th>
                      <th>To'lov sanasi</th>
                      <th>To'lov usuli</th>
                      <th>Summa ($)</th>
                      <th>Qabul qildi</th>
                      <th>Izoh</th>
                      <th>Amal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(paymentsData.items || []).map((p: any) => {
                      const isVoid = Boolean(p.voidedAt);
                      return (
                        <tr key={p.id} style={{ opacity: isVoid ? 0.55 : 1 }}>
                          <td>#{p.id}</td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <StudentAvatar student={p.student || { fullname: `Talaba #${p.studentId}` }} size={34} />
                              <div>
                                <div style={{ fontWeight: 700 }}>{p.student?.fullname || `Talaba #${p.studentId}`}</div>
                                <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                                  Qolgan qarz: {fmtUSD(p.student?.remainingAmount)}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>{p.student?.group?.name || "—"}</td>
                          <td>{String(p.paidAt || "").slice(0, 10)}</td>
                          <td>
                            <span className={`badge ${METHOD_MAP[p.method]?.badge || "badge-slate"}`}>
                              {METHOD_MAP[p.method]?.label || p.method}
                            </span>
                          </td>
                          <td style={{ fontWeight: 800, color: isVoid ? "#f43f5e" : "#10b981", textDecoration: isVoid ? "line-through" : "none" }}>
                            {fmtUSD(p.amount)}
                          </td>
                          <td>
                            <div>{p.receivedByName || "Ma'mur"}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                              {p.source === "LEGACY" ? "Avvalgi qayd" : p.source === "MANUAL" ? "Qo'lda kiritilgan" : p.source || "Tizim"}
                            </div>
                          </td>
                          <td>
                            {isVoid ? (
                              <span className="badge badge-rose">
                                BEKOR QILINGAN: {p.voidReason} ({p.voidedByName || ""})
                              </span>
                            ) : (
                              p.note || "—"
                            )}
                          </td>
                          <td>
                            {!isVoid && (
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                <button
                                  className="btn btn-sm"
                                  onClick={() => setReceiptPrintModal(p)}
                                  title="To'lov kvitansiyasini ko'rish va chop etish"
                                >
                                  🖨️ Kvitansiya
                                </button>
                                {access.isDirector && (
                                  <button
                                    className="btn btn-sm btn-danger"
                                    onClick={() => setVoidPayModal({ payment: p, reason: "" })}
                                  >
                                    Bekor qilish
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: DEBTORS */}
          {activeTab === "debtors" && (
            <div className="animate-in glass-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800 }}>Qarzdor talabalar va to'lov muddatlari</h2>
                  <p style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                    Qarzdor talabalar ro'yxati. O'tgan o'quv yilidagi yopilmagan qarzlar ham alohida ko'rinadi.
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span className="badge badge-rose">Muddati o'tgan: {debtorsData.summary?.overdueCount || 0} ({fmtUSD(debtorsData.summary?.overdueAmount)})</span>
                  <span className="badge badge-amber">7 kunda: {debtorsData.summary?.dueSoonCount || 0} ({fmtUSD(debtorsData.summary?.dueSoonAmount)})</span>
                  <span className="badge badge-violet">Arxiv (o'tgan yil): {debtorsData.summary?.archivedDebtorCount || 0} ({fmtUSD(debtorsData.summary?.archivedDebtAmount)})</span>
                </div>
              </div>

              <div className="filter-bar">
                {[
                  { id: "ACTIVE", label: "🟢 Faol talabalar" },
                  { id: "OVERDUE", label: "🔴 Muddati o'tgan" },
                  { id: "DUESOON", label: "🟡 Yaqin 7 kunda" },
                  { id: "NODATE", label: "⚪ Muddat belgilanmagan" },
                  { id: "ARCHIVED", label: "📦 O'tgan yil (Arxiv)" },
                  { id: "ALL", label: "🌐 Barchasi (Faol + Arxiv)" },
                ].map((s) => (
                  <button
                    key={s.id}
                    className={`btn btn-sm ${debtorFilter.signal === s.id ? "btn-primary" : ""}`}
                    onClick={() => setDebtorFilter({ ...debtorFilter, signal: s.id })}
                  >
                    {s.label}
                  </button>
                ))}

                <input
                  className="input"
                  placeholder="Talaba ismi yoki telefon..."
                  value={debtorFilter.search}
                  onChange={(e) => setDebtorFilter({ ...debtorFilter, search: e.target.value })}
                  style={{ minWidth: 200 }}
                />

                <select
                  className="select"
                  value={debtorFilter.year}
                  onChange={(e) => setDebtorFilter({ ...debtorFilter, year: e.target.value })}
                >
                  <option value="">Barcha o'quv yillari</option>
                  <option value="2026-2027">2026-2027 (Joriy yil)</option>
                  <option value="2025-2026">2025-2026 (Arxiv yil)</option>
                </select>

                <select
                  className="select"
                  value={!access.isDirector && access.gender ? access.gender : debtorFilter.gender}
                  disabled={!access.isDirector && Boolean(access.gender)}
                  onChange={(e) => setDebtorFilter({ ...debtorFilter, gender: e.target.value })}
                >
                  <option value="">Barcha jinslar</option>
                  <option value="MALE">O'g'il bolalar</option>
                  <option value="FEMALE">Qiz bolalar</option>
                </select>

                <select
                  className="select"
                  value={debtorFilter.groupId}
                  onChange={(e) => setDebtorFilter({ ...debtorFilter, groupId: e.target.value })}
                >
                  <option value="">Barcha guruhlar</option>
                  {(debtorsData.groups || []).map((g: any) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              <div className="table-wrap">
                <table className="fin-table">
                  <thead>
                    <tr>
                      <th>Talaba</th>
                      <th>Guruh</th>
                      <th>Shartnoma</th>
                      <th>To'langan</th>
                      <th>Qolgan qarz</th>
                      <th>Keyingi to'lov muddati</th>
                      <th>Holati</th>
                      <th>Amallar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDebtors.map((st: any) => {
                      const today = overview?.asOf || new Date().toISOString().slice(0, 10);
                      const soon = new Date(Date.now() + 7 * 86400 * 1000).toISOString().slice(0, 10);
                      const due = st.paidUntilDate ? String(st.paidUntilDate).slice(0, 10) : null;
                      const isArchived = Boolean(st.isArchived || !st.isActive || st.isDeleted);
                      let signalBadge = <span className="badge badge-slate">Muddatsiz</span>;
                      if (isArchived) signalBadge = <span className="badge badge-violet">O'tgan o'quv yili</span>;
                      else if (due && due < today) signalBadge = <span className="badge badge-rose">Muddati o'tgan</span>;
                      else if (due && due <= soon) signalBadge = <span className="badge badge-amber">Yaqin qoldi</span>;
                      else if (due) signalBadge = <span className="badge badge-emerald">Muddati bor</span>;

                      return (
                        <tr key={st.id}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <StudentAvatar student={st} size={36} />
                              <div>
                                <div style={{ fontWeight: 700 }}>{st.fullname}</div>
                                <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                                  {st.phone || st.fatherPhone || st.motherPhone || st.username}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>{st.group?.name || "—"}</td>
                          <td>{fmtUSD(st.totalPayment)}</td>
                          <td style={{ color: "#34d399", fontWeight: 600 }}>
                            {fmtUSD(st.paidAmount)}
                            {st.overpaidAmount > 0 && (
                              <span className="badge badge-cyan" style={{ marginLeft: 6 }}>
                                +{fmtUSD(st.overpaidAmount)} ortiqcha
                              </span>
                            )}
                          </td>
                          <td style={{ color: "#fbbf24", fontWeight: 800 }}>{fmtUSD(st.remainingAmount)}</td>
                          <td>
                            <div>{due || "Belgilanmagan"}</div>
                            {st.plannedPayment > 0 && (
                              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                                Kutilmoqda: {fmtUSD(st.plannedPayment)}
                              </div>
                            )}
                          </td>
                          <td>{signalBadge}</td>
                          <td>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <button className="btn btn-sm btn-primary" onClick={() => openPaymentModal(st, false)}>
                                + To'lov
                              </button>
                              <button className="btn btn-sm" onClick={() => openPaymentModal(st, true)}>
                                Muddat
                              </button>
                              <button className="btn btn-sm" onClick={() => setStudentHistoryModal(st)}>
                                <History size={13} /> Tarix ({(st.payments || []).length})
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: EXPENSES */}
          {activeTab === "expenses" && (
            <div className="animate-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Sub-Tab Switcher: Haqiqiy xarajatlar vs Talabnomalar (So'rovlar) */}
              <div
                className="glass-card"
                style={{
                  padding: "12px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    className={`btn ${expenseSubTab === "expenses" ? "btn-primary" : ""}`}
                    onClick={() => setExpenseSubTab("expenses")}
                    style={{ fontWeight: 800 }}
                  >
                    💸 Haqiqiy xarajatlar ({(expensesData.items || []).length})
                  </button>
                  <button
                    className={`btn ${expenseSubTab === "requests" ? "btn-primary" : ""}`}
                    onClick={() => setExpenseSubTab("requests")}
                    style={{ fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 8 }}
                  >
                    <span>📝 Talabnomalar / So'rovlar ({(expenseRequestsData.items || []).length})</span>
                    {(expenseRequestsData.summary?.pendingCount || 0) > 0 && (
                      <span
                        className="badge badge-amber"
                        style={{ fontSize: 10.5, padding: "2px 8px", fontWeight: 800 }}
                      >
                        ⏳ {expenseRequestsData.summary.pendingCount} ta tasdiq kutmoqda
                      </span>
                    )}
                    {(expenseRequestsData.summary?.approvedCount || 0) > 0 && (
                      <span
                        className="badge badge-cyan"
                        style={{ fontSize: 10.5, padding: "2px 8px", fontWeight: 800 }}
                      >
                        ✅ {expenseRequestsData.summary.approvedCount} ta ruxsat berilgan
                      </span>
                    )}
                  </button>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="btn"
                    style={{
                      borderColor: "rgba(245,158,11,0.45)",
                      background: "rgba(245,158,11,0.12)",
                      color: "#fbbf24",
                      fontWeight: 700,
                    }}
                    onClick={() => openExpenseRequestModal()}
                  >
                    📝 + Xarajatga talabnoma (So'rov)
                  </button>
                </div>
              </div>

              {expenseSubTab === "expenses" && (
                <>
              {/* Top KPI Summary Row */}
              <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                <div
                  className="kpi-card"
                  style={{ cursor: "pointer", borderColor: expFilter.status === "PAID" ? "#f43f5e" : undefined }}
                  onClick={() => setExpFilter({ ...expFilter, status: expFilter.status === "PAID" ? "" : "PAID" })}
                >
                  <div className="kpi-glow" style={{ background: "#f43f5e" }} />
                  <div style={{ fontSize: 11.5, color: "var(--text-secondary)", fontWeight: 700 }}>TO'LANGAN XARAJATLAR (JAMI)</div>
                  <div className="kpi-value" style={{ color: "#f43f5e" }}>
                    {access.isDirector
                      ? fmtUSD(filteredExpenseKpis.paidUsd)
                      : fmtTL(filteredExpenseKpis.paidTl)}
                  </div>
                  <div className="kpi-sub">
                    {access.isDirector && (
                      <>
                        <span>Asl summasi: <strong>{fmtTL(filteredExpenseKpis.paidTl)}</strong></span>
                        <span>•</span>
                      </>
                    )}
                    <span>{filteredExpenseKpis.paidCount} ta xarajat</span>
                  </div>
                </div>

                <div
                  className="kpi-card"
                  style={{ cursor: "pointer", borderColor: expFilter.status === "PENDING" ? "#f59e0b" : undefined }}
                  onClick={() => setExpFilter({ ...expFilter, status: expFilter.status === "PENDING" ? "" : "PENDING" })}
                >
                  <div className="kpi-glow" style={{ background: "#f59e0b" }} />
                  <div style={{ fontSize: 11.5, color: "var(--text-secondary)", fontWeight: 700 }}>TASDIQ KUTILMOQDA (PENDING)</div>
                  <div className="kpi-value" style={{ color: "#f59e0b" }}>
                    {access.isDirector
                      ? fmtUSD(filteredExpenseKpis.pendingUsd)
                      : fmtTL(filteredExpenseKpis.pendingTl)}
                  </div>
                  <div className="kpi-sub">
                    {access.isDirector && (
                      <>
                        <span>Asl summasi: <strong>{fmtTL(filteredExpenseKpis.pendingTl)}</strong></span>
                        <span>•</span>
                      </>
                    )}
                    <span>{filteredExpenseKpis.pendingCount} ta so'rov</span>
                  </div>
                </div>

                <div
                  className="kpi-card"
                  style={{ cursor: "pointer", borderColor: expFilter.status === "APPROVED" ? "#06b6d4" : undefined }}
                  onClick={() => setExpFilter({ ...expFilter, status: expFilter.status === "APPROVED" ? "" : "APPROVED" })}
                >
                  <div className="kpi-glow" style={{ background: "#06b6d4" }} />
                  <div style={{ fontSize: 11.5, color: "var(--text-secondary)", fontWeight: 700 }}>TASDIQLANGAN (TO'LOV KUTMOQDA)</div>
                  <div className="kpi-value" style={{ color: "#06b6d4" }}>
                    {access.isDirector
                      ? fmtUSD(filteredExpenseKpis.approvedUsd)
                      : fmtTL(filteredExpenseKpis.approvedTl)}
                  </div>
                  <div className="kpi-sub">
                    {access.isDirector && (
                      <>
                        <span>Asl summasi: <strong>{fmtTL(filteredExpenseKpis.approvedTl)}</strong></span>
                        <span>•</span>
                      </>
                    )}
                    <span>{filteredExpenseKpis.approvedCount} ta</span>
                  </div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-glow" style={{ background: "#10b981" }} />
                  <div style={{ fontSize: 11.5, color: "var(--text-secondary)", fontWeight: 700 }}>TANLANGAN RO'YXAT JAMI</div>
                  <div className="kpi-value" style={{ color: "#10b981" }}>
                    {access.isDirector
                      ? fmtUSD(filteredExpenses.reduce((s: number, x: any) => s + Number(x.amountUsd || 0), 0))
                      : fmtTL(filteredExpenses.reduce((s: number, x: any) => s + Number(x.amountInDefault || x.amount || 0), 0))}
                  </div>
                  <div className="kpi-sub">
                    {access.isDirector && (
                      <>
                        <span>TLda: <strong>{fmtTL(filteredExpenses.reduce((s: number, x: any) => s + Number(x.amountInDefault || x.amount || 0), 0))}</strong></span>
                        <span>•</span>
                      </>
                    )}
                    <span>{filteredExpenses.length} ta qator</span>
                  </div>
                </div>
              </div>

              {/* Main Expenses Card */}
              <div className="glass-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 800 }}>
                      {access.isDirector ? "Xarajatlar va rahbar nazorati" : `Mening xarajatlarim (${access.accountName || "Hamyon"})`}
                    </h2>
                    <p style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                      {access.isDirector
                        ? "Har bir xarajat o'sha kundagi USD/TL kursi bilan hisoblangan. Xodimlar kesimida yoki sana bo'yicha saralab ko'rishingiz mumkin."
                        : "O'z hisobingizdan kiritilgan xarajatlar ro'yxati va ularning tasdiqlanish holati (Turk lirasida)."}
                    </p>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
                      setNewExpenseModal({
                        employeeId: access.employeeId || expensesData.employees?.[0]?.id || "",
                        categoryId: expensesData.categories?.[0]?.id || "",
                        amount: "",
                        currency: "TRY",
                        expenseDate: today,
                        description: "",
                        status: "PAID",
                      });
                    }}
                  >
                    <Plus size={16} /> Yangi xarajat kiritish
                  </button>
                </div>

                {/* Employee Filter Chips */}
                {access.isDirector && employeeExpenseStats.length > 0 && (
                  <div className="emp-chip-bar">
                    <button
                      type="button"
                      className={`emp-chip ${!expFilter.employeeId ? "active" : ""}`}
                      onClick={() => setExpFilter({ ...expFilter, employeeId: "" })}
                    >
                      <span>Barcha xodimlar</span>
                      <span style={{ opacity: 0.85, fontSize: 11 }}>
                        ({allEmployeesFilteredTotals.count} ta • {fmtUSD(allEmployeesFilteredTotals.totalUsd)})
                      </span>
                    </button>
                    {employeeExpenseStats.map((emp) => (
                      <button
                        key={emp.id}
                        type="button"
                        className={`emp-chip ${expFilter.employeeId === emp.id ? "active" : ""}`}
                        onClick={() => setExpFilter({ ...expFilter, employeeId: expFilter.employeeId === emp.id ? "" : emp.id })}
                      >
                        <span>{emp.name}</span>
                        <span style={{ opacity: 0.8, fontSize: 11 }}>({emp.count} ta • {fmtUSD(emp.totalUsd)})</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Date Basis & Quick Period Filter Bar */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 12px",
                    marginBottom: 10,
                    borderRadius: 12,
                    background: "rgba(15, 23, 42, 0.35)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginRight: 4 }}>
                      Sana filtri turi:
                    </span>
                    {(
                      [
                        { id: "expenseDate", label: "📅 Asl xarajat sanasi bo'yicha", sort: "expenseDate" },
                        { id: "createdDate", label: "🕒 Kiritilgan vaqti bo'yicha", sort: "createdAt" },
                        ...(access.isDirector
                          ? [
                              { id: "approvedDate", label: "✅ Tasdiqlangan vaqti bo'yicha", sort: "approvedAt" },
                              { id: "paidDate", label: "💸 To'langan vaqti bo'yicha", sort: "paidAt" },
                            ]
                          : []),
                      ] as { id: "expenseDate" | "createdDate" | "approvedDate" | "paidDate"; label: string; sort: any }[]
                    ).map((df) => (
                      <button
                        key={df.id}
                        type="button"
                        className={`btn btn-sm ${expFilter.dateField === df.id ? "btn-primary" : ""}`}
                        onClick={() => setExpFilter({ ...expFilter, dateField: df.id, sortBy: df.sort })}
                      >
                        {df.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11.5, color: "var(--text-secondary)", fontWeight: 600 }}>Tezkor davr:</span>
                    {[
                      {
                        label: "Bugun",
                        getRange: () => {
                          const d = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
                          return { from: d, to: d };
                        },
                      },
                      {
                        label: "Kecha",
                        getRange: () => {
                          const d = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(
                            new Date(Date.now() - 86400 * 1000)
                          );
                          return { from: d, to: d };
                        },
                      },
                      {
                        label: "Oxirgi 7 kun",
                        getRange: () => {
                          const to = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
                          const from = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(
                            new Date(Date.now() - 6 * 86400 * 1000)
                          );
                          return { from, to };
                        },
                      },
                      {
                        label: "Shu oy",
                        getRange: () => {
                          const to = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
                          return { from: `${to.slice(0, 7)}-01`, to };
                        },
                      },
                      {
                        label: "Barcha vaqt",
                        getRange: () => ({ from: "", to: "" }),
                      },
                    ].map((preset) => {
                      const r = preset.getRange();
                      const isCurrent = expFilter.from === r.from && expFilter.to === r.to;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          className={`btn btn-sm ${isCurrent ? "btn-primary" : ""}`}
                          onClick={() => setExpFilter({ ...expFilter, from: r.from, to: r.to })}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Filter Bar */}
                <div className="filter-bar" style={{ marginBottom: 14 }}>
                  {[
                    { id: "", label: "Barchasi" },
                    { id: "PAID", label: "To'langan" },
                    { id: "PENDING", label: "Kutilmoqda" },
                    { id: "APPROVED", label: "Tasdiqlangan" },
                    { id: "REJECTED", label: "Rad / Bekor" },
                  ].map((s) => (
                    <button
                      key={s.id}
                      className={`btn btn-sm ${expFilter.status === s.id ? "btn-primary" : ""}`}
                      onClick={() => setExpFilter({ ...expFilter, status: s.id })}
                    >
                      {s.label}
                    </button>
                  ))}

                  <select
                    className="select"
                    value={expFilter.categoryId}
                    onChange={(e) => setExpFilter({ ...expFilter, categoryId: e.target.value })}
                  >
                    <option value="">Barcha toifalar ({(expensesData.categories || []).length})</option>
                    {(expensesData.categories || []).map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>

                  <input
                    type="date"
                    className="input"
                    value={expFilter.from}
                    onChange={(e) => setExpFilter({ ...expFilter, from: e.target.value })}
                    title="Tanlangan sana turi bo'yicha boshlanish sanasi"
                  />
                  <input
                    type="date"
                    className="input"
                    value={expFilter.to}
                    onChange={(e) => setExpFilter({ ...expFilter, to: e.target.value })}
                    title="Tanlangan sana turi bo'yicha tugash sanasi"
                  />

                  <select
                    className="select"
                    value={expFilter.sortBy}
                    onChange={(e) => setExpFilter({ ...expFilter, sortBy: e.target.value as any })}
                    title="Ro'yxatni saralash tartibi"
                  >
                    <option value="createdAt">Saralash: 🕒 Kiritilgan vaqti</option>
                    <option value="expenseDate">Saralash: 📅 Asl xarajat sanasi</option>
                    {access.isDirector && <option value="approvedAt">Saralash: ✅ Tasdiqlangan vaqti</option>}
                    {access.isDirector && <option value="paidAt">Saralash: 💸 To'langan vaqti</option>}
                    <option value="amount">Saralash: 💰 Summasi bo'yicha</option>
                  </select>

                  <input
                    className="input"
                    placeholder="Tavsif yoki xodim bo'yicha qidirish..."
                    value={expFilter.search}
                    onChange={(e) => setExpFilter({ ...expFilter, search: e.target.value })}
                    style={{ minWidth: 200, flex: 1 }}
                  />

                  {(expFilter.status || expFilter.employeeId || expFilter.categoryId || expFilter.from || expFilter.to || expFilter.search || expFilter.dateField !== "expenseDate") && (
                    <button
                      className="btn btn-sm"
                      onClick={() =>
                        setExpFilter({
                          status: "",
                          categoryId: "",
                          employeeId: "",
                          dateField: "expenseDate",
                          sortBy: "createdAt",
                          from: "",
                          to: "",
                          search: "",
                        })
                      }
                    >
                      Tozalash
                    </button>
                  )}
                </div>

                {/* Expenses Table */}
                <div className="table-wrap">
                  <table className="fin-table">
                    <thead>
                      <tr>
                        <th>Sanalar (Xarajat / Kiritildi / Tasdiq)</th>
                        <th>Xodim</th>
                        <th>Xarajat tavsifi va toifasi</th>
                        <th>Summa (TL)</th>
                        {access.isDirector && <th>USD ekvivalenti / Kurs</th>}
                        <th>Holati</th>
                        <th style={{ textAlign: "right" }}>Boshqaruv amallari</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredExpenses.map((e: any) => {
                        const empName = e.employee ? `${e.employee.firstName || ""} ${e.employee.lastName || ""}`.trim() : "Xodim";
                        const initials = empName
                          .split(" ")
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((w: string) => w[0]?.toUpperCase())
                          .join("");
                        const expD = String(e.expenseDate || e.date || "").slice(0, 10);
                        const crtD = String(e.createdDate || e.createdAt || "").slice(0, 10);
                        const crtTxt = e.createdAtText || (e.createdAt ? String(e.createdAt).slice(0, 16).replace("T", " ") : expD);
                        const appTxt = e.approvedAtText || (e.approvedAt ? String(e.approvedAt).slice(0, 16).replace("T", " ") : "");
                        const paidTxt = e.paidAtText || (e.paidAt ? String(e.paidAt).slice(0, 16).replace("T", " ") : "");
                        const isBackdated = expD && crtD && expD !== crtD;
                        return (
                          <tr key={e.id}>
                            <td style={{ whiteSpace: "nowrap" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontWeight: 800, fontSize: 13, color: "var(--text-primary)" }}>
                                  📅 Xarajat: {expD}
                                </span>
                                {isBackdated && (
                                  <span
                                    className="badge badge-amber"
                                    style={{ fontSize: 9.5, padding: "1px 6px" }}
                                    title={`Asl xarajat ${expD} da qilingan, tizimga ${crtD} da kiritilgan`}
                                  >
                                    Oldingi kun uchun
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 2 }}>
                                🕒 Kiritildi: <strong>{crtTxt}</strong>
                              </div>
                              {appTxt && (
                                <div style={{ fontSize: 11, color: "#06b6d4", marginTop: 1 }}>
                                  ✅ Tasdiq: {appTxt}
                                </div>
                              )}
                              {paidTxt && (
                                <div style={{ fontSize: 11, color: "#10b981", marginTop: 1 }}>
                                  💸 To'landi: {paidTxt}
                                </div>
                              )}
                            </td>
                            <td style={{ whiteSpace: "nowrap" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div
                                  className="stu-avatar"
                                  style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 8,
                                    fontSize: 11.5,
                                    background: "rgba(139,92,246,0.15)",
                                    color: "#a78bfa",
                                  }}
                                >
                                  {initials}
                                </div>
                                <span style={{ fontWeight: 700 }}>{empName}</span>
                              </div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text-primary)" }}>
                                {e.description || e.title || "—"}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                                <span className="badge badge-slate" style={{ fontSize: 10.5, padding: "1px 7px" }}>
                                  {e.category?.name || "Umumiy"}
                                </span>
                                {e.requestId && (
                                  <span
                                    className="badge badge-cyan"
                                    style={{ fontSize: 10.5, padding: "1px 7px", cursor: "pointer" }}
                                    onClick={() => setExpenseSubTab("requests")}
                                    title="Ushbu xarajat tasdiqlangan talabnoma asosida amalga oshirilgan"
                                  >
                                    🔗 Talabnomadan
                                  </span>
                                )}
                                {e.flaggedLowBalance && (
                                  <span className="badge badge-rose" style={{ fontSize: 10.5, padding: "1px 7px" }}>
                                    Hamyonda mablag' kam bo'lgan
                                  </span>
                                )}
                                {e.rejectionReason && (
                                  <span style={{ fontSize: 11, color: "#f43f5e", fontWeight: 600 }}>
                                    Sabab: {e.rejectionReason}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ fontWeight: 800, fontSize: 14, color: "#f43f5e", whiteSpace: "nowrap" }}>
                              -{fmtTL(e.amountInDefault || e.amount)}
                            </td>
                            {access.isDirector && (
                              <td style={{ whiteSpace: "nowrap" }}>
                                <div style={{ fontWeight: 800, fontSize: 13.5, color: "#06b6d4" }}>
                                  {fmtUSD(e.amountUsd)}
                                </div>
                                <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>
                                  1$ = {Number(e.usdRate || 49.63).toFixed(2)} ₺
                                </div>
                              </td>
                            )}
                            <td style={{ whiteSpace: "nowrap" }}>
                              <span className={`badge ${EXPENSE_STATUS_MAP[e.status]?.badge || "badge-slate"}`}>
                                {EXPENSE_STATUS_MAP[e.status]?.label || e.status}
                              </span>
                            </td>
                            <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                              <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                <button
                                  className="btn btn-sm"
                                  onClick={() => setExpenseReceiptModal(e)}
                                  title="Xarajat cheki rasmini ko'rish yoki biriktirish"
                                >
                                  Chek ({(e.receipts || []).length})
                                </button>
                                {access.isDirector && e.status === "PENDING" && (
                                  <>
                                    <button className="btn btn-sm btn-primary" onClick={() => handleQuickExpenseAction(e.id, "approve")}>
                                      Tasdiqlash
                                    </button>
                                    <button
                                      className="btn btn-sm btn-danger"
                                      onClick={() =>
                                        setExpActionModal({
                                          expense: e,
                                          action: "reject",
                                          amount: String(e.amount || ""),
                                          description: e.description || "",
                                          reason: "",
                                        })
                                      }
                                    >
                                      Rad etish
                                    </button>
                                  </>
                                )}

                                {!access.isDirector && (e.status === "PENDING" || e.status === "REJECTED") && (
                                  <>
                                    <button
                                      className="btn btn-sm"
                                      onClick={() => openEditExpense(e)}
                                      title="Xarajat summasi, toifasi yoki tavsifini tahrirlash"
                                    >
                                      <Edit3 size={12} /> Tahrirlash
                                    </button>
                                    <button
                                      className="btn btn-sm btn-danger"
                                      onClick={() => handleQuickExpenseAction(e.id, "delete")}
                                    >
                                      O'chirish
                                    </button>
                                  </>
                                )}

                                {access.isDirector && e.status === "APPROVED" && (
                                  <button className="btn btn-sm btn-primary" onClick={() => handleQuickExpenseAction(e.id, "pay")}>
                                    To'lash
                                  </button>
                                )}

                                {access.isDirector && (e.status === "APPROVED" || e.status === "PAID") && (
                                  <>
                                    <button
                                      className="btn btn-sm"
                                      title="Summa yoki tavsifni to'g'rilash"
                                      onClick={() =>
                                        setExpActionModal({
                                          expense: e,
                                          action: "adjust",
                                          amount: String(e.amount || ""),
                                          description: e.description || "",
                                          reason: "",
                                        })
                                      }
                                    >
                                      <Edit3 size={12} /> Tahrir
                                    </button>
                                    <button
                                      className="btn btn-sm btn-danger"
                                      title="Xarajatni bekor qilish"
                                      onClick={() =>
                                        setExpActionModal({
                                          expense: e,
                                          action: "void",
                                          amount: String(e.amount || ""),
                                          description: e.description || "",
                                          reason: "",
                                        })
                                      }
                                    >
                                      <XCircle size={12} /> Bekor
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredExpenses.length === 0 && (
                        <tr>
                          <td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>
                            Tanlangan filtr bo'yicha xarajatlar topilmadi
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              </>
              )}

              {expenseSubTab === "requests" && (
                <>
                  {/* KPI Summary Cards for Expense Requests */}
                  <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                    <div
                      className="kpi-card"
                      style={{ cursor: "pointer", borderColor: reqFilter.status === "PENDING" ? "#f59e0b" : undefined }}
                      onClick={() => setReqFilter({ ...reqFilter, status: reqFilter.status === "PENDING" ? "" : "PENDING" })}
                    >
                      <div className="kpi-glow" style={{ background: "#f59e0b" }} />
                      <div style={{ fontSize: 11.5, color: "var(--text-secondary)", fontWeight: 700 }}>
                        ⏳ TASDIQ KUTILMOQDA (PENDING)
                      </div>
                      <div className="kpi-value" style={{ color: "#f59e0b" }}>
                        {access.isDirector
                          ? fmtUSD(filteredRequestKpis.pendingUsd)
                          : fmtTL(filteredRequestKpis.pendingTry)}
                      </div>
                      <div className="kpi-sub">
                        {access.isDirector && (
                          <>
                            <span>TL: <strong>{fmtTL(filteredRequestKpis.pendingTry)}</strong></span>
                            <span>•</span>
                          </>
                        )}
                        <span>{filteredRequestKpis.pendingCount} ta talabnoma</span>
                      </div>
                    </div>

                    <div
                      className="kpi-card"
                      style={{ cursor: "pointer", borderColor: reqFilter.status === "APPROVED" ? "#06b6d4" : undefined }}
                      onClick={() => setReqFilter({ ...reqFilter, status: reqFilter.status === "APPROVED" ? "" : "APPROVED" })}
                    >
                      <div className="kpi-glow" style={{ background: "#06b6d4" }} />
                      <div style={{ fontSize: 11.5, color: "var(--text-secondary)", fontWeight: 700 }}>
                        ✅ RUXSAT BERILGAN (XARID KUTMOQDA)
                      </div>
                      <div className="kpi-value" style={{ color: "#06b6d4" }}>
                        {access.isDirector
                          ? fmtUSD(filteredRequestKpis.approvedUsd)
                          : fmtTL(filteredRequestKpis.approvedTry)}
                      </div>
                      <div className="kpi-sub">
                        {access.isDirector && (
                          <>
                            <span>TL: <strong>{fmtTL(filteredRequestKpis.approvedTry)}</strong></span>
                            <span>•</span>
                          </>
                        )}
                        <span>{filteredRequestKpis.approvedCount} ta ruxsat etilgan</span>
                      </div>
                    </div>

                    <div
                      className="kpi-card"
                      style={{ cursor: "pointer", borderColor: reqFilter.status === "COMPLETED" ? "#10b981" : undefined }}
                      onClick={() => setReqFilter({ ...reqFilter, status: reqFilter.status === "COMPLETED" ? "" : "COMPLETED" })}
                    >
                      <div className="kpi-glow" style={{ background: "#10b981" }} />
                      <div style={{ fontSize: 11.5, color: "var(--text-secondary)", fontWeight: 700 }}>
                        💸 XARID QILINGAN (BAJARILGAN)
                      </div>
                      <div className="kpi-value" style={{ color: "#10b981" }}>
                        {access.isDirector
                          ? fmtUSD(filteredRequestKpis.completedUsd)
                          : fmtTL(filteredRequestKpis.completedTry)}
                      </div>
                      <div className="kpi-sub">
                        {access.isDirector && (
                          <>
                            <span>TL: <strong>{fmtTL(filteredRequestKpis.completedTry)}</strong></span>
                            <span>•</span>
                          </>
                        )}
                        <span>{filteredRequestKpis.completedCount} ta xarajatga o'tgan</span>
                      </div>
                    </div>

                    <div
                      className="kpi-card"
                      style={{ cursor: "pointer", borderColor: reqFilter.status === "REJECTED" ? "#f43f5e" : undefined }}
                      onClick={() => setReqFilter({ ...reqFilter, status: reqFilter.status === "REJECTED" ? "" : "REJECTED" })}
                    >
                      <div className="kpi-glow" style={{ background: "#f43f5e" }} />
                      <div style={{ fontSize: 11.5, color: "var(--text-secondary)", fontWeight: 700 }}>
                        ❌ RAD ETILGAN SO'ROVLAR
                      </div>
                      <div className="kpi-value" style={{ color: "#f43f5e" }}>
                        {filteredRequestKpis.rejectedCount} ta
                      </div>
                      <div className="kpi-sub">
                        <span>Jami talabnomalar: <strong>{filteredRequestKpis.totalCount} ta</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Requests Table & Filters Card */}
                  <div className="glass-card">
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 12,
                        marginBottom: 14,
                      }}
                    >
                      <div>
                        <h3 style={{ fontSize: 16, fontWeight: 800 }}>
                          📝 Xarajatga talabnomalar (Oldindan ruxsat so'rash tizimi)
                        </h3>
                        <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                          Har qanday xodim botdan yoki saytdan talabnoma kiritishi mumkin — u darhol Direktorga Telegram orqali yuboriladi
                        </p>
                      </div>
                      <button className="btn btn-primary" onClick={() => openExpenseRequestModal()}>
                        <Plus size={15} /> Yangi talabnoma yaratish
                      </button>
                    </div>

                    {/* Date Basis & Quick Period Filter Bar */}
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 12px",
                        borderRadius: 12,
                        background: "rgba(15,23,42,0.45)",
                        border: "1px solid var(--border-subtle)",
                        marginBottom: 12,
                      }}
                    >
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-secondary)", marginRight: 4 }}>
                          Sana turi:
                        </span>
                        {[
                          { id: "neededDate", label: "📅 Kerakli sanasi bo'yicha" },
                          { id: "createdDate", label: "🕒 So'ralgan vaqti bo'yicha" },
                          { id: "approvedDate", label: "✅ Tasdiqlangan vaqti bo'yicha" },
                          { id: "completedDate", label: "💸 Bajarilgan vaqti bo'yicha" },
                        ].map((df) => (
                          <button
                            key={df.id}
                            className={`btn btn-sm ${reqFilter.dateField === df.id ? "btn-primary" : ""}`}
                            onClick={() => setReqFilter({ ...reqFilter, dateField: df.id as any })}
                          >
                            {df.label}
                          </button>
                        ))}
                      </div>

                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        {(() => {
                          const todayStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
                          const yestDate = new Date(Date.now() - 86400000);
                          const yestStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(yestDate);
                          const weekDate = new Date(Date.now() - 6 * 86400000);
                          const weekStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(weekDate);
                          const monthStart = `${todayStr.slice(0, 7)}-01`;
                          return (
                            <>
                              <button
                                className={`btn btn-sm ${reqFilter.from === todayStr && reqFilter.to === todayStr ? "btn-primary" : ""}`}
                                onClick={() => setReqFilter({ ...reqFilter, from: todayStr, to: todayStr })}
                              >
                                Bugun
                              </button>
                              <button
                                className={`btn btn-sm ${reqFilter.from === yestStr && reqFilter.to === yestStr ? "btn-primary" : ""}`}
                                onClick={() => setReqFilter({ ...reqFilter, from: yestStr, to: yestStr })}
                              >
                                Kecha
                              </button>
                              <button
                                className={`btn btn-sm ${reqFilter.from === weekStr && reqFilter.to === todayStr ? "btn-primary" : ""}`}
                                onClick={() => setReqFilter({ ...reqFilter, from: weekStr, to: todayStr })}
                              >
                                Oxirgi 7 kun
                              </button>
                              <button
                                className={`btn btn-sm ${reqFilter.from === monthStart && reqFilter.to === todayStr ? "btn-primary" : ""}`}
                                onClick={() => setReqFilter({ ...reqFilter, from: monthStart, to: todayStr })}
                              >
                                Shu oy
                              </button>
                              <button
                                className={`btn btn-sm ${!reqFilter.from && !reqFilter.to ? "btn-primary" : ""}`}
                                onClick={() => setReqFilter({ ...reqFilter, from: "", to: "" })}
                              >
                                Barcha vaqt
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Filter Inputs Bar */}
                    <div className="filter-bar" style={{ marginBottom: 14 }}>
                      <input
                        className="input"
                        style={{ minWidth: 210 }}
                        placeholder="Kod (#T-1), maqsad, xodim yoki bo'lim qidirish..."
                        value={reqFilter.search}
                        onChange={(e) => setReqFilter({ ...reqFilter, search: e.target.value })}
                      />
                      <select
                        className="select"
                        value={reqFilter.status}
                        onChange={(e) => setReqFilter({ ...reqFilter, status: e.target.value })}
                      >
                        <option value="">Barcha holatlar</option>
                        <option value="PENDING">⏳ Tasdiq kutilmoqda</option>
                        <option value="APPROVED">✅ Ruxsat berilgan (Xarid kutilmoqda)</option>
                        <option value="COMPLETED">💸 Xarid qilingan (Bajarilgan)</option>
                        <option value="REJECTED">❌ Rad etilgan</option>
                      </select>
                      <select
                        className="select"
                        value={reqFilter.urgency}
                        onChange={(e) => setReqFilter({ ...reqFilter, urgency: e.target.value })}
                      >
                        <option value="">Barcha muhimlik darajasi</option>
                        <option value="URGENT">🚨 Shoshilinch (Urgent)</option>
                        <option value="NORMAL">🟢 Odatiy</option>
                      </select>
                      <select
                        className="select"
                        value={reqFilter.categoryId}
                        onChange={(e) => setReqFilter({ ...reqFilter, categoryId: e.target.value })}
                      >
                        <option value="">Barcha kategoriyalar</option>
                        {(expensesData.categories || []).map((c: any) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="date"
                          className="input"
                          value={reqFilter.from}
                          onChange={(e) => setReqFilter({ ...reqFilter, from: e.target.value })}
                        />
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                        <input
                          type="date"
                          className="input"
                          value={reqFilter.to}
                          onChange={(e) => setReqFilter({ ...reqFilter, to: e.target.value })}
                        />
                      </div>
                      {(reqFilter.status || reqFilter.urgency || reqFilter.categoryId || reqFilter.from || reqFilter.to || reqFilter.search) && (
                        <button
                          className="btn btn-sm"
                          onClick={() =>
                            setReqFilter({
                              status: "",
                              categoryId: "",
                              employeeId: "",
                              urgency: "",
                              dateField: "neededDate",
                              from: "",
                              to: "",
                              search: "",
                            })
                          }
                        >
                          Tozalash
                        </button>
                      )}
                    </div>

                    {/* Expense Requests Table */}
                    <div className="table-wrap">
                      <table className="fin-table">
                        <thead>
                          <tr>
                            <th>Kod / Muhimlik</th>
                            <th>Sanalar (Kerakli / So'raldi / Tasdiq / Xarid)</th>
                            <th>So'rovchi va Hamyon</th>
                            <th>Maqsad va Kategoriya</th>
                            <th>So'ralgan / Tasdiqlangan</th>
                            {access.isDirector && <th>USD ekvivalenti</th>}
                            <th>Holati</th>
                            <th style={{ textAlign: "right" }}>Boshqaruv amallari</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredExpenseRequests.map((r: any) => {
                            const statusBadgeMap: Record<string, { label: string; cls: string }> = {
                              PENDING: { label: "⏳ Tasdiq kutilmoqda", cls: "badge-amber" },
                              APPROVED: { label: "✅ Ruxsat berilgan", cls: "badge-cyan" },
                              COMPLETED: { label: "💸 Xarid bajarildi", cls: "badge-emerald" },
                              REJECTED: { label: "❌ Rad etilgan", cls: "badge-rose" },
                            };
                            const st = statusBadgeMap[r.status] || { label: r.status, cls: "badge-slate" };
                            const customApproved =
                              r.approvedAmountTry != null &&
                              Math.abs(Number(r.approvedAmountTry) - Number(r.amountTry)) > 0.01;
                            return (
                              <tr key={r.id}>
                                <td style={{ whiteSpace: "nowrap" }}>
                                  <div style={{ fontWeight: 800, fontSize: 13.5, color: "#a78bfa" }}>
                                    {r.requestCode}
                                  </div>
                                  <div style={{ marginTop: 4 }}>
                                    {r.urgency === "URGENT" ? (
                                      <span className="badge badge-rose" style={{ fontSize: 10, padding: "1px 6px" }}>
                                        🚨 Shoshilinch
                                      </span>
                                    ) : (
                                      <span className="badge badge-slate" style={{ fontSize: 10, padding: "1px 6px" }}>
                                        🟢 Odatiy
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td style={{ whiteSpace: "nowrap" }}>
                                  <div style={{ fontWeight: 800, fontSize: 13, color: "var(--text-primary)" }}>
                                    📅 Kerakli: {r.neededDate}
                                  </div>
                                  <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 2 }}>
                                    🕒 So'raldi: <strong>{r.createdAtText}</strong>
                                  </div>
                                  {r.approvedAtText && (
                                    <div style={{ fontSize: 11, color: "#06b6d4", marginTop: 1 }}>
                                      ✅ Tasdiq: {r.approvedAtText} ({r.approvedByName || "Rahbar"})
                                    </div>
                                  )}
                                  {r.rejectedAtText && (
                                    <div style={{ fontSize: 11, color: "#f43f5e", marginTop: 1 }}>
                                      ❌ Rad etildi: {r.rejectedAtText}
                                    </div>
                                  )}
                                  {r.completedAtText && (
                                    <div style={{ fontSize: 11, color: "#10b981", marginTop: 1 }}>
                                      💸 Xarid: {r.completedAtText}
                                    </div>
                                  )}
                                </td>
                                <td style={{ whiteSpace: "nowrap" }}>
                                  <div style={{ fontWeight: 700, fontSize: 13 }}>{r.requesterName}</div>
                                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                                    📍 {r.sourceLabel || r.employeeName}
                                  </div>
                                  {r.walletBalanceTry != null && (
                                    <div style={{ fontSize: 11, color: "#34d399", marginTop: 2 }}>
                                      💳 Hamyon: <strong>{fmtTL(r.walletBalanceTry)}</strong>
                                    </div>
                                  )}
                                </td>
                                <td>
                                  <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text-primary)" }}>
                                    {r.description}
                                  </div>
                                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 3 }}>
                                    <span className="badge badge-slate" style={{ fontSize: 10.5, padding: "1px 7px" }}>
                                      {r.categoryName || "Umumiy"}
                                    </span>
                                    {r.directorNote && (
                                      <span style={{ fontSize: 11, color: "#06b6d4", fontWeight: 600 }}>
                                        💬 Rahbar izohi: {r.directorNote}
                                      </span>
                                    )}
                                    {r.rejectionReason && (
                                      <span style={{ fontSize: 11, color: "#f43f5e", fontWeight: 600 }}>
                                        ❗ Sabab: {r.rejectionReason}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td style={{ whiteSpace: "nowrap" }}>
                                  <div
                                    style={{
                                      fontWeight: 800,
                                      fontSize: 14,
                                      color: customApproved ? "var(--text-muted)" : "#fbbf24",
                                      textDecoration: customApproved ? "line-through" : "none",
                                    }}
                                  >
                                    {fmtTL(r.amountTry)}
                                  </div>
                                  {r.approvedAmountTry != null && (
                                    <div style={{ fontWeight: 800, fontSize: 13.5, color: "#10b981", marginTop: 2 }}>
                                      ✅ Ruxsat: {fmtTL(r.approvedAmountTry)}
                                    </div>
                                  )}
                                </td>
                                {access.isDirector && (
                                  <td style={{ whiteSpace: "nowrap" }}>
                                    <div style={{ fontWeight: 800, fontSize: 13.5, color: "#06b6d4" }}>
                                      {fmtUSD(r.approvedAmountUsd ?? r.amountUsd)}
                                    </div>
                                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                                      1$ = {Number(r.usdRate || 49.63).toFixed(2)} ₺
                                    </div>
                                  </td>
                                )}
                                <td style={{ whiteSpace: "nowrap" }}>
                                  <span className={`badge ${st.cls}`}>{st.label}</span>
                                </td>
                                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                  <div style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                                    {access.isDirector && r.status === "PENDING" && (
                                      <>
                                        <button
                                          className="btn btn-sm btn-primary"
                                          onClick={() => handleQuickRequestAction(r.id, "approve")}
                                          title="So'ralgan summani darhol tasdiqlash"
                                        >
                                          ✅ Tasdiqlash
                                        </button>
                                        <button
                                          className="btn btn-sm"
                                          onClick={() =>
                                            setReqActionModal({
                                              reqItem: r,
                                              action: "approve",
                                              amount: String(r.amountTry || r.amount || ""),
                                              description: r.description || "",
                                              noteOrReason: "",
                                            })
                                          }
                                          title="Boshqa summani tasdiqlash yoki izoh yozish"
                                        >
                                          ✏️ Boshqa summa
                                        </button>
                                        <button
                                          className="btn btn-sm btn-danger"
                                          onClick={() =>
                                            setReqActionModal({
                                              reqItem: r,
                                              action: "reject",
                                              amount: String(r.amountTry || r.amount || ""),
                                              description: r.description || "",
                                              noteOrReason: "",
                                            })
                                          }
                                        >
                                          ❌ Rad etish
                                        </button>
                                      </>
                                    )}

                                    {r.status === "APPROVED" && (
                                      <button
                                        className="btn btn-sm btn-primary"
                                        style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}
                                        onClick={() =>
                                          setReqActionModal({
                                            reqItem: r,
                                            action: "complete",
                                            amount: String(r.approvedAmountTry ?? r.amountTry ?? r.amount ?? ""),
                                            description: r.description || "",
                                            noteOrReason: "",
                                            receiptBase64: null,
                                            receiptFileName: "",
                                          })
                                        }
                                      >
                                        💸 Xarid qilindi (Xarajatga o'tkazish)
                                      </button>
                                    )}

                                    {r.status === "PENDING" && (
                                      <>
                                        <button
                                          className="btn btn-sm"
                                          onClick={() => openExpenseRequestModal(r)}
                                          title="Talabnomani tahrirlash"
                                        >
                                          <Edit3 size={12} /> Tahrir
                                        </button>
                                        <button
                                          className="btn btn-sm btn-danger"
                                          onClick={() => handleQuickRequestAction(r.id, "delete")}
                                          title="Talabnomani bekor qilish / o'chirish"
                                        >
                                          O'chirish
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          {filteredExpenseRequests.length === 0 && (
                            <tr>
                              <td colSpan={8} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>
                                Tanlangan filtr bo'yicha talabnomalar topilmadi
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 5: WALLETS & MONTHLY STATEMENTS */}
          {activeTab === "wallets" && (
            <div className="animate-in">
              <div className="kpi-grid" style={{ marginBottom: 22 }}>
                {(walletsData.wallets || []).map((w: any) => {
                  const empName = `${w.employee?.firstName || ""} ${w.employee?.lastName || ""}`.trim() || "Xodim";
                  const bal = Number(w.balance || 0);
                  return (
                    <div key={w.id} className="glass-card interactive">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{empName}</div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{w.employee?.email || ""}</div>
                        </div>
                        <span className={`badge ${bal < 500 ? "badge-rose" : "badge-emerald"}`}>
                          {bal < 500 ? "Mablag' kam" : "Faol"}
                        </span>
                      </div>

                      <div className="kpi-value" style={{ color: bal < 0 ? "#fb7185" : "#34d399", marginTop: 12 }}>
                        {fmtTL(bal)}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 14 }}>
                        Tasdiqlangan (to'lanishi kutilmoqda): <strong>{fmtTL(w.pendingAmount)}</strong>
                      </div>

                      <div style={{ display: "flex", gap: 8 }}>
                        {access.isDirector && (
                          <button
                            className="btn btn-sm btn-primary"
                            style={{ flex: 1 }}
                            onClick={() =>
                              setAssignWalletModal({
                                wallet: w,
                                amount: "",
                                currency: "TRY",
                                date: new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date()),
                                description: "",
                              })
                            }
                          >
                            <Plus size={13} /> Mablag' berish
                          </button>
                        )}
                        <button className="btn btn-sm" style={{ flex: access.isDirector ? undefined : 1 }} onClick={() => openWalletTransactions(w)}>
                          <History size={13} /> Tarix
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="glass-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 800 }}>Oylik hamyon hisoboti</h3>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      Oy oxiridagi qoldiq = oy boshidagi qoldiq + berilgan mablag' − sarflangan summa + tuzatishlar
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="number"
                      className="input"
                      value={walletMonth.year}
                      onChange={(e) => setWalletMonth({ ...walletMonth, year: Number(e.target.value) })}
                      style={{ width: 90 }}
                    />
                    <select
                      className="select"
                      value={walletMonth.month}
                      onChange={(e) => setWalletMonth({ ...walletMonth, month: Number(e.target.value) })}
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <option key={m} value={m}>{m}-oy</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="table-wrap">
                  <table className="fin-table">
                    <thead>
                      <tr>
                        <th>Xodim</th>
                        <th>Oy boshi</th>
                        <th>Berilgan (+)</th>
                        <th>Sarflangan (−)</th>
                        <th>Tuzatishlar</th>
                        <th>Oy oxiri</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(walletsData.statements || []).map((st: any, idx: number) => (
                        <tr key={st.walletId || idx}>
                          <td style={{ fontWeight: 700 }}>{st.employeeName || st.employee?.fullName || "Xodim"}</td>
                          <td>{fmtTL(st.openingBalance)}</td>
                          <td style={{ color: "#34d399", fontWeight: 600 }}>+{fmtTL(st.totalAssigned)}</td>
                          <td style={{ color: "#fb7185", fontWeight: 600 }}>-{fmtTL(st.totalSpent)}</td>
                          <td style={{ color: "#22d3ee" }}>{fmtTL(st.adjustments || st.totalAdjustments || 0)}</td>
                          <td style={{ fontWeight: 800 }}>{fmtTL(st.closingBalance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: INCOME, BUDGETS & EXCHANGE RATES */}
          {activeTab === "planning" && (
            <div className="animate-in" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              {/* Income */}
              <div className="glass-card">
                <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Qo'shimcha daromadlar</h3>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 14 }}>
                  Xazina qoldig'ini shakllantiruvchi manbalar (grant, homiylik, qo'shimcha tushumlar).
                </p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    try {
                      await apiFetch("/fin-api/erp/income", {
                        method: "POST",
                        body: JSON.stringify({
                          source: fd.get("source"),
                          amount: Number(fd.get("amount")),
                          currency: fd.get("currency") || "TRY",
                          officeId: fd.get("officeId") || incomeData.offices?.[0]?.id,
                          incomeDate: fd.get("incomeDate") || new Date().toISOString().slice(0, 10),
                          description: fd.get("description") || "",
                        }),
                      });
                      notify("Daromad qo'shildi!");
                      (e.target as HTMLFormElement).reset();
                      loadPlanning();
                      loadOverview();
                    } catch (err: any) {
                      notify(err.message, "err");
                    }
                  }}
                  style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}
                >
                  <input name="source" className="input" placeholder="Manba nomi (masalan: Xazina kiritmasi)" required />
                  <input name="amount" type="number" step="0.01" className="input" placeholder="Summa (₺)" required />
                  <select name="officeId" className="select">
                    {(incomeData.offices || []).map((o: any) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                  <button type="submit" className="btn btn-primary">+ Daromad qo'shish</button>
                </form>

                <div className="table-wrap">
                  <table className="fin-table">
                    <thead>
                      <tr>
                        <th>Sana</th>
                        <th>Manba</th>
                        <th>Summa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(incomeData.items || []).map((inc: any) => (
                        <tr key={inc.id}>
                          <td>{String(inc.incomeDate || inc.createdAt || "").slice(0, 10)}</td>
                          <td>{inc.source || inc.description || "Daromad"}</td>
                          <td style={{ color: "#34d399", fontWeight: 700 }}>+{fmtTL(inc.amountInDefault || inc.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Exchange Rates & Budgets */}
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div className="glass-card">
                  <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Valyuta kurslari (Turk lirasiga nisbatan)</h3>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 14 }}>
                    Chet el valyutasida (AQSH dollari, Yevro) amal bajarish uchun joriy valyuta kursini kiriting.
                  </p>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      try {
                        await apiFetch("/fin-api/erp/currencies", {
                          method: "POST",
                          body: JSON.stringify({
                            fromCurrency: fd.get("fromCurrency"),
                            toCurrency: "TRY",
                            rate: Number(fd.get("rate")),
                            effectiveDate: new Date().toISOString().slice(0, 10),
                          }),
                        });
                        notify("Valyuta kursi saqlandi!");
                        (e.target as HTMLFormElement).reset();
                        loadPlanning();
                      } catch (err: any) {
                        notify(err.message, "err");
                      }
                    }}
                    style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}
                  >
                    <select name="fromCurrency" className="select">
                      <option value="USD">USD ($) → TRY (₺)</option>
                      <option value="EUR">EUR (€) → TRY (₺)</option>
                      <option value="UZS">UZS (so'm) → TRY (₺)</option>
                    </select>
                    <input name="rate" type="number" step="0.0001" className="input" placeholder="Kurs (masalan: 34.50)" required />
                    <button type="submit" className="btn btn-cyan">Kursni saqlash</button>
                  </form>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(currenciesData.items || []).map((c: any) => (
                      <span key={c.id} className="badge badge-cyan" style={{ fontSize: 12.5, padding: "6px 10px" }}>
                        1 {c.fromCurrency} = {Number(c.rate).toLocaleString("tr-TR")} ₺
                      </span>
                    ))}
                  </div>
                </div>

                <div className="glass-card">
                  <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Oylik toifa byudjetlari</h3>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 14 }}>
                    Sarflangan mablag' to'langan xarajatlardan avtomatik ravishda hisoblanadi.
                  </p>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      const now = new Date();
                      try {
                        await apiFetch("/fin-api/erp/budgets", {
                          method: "POST",
                          body: JSON.stringify({
                            categoryId: fd.get("categoryId"),
                            amount: Number(fd.get("amount")),
                            month: now.getMonth() + 1,
                            year: now.getFullYear(),
                          }),
                        });
                        notify("Byudjet saqlandi!");
                        loadPlanning();
                      } catch (err: any) {
                        notify(err.message, "err");
                      }
                    }}
                    style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}
                  >
                    <select name="categoryId" className="select" required>
                      {(budgetsData.categories || []).map((c: any) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <input name="amount" type="number" className="input" placeholder="Oylik cheklov (₺)" required />
                    <button type="submit" className="btn btn-primary">+ Byudjet</button>
                  </form>

                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {(budgetsData.items || []).map((b: any) => {
                      const limit = Number(b.amount || 0);
                      const spent = Number(b.spent || 0);
                      const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
                      return (
                        <div key={b.id} style={{ fontSize: 13 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <strong>{b.category?.name || "Toifa"} ({b.month}/{b.year})</strong>
                            <span>{fmtTL(spent)} / {fmtTL(limit)} ({pct}%)</span>
                          </div>
                          <div className="progress-track">
                            <div
                              className="progress-fill"
                              style={{
                                width: `${Math.min(100, pct)}%`,
                                background: pct >= 100 ? "#f43f5e" : pct >= 80 ? "#f59e0b" : "#10b981",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: UNIFIED CASHFLOW REPORTS */}
          {activeTab === "reports" && (
            <div className="animate-in glass-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800 }}>Umumiy pul oqimi hisoboti</h2>
                  <p style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                    Davr: {dateRange.from} — {dateRange.to} • Barcha talaba to'lovlari, qo'shimcha daromadlar va to'langan xarajatlar
                  </p>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <a
                    href={`/fin-api/reports/cashflow?from=${dateRange.from}&to=${dateRange.to}&format=csv`}
                    className="btn"
                    download
                  >
                    <Download size={15} /> Jadval (CSV) yuklab olish
                  </a>
                  <a
                    href={`/fin-api/reports/cashflow?from=${dateRange.from}&to=${dateRange.to}&format=xlsx`}
                    className="btn btn-primary"
                    download
                  >
                    <FileSpreadsheet size={15} /> Excel yuklab olish
                  </a>
                </div>
              </div>

              <div className="kpi-grid" style={{ marginBottom: 18 }}>
                <div className="kpi-card">
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>DAVR KIRIMI</div>
                  <div className="kpi-value" style={{ color: "#10b981" }}>+{fmtUSD(reportData.totalInflow)}</div>
                </div>
                <div className="kpi-card">
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>DAVR CHIQIMI</div>
                  <div className="kpi-value" style={{ color: "#f43f5e" }}>-{fmtUSD(reportData.totalOutflow)}</div>
                  {reportData.totalOutflowTl > 0 && (
                    <div className="kpi-sub">Asl summasi: {fmtTL(reportData.totalOutflowTl)}</div>
                  )}
                </div>
                <div className="kpi-card">
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>SOF FARQ</div>
                  <div className="kpi-value" style={{ color: "#06b6d4" }}>{fmtUSD(reportData.netFlow)}</div>
                </div>
              </div>

              <div className="table-wrap">
                <table className="fin-table">
                  <thead>
                    <tr>
                      <th>Raqam</th>
                      <th>Sana</th>
                      <th>Bo'lim</th>
                      <th>Yo'nalish</th>
                      <th>Toifa</th>
                      <th>Talaba / Xodim</th>
                      <th>Guruh / Filial</th>
                      <th>To'lov usuli</th>
                      <th>Summa ($)</th>
                      <th>Izoh</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reportData.rows || []).map((r: any) => (
                      <tr key={r.id}>
                        <td>{r.id}</td>
                        <td>{r.date}</td>
                        <td>
                          <span className={`badge ${r.system === "CRM" ? "badge-emerald" : "badge-cyan"}`}>
                            {r.system === "CRM" ? "O'quv markazi" : "Moliya"}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${r.direction === "INFLOW" ? "badge-emerald" : "badge-rose"}`}>
                            {r.direction === "INFLOW" ? "Kirim (+)" : "Chiqim (−)"}
                          </span>
                        </td>
                        <td>{r.category}</td>
                        <td style={{ fontWeight: 600 }}>{r.counterparty}</td>
                        <td>{r.groupOrDept}</td>
                        <td>{METHOD_MAP[r.method]?.label || r.method}</td>
                        <td style={{ fontWeight: 800, color: r.direction === "INFLOW" ? "#10b981" : "#f43f5e" }}>
                          <div>{r.direction === "INFLOW" ? "+" : "-"}{fmtUSD(r.amountUsd ?? r.amount)}</div>
                          {r.amountTl && (
                            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)" }}>
                              Asl: {fmtTL(r.amountTl)} (1$ = {Number(r.usdRate || 49.63).toFixed(2)} ₺)
                            </div>
                          )}
                        </td>
                        <td>{r.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MODAL: RECORD PAYMENT / SET DUE DATE */}
      {paymentModal && (
        <div className="modal-backdrop" onClick={() => setPaymentModal(null)}>
          <div className="modal-box animate-in" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800 }}>
                {paymentModal.onlyDueDate ? "To'lov muddatini belgilash" : "Talaba to'lovini qabul qilish"}
              </h3>
              <button className="btn btn-sm" onClick={() => setPaymentModal(null)}><X size={15} /></button>
            </div>

            <form onSubmit={submitPaymentModal} className="form-grid">
              <div className="form-field full">
                <label className="form-label">Talabani tanlang</label>
                <input
                  className="input"
                  placeholder="Talaba ismini yozib qidiring..."
                  value={paymentModal.studentSearch}
                  onChange={(e) => setPaymentModal({ ...paymentModal, studentSearch: e.target.value })}
                  style={{ marginBottom: 6 }}
                />
                <select
                  className="select"
                  value={paymentModal.studentId}
                  onChange={(e) => {
                    const st = studentsList.find((x) => String(x.id) === e.target.value);
                    setPaymentModal({
                      ...paymentModal,
                      studentId: e.target.value,
                      nextDueDate: st?.paidUntilDate ? String(st.paidUntilDate).slice(0, 10) : paymentModal.nextDueDate,
                      plannedPayment: st?.plannedPayment ? String(st.plannedPayment) : paymentModal.plannedPayment,
                    });
                  }}
                  required
                >
                  <option value="">— Talabani tanlang —</option>
                  {studentsList
                    .filter((s) => {
                      const isArchivedOrInactive = Boolean(s.isArchived || !s.isActive || s.isDeleted);
                      if (!paymentModal.studentSearch) {
                        return !isArchivedOrInactive || String(s.id) === String(paymentModal.studentId);
                      }
                      return (
                        String(s.id) === String(paymentModal.studentId) ||
                        s.fullname?.toLowerCase().includes(paymentModal.studentSearch.toLowerCase())
                      );
                    })
                    .slice(0, 120)
                    .map((s) => {
                      const isArch = Boolean(s.isArchived || !s.isActive || s.isDeleted);
                      return (
                        <option key={s.id} value={s.id}>
                          {s.fullname} ({s.group?.name || "Guruhsiz"}){isArch ? " [Arxiv]" : ""} — Qarz: {fmtUSD(s.remainingAmount)}
                        </option>
                      );
                    })}
                </select>
              </div>

              {!paymentModal.onlyDueDate && (
                <>
                  <div className="form-field">
                    <label className="form-label">To'lov summasi ($)</label>
                    <input
                      type="number"
                      min="1"
                      className="input"
                      value={paymentModal.amount}
                      onChange={(e) => setPaymentModal({ ...paymentModal, amount: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label className="form-label">To'lov usuli</label>
                    <select
                      className="select"
                      value={paymentModal.paymentMethod}
                      onChange={(e) => setPaymentModal({ ...paymentModal, paymentMethod: e.target.value })}
                    >
                      <option value="naqt">Naqd pul</option>
                      <option value="karta">Bank kartasi</option>
                      <option value="otkazma">O'tkazma</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label className="form-label">Haqiqiy to'lov sanasi</label>
                    <input
                      type="date"
                      className="input"
                      value={paymentModal.paidAt}
                      onChange={(e) => setPaymentModal({ ...paymentModal, paidAt: e.target.value })}
                      required
                    />
                  </div>
                </>
              )}

              <div className="form-field">
                <label className="form-label">Keyingi to'lov muddati</label>
                <input
                  type="date"
                  className="input"
                  value={paymentModal.nextDueDate}
                  onChange={(e) => setPaymentModal({ ...paymentModal, nextDueDate: e.target.value })}
                />
              </div>

              <div className="form-field">
                <label className="form-label">Keyingi muddatda kutilayotgan summa ($)</label>
                <input
                  type="number"
                  className="input"
                  placeholder="Ixtiyoriy"
                  value={paymentModal.plannedPayment}
                  onChange={(e) => setPaymentModal({ ...paymentModal, plannedPayment: e.target.value })}
                />
              </div>

              <div className="form-field full">
                <label className="form-label">Izoh</label>
                <input
                  className="input"
                  placeholder="To'lov yoki muddat bo'yicha izoh..."
                  value={paymentModal.note}
                  onChange={(e) => setPaymentModal({ ...paymentModal, note: e.target.value })}
                />
              </div>

              <div className="form-field full" style={{ display: "flex", flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                <button type="button" className="btn" onClick={() => setPaymentModal(null)}>Bekor qilish</button>
                <button type="submit" className="btn btn-primary">Saqlash</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: VOID STUDENT PAYMENT */}
      {voidPayModal && (
        <div className="modal-backdrop" onClick={() => setVoidPayModal(null)}>
          <div className="modal-box animate-in" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>To'lovni bekor qilish</h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 14 }}>
              Talaba: <strong>{voidPayModal.payment.student?.fullname}</strong> • Summa: <strong>{fmtUSD(voidPayModal.payment.amount)}</strong>.
              Qayd daftardan o'chib ketmaydi, sababi bilan bekor qilingan holatga o'tadi va talaba qarzi qayta hisoblanadi.
            </p>
            <form onSubmit={submitVoidPayment} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                className="input"
                placeholder="Bekor qilish sababini kiriting (majburiy)..."
                value={voidPayModal.reason}
                onChange={(e) => setVoidPayModal({ ...voidPayModal, reason: e.target.value })}
                required
                autoFocus
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button type="button" className="btn" onClick={() => setVoidPayModal(null)}>Yopish</button>
                <button type="submit" className="btn btn-danger">Tasdiqlash va bekor qilish</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: STUDENT PAYMENT HISTORY */}
      {studentHistoryModal && (
        <div className="modal-backdrop" onClick={() => setStudentHistoryModal(null)}>
          <div className="modal-box wide animate-in" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <StudentAvatar student={studentHistoryModal} size={46} />
                <div>
                  <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>{studentHistoryModal.fullname} — To'lovlar tarixi</h3>
                  <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
                    Shartnoma: {fmtUSD(studentHistoryModal.totalPayment)} • To'langan: {fmtUSD(studentHistoryModal.paidAmount)} • Qolgan qarz: {fmtUSD(studentHistoryModal.remainingAmount)}
                  </p>
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => setStudentHistoryModal(null)}><X size={15} /></button>
            </div>
            <div className="table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Raqam</th>
                    <th>Sana</th>
                    <th>To'lov usuli</th>
                    <th>Summa</th>
                    <th>Qabul qildi</th>
                    <th>Izoh / Holati</th>
                    <th>Amal</th>
                  </tr>
                </thead>
                <tbody>
                  {(studentHistoryModal.payments || []).map((p: any) => {
                    const isVoid = Boolean(p.voidedAt);
                    return (
                      <tr key={p.id} style={{ opacity: isVoid ? 0.55 : 1 }}>
                        <td>#{p.id}</td>
                        <td>{String(p.paidAt || "").slice(0, 10)}</td>
                        <td>{METHOD_MAP[p.method]?.label || p.method}</td>
                        <td style={{ fontWeight: 700, textDecoration: isVoid ? "line-through" : "none" }}>{fmtUSD(p.amount)}</td>
                        <td>{p.receivedByName || (p.source === "LEGACY" ? "Avvalgi qayd" : p.source)}</td>
                        <td>{isVoid ? `BEKOR QILINGAN: ${p.voidReason}` : p.note || "—"}</td>
                        <td>
                          {!isVoid && (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <button
                                className="btn btn-sm"
                                onClick={() => setReceiptPrintModal({ ...p, student: studentHistoryModal })}
                              >
                                🖨️ Kvitansiya
                              </button>
                              {access.isDirector && (
                                <button
                                  className="btn btn-sm btn-danger"
                                  onClick={() => setVoidPayModal({ payment: { ...p, student: studentHistoryModal }, reason: "" })}
                                >
                                  Bekor qilish
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NEW / EDIT EXPENSE */}
      {newExpenseModal && (
        <div className="modal-backdrop" onClick={() => setNewExpenseModal(null)}>
          <div className="modal-box animate-in" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800 }}>
                {newExpenseModal.id ? "✏️ Xarajatni tahrirlash" : "Yangi xarajat qo'shish"}
              </h3>
              <button className="btn btn-sm" onClick={() => setNewExpenseModal(null)}><X size={15} /></button>
            </div>
            <form onSubmit={submitNewExpense} className="form-grid">
              {access.isDirector && !newExpenseModal.id && (
                <div className="form-field">
                  <label className="form-label">Xodim (Hamyon egasi)</label>
                  <select
                    className="select"
                    value={newExpenseModal.employeeId || ""}
                    onChange={(e) => setNewExpenseModal({ ...newExpenseModal, employeeId: e.target.value })}
                    required
                  >
                    {(expensesData.employees || []).map((emp: any) => (
                      <option key={emp.id} value={emp.id}>{emp.fullName} (@{emp.username})</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-field">
                <label className="form-label">Xarajat toifasi</label>
                <select
                  className="select"
                  value={newExpenseModal.categoryId}
                  onChange={(e) => setNewExpenseModal({ ...newExpenseModal, categoryId: e.target.value })}
                  required
                >
                  <option value="">— Tanlang —</option>
                  {(expensesData.categories || []).map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Summa</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  value={newExpenseModal.amount}
                  onChange={(e) => setNewExpenseModal({ ...newExpenseModal, amount: e.target.value })}
                  required
                />
              </div>
              <div className="form-field">
                <label className="form-label">Valyuta</label>
                <select
                  className="select"
                  value={newExpenseModal.currency}
                  onChange={(e) => setNewExpenseModal({ ...newExpenseModal, currency: e.target.value })}
                >
                  <option value="TRY">Turk lirasi (₺)</option>
                  <option value="USD">AQSH dollari ($)</option>
                  <option value="EUR">Yevro (€)</option>
                </select>
              </div>
              <div className="form-field full">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 6 }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>
                    📅 Asl xarajat qilingan sana (kecha yoki oldin qilingan bo'lsa o'sha sanani tanlang)
                  </label>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[
                      { label: "Bugun", offsetDays: 0 },
                      { label: "Kecha", offsetDays: 1 },
                      { label: "2 kun oldin", offsetDays: 2 },
                    ].map((btn) => {
                      const d = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(
                        new Date(Date.now() - btn.offsetDays * 86400 * 1000)
                      );
                      return (
                        <button
                          key={btn.label}
                          type="button"
                          className={`btn btn-sm ${newExpenseModal.expenseDate === d ? "btn-primary" : ""}`}
                          style={{ padding: "2px 8px", fontSize: 11 }}
                          onClick={() => setNewExpenseModal({ ...newExpenseModal, expenseDate: d })}
                        >
                          {btn.label} ({d.slice(5)})
                        </button>
                      );
                    })}
                  </div>
                </div>
                <input
                  type="date"
                  className="input"
                  value={newExpenseModal.expenseDate}
                  onChange={(e) => setNewExpenseModal({ ...newExpenseModal, expenseDate: e.target.value })}
                  required
                />
                <span style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 3 }}>
                  🕒 Tizimga kiritilgan vaqt (bugun, hozirgi soat) bazada alohida <strong>Kiritilgan sana</strong> sifatida avtomatik saqlanadi.
                </span>
              </div>
              <div className="form-field full">
                <label className="form-label">Tavsif</label>
                <input
                  className="input"
                  placeholder="Xarajat maqsadi..."
                  value={newExpenseModal.description}
                  onChange={(e) => setNewExpenseModal({ ...newExpenseModal, description: e.target.value })}
                  required
                />
              </div>
              <div className="form-field full">
                <label className="form-label">Chek rasmi (ixtiyoriy)</label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="input"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) {
                      setNewExpenseModal({ ...newExpenseModal, receiptFile: null });
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      setNewExpenseModal({
                        ...newExpenseModal,
                        receiptFile: {
                          fileName: file.name,
                          mimeType: file.type || "image/jpeg",
                          dataUrl: String(reader.result || ""),
                        },
                      });
                    };
                    reader.readAsDataURL(file);
                  }}
                />
                {newExpenseModal.receiptFile && (
                  <span style={{ fontSize: 11.5, color: "#34d399" }}>
                    ✅ Biriktirildi: {newExpenseModal.receiptFile.fileName}
                  </span>
                )}
              </div>
              <div className="form-field full" style={{ display: "flex", flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
                <button type="button" className="btn" onClick={() => setNewExpenseModal(null)}>Bekor qilish</button>
                <button type="submit" className="btn btn-primary">Saqlash</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DIRECTOR EXPENSE ADJUST / VOID / REJECT */}
      {expActionModal && (
        <div className="modal-backdrop" onClick={() => setExpActionModal(null)}>
          <div className="modal-box animate-in" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>
              {expActionModal.action === "adjust"
                ? "Rahbar: Xarajatni to'g'rilash"
                : expActionModal.action === "void"
                ? "Rahbar: Xarajatni bekor qilish"
                : "Xarajatni rad etish"}
            </h3>
            <p style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 14 }}>
              Xarajat: <strong>{expActionModal.expense.description}</strong> ({fmtTL(expActionModal.expense.amountInDefault || expActionModal.expense.amount)})
            </p>
            <form onSubmit={submitExpActionModal} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {expActionModal.action === "adjust" && (
                <>
                  <div className="form-field">
                    <label className="form-label">Yangi summa (₺)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="input"
                      value={expActionModal.amount}
                      onChange={(e) => setExpActionModal({ ...expActionModal, amount: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label className="form-label">Tavsif</label>
                    <input
                      className="input"
                      value={expActionModal.description}
                      onChange={(e) => setExpActionModal({ ...expActionModal, description: e.target.value })}
                    />
                  </div>
                </>
              )}
              <div className="form-field">
                <label className="form-label">Sabab (majburiy — tarix va hamyon qaydiga yoziladi)</label>
                <input
                  className="input"
                  placeholder="Sababni kiriting..."
                  value={expActionModal.reason}
                  onChange={(e) => setExpActionModal({ ...expActionModal, reason: e.target.value })}
                  required
                  autoFocus
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button type="button" className="btn" onClick={() => setExpActionModal(null)}>Yopish</button>
                <button type="submit" className="btn btn-primary">Tasdiqlash</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT EXPENSE REQUEST (TALABNOMA) */}
      {expenseRequestModal && (
        <div className="modal-backdrop" onClick={() => setExpenseRequestModal(null)}>
          <div className="modal-box animate-in" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>
              {expenseRequestModal.id
                ? "📝 Talabnomani tahrirlash"
                : "📝 Xarajatga yangi talabnoma (Direktordan ruxsat so'rash)"}
            </h3>
            <p style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 14 }}>
              Talabnoma saqlangach, u darhol Direktorga Telegram bot orqali yuboriladi. Tasdiqlangach hamyondan xarid qilinadi.
            </p>
            <form onSubmit={submitExpenseRequestModal} className="form-grid">
              {access.isDirector ? (
                <div className="form-field">
                  <label className="form-label">So'rovchi xodim / Hamyon</label>
                  <select
                    className="select"
                    value={expenseRequestModal.employeeId || ""}
                    onChange={(e) => setExpenseRequestModal({ ...expenseRequestModal, employeeId: e.target.value })}
                    required
                  >
                    {(expensesData.wallets || []).map((w: any) => (
                      <option key={w.employeeId} value={w.employeeId}>
                        {w.employee?.firstName} {w.employee?.lastName} ({fmtTL(w.balance)})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="form-field">
                  <label className="form-label">Mas'ul xodim</label>
                  <input className="input" value={access.sourceLabel || access.accountName} disabled />
                </div>
              )}

              <div className="form-field">
                <label className="form-label">Kategoriya (Toifa)</label>
                <select
                  className="select"
                  value={expenseRequestModal.categoryId}
                  onChange={(e) => setExpenseRequestModal({ ...expenseRequestModal, categoryId: e.target.value })}
                  required
                >
                  {(expensesData.categories || []).map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label className="form-label">So'ralayotgan summa</label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  className="input"
                  placeholder="Masalan: 1500"
                  value={expenseRequestModal.amount}
                  onChange={(e) => setExpenseRequestModal({ ...expenseRequestModal, amount: e.target.value })}
                  required
                  autoFocus
                />
              </div>

              <div className="form-field">
                <label className="form-label">Valyuta</label>
                <select
                  className="select"
                  value={expenseRequestModal.currency || "TRY"}
                  onChange={(e) => setExpenseRequestModal({ ...expenseRequestModal, currency: e.target.value })}
                >
                  <option value="TRY">Turk lirasi (₺ / TL)</option>
                  <option value="USD">AQSH dollari ($ / USD)</option>
                  <option value="EUR">Yevro (€)</option>
                </select>
              </div>

              <div className="form-field">
                <label className="form-label">📅 Qachonga kerak (Kerakli sana)</label>
                <input
                  type="date"
                  className="input"
                  value={expenseRequestModal.neededDate}
                  onChange={(e) => setExpenseRequestModal({ ...expenseRequestModal, neededDate: e.target.value })}
                  required
                />
              </div>

              <div className="form-field">
                <label className="form-label">Muhimlik darajasi</label>
                <select
                  className="select"
                  value={expenseRequestModal.urgency}
                  onChange={(e) =>
                    setExpenseRequestModal({
                      ...expenseRequestModal,
                      urgency: e.target.value === "URGENT" ? "URGENT" : "NORMAL",
                    })
                  }
                >
                  <option value="NORMAL">🟢 Odatiy</option>
                  <option value="URGENT">🚨 Shoshilinch (Urgent)</option>
                </select>
              </div>

              <div className="form-field full">
                <label className="form-label">Maqsad va asosnoma (nima uchun kerak?)</label>
                <input
                  className="input"
                  placeholder="Masalan: Oshxonaga 2 qop un va yog' olish uchun..."
                  value={expenseRequestModal.description}
                  onChange={(e) => setExpenseRequestModal({ ...expenseRequestModal, description: e.target.value })}
                  required
                />
              </div>

              <div className="form-field full" style={{ display: "flex", flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
                <button type="button" className="btn" onClick={() => setExpenseRequestModal(null)}>
                  Bekor qilish
                </button>
                <button type="submit" className="btn btn-primary">
                  {expenseRequestModal.id ? "Saqlash" : "📩 Direktorga yuborish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EXPENSE REQUEST APPROVE / REJECT / COMPLETE PURCHASE */}
      {reqActionModal && (
        <div className="modal-backdrop" onClick={() => setReqActionModal(null)}>
          <div className="modal-box animate-in" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>
              {reqActionModal.action === "approve"
                ? `✅ Talabnomani tasdiqlash (${reqActionModal.reqItem.requestCode})`
                : reqActionModal.action === "reject"
                ? `❌ Talabnomani rad etish (${reqActionModal.reqItem.requestCode})`
                : `💸 Xarid qilindi — Haqiqiy xarajatga o'tkazish (${reqActionModal.reqItem.requestCode})`}
            </h3>
            <p style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 14 }}>
              So'rovchi: <strong>{reqActionModal.reqItem.requesterName}</strong> • Maqsad:{" "}
              <strong>{reqActionModal.reqItem.description}</strong> ({fmtTL(reqActionModal.reqItem.amountTry)})
            </p>
            <form onSubmit={submitReqActionModal} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(reqActionModal.action === "approve" || reqActionModal.action === "complete") && (
                <div className="form-field">
                  <label className="form-label">
                    {reqActionModal.action === "approve"
                      ? "Tasdiqlanayotgan summa (₺) — o'zgartirish mumkin"
                      : "Amalda sarflangan haqiqiy summa (₺)"}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="input"
                    value={reqActionModal.amount}
                    onChange={(e) => setReqActionModal({ ...reqActionModal, amount: e.target.value })}
                    required
                    autoFocus
                  />
                </div>
              )}

              {reqActionModal.action === "complete" && (
                <>
                  <div className="form-field">
                    <label className="form-label">Xarajat tavsifi</label>
                    <input
                      className="input"
                      value={reqActionModal.description}
                      onChange={(e) => setReqActionModal({ ...reqActionModal, description: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label className="form-label">📸 Chek rasmi (ixtiyoriy)</label>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="input"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) {
                          setReqActionModal({ ...reqActionModal, receiptBase64: null, receiptFileName: "" });
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => {
                          setReqActionModal({
                            ...reqActionModal,
                            receiptBase64: String(reader.result || ""),
                            receiptFileName: file.name,
                          });
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                    {reqActionModal.receiptFileName && (
                      <span style={{ fontSize: 11.5, color: "#34d399" }}>
                        ✅ Chek biriktirildi: {reqActionModal.receiptFileName}
                      </span>
                    )}
                  </div>
                </>
              )}

              {reqActionModal.action !== "complete" && (
                <div className="form-field">
                  <label className="form-label">
                    {reqActionModal.action === "approve"
                      ? "Rahbar izohi (ixtiyoriy — xodimga Telegramdan boradi)"
                      : "Rad etish sababi (majburiy — xodimga Telegramdan boradi)"}
                  </label>
                  <input
                    className="input"
                    placeholder={
                      reqActionModal.action === "approve"
                        ? "Masalan: Chekini albatta oling..."
                        : "Rad etish sababini yozing..."
                    }
                    value={reqActionModal.noteOrReason}
                    onChange={(e) => setReqActionModal({ ...reqActionModal, noteOrReason: e.target.value })}
                    required={reqActionModal.action === "reject"}
                    autoFocus={reqActionModal.action === "reject"}
                  />
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
                <button type="button" className="btn" onClick={() => setReqActionModal(null)}>
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className={`btn ${reqActionModal.action === "reject" ? "btn-danger" : "btn-primary"}`}
                >
                  {reqActionModal.action === "approve"
                    ? "✅ Tasdiqlash"
                    : reqActionModal.action === "reject"
                    ? "❌ Rad etish"
                    : "💸 Xarajatga o'tkazish va hamyondan yechish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ASSIGN FUNDS TO WALLET */}
      {assignWalletModal && (
        <div className="modal-backdrop" onClick={() => setAssignWalletModal(null)}>
          <div className="modal-box animate-in" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 10 }}>
              Hamyonga mablag' berish — {assignWalletModal.wallet.employee?.firstName} {assignWalletModal.wallet.employee?.lastName}
            </h3>
            <form onSubmit={submitAssignWallet} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
                <div className="form-field">
                  <label className="form-label">Summa</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    className="input"
                    value={assignWalletModal.amount}
                    onChange={(e) => setAssignWalletModal({ ...assignWalletModal, amount: e.target.value })}
                    required
                    autoFocus
                  />
                </div>
                <div className="form-field">
                  <label className="form-label">Valyuta</label>
                  <select
                    className="select"
                    value={assignWalletModal.currency}
                    onChange={(e) => setAssignWalletModal({ ...assignWalletModal, currency: e.target.value })}
                  >
                    <option value="TRY">₺ (TL)</option>
                    <option value="USD">$ (USD)</option>
                  </select>
                </div>
              </div>

              <div className="form-field">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 6 }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>
                    📅 Mablag' berilgan sana (orqa sana bilan ham kiritish mumkin)
                  </label>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[
                      { label: "Bugun", offsetDays: 0 },
                      { label: "Kecha", offsetDays: 1 },
                      { label: "2 kun oldin", offsetDays: 2 },
                    ].map((btn) => {
                      const d = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(
                        new Date(Date.now() - btn.offsetDays * 86400 * 1000)
                      );
                      return (
                        <button
                          key={btn.label}
                          type="button"
                          className={`btn btn-sm ${assignWalletModal.date === d ? "btn-primary" : ""}`}
                          style={{ padding: "2px 8px", fontSize: 11 }}
                          onClick={() => setAssignWalletModal({ ...assignWalletModal, date: d })}
                        >
                          {btn.label} ({d.slice(5)})
                        </button>
                      );
                    })}
                  </div>
                </div>
                <input
                  type="date"
                  className="input"
                  value={assignWalletModal.date}
                  onChange={(e) => setAssignWalletModal({ ...assignWalletModal, date: e.target.value })}
                  required
                />
                <span style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 3 }}>
                  🕒 Amalda pul berilgan sanani tanlang (masalan: kecha yoki o'tgan oy). Tizimga kiritilgan vaqt alohida saqlanadi.
                </span>
              </div>

              <div className="form-field">
                <label className="form-label">Izoh</label>
                <input
                  className="input"
                  placeholder="Masalan: Oylik ishchi mablag'"
                  value={assignWalletModal.description}
                  onChange={(e) => setAssignWalletModal({ ...assignWalletModal, description: e.target.value })}
                  required
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button type="button" className="btn" onClick={() => setAssignWalletModal(null)}>Bekor qilish</button>
                <button type="submit" className="btn btn-primary">O'tkazish</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: WALLET TRANSACTIONS */}
      {walletTxModal && (
        <div className="modal-backdrop" onClick={() => setWalletTxModal(null)}>
          <div className="modal-box wide animate-in" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800 }}>
                {walletTxModal.wallet.employee?.firstName} {walletTxModal.wallet.employee?.lastName} — Hamyon amaliyotlari
              </h3>
              <button className="btn btn-sm" onClick={() => setWalletTxModal(null)}><X size={15} /></button>
            </div>
            <div className="table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Sana (Amaliyot / Kiritildi)</th>
                    <th>Amaliyot turi</th>
                    <th>Summa</th>
                    <th>Tavsif</th>
                  </tr>
                </thead>
                <tbody>
                  {walletTxModal.items.map((tx: any) => {
                    const occD = tx.occurredDate || String(tx.occurredAt || tx.createdAt || "").slice(0, 10);
                    const crtD = tx.createdDate || String(tx.createdAt || "").slice(0, 10);
                    const crtTxt = tx.createdAtText || (tx.createdAt ? String(tx.createdAt).slice(0, 16).replace("T", " ") : occD);
                    const isBackdated = occD && crtD && occD !== crtD;
                    return (
                      <tr key={tx.id}>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontWeight: 800, fontSize: 13 }}>📅 {occD}</span>
                            {isBackdated && (
                              <span
                                className="badge badge-amber"
                                style={{ fontSize: 9.5, padding: "1px 6px" }}
                                title={`Asl amaliyot ${occD} sanasida bo'lgan, tizimga ${crtD} da kiritilgan`}
                              >
                                Orqa sana bilan
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                            🕒 Kiritildi: {crtTxt}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              tx.type === "ASSIGNMENT"
                                ? "badge-emerald"
                                : tx.type === "ADJUSTMENT"
                                ? "badge-cyan"
                                : "badge-rose"
                            }`}
                          >
                            {tx.type === "ASSIGNMENT"
                              ? "Mablag' berildi (+)"
                              : tx.type === "ADJUSTMENT"
                              ? "Qayta hisoblash"
                              : tx.type === "EXPENSE" || tx.type === "EXPENSE_DEBIT"
                              ? "Xarajat (−)"
                              : tx.type}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700 }}>{fmtTL(tx.amountInDefault || tx.amount)}</td>
                        <td>{tx.description || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PRINTABLE PAYMENT RECEIPT (To'lov kvitansiyasi) */}
      {receiptPrintModal && (
        <div className="modal-backdrop" onClick={() => setReceiptPrintModal(null)}>
          <div className="modal-box animate-in" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800 }}>🧾 Rasmiy to'lov kvitansiyasi</h3>
              <button className="btn btn-sm" onClick={() => setReceiptPrintModal(null)}><X size={15} /></button>
            </div>

            <div
              id="printable-receipt"
              style={{
                padding: 20,
                borderRadius: 12,
                background: "var(--bg-surface-elevated)",
                border: "1px dashed rgba(16, 185, 129, 0.55)",
                marginBottom: 16,
              }}
            >
              <div style={{ textAlign: "center", borderBottom: "1px solid var(--border-subtle)", paddingBottom: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#34d399" }}>MEZANA O'QUV MARKAZI</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                  To'lov kvitansiyasi № {receiptPrintModal.id}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 13.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Talaba F.I.Sh.:</span>
                  <strong>{receiptPrintModal.student?.fullname || `Talaba #${receiptPrintModal.studentId}`}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Guruh:</span>
                  <strong>{receiptPrintModal.student?.group?.name || "—"}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-secondary)" }}>To'lov sanasi:</span>
                  <strong>{String(receiptPrintModal.paidAt || "").slice(0, 10)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-secondary)" }}>To'lov usuli:</span>
                  <strong>{METHOD_MAP[receiptPrintModal.method]?.label || receiptPrintModal.method}</strong>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "rgba(16, 185, 129, 0.14)",
                    marginTop: 4,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontWeight: 700 }}>Qabul qilingan summa:</span>
                  <strong style={{ fontSize: 16, color: "#10b981" }}>{fmtUSD(receiptPrintModal.amount)}</strong>
                </div>
                {receiptPrintModal.student?.remainingAmount !== undefined && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Qolgan shartnoma qarzi:</span>
                    <strong style={{ color: "#fbbf24" }}>{fmtUSD(receiptPrintModal.student.remainingAmount)}</strong>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Qabul qildi:</span>
                  <strong>{receiptPrintModal.receivedByName || "Ma'muriyat"}</strong>
                </div>
                {receiptPrintModal.note && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Izoh:</span>
                    <span>{receiptPrintModal.note}</span>
                  </div>
                )}
              </div>

              <div style={{ marginTop: 16, paddingTop: 10, borderTop: "1px solid var(--border-subtle)", textAlign: "center", fontSize: 11.5, color: "var(--text-muted)" }}>
                Ushbu kvitansiya Mezana Yagona Boshqaruv Tizimi orqali tasdiqlangan.
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" className="btn" onClick={() => setReceiptPrintModal(null)}>Yopish</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => window.print()}
              >
                🖨️ Chop etish / PDF saqlash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EXPENSE RECEIPT VIEW & UPLOAD (Xarajat cheki rasmi) */}
      {expenseReceiptModal && (
        <div className="modal-backdrop" onClick={() => setExpenseReceiptModal(null)}>
          <div className="modal-box animate-in" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800 }}>📎 Xarajat cheki va tasdiqlovchi hujjat</h3>
                <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {expenseReceiptModal.description || "Xarajat"} • {fmtTL(expenseReceiptModal.amountInDefault || expenseReceiptModal.amount)}
                </p>
              </div>
              <button className="btn btn-sm" onClick={() => setExpenseReceiptModal(null)}><X size={15} /></button>
            </div>

            <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-subtle)" }}>
              <label className="form-label" style={{ display: "block", marginBottom: 6 }}>Yangi chek rasmini biriktirish</label>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="input"
                disabled={uploadingReceipt}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAttachExpenseReceipt(expenseReceiptModal.id, file);
                }}
              />
              {uploadingReceipt && <div style={{ fontSize: 12, color: "#34d399", marginTop: 6 }}>Chek yuklanmoqda...</div>}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: 380, overflowY: "auto" }}>
              {(expenseReceiptModal.receipts || []).length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                  Hozircha ushbu xarajatga chek rasmi biriktirilmagan. Yuqoridagi tugma orqali rasm tanlang.
                </div>
              ) : (
                (expenseReceiptModal.receipts || []).map((rec: any) => (
                  <div key={rec.id} style={{ padding: 10, borderRadius: 10, background: "var(--bg-surface-elevated)", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 12.5 }}>
                      <strong>{rec.fileName || "Chek rasmi"}</strong>
                      <a href={rec.url} target="_blank" rel="noreferrer" className="btn btn-sm">
                        Yangi oynada ochish ↗
                      </a>
                    </div>
                    {String(rec.mimeType || "").startsWith("image/") || String(rec.url || "").match(/\.(jpg|jpeg|png|webp|gif)$/i) ? (
                      <img
                        src={rec.url}
                        alt={rec.fileName || "Chek"}
                        style={{ width: "100%", maxHeight: 280, objectFit: "contain", borderRadius: 8, background: "#020617" }}
                      />
                    ) : (
                      <a href={rec.url} target="_blank" rel="noreferrer" style={{ color: "#34d399", fontSize: 13 }}>
                        📄 Hujjatni yuklab olish ({rec.fileName})
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL SEARCH PALETTE (Ctrl+K) */}
      {searchOpen && (
        <div className="modal-backdrop" onClick={() => setSearchOpen(false)}>
          <div className="modal-box animate-in" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <Search size={18} color="#10b981" />
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder="Talaba, qarzdor, to'lov, xarajat yoki hamyon qidirish..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              <button className="btn btn-sm" onClick={() => setSearchOpen(false)}>Yopish</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {searchResults.map((r) => (
                <div
                  key={r.id}
                  onClick={() => {
                    setActiveTab(r.tab);
                    setSearchOpen(false);
                  }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "rgba(148,163,184,0.08)",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{r.title}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{r.subtitle}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {r.badge && <span className={"badge " + (r.badge.includes("Arxiv") || r.badge.includes("O'chirilgan") ? "badge-amber" : "badge-emerald")}>{r.badge}</span>}
                    <span className="badge badge-cyan">{r.type}</span>
                  </div>
                </div>
              ))}
              {searchQuery && searchResults.length === 0 && (
                <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                  Natija topilmadi
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL STUDENT PHOTO LIGHTBOX MODAL */}
      {previewStudentPhoto && (
        <div
          className="modal-backdrop"
          style={{ zIndex: 10000 }}
          onClick={() => setPreviewStudentPhoto(null)}
        >
          <div
            className="modal-box animate-in"
            style={{
              maxWidth: 560,
              padding: 20,
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, textAlign: "left" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                  {previewStudentPhoto.fullname}
                </h3>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  {previewStudentPhoto.group && (
                    <span className="badge badge-cyan">{previewStudentPhoto.group}</span>
                  )}
                  {previewStudentPhoto.studyPlace && (
                    <span className="badge badge-emerald">{previewStudentPhoto.studyPlace}</span>
                  )}
                  {previewStudentPhoto.room && previewStudentPhoto.room !== "—" && (
                    <span className="badge badge-slate">Xona: {previewStudentPhoto.room}</span>
                  )}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => setPreviewStudentPhoto(null)} title="Yopish (Esc)">
                <X size={16} />
              </button>
            </div>

            <div
              style={{
                width: "100%",
                background: "#020617",
                borderRadius: 14,
                padding: 8,
                border: "1px solid rgba(148,163,184,0.22)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <img
                src={previewStudentPhoto.url}
                alt={previewStudentPhoto.fullname}
                style={{
                  maxWidth: "100%",
                  maxHeight: "72vh",
                  borderRadius: 10,
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </div>

            <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <a
                href={previewStudentPhoto.url}
                target="_blank"
                rel="noreferrer"
                className="btn btn-sm"
              >
                Asl rasmni yangi oynada ochish ↗
              </a>
              <button className="btn btn-sm btn-primary" onClick={() => setPreviewStudentPhoto(null)}>
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI ASSISTANT MODAL WITH FULL ARCHIVE ACCESS & ACTION CONFIRMATION */}
      <AiAssistantModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        messages={aiMessages}
        onClearMessages={() => setAiMessages([])}
        question={aiQuestion}
        setQuestion={setAiQuestion}
        busy={aiBusy}
        askAi={askAi}
        executeAiAction={executeAiAction}
        cancelAiAction={cancelAiAction}
      />
    </div>
  );
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<App />);
}
