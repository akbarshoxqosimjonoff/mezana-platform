import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  Filter,
  History,
  Layers,
  LogOut,
  Moon,
  PieChart,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Sun,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { DirectorInventoryCountsSection, MobileCountScannerPage } from "./InventoryCountModule";
import {
  NewDocumentModal,
  DocumentsAndApprovalsSection,
  MyAssetsSection,
  FaultsAndOffboardingSection,
  LifecycleReportsSection,
  RolesAndSettingsSection,
  DOC_TYPE_META,
  DOC_STATUS_META,
  ROLE_META,
} from "./LifecycleModule";
import {
  FileText,
  PackageCheck,
  ShieldCheck,
  UserCheck,
  UserMinus,
  Wrench,
  Calendar,
  Sparkles,
  Link2,
} from "lucide-react";
import {
  NotificationsBellPopover,
  DirectorDashboardSection,
  PendingFinanceExpensesSection,
  SchedulesAndRemindersSection,
  UnauthenticatedQrLandingCard,
  TelegramMiniAppScannerPage,
  VaqfBotBannerAndLinkBar,
  SystemHealthAndMultiImportSection,
} from "./AutomationModule";
import {
  DonationsRegistryPanel,
  PropertiesAndLeasesPanel,
  ArchiveDocumentsPanel,
  BoardDecisionsPanel,
  AnnualVaqfReportPanel,
} from "./GovernanceModule";
import { Gift, FolderArchive, Scale } from "lucide-react";

type VaqfPage =
  | "dashboard"
  | "assets"
  | "asset_detail"
  | "new_asset"
  | "counts"
  | "mobile_count"
  | "documents"
  | "approvals"
  | "my_assets"
  | "faults_offboarding"
  | "pending_expenses"
  | "schedules"
  | "donations"
  | "properties"
  | "archive"
  | "board"
  | "annual_report"
  | "tg_miniapp"
  | "reports"
  | "roles_settings"
  | "locations"
  | "categories"
  | "import"
  | "labels";

const STATUS_META: Record<string, { label: string; badge: string; color: string }> = {
  in_use: { label: "Foydalanishda", badge: "badge-emerald", color: "#10b981" },
  in_storage: { label: "Omborda", badge: "badge-cyan", color: "#06b6d4" },
  under_repair: { label: "Ta'mirda", badge: "badge-amber", color: "#f59e0b" },
  missing: { label: "Topilmadi / Yo'qolgan", badge: "badge-rose", color: "#f43f5e" },
  written_off: { label: "Hisobdan chiqarilgan", badge: "badge-slate", color: "#64748b" },
};

const CONDITION_META: Record<string, { label: string; badge: string }> = {
  new: { label: "Yangi", badge: "badge-emerald" },
  good: { label: "Yaxshi", badge: "badge-cyan" },
  fair: { label: "O'rtacha (ta'mirtalab)", badge: "badge-amber" },
  poor: { label: "Yaroqsiz", badge: "badge-rose" },
};

const ACQUISITION_META: Record<string, { label: string; badge: string }> = {
  purchase: { label: "Xarid qilingan", badge: "badge-cyan" },
  donation: { label: "Hadya / Vaqf ehsoni", badge: "badge-amber" },
  transfer: { label: "Ko'chirib o'tkazilgan", badge: "badge-violet" },
  unknown: { label: "Noma'lum (mavjud)", badge: "badge-slate" },
};

const KIND_META: Record<string, { label: string; badge: string }> = {
  building: { label: "Bino", badge: "badge-violet" },
  floor: { label: "Qavat", badge: "badge-cyan" },
  room: { label: "Xona", badge: "badge-emerald" },
  storage: { label: "Omborxona", badge: "badge-amber" },
  outdoor: { label: "Tashqi hudud", badge: "badge-slate" },
};

const EVENT_LABELS: Record<string, string> = {
  created: "Kartochka yaratildi",
  updated: "Ma'lumotlar tahrirlandi",
  location_changed: "Joylashuvi o'zgartirildi",
  responsible_changed: "Javobgar xodim o'zgartirildi",
  status_changed: "Holati o'zgartirildi",
  photo_added: "Rasm biriktirildi",
  document_added: "Hujjat biriktirildi",
  deleted: "Yumshoq o'chirildi",
  imported: "Excel/CSV orqali import qilindi",
  assigned: "Zimmatga berildi (ZMT)",
  returned: "Zimmatdan qaytarib olindi (QYT)",
  transferred: "Joylashuvi ko'chirildi (KCH)",
  repair_sent: "Ta'mirga yuborildi (TMR)",
  repair_completed: "Ta'mirdan qaytdi (TMR)",
  written_off: "Hisobdan chiqarildi (HCH)",
  fault_reported: "Nosozlik haqida xabar berildi",
  expense_linked: "Moliya xarajati bog'landi",
  schedule_completed: "Texnik ko'rik / muddat bajarildi",
};

const fmtTRY = (val: number | string | null | undefined) => {
  const n = Math.round(Number(val) || 0);
  return `\u20BA${n.toLocaleString("tr-TR")}`;
};

const fmtUSD = (val: number | string | null | undefined) => {
  const n = Number(val) || 0;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

const fmtMoney = (val: number | string | null | undefined, cur = "TRY") => {
  if (val === null || val === undefined || val === "") return "—";
  return cur === "USD" ? fmtUSD(val) : fmtTRY(val);
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
    err.details = data?.details;
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

export function App() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return (localStorage.getItem("mezana_theme") as "dark" | "light") || "dark";
  });
  const [auth, setAuth] = useState<any>({ loading: true, authenticated: false });
  const [page, setPage] = useState<VaqfPage>("dashboard");
  const [mobileCountId, setMobileCountId] = useState<number>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: "ok" | "err" } | null>(null);
  const [busy, setBusy] = useState(false);

  // Reference data
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<number | string>(1);
  const activeNumericInstId = Number(selectedInstitutionId) || 1;
  const [locations, setLocations] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);

  // Dashboard summary
  const [summary, setSummary] = useState<any>(null);

  // Assets list state
  const [assetsData, setAssetsData] = useState<any>({
    items: [],
    total: 0,
    totalQuantity: 0,
    totalValueTry: 0,
    totalValueUsd: 0,
    page: 1,
    limit: 50,
    totalPages: 1,
  });
  const [filters, setFilters] = useState({
    search: "",
    location_id: "",
    category_id: "",
    status: "",
    condition: "",
    tracking: "",
    acquisition_type: "",
    responsible: "",
    page: 1,
  });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Active asset detail
  const [activeAsset, setActiveAsset] = useState<any>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [quickDocModalType, setQuickDocModalType] = useState<string | null>(null);

  // Quick Add New Asset Form (remembers last location & responsible person)
  const [newForm, setNewForm] = useState<any>(() => ({
    name: "",
    category_id: "",
    tracking: "individual",
    quantity: "1",
    unit: "dona",
    institution_id: 1,
    location_id: localStorage.getItem("vaqf_last_location_id") || "",
    responsible_name: localStorage.getItem("vaqf_last_responsible_name") || "",
    responsible_ref: localStorage.getItem("vaqf_last_responsible_ref") || "",
    status: "in_use",
    condition: "good",
    acquisition_type: "purchase",
    acquired_at: new Date().toISOString().slice(0, 10),
    purchase_price: "",
    currency: "TRY",
    brand: "",
    model: "",
    serial_no: "",
    supplier: "",
    donor_name: "",
    donation_doc_no: "",
    warranty_until: "",
    notes: "",
    photoFile: null as File | null,
    photoPreview: "",
  }));

  // Locations modal
  const [locModal, setLocModal] = useState<any>(null);
  const [expandedLocs, setExpandedLocs] = useState<Record<number, boolean>>({});

  // Categories modal
  const [catModal, setCatModal] = useState<any>(null);

  // Import state
  const [importFile, setImportFile] = useState<{ name: string; dataUrl: string; mimeType: string } | null>(null);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [importBusy, setImportBusy] = useState(false);

  // Labels settings
  const [labelSettings, setLabelSettings] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("vaqf_label_settings") || "{}");
      return {
        preset: saved.preset || "a4_3x8",
        cols: saved.cols || "3",
        rows: saved.rows || "8",
        widthMm: saved.widthMm || "58",
        heightMm: saved.heightMm || "40",
        baseUrl: saved.baseUrl || window.location.origin,
      };
    } catch {
      return {
        preset: "a4_3x8",
        cols: "3",
        rows: "8",
        widthMm: "58",
        heightMm: "40",
        baseUrl: window.location.origin,
      };
    }
  });

  const notify = useCallback((text: string, type: "ok" | "err" = "ok") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    localStorage.setItem("mezana_theme", theme);
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light");
      root.classList.remove("dark");
    } else {
      root.classList.add("dark");
      root.classList.remove("light");
    }
  }, [theme]);

  // URL Deep-Link Handler: /vaqf/count/:id, /vaqf/a/:inventoryNo or /vaqf/assets/:id
  const parseUrlRoute = useCallback(async (meData?: any) => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("tg_miniapp") === "1") {
      setPage("tg_miniapp");
      return true;
    }
    const p = window.location.pathname;
    const countMatch = p.match(/^\/vaqf\/count\/(\d+)\/?$/);
    if (countMatch) {
      setMobileCountId(Number(countMatch[1]));
      setPage("mobile_count");
      return true;
    }
    if (meData && !meData.vaqfAccess?.canView && meData.vaqfAccess?.canCount) {
      const firstCountId = Number(meData.vaqfAccess?.assignedCountIds?.[0] || 0);
      if (firstCountId > 0) {
        setMobileCountId(firstCountId);
        setPage("mobile_count");
        window.history.replaceState({}, "", `/vaqf/count/${firstCountId}`);
        return true;
      }
    }
    const qrMatch = p.match(/^\/vaqf\/a\/([^/]+)\/?$/);
    if (qrMatch) {
      const code = decodeURIComponent(qrMatch[1]);
      try {
        setBusy(true);
        const res = await apiFetch(`/vaqf-api/assets/by-code/${encodeURIComponent(code)}`);
        setActiveAsset(res.asset);
        setEditMode(false);
        setPage("asset_detail");
      } catch (e: any) {
        notify(`QR kod bo'yicha buyum topilmadi (${code}): ${e.message}`, "err");
        setPage("assets");
      } finally {
        setBusy(false);
      }
      return true;
    }
    const idMatch = p.match(/^\/vaqf\/assets\/(\d+)\/?$/);
    if (idMatch) {
      try {
        setBusy(true);
        const res = await apiFetch(`/vaqf-api/assets/${idMatch[1]}`);
        setActiveAsset(res.asset);
        setEditMode(false);
        setPage("asset_detail");
      } catch (e: any) {
        notify(e.message, "err");
      } finally {
        setBusy(false);
      }
      return true;
    }
    return false;
  }, [notify]);

  const loadReferenceData = useCallback(async () => {
    const [instRes, locRes, catRes] = await Promise.all([
      apiFetch("/vaqf-api/institutions"),
      apiFetch(`/vaqf-api/locations?institution_id=${activeNumericInstId}`),
      apiFetch("/vaqf-api/categories"),
    ]);
    setInstitutions(instRes.items || []);
    setLocations(locRes.items || []);
    setCategories(catRes.items || []);
    const exp: Record<number, boolean> = {};
    for (const l of locRes.items || []) {
      if (l.kind === "building" || l.kind === "floor") exp[l.id] = true;
    }
    setExpandedLocs((prev) => ({ ...exp, ...prev }));
  }, [activeNumericInstId]);

  const loadSummary = useCallback(async () => {
    const s = await apiFetch(`/vaqf-api/reports/summary?institution_id=${activeNumericInstId}`);
    setSummary(s);
  }, [activeNumericInstId]);

  const loadAssets = useCallback(async () => {
    const q = new URLSearchParams();
    if (selectedInstitutionId !== "all") {
      q.set("institution_id", String(selectedInstitutionId));
    }
    if (filters.search) q.set("search", filters.search);
    if (filters.location_id) q.set("location_id", filters.location_id);
    if (filters.category_id) q.set("category_id", filters.category_id);
    if (filters.status) q.set("status", filters.status);
    if (filters.condition) q.set("condition", filters.condition);
    if (filters.tracking) q.set("tracking", filters.tracking);
    if (filters.acquisition_type) q.set("acquisition_type", filters.acquisition_type);
    if (filters.responsible) q.set("responsible", filters.responsible);
    q.set("page", String(filters.page || 1));
    q.set("limit", "50");
    const d = await apiFetch(`/vaqf-api/assets?${q.toString()}`);
    setAssetsData(d);
  }, [selectedInstitutionId, filters]);

  // Initial Auth Check
  useEffect(() => {
    (async () => {
      try {
        const me = await apiFetch("/vaqf-api/me");
        setAuth({ loading: false, ...me });
        setStaffList(me.staff || []);
        if (me.vaqfAccess?.canView) {
          await Promise.all([loadReferenceData(), loadSummary(), loadAssets()]);
        } else {
          try {
            const catRes = await apiFetch("/vaqf-api/categories");
            setCategories(catRes.items || []);
          } catch {}
          if (me.vaqfAccess?.canAccess && !me.vaqfAccess?.canCount) {
            setPage("my_assets");
          }
        }
        await parseUrlRoute(me);
      } catch (err: any) {
        if (err.status === 401) {
          const qrMatch = window.location.pathname.match(/^\/vaqf\/a\/([^/]+)\/?$/);
          if (qrMatch) {
            setAuth({
              loading: false,
              authenticated: false,
              unauthQrCode: decodeURIComponent(qrMatch[1]),
            });
            return;
          }
          const returnPath = window.location.pathname + window.location.search;
          window.location.href = `/?next=${encodeURIComponent(returnPath)}`;
          return;
        }
        setAuth({ loading: false, authenticated: true, forbidden: true, error: err.message });
      }
    })();
  }, []);

  useEffect(() => {
    if (!auth.authenticated || auth.forbidden || !auth.vaqfAccess?.canView) return;
    loadAssets().catch((e) => notify(e.message, "err"));
  }, [filters, selectedInstitutionId, auth.authenticated, auth.forbidden]);

  const openAssetCard = async (id: number) => {
    try {
      setBusy(true);
      const res = await apiFetch(`/vaqf-api/assets/${id}`);
      setActiveAsset(res.asset);
      setEditMode(false);
      setPage("asset_detail");
      window.history.pushState({}, "", `/vaqf/a/${encodeURIComponent(res.asset.inventory_no)}`);
    } catch (e: any) {
      notify(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  const navigatePage = (target: VaqfPage) => {
    setPage(target);
    setMobileMenuOpen(false);
    if (window.location.pathname !== "/vaqf/") {
      window.history.pushState({}, "", "/vaqf/");
    }
    if (target === "dashboard") loadSummary().catch(() => {});
    if (target === "assets" || target === "labels") loadAssets().catch(() => {});
    if (target === "locations" || target === "categories") loadReferenceData().catch(() => {});
  };

  const handleCategorySelectOnNew = (catIdStr: string) => {
    const cat = categories.find((c) => String(c.id) === String(catIdStr));
    setNewForm((prev: any) => ({
      ...prev,
      category_id: catIdStr,
      tracking: cat?.tracking || prev.tracking || "individual",
      quantity: (cat?.tracking || prev.tracking) === "individual" ? "1" : prev.quantity,
      unit: cat?.default_unit || prev.unit || "dona",
    }));
  };

  const submitNewAsset = async (mode: "open_card" | "add_next") => {
    if (!newForm.name.trim()) {
      notify("Buyum nomini kiriting", "err");
      return;
    }
    if (!newForm.category_id) {
      notify("Kategoriyani tanlang", "err");
      return;
    }
    setBusy(true);
    try {
      if (newForm.location_id) {
        localStorage.setItem("vaqf_last_location_id", String(newForm.location_id));
      }
      if (newForm.responsible_name) {
        localStorage.setItem("vaqf_last_responsible_name", String(newForm.responsible_name));
        localStorage.setItem("vaqf_last_responsible_ref", String(newForm.responsible_ref || ""));
      }

      const payload = {
        name: newForm.name.trim(),
        category_id: Number(newForm.category_id),
        tracking: newForm.tracking,
        quantity: newForm.tracking === "individual" ? 1 : Number(newForm.quantity || 1),
        unit: newForm.unit || "dona",
        institution_id: activeNumericInstId,
        location_id: newForm.location_id ? Number(newForm.location_id) : null,
        responsible_name: newForm.responsible_name || null,
        responsible_ref: newForm.responsible_ref || null,
        status: newForm.status,
        condition: newForm.condition,
        acquisition_type: newForm.acquisition_type,
        acquired_at: newForm.acquired_at || null,
        purchase_price: newForm.purchase_price !== "" ? Number(newForm.purchase_price) : null,
        currency: newForm.currency || "TRY",
        brand: newForm.brand || null,
        model: newForm.model || null,
        serial_no: newForm.serial_no || null,
        supplier: newForm.supplier || null,
        donor_name: newForm.donor_name || null,
        donation_doc_no: newForm.donation_doc_no || null,
        warranty_until: newForm.warranty_until || null,
        notes: newForm.notes || null,
      };

      const res = await apiFetch("/vaqf-api/assets", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      let created = res.asset;

      if (newForm.photoFile) {
        const dataUrl = await readFileAsDataUrl(newForm.photoFile);
        await apiFetch(`/vaqf-api/assets/${created.id}/photos`, {
          method: "POST",
          body: JSON.stringify({
            fileName: newForm.photoFile.name,
            mimeType: newForm.photoFile.type || "image/jpeg",
            dataUrl,
            is_primary: true,
          }),
        });
        const refreshed = await apiFetch(`/vaqf-api/assets/${created.id}`);
        created = refreshed.asset;
      }

      notify(`Saqlandi: ${created.inventory_no} — ${created.name}`);
      await Promise.all([loadSummary(), loadAssets(), loadReferenceData()]);

      if (mode === "add_next") {
        setNewForm((prev: any) => ({
          ...prev,
          name: "",
          quantity: prev.tracking === "individual" ? "1" : prev.quantity,
          serial_no: "",
          notes: "",
          photoFile: null,
          photoPreview: "",
        }));
      } else {
        setActiveAsset(created);
        setEditMode(false);
        setPage("asset_detail");
        window.history.pushState({}, "", `/vaqf/a/${encodeURIComponent(created.inventory_no)}`);
      }
    } catch (e: any) {
      notify(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  const startEditingAsset = () => {
    if (!activeAsset) return;
    setEditForm({
      name: activeAsset.name || "",
      category_id: activeAsset.category_id || "",
      tracking: activeAsset.tracking || "individual",
      quantity: String(activeAsset.quantity ?? 1),
      unit: activeAsset.unit || "dona",
      location_id: activeAsset.location_id || "",
      responsible_name: activeAsset.responsible_name || "",
      responsible_ref: activeAsset.responsible_ref || "",
      status: activeAsset.status || "in_use",
      condition: activeAsset.condition || "good",
      acquisition_type: activeAsset.acquisition_type || "purchase",
      acquired_at: activeAsset.acquired_at_str || "",
      purchase_price: activeAsset.purchase_price !== null && activeAsset.purchase_price !== undefined ? String(activeAsset.purchase_price) : "",
      currency: activeAsset.currency || "TRY",
      brand: activeAsset.brand || "",
      model: activeAsset.model || "",
      serial_no: activeAsset.serial_no || "",
      supplier: activeAsset.supplier || "",
      donor_name: activeAsset.donor_name || "",
      donation_doc_no: activeAsset.donation_doc_no || "",
      warranty_until: activeAsset.warranty_until_str || "",
      notes: activeAsset.notes || "",
      event_note: "",
    });
    setEditMode(true);
  };

  const saveAssetEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAsset || !editForm) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/vaqf-api/assets/${activeAsset.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...editForm,
          category_id: Number(editForm.category_id),
          quantity: editForm.tracking === "individual" ? 1 : Number(editForm.quantity || 1),
          location_id: editForm.location_id ? Number(editForm.location_id) : null,
          purchase_price: editForm.purchase_price !== "" ? Number(editForm.purchase_price) : null,
          acquired_at: editForm.acquired_at || null,
          warranty_until: editForm.warranty_until || null,
        }),
      });
      setActiveAsset(res.asset);
      setEditMode(false);
      notify("Kartochka muvaffaqiyatli yangilandi!");
      loadAssets().catch(() => {});
      loadSummary().catch(() => {});
    } catch (err: any) {
      notify(err.message, "err");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAsset = async (asset: any) => {
    if (!window.confirm(`"${asset.inventory_no} — ${asset.name}" kartochkasini o'chirishni tasdiqlaysizmi?`)) return;
    setBusy(true);
    try {
      await apiFetch(`/vaqf-api/assets/${asset.id}`, {
        method: "DELETE",
        body: JSON.stringify({ reason: "Foydalanuvchi tomonidan o'chirildi" }),
      });
      notify("Mulk kartochkasi o'chirildi");
      await Promise.all([loadAssets(), loadSummary(), loadReferenceData()]);
      navigatePage("assets");
    } catch (e: any) {
      notify(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  const handleUploadAssetPhoto = async (file: File) => {
    if (!activeAsset) return;
    setUploadingFile(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await apiFetch(`/vaqf-api/assets/${activeAsset.id}/photos`, {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || "image/jpeg",
          dataUrl,
        }),
      });
      const refreshed = await apiFetch(`/vaqf-api/assets/${activeAsset.id}`);
      setActiveAsset(refreshed.asset);
      notify("Rasm muvaffaqiyatli yuklandi!");
    } catch (e: any) {
      notify(e.message, "err");
    } finally {
      setUploadingFile(false);
    }
  };

  const handleUploadAssetDoc = async (file: File, docType: string, title: string) => {
    if (!activeAsset) return;
    setUploadingFile(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await apiFetch(`/vaqf-api/assets/${activeAsset.id}/documents`, {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || "application/pdf",
          doc_type: docType,
          title: title || file.name,
          dataUrl,
        }),
      });
      const refreshed = await apiFetch(`/vaqf-api/assets/${activeAsset.id}`);
      setActiveAsset(refreshed.asset);
      notify("Hujjat muvaffaqiyatli biriktirildi!");
    } catch (e: any) {
      notify(e.message, "err");
    } finally {
      setUploadingFile(false);
    }
  };

  const openLabelsPdf = (ids: number[]) => {
    localStorage.setItem("vaqf_label_settings", JSON.stringify(labelSettings));
    const q = new URLSearchParams();
    if (ids.length > 0) q.set("ids", ids.join(","));
    q.set("preset", labelSettings.preset);
    q.set("cols", String(labelSettings.cols || 3));
    q.set("rows", String(labelSettings.rows || 8));
    q.set("width_mm", String(labelSettings.widthMm || 58));
    q.set("height_mm", String(labelSettings.heightMm || 40));
    if (labelSettings.baseUrl) q.set("base_url", labelSettings.baseUrl);
    window.open(`/vaqf-api/labels?${q.toString()}`, "_blank");
  };

  // Location tree helper
  const locationTree = useMemo(() => {
    const byParent = new Map<number, any[]>();
    for (const loc of locations) {
      const pid = loc.parent_id || 0;
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid)!.push(loc);
    }
    return byParent;
  }, [locations]);

  // Flat formatted locations for select dropdowns
  const flatLocationOptions = useMemo(() => {
    const out: { id: number; label: string; kind: string }[] = [];
    const walk = (pid: number, depth: number) => {
      const list = locationTree.get(pid) || [];
      for (const l of list) {
        const prefix = depth > 0 ? "\u00A0\u00A0\u00A0".repeat(depth) : "";
        const showCode =
          l.code &&
          l.kind === "building" &&
          !String(l.name || "").toLowerCase().includes(String(l.code).toLowerCase());
        out.push({
          id: l.id,
          label: `${prefix}${l.name}${showCode ? ` [${l.code}]` : ""}`,
          kind: l.kind,
        });
        walk(l.id, depth + 1);
      }
    };
    walk(0, 0);
    return out;
  }, [locationTree]);

  if (auth.loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ textAlign: "center" }}>
          <img src="/vaqf/ezan-logo.svg" alt="Ezan Vakfı" style={{ width: 54, height: 68, marginBottom: 12 }} />
          <div style={{ fontWeight: 700, fontSize: 16 }}>Ezan Vakfı tizimi yuklanmoqda...</div>
        </div>
      </div>
    );
  }

  if (auth.unauthQrCode) {
    return <UnauthenticatedQrLandingCard inventoryNo={auth.unauthQrCode} />;
  }

  if (page === "tg_miniapp") {
    return (
      <TelegramMiniAppScannerPage
        notify={notify}
        onExitMiniApp={() => {
          setPage("dashboard");
          window.history.replaceState({}, "", "/vaqf/");
        }}
      />
    );
  }

  if (auth.forbidden) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <div className="glass-card" style={{ maxWidth: 440, textAlign: "center" }}>
          <ShieldAlert size={42} color="#f43f5e" style={{ margin: "0 auto 12px" }} />
          <h2 style={{ fontSize: 19, fontWeight: 800, marginBottom: 8 }}>Kirish ruxsati yo'q (403)</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: 13.5, marginBottom: 18 }}>
            Vaqf mulk va inventarizatsiya bo'limiga faqat vakolatli rahbar (Direktor) yoki faol sanoqqa biriktirilgan xodimlar kira oladi.
          </p>
          <a href="/" className="btn btn-primary" style={{ textDecoration: "none" }}>
            <ArrowLeft size={16} /> Mezana Akademiyasiga qaytish
          </a>
        </div>
      </div>
    );
  }

  if (page === "mobile_count" && mobileCountId > 0) {
    return (
      <>
        {toast && (
          <div
            className="animate-in"
            style={{
              position: "fixed",
              bottom: 24,
              right: 24,
              zIndex: 300,
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
        <MobileCountScannerPage
          countId={mobileCountId}
          user={auth.user}
          vaqfAccess={auth.vaqfAccess}
          notify={notify}
          onExitScanner={() => {
            if (auth.vaqfAccess?.canView) {
              navigatePage("counts");
            } else {
              window.location.href = "/";
            }
          }}
          onBackToAdmin={() => {
            if (auth.vaqfAccess?.canView) {
              navigatePage("counts");
            } else {
              window.location.href = "/";
            }
          }}
        />
      </>
    );
  }

  const tot = summary?.totals || {};

  return (
    <div className="app-shell">
      <div className="hi-tech-bg" />
      <div className="hi-tech-grid" />

      {toast && (
        <div
          className="animate-in"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 300,
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
        <div
          className="brand-box"
          style={{
            borderColor: "rgba(251, 204, 66, 0.35)",
            background: "var(--bg-brand)",
            borderRadius: 12,
          }}
        >
          <img
            src="/vaqf/ezan-logo.svg"
            alt="Ezan Vakfı"
            style={{ width: 36, height: 46, objectFit: "contain", flexShrink: 0 }}
          />
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: "0.01em", color: "var(--text-brand-gold)" }}>
              EZAN VAKFI
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
              Mulk va Inventarizatsiya
            </div>
          </div>
        </div>

        {/* Institution Selector (ready for multiple institutions) */}
        <div style={{ padding: "0 4px 8px" }}>
          <label style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>
            VAQF MUASSASASI
          </label>
          <select
            className="select"
            value={selectedInstitutionId}
            onChange={(e) => {
              const v = e.target.value;
              setSelectedInstitutionId(v === "all" ? "all" : Number(v));
            }}
            style={{ fontWeight: 700, fontSize: 13 }}
          >
            <option value="all">🏛 Barcha muassasalar</option>
            {institutions.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name} ({inst.code})
              </option>
            ))}
          </select>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, overflowY: "auto" }}>
          {auth.vaqfAccess?.canView && (
            <>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", padding: "6px 10px 4px", letterSpacing: "0.06em" }}>
                INVENTARIZATSIYA
              </div>
              <button className={`nav-btn ${page === "dashboard" ? "active" : ""}`} onClick={() => navigatePage("dashboard")}>
                <PieChart size={17} /> Bosh sahifa
              </button>
              <button
                className={`nav-btn ${page === "assets" || page === "asset_detail" ? "active" : ""}`}
                onClick={() => navigatePage("assets")}
              >
                <Layers size={17} /> Mulk ro'yxati
                <span className="nav-badge badge-amber">{tot.total_cards || assetsData.total || 0}</span>
              </button>
              {auth.vaqfAccess?.canEdit && (
                <button className={`nav-btn ${page === "new_asset" ? "active" : ""}`} onClick={() => navigatePage("new_asset")}>
                  <Plus size={17} /> Yangi buyum qo'shish
                </button>
              )}
              <button className={`nav-btn ${page === "pending_expenses" ? "active" : ""}`} onClick={() => navigatePage("pending_expenses")}>
                <Sparkles size={17} color="#fbcc42" /> Ro'yxatga olinishi kerak
              </button>
              <button className={`nav-btn ${page === "schedules" ? "active" : ""}`} onClick={() => navigatePage("schedules")}>
                <Calendar size={17} color="#06b6d4" /> Muddatlar va Eslatmalar
              </button>
              <button className={`nav-btn ${page === "counts" ? "active" : ""}`} onClick={() => navigatePage("counts")}>
                <ClipboardCheck size={17} /> Inventarizatsiya (Sanoq)
              </button>

              <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", padding: "12px 10px 4px", letterSpacing: "0.06em" }}>
                MULK HARAKATI VA ZIMMAT
              </div>
              <button className={`nav-btn ${page === "documents" ? "active" : ""}`} onClick={() => navigatePage("documents")}>
                <FileText size={17} /> Hujjatlar (Dalolatnoma)
              </button>
              {auth.vaqfAccess?.canApprove && (
                <button className={`nav-btn ${page === "approvals" ? "active" : ""}`} onClick={() => navigatePage("approvals")}>
                  <ShieldCheck size={17} /> Tasdiqlar (Direktor)
                </button>
              )}
              <button className={`nav-btn ${page === "faults_offboarding" ? "active" : ""}`} onClick={() => navigatePage("faults_offboarding")}>
                <Wrench size={17} /> Nosozlik va Zimmat yopish
              </button>
              <button className={`nav-btn ${page === "reports" ? "active" : ""}`} onClick={() => navigatePage("reports")}>
                <Activity size={17} /> Hisobotlar (Zimmat/Zarar)
              </button>

              <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", padding: "12px 10px 4px", letterSpacing: "0.06em" }}>
                VAQF BOSHQARUVI (5-BOSQICH)
              </div>
              <button className={`nav-btn ${page === "donations" ? "active" : ""}`} onClick={() => navigatePage("donations")}>
                <Gift size={17} color="#10b981" /> Hadyalar (Bağışlar)
              </button>
              <button className={`nav-btn ${page === "properties" ? "active" : ""}`} onClick={() => navigatePage("properties")}>
                <Building2 size={17} color="#fbcc42" /> Ko'chmas mulk va Ijara
              </button>
              <button className={`nav-btn ${page === "archive" ? "active" : ""}`} onClick={() => navigatePage("archive")}>
                <FolderArchive size={17} color="#06b6d4" /> Hujjatlar arxivi
              </button>
              <button className={`nav-btn ${page === "board" ? "active" : ""}`} onClick={() => navigatePage("board")}>
                <Scale size={17} color="#c084fc" /> Yönetim Kurulu Qarorlari
              </button>
              <button className={`nav-btn ${page === "annual_report" ? "active" : ""}`} onClick={() => navigatePage("annual_report")}>
                <PieChart size={17} color="#fbcc42" /> Yillik Vaqf Hisoboti
              </button>
            </>
          )}

          <button className={`nav-btn ${page === "my_assets" ? "active" : ""}`} onClick={() => navigatePage("my_assets")}>
            <UserCheck size={17} /> Mening buyumlarim
          </button>

          {auth.vaqfAccess?.canView && (
            <>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", padding: "12px 10px 4px", letterSpacing: "0.06em" }}>
                TUZILMA VA SOZLAMALAR
              </div>
              <button className={`nav-btn ${page === "locations" ? "active" : ""}`} onClick={() => navigatePage("locations")}>
                <Building2 size={17} /> Joylar va xonalar
                <span className="nav-badge badge-cyan">{locations.length}</span>
              </button>
              <button className={`nav-btn ${page === "categories" ? "active" : ""}`} onClick={() => navigatePage("categories")}>
                <Filter size={17} /> Kategoriyalar
                <span className="nav-badge badge-slate">{categories.length}</span>
              </button>
              {auth.vaqfAccess?.canEdit && (
                <button className={`nav-btn ${page === "import" ? "active" : ""}`} onClick={() => navigatePage("import")}>
                  <FileSpreadsheet size={17} /> Excel / CSV Import
                </button>
              )}
              <button className={`nav-btn ${page === "labels" ? "active" : ""}`} onClick={() => navigatePage("labels")}>
                <Download size={17} /> QR Yorliqlar (PDF)
                {selectedIds.length > 0 && <span className="nav-badge badge-emerald">{selectedIds.length}</span>}
              </button>
              {auth.vaqfAccess?.canManageRoles && (
                <button className={`nav-btn ${page === "roles_settings" ? "active" : ""}`} onClick={() => navigatePage("roles_settings")}>
                  <Settings size={17} /> Rollar va Sozlamalar
                </button>
              )}
            </>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}>
          <div style={{ fontSize: 12.5 }}>
            <div style={{ fontWeight: 700 }}>{auth.user?.sourceLabel || auth.user?.name || "Foydalanuvchi"}</div>
            <div style={{ color: "#fbcc42", fontSize: 11 }}>
              {ROLE_META[auth.vaqfAccess?.role || ""]?.label || "Ezan Vakfı"}
            </div>
          </div>
          <a href="/" className="btn btn-sm" style={{ textDecoration: "none" }} title="Mezana Akademiyasiga qaytish">
            <ArrowLeft size={14} />
          </a>
        </div>
      </aside>

      {/* Main Content */}
      <div className="main-area">
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-sm mobile-menu-btn"
              onClick={() => setMobileMenuOpen((v) => !v)}
            >
              <Layers size={16} /> Menyu
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img src="/vaqf/ezan-logo.svg" alt="Ezan Vakfı" style={{ width: 22, height: 28, objectFit: "contain" }} />
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>Ezan Vakfı</span>
                  <span className="badge badge-amber" style={{ fontSize: 11 }}>
                    Mezana Akademiyasi
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <NotificationsBellPopover
              onNavigate={(p) => navigatePage(p as VaqfPage)}
              notify={notify}
            />
            <button className="btn btn-primary" onClick={() => navigatePage("new_asset")}>
              <Plus size={15} /> Yangi buyum
            </button>
            {selectedIds.length > 0 && (
              <button className="btn btn-cyan" onClick={() => openLabelsPdf(selectedIds)}>
                <Download size={15} /> QR Yorliq ({selectedIds.length})
              </button>
            )}
            <button
              className="btn btn-sm"
              onClick={() => {
                loadSummary();
                loadAssets();
                loadReferenceData();
              }}
              title="Yangilash"
            >
              <RefreshCw size={15} className={busy ? "pulse-dot" : ""} />
            </button>
            <button
              className="btn btn-sm"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title="Mavzuni o'zgartirish"
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            {/* Top-Right Switch Button back to Mezana Akademiyasi (apps/finance) */}
            <a
              href="/"
              className="vaqf-switch-btn"
              title="Mezana Akademiyasi — Moliya va Boshqaruv tizimiga qaytish"
              style={{
                borderColor: "rgba(16, 185, 129, 0.5)",
                background: "linear-gradient(135deg, rgba(16, 185, 129, 0.18), rgba(6, 182, 212, 0.1))",
                color: "#10b981",
              }}
            >
              <Building2 size={16} />
              <span className="vaqf-switch-label">Mezana Akademiyasi</span>
            </a>
          </div>
        </header>

        <main className="content-wrap">
          <VaqfBotBannerAndLinkBar
            botStatus={auth.botStatus}
            onRefreshBotStatus={async () => {
              try {
                const bs = await apiFetch("/vaqf-api/me/bot-status");
                setAuth((prev: any) => ({ ...prev, botStatus: bs }));
              } catch {}
            }}
            notify={notify}
          />
          {/* ============================================================== */}
          {/* 1. BOSH SAHIFA (DASHBOARD) */}
          {/* ============================================================== */}
          {page === "dashboard" && (
            <DirectorDashboardSection
              institutionId={selectedInstitutionId}
              onNavigate={(p) => navigatePage(p as VaqfPage)}
              onFilterAssets={(patch) => {
                setFilters((f) => ({
                  ...f,
                  search: patch.search ?? "",
                  location_id: patch.location_id ?? "",
                  category_id: patch.category_id ?? "",
                  status: patch.status ?? "",
                  condition: patch.condition ?? "",
                  tracking: patch.tracking ?? "",
                  acquisition_type: patch.acquisition_type ?? "",
                  responsible: patch.responsible ?? "",
                  page: 1,
                }));
                navigatePage("assets");
              }}
            />
          )}

          {/* ============================================================== */}
          {/* 2. MULK RO'YXATI (ASSETS LIST) */}
          {/* ============================================================== */}
          {page === "assets" && (
            <div className="animate-in">
              <div className="glass-card" style={{ marginBottom: 16 }}>
                <div className="section-header">
                  <div className="section-title">
                    <Layers size={18} color="#fbcc42" /> Vaqf Mulk va Jihozlar Ro'yxati ({assetsData.total} ta kartochka, {assetsData.totalQuantity} birlik)
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {selectedIds.length > 0 && (
                      <button className="btn btn-sm btn-cyan" onClick={() => openLabelsPdf(selectedIds)}>
                        <Download size={14} /> Tanlanganlarga QR yorliq ({selectedIds.length})
                      </button>
                    )}
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        const q = new URLSearchParams();
                        q.set("institution_id", String(selectedInstitutionId));
                        if (filters.search) q.set("search", filters.search);
                        if (filters.location_id) q.set("location_id", filters.location_id);
                        if (filters.category_id) q.set("category_id", filters.category_id);
                        if (filters.status) q.set("status", filters.status);
                        window.open(`/vaqf-api/assets/export?${q.toString()}`, "_blank");
                      }}
                    >
                      <FileSpreadsheet size={14} /> Excel'ga eksport
                    </button>
                    <button className="btn btn-sm btn-primary" onClick={() => navigatePage("new_asset")}>
                      <Plus size={14} /> Yangi buyum
                    </button>
                  </div>
                </div>

                {/* Filters Bar */}
                <div className="resp-grid-4" style={{ marginBottom: 12 }}>
                  <div style={{ position: "relative" }}>
                    <input
                      className="input"
                      placeholder="Qidiruv (nomi, inventar №, seriya, javobgar)..."
                      value={filters.search}
                      onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
                    />
                  </div>
                  <select
                    className="select"
                    value={filters.location_id}
                    onChange={(e) => setFilters({ ...filters, location_id: e.target.value, page: 1 })}
                  >
                    <option value="">Barcha joylar / xonalar</option>
                    <option value="unassigned">⚠️ Joyi belgilanmaganlar</option>
                    {flatLocationOptions.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="select"
                    value={filters.category_id}
                    onChange={(e) => setFilters({ ...filters, category_id: e.target.value, page: 1 })}
                  >
                    <option value="">Barcha kategoriyalar</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.parent_id ? `   ${c.name}` : c.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="select"
                    value={filters.status}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
                  >
                    <option value="">Barcha holatlar</option>
                    {Object.entries(STATUS_META).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <select
                      className="select"
                      style={{ width: "auto" }}
                      value={filters.acquisition_type}
                      onChange={(e) => setFilters({ ...filters, acquisition_type: e.target.value, page: 1 })}
                    >
                      <option value="">Barcha kirim turlari</option>
                      {Object.entries(ACQUISITION_META).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                    <select
                      className="select"
                      style={{ width: "auto" }}
                      value={filters.tracking}
                      onChange={(e) => setFilters({ ...filters, tracking: e.target.value, page: 1 })}
                    >
                      <option value="">Hisob turi (Barchasi)</option>
                      <option value="individual">Donalab (Individual)</option>
                      <option value="batch">Partiya / Miqdoriy (Batch)</option>
                    </select>
                    <select
                      className="select"
                      style={{ width: "auto" }}
                      value={filters.responsible}
                      onChange={(e) => setFilters({ ...filters, responsible: e.target.value, page: 1 })}
                    >
                      <option value="">Barcha javobgarlar</option>
                      <option value="unassigned">⚠️ Javobgari belgilanmagan</option>
                      {staffList.map((s) => (
                        <option key={s.ref} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    {(filters.search ||
                      filters.location_id ||
                      filters.category_id ||
                      filters.status ||
                      filters.acquisition_type ||
                      filters.tracking ||
                      filters.responsible) && (
                      <button
                        className="btn btn-sm"
                        onClick={() =>
                          setFilters({
                            search: "",
                            location_id: "",
                            category_id: "",
                            status: "",
                            condition: "",
                            tracking: "",
                            acquisition_type: "",
                            responsible: "",
                            page: 1,
                          })
                        }
                      >
                        <X size={14} /> Filtrlarni tozalash
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                    Jami qiymat: <strong style={{ color: "#10b981" }}>{fmtTRY(assetsData.totalValueTry)}</strong>
                    {assetsData.totalValueUsd > 0 && (
                      <span>
                        {" "}
                        + <strong style={{ color: "#06b6d4" }}>{fmtUSD(assetsData.totalValueUsd)}</strong>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="glass-card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}>
                          <input
                            type="checkbox"
                            checked={
                              assetsData.items.length > 0 &&
                              assetsData.items.every((it: any) => selectedIds.includes(it.id))
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                const allPageIds = assetsData.items.map((it: any) => it.id);
                                setSelectedIds(Array.from(new Set([...selectedIds, ...allPageIds])));
                              } else {
                                const pageSet = new Set(assetsData.items.map((it: any) => it.id));
                                setSelectedIds(selectedIds.filter((id) => !pageSet.has(id)));
                              }
                            }}
                          />
                        </th>
                        <th>Inventar №</th>
                        <th>Buyum nomi</th>
                        <th>Kategoriya</th>
                        <th>Miqdori</th>
                        <th>Joy / Xona</th>
                        <th>Javobgar</th>
                        <th>Holati</th>
                        <th>Manba</th>
                        <th>Qiymati</th>
                        <th>Amal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assetsData.items.length === 0 ? (
                        <tr>
                          <td colSpan={11} style={{ textAlign: "center", padding: 36, color: "var(--text-muted)" }}>
                            Tanlangan shartlar bo'yicha buyumlar topilmadi
                          </td>
                        </tr>
                      ) : (
                        assetsData.items.map((a: any) => {
                          const checked = selectedIds.includes(a.id);
                          return (
                            <tr key={a.id}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    if (e.target.checked) setSelectedIds([...selectedIds, a.id]);
                                    else setSelectedIds(selectedIds.filter((x) => x !== a.id));
                                  }}
                                />
                              </td>
                              <td onClick={() => openAssetCard(a.id)} style={{ cursor: "pointer" }}>
                                <strong style={{ color: "#fbcc42", fontFamily: "monospace" }}>{a.inventory_no}</strong>
                              </td>
                              <td onClick={() => openAssetCard(a.id)} style={{ cursor: "pointer" }}>
                                <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                                  {a.primary_photo_id && (
                                    <img
                                      src={`/vaqf-api/files/photos/${a.primary_photo_id}`}
                                      alt=""
                                      style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover" }}
                                    />
                                  )}
                                  <span>{a.name}</span>
                                </div>
                                {(a.brand || a.model || a.serial_no) && (
                                  <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                                    {[a.brand, a.model, a.serial_no ? `SN:${a.serial_no}` : null]
                                      .filter(Boolean)
                                      .join(" • ")}
                                  </div>
                                )}
                              </td>
                              <td>{a.category_name}</td>
                              <td>
                                <span className={`badge ${a.tracking === "batch" ? "badge-violet" : "badge-slate"}`}>
                                  {a.quantity} {a.unit}
                                </span>
                              </td>
                              <td>
                                {a.location_name ? (
                                  <span>
                                    {a.location_parent_name ? `${a.location_parent_name} → ` : ""}
                                    <strong>{a.location_name}</strong>
                                  </span>
                                ) : (
                                  <span style={{ color: "#f59e0b", fontSize: 12 }}>Belgilanmagan</span>
                                )}
                              </td>
                              <td>
                                {a.responsible_name || (
                                  <span style={{ color: "#f43f5e", fontSize: 12 }}>Belgilanmagan</span>
                                )}
                              </td>
                              <td>
                                <span className={`badge ${STATUS_META[a.status]?.badge || "badge-slate"}`}>
                                  {STATUS_META[a.status]?.label || a.status}
                                </span>
                              </td>
                              <td>
                                <span className={`badge ${ACQUISITION_META[a.acquisition_type]?.badge || "badge-slate"}`}>
                                  {ACQUISITION_META[a.acquisition_type]?.label || a.acquisition_type}
                                </span>
                                {a.donor_name && (
                                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                                    {a.donor_name}
                                  </div>
                                )}
                              </td>
                              <td>
                                {a.purchase_price !== null ? (
                                  <div>
                                    <strong>
                                      {fmtMoney(Number(a.purchase_price) * Number(a.quantity || 1), a.currency)}
                                    </strong>
                                    {a.tracking === "batch" && Number(a.quantity) > 1 && (
                                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                        {fmtMoney(a.purchase_price, a.currency)} / {a.unit}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button className="btn btn-sm" onClick={() => openAssetCard(a.id)} title="Kartochkani ochish">
                                    <Eye size={14} />
                                  </button>
                                  <button
                                    className="btn btn-sm"
                                    onClick={() => openLabelsPdf([a.id])}
                                    title="QR yorliq PDF"
                                  >
                                    QR
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {assetsData.totalPages > 1 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
                    <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                      Sahifa {assetsData.page} / {assetsData.totalPages}
                    </span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className="btn btn-sm"
                        disabled={assetsData.page <= 1}
                        onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                      >
                        Oldingi
                      </button>
                      <button
                        className="btn btn-sm"
                        disabled={assetsData.page >= assetsData.totalPages}
                        onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                      >
                        Keyingi
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* 3. BUYUM KARTOCHKASI (ASSET DETAIL & EDIT) */}
          {/* ============================================================== */}
          {page === "asset_detail" && activeAsset && (
            <div className="animate-in">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
                <button className="btn btn-sm" onClick={() => navigatePage("assets")}>
                  <ArrowLeft size={15} /> Mulk ro'yxatiga qaytish
                </button>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn btn-sm btn-cyan" onClick={() => openLabelsPdf([activeAsset.id])}>
                    <Download size={14} /> QR Yorliq chop etish
                  </button>
                  {auth.vaqfAccess?.canEdit && activeAsset.status !== "written_off" && (
                    <>
                      <button className="btn btn-sm" style={{ borderColor: "#10b981", color: "#10b981" }} onClick={() => setQuickDocModalType("assignment")}>
                        👤 Zimmatga berish
                      </button>
                      <button className="btn btn-sm" style={{ borderColor: "#06b6d4", color: "#06b6d4" }} onClick={() => setQuickDocModalType("return")}>
                        ↩️ Qaytarib olish
                      </button>
                      <button className="btn btn-sm" style={{ borderColor: "#a855f7", color: "#a855f7" }} onClick={() => setQuickDocModalType("transfer")}>
                        🚚 Ko'chirish
                      </button>
                      <button className="btn btn-sm" style={{ borderColor: "#f59e0b", color: "#f59e0b" }} onClick={() => setQuickDocModalType("repair")}>
                        🔧 Ta'mirga berish
                      </button>
                      <button className="btn btn-sm" style={{ borderColor: "#f43f5e", color: "#f43f5e" }} onClick={() => setQuickDocModalType("writeoff")}>
                        🗑️ Hisobdan chiqarish so'rovi
                      </button>
                    </>
                  )}
                  {!editMode && auth.vaqfAccess?.canEdit && (
                    <button className="btn btn-sm btn-primary" onClick={startEditingAsset}>
                      <Edit3 size={14} /> Tahrirlash
                    </button>
                  )}
                  {auth.vaqfAccess?.canEdit && (
                    <button className="btn btn-sm btn-danger" onClick={() => handleDeleteAsset(activeAsset)}>
                      <Trash2 size={14} /> O'chirish
                    </button>
                  )}
                </div>
              </div>

              {!editMode ? (
                <div className="resp-grid-2">
                  {/* Left: Main Details */}
                  <div className="glass-card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
                      <div>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "4px 10px",
                            borderRadius: 8,
                            background: "rgba(251, 204, 66, 0.16)",
                            color: "#fbcc42",
                            fontFamily: "monospace",
                            fontWeight: 800,
                            fontSize: 14,
                            marginBottom: 6,
                          }}
                        >
                          {activeAsset.inventory_no}
                        </span>
                        <h2 style={{ fontSize: 21, fontWeight: 800 }}>{activeAsset.name}</h2>
                        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
                          {activeAsset.institution_name} • {activeAsset.category_name}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                        <span className={`badge ${STATUS_META[activeAsset.status]?.badge || "badge-slate"}`}>
                          {STATUS_META[activeAsset.status]?.label || activeAsset.status}
                        </span>
                        <span className={`badge ${CONDITION_META[activeAsset.condition]?.badge || "badge-slate"}`}>
                          Holati: {CONDITION_META[activeAsset.condition]?.label || activeAsset.condition}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: 12,
                        padding: 14,
                        borderRadius: 12,
                        background: "var(--bg-subtle)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Hisob turi va miqdori</div>
                        <div style={{ fontWeight: 700, marginTop: 2 }}>
                          {activeAsset.quantity} {activeAsset.unit} ({activeAsset.tracking === "batch" ? "Partiya / Miqdoriy" : "Donalab"})
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Joy / Xona</div>
                        <div style={{ fontWeight: 700, marginTop: 2 }}>
                          {activeAsset.location_name ? (
                            `${activeAsset.location_parent_name ? activeAsset.location_parent_name + " → " : ""}${activeAsset.location_name}`
                          ) : (
                            <span style={{ color: "#f59e0b" }}>Belgilanmagan</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Javobgar xodim</div>
                        <div style={{ fontWeight: 700, marginTop: 2 }}>
                          {activeAsset.responsible_name || <span style={{ color: "#f43f5e" }}>Belgilanmagan</span>}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Kirim manbasi</div>
                        <div style={{ fontWeight: 700, marginTop: 2 }}>
                          {ACQUISITION_META[activeAsset.acquisition_type]?.label || activeAsset.acquisition_type}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Xarid narxi / Umumiy qiymat</div>
                        <div style={{ fontWeight: 700, marginTop: 2, color: "#10b981" }}>
                          {activeAsset.purchase_price !== null ? (
                            <>
                              {fmtMoney(Number(activeAsset.purchase_price) * Number(activeAsset.quantity || 1), activeAsset.currency)}
                              {Number(activeAsset.quantity) > 1 && (
                                <span style={{ fontSize: 11.5, color: "var(--text-secondary)", fontWeight: 400 }}>
                                  {" "}
                                  ({fmtMoney(activeAsset.purchase_price, activeAsset.currency)} / {activeAsset.unit})
                                </span>
                              )}
                            </>
                          ) : (
                            "—"
                          )}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Olingan sana / Kafolat</div>
                        <div style={{ fontWeight: 600, marginTop: 2 }}>
                          {activeAsset.acquired_at_str || "—"}
                          {activeAsset.warranty_until_str ? ` (Kafolat: ${activeAsset.warranty_until_str})` : ""}
                        </div>
                      </div>
                      {activeAsset.expense_ref && (
                        <div style={{ gridColumn: "1 / -1" }}>
                          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Bog'langan moliya xarajati</div>
                          <div style={{ marginTop: 4 }}>
                            <a
                              href={`/?expense_id=${encodeURIComponent(activeAsset.expense_ref)}`}
                              className="badge badge-amber"
                              style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5 }}
                            >
                              <Link2 size={13} /> Moliyada ko'rish (Xarajat ID: {activeAsset.expense_ref})
                            </a>
                          </div>
                        </div>
                      )}
                      {(activeAsset.brand || activeAsset.model || activeAsset.serial_no) && (
                        <div style={{ gridColumn: "1 / -1" }}>
                          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Brend / Model / Seriya raqami</div>
                          <div style={{ fontWeight: 600, marginTop: 2 }}>
                            {[activeAsset.brand, activeAsset.model, activeAsset.serial_no ? `SN: ${activeAsset.serial_no}` : null]
                              .filter(Boolean)
                              .join(" • ")}
                          </div>
                        </div>
                      )}
                      {(activeAsset.supplier || activeAsset.donor_name || activeAsset.donation_doc_no) && (
                        <div style={{ gridColumn: "1 / -1" }}>
                          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Yetkazib beruvchi / Homiy (Hadya)</div>
                          <div style={{ fontWeight: 600, marginTop: 2 }}>
                            {[
                              activeAsset.supplier ? `Do'kon: ${activeAsset.supplier}` : null,
                              activeAsset.donor_name ? `Homiy: ${activeAsset.donor_name}` : null,
                              activeAsset.donation_doc_no ? `Hujjat №: ${activeAsset.donation_doc_no}` : null,
                            ]
                              .filter(Boolean)
                              .join(" • ")}
                          </div>
                        </div>
                      )}
                      {(activeAsset.description || activeAsset.notes) && (
                        <div style={{ gridColumn: "1 / -1" }}>
                          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Izoh va tavsif</div>
                          <div style={{ marginTop: 2, fontSize: 13.5, lineHeight: 1.5 }}>
                            {activeAsset.description} {activeAsset.notes}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Photos Section */}
                    <div style={{ marginTop: 18 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <h3 style={{ fontSize: 14.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                          <Camera size={16} color="#fbcc42" /> Rasmlar ({activeAsset.photos?.length || 0})
                        </h3>
                        <label className="btn btn-sm" style={{ cursor: "pointer" }}>
                          <Camera size={14} /> {uploadingFile ? "Yuklanmoqda..." : "Rasm qo'shish"}
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            style={{ display: "none" }}
                            disabled={uploadingFile}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleUploadAssetPhoto(f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                      {(activeAsset.photos || []).length === 0 ? (
                        <div style={{ padding: 18, textAlign: "center", color: "var(--text-muted)", fontSize: 12.5, border: "1px dashed var(--border-subtle)", borderRadius: 10 }}>
                          Hozircha rasm biriktirilmagan
                        </div>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
                          {(activeAsset.photos || []).map((ph: any) => (
                            <a
                              key={ph.id}
                              href={ph.url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                display: "block",
                                borderRadius: 10,
                                overflow: "hidden",
                                border: ph.is_primary ? "2px solid #fbcc42" : "1px solid var(--border-subtle)",
                              }}
                            >
                              <img src={ph.url} alt={ph.file_name} style={{ width: "100%", height: 100, objectFit: "cover", display: "block" }} />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Documents Section */}
                    <div style={{ marginTop: 18 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <h3 style={{ fontSize: 14.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                          <FileSpreadsheet size={16} color="#06b6d4" /> Hujjatlar ({activeAsset.documents?.length || 0})
                        </h3>
                        <label className="btn btn-sm" style={{ cursor: "pointer" }}>
                          <Plus size={14} /> Hujjat biriktirish
                          <input
                            type="file"
                            accept=".pdf,image/*,.xlsx,.docx"
                            style={{ display: "none" }}
                            disabled={uploadingFile}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleUploadAssetDoc(f, activeAsset.acquisition_type === "donation" ? "donation_act" : "invoice", f.name);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                      {(activeAsset.documents || []).length === 0 ? (
                        <div style={{ padding: 14, textAlign: "center", color: "var(--text-muted)", fontSize: 12.5, border: "1px dashed var(--border-subtle)", borderRadius: 10 }}>
                          Faktura, kafolat xati yoki hadya dalolatnomasi biriktirilmagan
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {(activeAsset.documents || []).map((dc: any) => (
                            <a
                              key={dc.id}
                              href={dc.url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "8px 12px",
                                borderRadius: 8,
                                background: "var(--bg-subtle)",
                                border: "1px solid var(--border-subtle)",
                                color: "var(--text-primary)",
                                textDecoration: "none",
                                fontSize: 13,
                              }}
                            >
                              <span>📄 {dc.title || dc.file_name}</span>
                              <span className="badge badge-cyan">{dc.doc_type}</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                    {/* Right: Asset Events History & Lifecycle Documents */}
                    <div className="glass-card">
                      {(activeAsset.lifecycle_documents || []).length > 0 && (
                        <div style={{ marginBottom: 18 }}>
                          <div className="section-header" style={{ marginBottom: 10 }}>
                            <div className="section-title">
                              <FileText size={18} color="#fbcc42" /> Rasmiy dalolatnomalar ({activeAsset.lifecycle_documents.length})
                            </div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {activeAsset.lifecycle_documents.map((ld: any) => (
                              <div
                                key={ld.id}
                                style={{
                                  padding: "10px 12px",
                                  borderRadius: 10,
                                  background: "var(--bg-subtle)",
                                  border: "1px solid var(--border-subtle)",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                  gap: 8,
                                }}
                              >
                                <div>
                                  <span style={{ fontFamily: "monospace", color: "#fbcc42", fontWeight: 800, marginRight: 8 }}>
                                    {ld.doc_no}
                                  </span>
                                  <span className={`badge ${DOC_TYPE_META[ld.type]?.badge || "badge-slate"}`}>
                                    {DOC_TYPE_META[ld.type]?.label || ld.type}
                                  </span>
                                  <span className={`badge ${DOC_STATUS_META[ld.status]?.badge || "badge-slate"}`} style={{ marginLeft: 6 }}>
                                    {DOC_STATUS_META[ld.status]?.label || ld.status}
                                  </span>
                                </div>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <a
                                    href={`/vaqf-api/documents/${ld.id}/pdf?lang=tr`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn btn-sm btn-cyan"
                                    style={{ textDecoration: "none" }}
                                  >
                                    TR PDF
                                  </a>
                                  <a
                                    href={`/vaqf-api/documents/${ld.id}/pdf?lang=uz`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn btn-sm"
                                    style={{ textDecoration: "none" }}
                                  >
                                    UZ PDF
                                  </a>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="section-header">
                        <div className="section-title">
                          <History size={18} color="#10b981" /> Buyum tarixi (Audit log)
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {(activeAsset.events || []).map((ev: any) => (
                          <div
                            key={ev.id}
                            style={{
                              padding: 12,
                              borderRadius: 10,
                              background: "var(--bg-subtle)",
                              border: "1px solid var(--border-subtle)",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 6 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <strong style={{ fontSize: 13, color: "#fbcc42" }}>
                                  {EVENT_LABELS[ev.event_type] || ev.event_type}
                                </strong>
                                {ev.doc_no && ev.pdf_url && (
                                  <a
                                    href={`${ev.pdf_url}?lang=tr`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="badge badge-cyan"
                                    style={{ textDecoration: "none", fontFamily: "monospace" }}
                                  >
                                    📄 {ev.doc_no} (PDF)
                                  </a>
                                )}
                              </div>
                              <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                                {new Date(ev.created_at).toLocaleString("uz-UZ")}
                              </span>
                            </div>
                            <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                              Bajaruvchi: <strong>{ev.actor_name || ev.actor_id || "Tizim"}</strong>
                              {ev.note ? ` — ${ev.note}` : ""}
                            </div>
                            {(ev.old_value || ev.new_value) && (
                              <pre
                                style={{
                                  marginTop: 6,
                                  padding: 8,
                                  borderRadius: 6,
                                  background: "rgba(0,0,0,0.25)",
                                  fontSize: 11,
                                  color: "var(--text-secondary)",
                                  overflowX: "auto",
                                }}
                              >
                                {JSON.stringify({ old: ev.old_value, new: ev.new_value }, null, 2)}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                </div>
              ) : (
                /* Edit Form */
                <form onSubmit={saveAssetEdit} className="glass-card">
                  <div className="section-header">
                    <div className="section-title">
                      <Edit3 size={18} color="#fbcc42" /> Kartochkani tahrirlash: {activeAsset.inventory_no}
                    </div>
                    <button type="button" className="btn btn-sm" onClick={() => setEditMode(false)}>
                      Bekor qilish
                    </button>
                  </div>

                  <div className="form-grid">
                    <div className="form-field">
                      <label className="form-label">Buyum nomi *</label>
                      <input
                        className="input"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Kategoriya *</label>
                      <select
                        className="select"
                        value={editForm.category_id}
                        onChange={(e) => setEditForm({ ...editForm, category_id: e.target.value })}
                        required
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.parent_id ? `   ${c.name}` : c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-field">
                      <label className="form-label">Hisob turi</label>
                      <select
                        className="select"
                        value={editForm.tracking}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            tracking: e.target.value,
                            quantity: e.target.value === "individual" ? "1" : editForm.quantity,
                          })
                        }
                      >
                        <option value="individual">Donalab (Individual — 1 dona)</option>
                        <option value="batch">Partiya / Miqdoriy (Batch — ko'p sonli)</option>
                      </select>
                    </div>
                    <div className="form-field">
                      <label className="form-label">Miqdori va birligi</label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          type="number"
                          step="any"
                          min="1"
                          className="input"
                          disabled={editForm.tracking === "individual"}
                          value={editForm.tracking === "individual" ? "1" : editForm.quantity}
                          onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                        />
                        <input
                          className="input"
                          style={{ width: 110 }}
                          value={editForm.unit}
                          onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="form-field">
                      <label className="form-label">Joy / Xona</label>
                      <select
                        className="select"
                        value={editForm.location_id}
                        onChange={(e) => setEditForm({ ...editForm, location_id: e.target.value })}
                      >
                        <option value="">— Belgilanmagan —</option>
                        {flatLocationOptions.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-field">
                      <label className="form-label">Javobgar xodim</label>
                      <input
                        className="input"
                        list="vaqf-staff-datalist"
                        value={editForm.responsible_name}
                        onChange={(e) => {
                          const val = e.target.value;
                          const matched = staffList.find((s) => s.name === val);
                          setEditForm({
                            ...editForm,
                            responsible_name: val,
                            responsible_ref: matched ? matched.ref : editForm.responsible_ref,
                          });
                        }}
                      />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Holati</label>
                      <select
                        className="select"
                        value={editForm.status}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                      >
                        {Object.entries(STATUS_META).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-field">
                      <label className="form-label">Yaroqlilik darajasi</label>
                      <select
                        className="select"
                        value={editForm.condition}
                        onChange={(e) => setEditForm({ ...editForm, condition: e.target.value })}
                      >
                        {Object.entries(CONDITION_META).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-field">
                      <label className="form-label">Kirim manbasi</label>
                      <select
                        className="select"
                        value={editForm.acquisition_type}
                        onChange={(e) => setEditForm({ ...editForm, acquisition_type: e.target.value })}
                      >
                        {Object.entries(ACQUISITION_META).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-field">
                      <label className="form-label">Narxi (1 birlik uchun) va Valyuta</label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          className="input"
                          value={editForm.purchase_price}
                          onChange={(e) => setEditForm({ ...editForm, purchase_price: e.target.value })}
                        />
                        <select
                          className="select"
                          style={{ width: 95 }}
                          value={editForm.currency}
                          onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })}
                        >
                          <option value="TRY">TRY (₺)</option>
                          <option value="USD">USD ($)</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-field">
                      <label className="form-label">Olingan sana</label>
                      <input
                        type="date"
                        className="input"
                        value={editForm.acquired_at}
                        onChange={(e) => setEditForm({ ...editForm, acquired_at: e.target.value })}
                      />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Brend / Model / Seriya №</label>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          className="input"
                          placeholder="Brend"
                          value={editForm.brand}
                          onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                        />
                        <input
                          className="input"
                          placeholder="Model"
                          value={editForm.model}
                          onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                        />
                        <input
                          className="input"
                          placeholder="Seriya №"
                          value={editForm.serial_no}
                          onChange={(e) => setEditForm({ ...editForm, serial_no: e.target.value })}
                        />
                      </div>
                    </div>
                    {editForm.acquisition_type === "donation" ? (
                      <>
                        <div className="form-field">
                          <label className="form-label">Homiy (Vaqf ehson qiluvchi)</label>
                          <input
                            className="input"
                            value={editForm.donor_name}
                            onChange={(e) => setEditForm({ ...editForm, donor_name: e.target.value })}
                          />
                        </div>
                        <div className="form-field">
                          <label className="form-label">Hadya hujjati №</label>
                          <input
                            className="input"
                            value={editForm.donation_doc_no}
                            onChange={(e) => setEditForm({ ...editForm, donation_doc_no: e.target.value })}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="form-field">
                        <label className="form-label">Yetkazib beruvchi / Do'kon</label>
                        <input
                          className="input"
                          value={editForm.supplier}
                          onChange={(e) => setEditForm({ ...editForm, supplier: e.target.value })}
                        />
                      </div>
                    )}
                    <div className="form-field" style={{ gridColumn: "1 / -1" }}>
                      <label className="form-label">Izoh / O'zgarish sababi</label>
                      <input
                        className="input"
                        placeholder="Masalan: 302-xonaga ko'chirildi..."
                        value={editForm.event_note}
                        onChange={(e) => setEditForm({ ...editForm, event_note: e.target.value })}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
                    <button type="button" className="btn" onClick={() => setEditMode(false)}>
                      Bekor qilish
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={busy}>
                      <Check size={16} /> O'zgarishlarni saqlash
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* 4. YANGI BUYUM QO'SHISH (QUICK MOBILE-FRIENDLY FORM) */}
          {/* ============================================================== */}
          {page === "new_asset" && (
            <div className="animate-in">
              <div className="glass-card" style={{ maxWidth: 880, margin: "0 auto" }}>
                <div className="section-header">
                  <div>
                    <div className="section-title">
                      <Plus size={18} color="#fbcc42" /> Yangi buyum / mulk kartochkasi qo'shish
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 2 }}>
                      Xonama-xona inventarizatsiya uchun oxirgi tanlangan joy va javobgar xodim avtomatik eslab qolinadi.
                    </div>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-field">
                    <label className="form-label">Kategoriya *</label>
                    <select
                      className="select"
                      value={newForm.category_id}
                      onChange={(e) => handleCategorySelectOnNew(e.target.value)}
                      required
                    >
                      <option value="">— Kategoriyani tanlang —</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.parent_id ? `   ${c.name}` : c.name} ({c.tracking === "batch" ? "Partiya" : "Donalab"})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field">
                    <label className="form-label">Buyum nomi *</label>
                    <input
                      className="input"
                      placeholder="Masalan: O'quv partasi, Epson Proyektor, Ikki qavatli karavot..."
                      value={newForm.name}
                      onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label className="form-label">Hisob turi (kategoriya bo'yicha avtomatik)</label>
                    <select
                      className="select"
                      value={newForm.tracking}
                      onChange={(e) =>
                        setNewForm({
                          ...newForm,
                          tracking: e.target.value,
                          quantity: e.target.value === "individual" ? "1" : newForm.quantity,
                        })
                      }
                    >
                      <option value="individual">Donalab (Individual — alohida inventar №)</option>
                      <option value="batch">Partiya / Miqdoriy (Batch — bitta kartada N ta)</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label className="form-label">Miqdori va o'lchov birligi</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="number"
                        step="any"
                        min="1"
                        className="input"
                        disabled={newForm.tracking === "individual"}
                        value={newForm.tracking === "individual" ? "1" : newForm.quantity}
                        onChange={(e) => setNewForm({ ...newForm, quantity: e.target.value })}
                      />
                      <select
                        className="select"
                        style={{ width: 130 }}
                        value={newForm.unit}
                        onChange={(e) => setNewForm({ ...newForm, unit: e.target.value })}
                      >
                        <option value="dona">dona</option>
                        <option value="komplekt">komplekt</option>
                        <option value="juft">juft</option>
                        <option value="metr">metr</option>
                        <option value="m2">m²</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-field">
                    <label className="form-label">Joy / Xona (eslab qolinadi)</label>
                    <select
                      className="select"
                      value={newForm.location_id}
                      onChange={(e) => setNewForm({ ...newForm, location_id: e.target.value })}
                    >
                      <option value="">— Joyni tanlang —</option>
                      {flatLocationOptions.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field">
                    <label className="form-label">Javobgar xodim (eslab qolinadi)</label>
                    <input
                      className="input"
                      list="vaqf-staff-datalist"
                      placeholder="Xodim ismini tanlang yoki yozing..."
                      value={newForm.responsible_name}
                      onChange={(e) => {
                        const val = e.target.value;
                        const matched = staffList.find((s) => s.name === val);
                        setNewForm({
                          ...newForm,
                          responsible_name: val,
                          responsible_ref: matched ? matched.ref : "",
                        });
                      }}
                    />
                    <datalist id="vaqf-staff-datalist">
                      {staffList.map((s) => (
                        <option key={s.ref} value={s.name}>
                          {s.role}
                        </option>
                      ))}
                    </datalist>
                  </div>

                  <div className="form-field">
                    <label className="form-label">Holati va Yaroqliligi</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <select
                        className="select"
                        value={newForm.status}
                        onChange={(e) => setNewForm({ ...newForm, status: e.target.value })}
                      >
                        {Object.entries(STATUS_META).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                      <select
                        className="select"
                        value={newForm.condition}
                        onChange={(e) => setNewForm({ ...newForm, condition: e.target.value })}
                      >
                        {Object.entries(CONDITION_META).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="form-field">
                    <label className="form-label">Kirim manbasi</label>
                    <select
                      className="select"
                      value={newForm.acquisition_type}
                      onChange={(e) => setNewForm({ ...newForm, acquisition_type: e.target.value })}
                    >
                      {Object.entries(ACQUISITION_META).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field">
                    <label className="form-label">Narxi (1 {newForm.unit} uchun) va Valyuta</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        className="input"
                        placeholder="0.00"
                        value={newForm.purchase_price}
                        onChange={(e) => setNewForm({ ...newForm, purchase_price: e.target.value })}
                      />
                      <select
                        className="select"
                        style={{ width: 100 }}
                        value={newForm.currency}
                        onChange={(e) => setNewForm({ ...newForm, currency: e.target.value })}
                      >
                        <option value="TRY">TRY (₺)</option>
                        <option value="USD">USD ($)</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-field">
                    <label className="form-label">Olingan sana</label>
                    <input
                      type="date"
                      className="input"
                      value={newForm.acquired_at}
                      onChange={(e) => setNewForm({ ...newForm, acquired_at: e.target.value })}
                    />
                  </div>

                  {newForm.acquisition_type === "donation" ? (
                    <>
                      <div className="form-field">
                        <label className="form-label">Homiy (Hadya qiluvchi)</label>
                        <input
                          className="input"
                          placeholder="Homiy F.I.Sh yoki tashkilot"
                          value={newForm.donor_name}
                          onChange={(e) => setNewForm({ ...newForm, donor_name: e.target.value })}
                        />
                      </div>
                      <div className="form-field">
                        <label className="form-label">Hadya hujjati / Dalolatnoma №</label>
                        <input
                          className="input"
                          placeholder="Masalan: HD-2026/05"
                          value={newForm.donation_doc_no}
                          onChange={(e) => setNewForm({ ...newForm, donation_doc_no: e.target.value })}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="form-field">
                      <label className="form-label">Yetkazib beruvchi / Do'kon</label>
                      <input
                        className="input"
                        placeholder="Do'kon yoki firma nomi"
                        value={newForm.supplier}
                        onChange={(e) => setNewForm({ ...newForm, supplier: e.target.value })}
                      />
                    </div>
                  )}

                  <div className="form-field">
                    <label className="form-label">Brend / Model / Seriya №</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        className="input"
                        placeholder="Brend"
                        value={newForm.brand}
                        onChange={(e) => setNewForm({ ...newForm, brand: e.target.value })}
                      />
                      <input
                        className="input"
                        placeholder="Model"
                        value={newForm.model}
                        onChange={(e) => setNewForm({ ...newForm, model: e.target.value })}
                      />
                      <input
                        className="input"
                        placeholder="Seriya №"
                        value={newForm.serial_no}
                        onChange={(e) => setNewForm({ ...newForm, serial_no: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Mobile-Friendly Camera Photo Capture */}
                  <div className="form-field">
                    <label className="form-label">Buyum rasmi (Telefondan rasmga olish yoki yuklash)</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <label className="btn" style={{ cursor: "pointer" }}>
                        <Camera size={16} color="#fbcc42" />{" "}
                        {newForm.photoFile ? newForm.photoFile.name : "Rasmga olish / Tanlash"}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const f = e.target.files?.[0] || null;
                            setNewForm({ ...newForm, photoFile: f });
                          }}
                        />
                      </label>
                      {newForm.photoFile && (
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => setNewForm({ ...newForm, photoFile: null })}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="form-field" style={{ gridColumn: "1 / -1" }}>
                    <label className="form-label">Qo'shimcha izoh</label>
                    <input
                      className="input"
                      placeholder="Buyum haqida qo'shimcha ma'lumot..."
                      value={newForm.notes}
                      onChange={(e) => setNewForm({ ...newForm, notes: e.target.value })}
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 10,
                    marginTop: 20,
                    flexWrap: "wrap",
                  }}
                >
                  <button type="button" className="btn" onClick={() => navigatePage("assets")}>
                    Bekor qilish
                  </button>
                  <button
                    type="button"
                    className="btn btn-cyan"
                    disabled={busy}
                    onClick={() => submitNewAsset("add_next")}
                  >
                    <Plus size={16} /> Saqlash va keyingisini qo'shish
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => submitNewAsset("open_card")}
                  >
                    <Check size={16} /> Saqlash va kartochkani ochish
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* 5. JOYLAR DARAXTI (LOCATIONS TREE) */}
          {/* ============================================================== */}
          {page === "locations" && (
            <div className="animate-in">
              <div className="glass-card">
                <div className="section-header">
                  <div>
                    <div className="section-title">
                      <Building2 size={18} color="#06b6d4" /> Muassasa joylari daraxti (Bino → Qavat → Xona)
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 2 }}>
                      Har bir joy qatorida o'sha joy va uning ichki xonalaridagi buyumlar soni ko'rsatilgan.
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      className="btn btn-sm"
                      onClick={async () => {
                        try {
                          setBusy(true);
                          const r = await apiFetch("/vaqf-api/locations", {
                            method: "POST",
                            body: JSON.stringify({ action: "sync_crm_rooms" }),
                          });
                          notify(`CRM xonalari sinxronlandi: ${r.imported} ta xona`);
                          await loadReferenceData();
                        } catch (e: any) {
                          notify(e.message, "err");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <RefreshCw size={14} /> CRM xonalarini sinxronlash
                    </button>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() =>
                        setLocModal({
                          institution_id: selectedInstitutionId,
                          parent_id: "",
                          kind: "room",
                          name: "",
                          code: "",
                          notes: "",
                        })
                      }
                    >
                      <Plus size={14} /> Yangi joy / xona qo'shish
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(() => {
                    const renderNode = (loc: any, depth: number): React.ReactNode => {
                      const kids = locationTree.get(loc.id) || [];
                      const isExpanded = expandedLocs[loc.id] ?? true;
                      return (
                        <div key={loc.id} style={{ marginLeft: depth * 22 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "9px 12px",
                              borderRadius: 10,
                              background: depth === 0 ? "var(--bg-subtle-strong)" : "var(--bg-subtle)",
                              border: "1px solid var(--border-subtle)",
                              marginBottom: 4,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              {kids.length > 0 ? (
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  style={{ padding: 4 }}
                                  onClick={() => setExpandedLocs({ ...expandedLocs, [loc.id]: !isExpanded })}
                                >
                                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                              ) : (
                                <span style={{ width: 24, display: "inline-block" }} />
                              )}
                              <span className={`badge ${KIND_META[loc.kind]?.badge || "badge-slate"}`}>
                                {KIND_META[loc.kind]?.label || loc.kind}
                              </span>
                              <strong style={{ fontSize: 13.5 }}>{loc.name}</strong>
                              {loc.code && (
                                <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace" }}>
                                  [{loc.code}]
                                </span>
                              )}
                              {loc.notes && (
                                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>— {loc.notes}</span>
                              )}
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <button
                                className="badge badge-emerald"
                                style={{ border: "none", cursor: "pointer" }}
                                onClick={() => {
                                  setFilters((f) => ({ ...f, location_id: String(loc.id), page: 1 }));
                                  navigatePage("assets");
                                }}
                              >
                                {loc.total_assets_count || 0} karta ({loc.total_quantity_sum || 0} birlik)
                              </button>
                              <button
                                className="btn btn-sm"
                                title="Ichiga joy qo'shish"
                                onClick={() =>
                                  setLocModal({
                                    institution_id: selectedInstitutionId,
                                    parent_id: loc.id,
                                    kind: loc.kind === "building" ? "floor" : "room",
                                    name: "",
                                    code: "",
                                    notes: "",
                                  })
                                }
                              >
                                <Plus size={13} />
                              </button>
                              <button
                                className="btn btn-sm"
                                title="Tahrirlash"
                                onClick={() => setLocModal({ ...loc, parent_id: loc.parent_id || "" })}
                              >
                                <Edit3 size={13} />
                              </button>
                            </div>
                          </div>
                          {isExpanded && kids.map((child) => renderNode(child, depth + 1))}
                        </div>
                      );
                    };
                    return (locationTree.get(0) || []).map((root) => renderNode(root, 0));
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* 6. KATEGORIYALAR (CATEGORIES) */}
          {/* ============================================================== */}
          {page === "categories" && (
            <div className="animate-in">
              <div className="glass-card">
                <div className="section-header">
                  <div className="section-title">
                    <Filter size={18} color="#fbcc42" /> Mulk va Jihoz Kategoriyalari
                  </div>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() =>
                      setCatModal({
                        parent_id: "",
                        name: "",
                        code: "",
                        tracking: "individual",
                        default_unit: "dona",
                        description: "",
                      })
                    }
                  >
                    <Plus size={14} /> Yangi kategoriya
                  </button>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Kategoriya nomi</th>
                        <th>Yuqori kategoriya</th>
                        <th>Standart hisob turi</th>
                        <th>Birlik</th>
                        <th>Buyumlar soni</th>
                        <th>Tavsif</th>
                        <th>Amal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <strong style={{ paddingLeft: c.parent_id ? 18 : 0 }}>
                              {c.parent_id ? "↳ " : ""}
                              {c.name}
                            </strong>
                          </td>
                          <td>{c.parent_name || "Asosiy"}</td>
                          <td>
                            <span className={`badge ${c.tracking === "batch" ? "badge-violet" : "badge-cyan"}`}>
                              {c.tracking === "batch" ? "Partiya (batch)" : "Donalab (individual)"}
                            </span>
                          </td>
                          <td>{c.default_unit}</td>
                          <td>
                            <button
                              className="badge badge-emerald"
                              style={{ border: "none", cursor: "pointer" }}
                              onClick={() => {
                                setFilters((f) => ({ ...f, category_id: String(c.id), page: 1 }));
                                navigatePage("assets");
                              }}
                            >
                              {c.assets_count || 0} karta ({c.quantity_sum || 0} birlik)
                            </button>
                          </td>
                          <td style={{ color: "var(--text-secondary)", fontSize: 12.5 }}>{c.description || "—"}</td>
                          <td>
                            <button
                              className="btn btn-sm"
                              onClick={() => setCatModal({ ...c, parent_id: c.parent_id || "" })}
                            >
                              <Edit3 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* 7. EXCEL / CSV IMPORT */}
          {/* ============================================================== */}
          {page === "import" && (
            <div className="animate-in">
              <div className="glass-card" style={{ marginBottom: 16 }}>
                <div className="section-header">
                  <div>
                    <div className="section-title">
                      <FileSpreadsheet size={18} color="#10b981" /> Excel / CSV orqali ommaviy yuklash
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 2 }}>
                      1) Shablonni yuklab oling → 2) To'ldirilgan faylni tanlab tekshiring → 3) Xatolarsiz qatorlarni tasdiqlang.
                    </div>
                  </div>
                  <button
                    className="btn btn-sm btn-cyan"
                    onClick={() => window.open("/vaqf-api/import/template", "_blank")}
                  >
                    <Download size={14} /> Excel shablonni yuklab olish (.xlsx)
                  </button>
                </div>

                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <label className="btn" style={{ cursor: "pointer" }}>
                    <FileSpreadsheet size={16} color="#10b981" />{" "}
                    {importFile ? importFile.name : "Excel (.xlsx) yoki CSV faylni tanlang"}
                    <input
                      type="file"
                      accept=".xlsx,.csv"
                      style={{ display: "none" }}
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        try {
                          setImportBusy(true);
                          const dataUrl = await readFileAsDataUrl(f);
                          const fileInfo = { name: f.name, dataUrl, mimeType: f.type };
                          setImportFile(fileInfo);
                          const prev = await apiFetch("/vaqf-api/import/assets", {
                            method: "POST",
                            body: JSON.stringify({
                              mode: "preview",
                              institution_id: selectedInstitutionId,
                              fileName: f.name,
                              mimeType: f.type,
                              dataUrl,
                            }),
                          });
                          setImportPreview(prev);
                        } catch (err: any) {
                          notify(err.message, "err");
                        } finally {
                          setImportBusy(false);
                        }
                      }}
                    />
                  </label>

                  {importPreview && (
                    <button
                      className="btn btn-primary"
                      disabled={importBusy || importPreview.validCount === 0}
                      onClick={async () => {
                        if (!importFile) return;
                        try {
                          setImportBusy(true);
                          const res = await apiFetch("/vaqf-api/import/assets", {
                            method: "POST",
                            body: JSON.stringify({
                              mode: "commit",
                              skipInvalid: true,
                              institution_id: selectedInstitutionId,
                              fileName: importFile.name,
                              mimeType: importFile.mimeType,
                              dataUrl: importFile.dataUrl,
                            }),
                          });
                          notify(`${res.importedCount} ta mulk muvaffaqiyatli import qilindi!`);
                          setImportPreview(null);
                          setImportFile(null);
                          await Promise.all([loadAssets(), loadSummary(), loadReferenceData()]);
                          navigatePage("assets");
                        } catch (err: any) {
                          notify(err.message, "err");
                        } finally {
                          setImportBusy(false);
                        }
                      }}
                    >
                      <Check size={16} /> Tasdiqlash va bazaga yozish ({importPreview.validCount} ta yaroqli)
                    </button>
                  )}
                </div>
              </div>

              {importPreview && (
                <div className="glass-card">
                  <div className="section-header">
                    <div className="section-title">
                      Oldindan ko'rish natijasi: Jami {importPreview.totalRows} qator (
                      <span style={{ color: "#10b981" }}>{importPreview.validCount} ta to'g'ri</span>,{" "}
                      <span style={{ color: "#f43f5e" }}>{importPreview.errorCount} ta xatolik</span>)
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Qator</th>
                          <th>Nomi</th>
                          <th>Kategoriya</th>
                          <th>Hisob turi / Miqdori</th>
                          <th>Joy / Xona</th>
                          <th>Javobgar</th>
                          <th>Narxi</th>
                          <th>Holati / Xatolar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(importPreview.rows || []).map((r: any) => (
                          <tr key={r.rowNumber}>
                            <td>#{r.rowNumber}</td>
                            <td>
                              <strong>{r.name || "—"}</strong>
                            </td>
                            <td>{r.category_name}</td>
                            <td>
                              {r.quantity} {r.unit} ({r.tracking})
                            </td>
                            <td>{r.location_name || "—"}</td>
                            <td>{r.responsible_name || "—"}</td>
                            <td>{r.purchase_price !== null ? `${r.purchase_price} ${r.currency}` : "—"}</td>
                            <td>
                              {r.valid ? (
                                <span className="badge badge-emerald">Tayyor</span>
                              ) : (
                                <div style={{ color: "#fb7185", fontSize: 12 }}>
                                  {r.errors.join("; ")}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <SystemHealthAndMultiImportSection
                isDirector={false}
                notify={notify}
              />
            </div>
          )}

          {/* ============================================================== */}
          {/* 8. QR YORLIQLAR (QR LABELS PDF) */}
          {/* ============================================================== */}
          {page === "labels" && (
            <div className="animate-in">
              <div className="resp-grid-2">
                <div className="glass-card">
                  <div className="section-header">
                    <div className="section-title">
                      <Settings size={18} color="#fbcc42" /> QR Yorliq va Printer Sozlamalari
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div className="form-field">
                      <label className="form-label">Qog'oz / Printer formati</label>
                      <select
                        className="select"
                        value={labelSettings.preset}
                        onChange={(e) => {
                          const p = e.target.value;
                          setLabelSettings((prev) => ({
                            ...prev,
                            preset: p,
                            cols: p === "a4_2x7" ? "2" : p === "a4_3x8" ? "3" : prev.cols,
                            rows: p === "a4_2x7" ? "7" : p === "a4_3x8" ? "8" : prev.rows,
                          }));
                        }}
                      >
                        <option value="a4_3x8">A4 Stiker varag'i — 3 × 8 (24 ta yorliq / bet)</option>
                        <option value="a4_2x7">A4 Stiker varag'i — 2 × 7 (14 ta yirik yorliq / bet)</option>
                        <option value="a4_custom">A4 Maxsus o'lcham (Ustun × Qator)</option>
                        <option value="thermal_58x40">Termoprinter ruloni — 58 × 40 mm</option>
                        <option value="thermal_50x30">Termoprinter ruloni — 50 × 30 mm</option>
                        <option value="custom_thermal">Termoprinter maxsus o'lcham (mm × mm)</option>
                      </select>
                    </div>

                    {labelSettings.preset.startsWith("a4") ? (
                      <div className="resp-grid-2">
                        <div className="form-field">
                          <label className="form-label">Ustunlar soni (A4 eniga)</label>
                          <input
                            type="number"
                            min="1"
                            max="5"
                            className="input"
                            value={labelSettings.cols}
                            onChange={(e) => setLabelSettings({ ...labelSettings, cols: e.target.value })}
                          />
                        </div>
                        <div className="form-field">
                          <label className="form-label">Qatorlar soni (A4 bo'yiga)</label>
                          <input
                            type="number"
                            min="1"
                            max="12"
                            className="input"
                            value={labelSettings.rows}
                            onChange={(e) => setLabelSettings({ ...labelSettings, rows: e.target.value })}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="resp-grid-2">
                        <div className="form-field">
                          <label className="form-label">Yorliq eni (mm)</label>
                          <input
                            type="number"
                            min="25"
                            max="120"
                            className="input"
                            value={labelSettings.widthMm}
                            onChange={(e) => setLabelSettings({ ...labelSettings, widthMm: e.target.value })}
                          />
                        </div>
                        <div className="form-field">
                          <label className="form-label">Yorliq balandligi (mm)</label>
                          <input
                            type="number"
                            min="15"
                            max="100"
                            className="input"
                            value={labelSettings.heightMm}
                            onChange={(e) => setLabelSettings({ ...labelSettings, heightMm: e.target.value })}
                          />
                        </div>
                      </div>
                    )}

                    <div className="form-field">
                      <label className="form-label">
                        QR kod ichidagi asosiy domen (telefonda skanerlanganda ochiladigan manzil)
                      </label>
                      <input
                        className="input"
                        value={labelSettings.baseUrl}
                        onChange={(e) => setLabelSettings({ ...labelSettings, baseUrl: e.target.value })}
                        placeholder="https://domen.org yoki http://192.168.1.10:3000"
                      />
                      <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                        Namuna manzil: <code>{labelSettings.baseUrl.replace(/\/+$/, "")}/vaqf/a/EV-MZN-000001</code>
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                      <button
                        className="btn btn-primary"
                        onClick={() => openLabelsPdf(selectedIds)}
                      >
                        <Download size={16} />{" "}
                        {selectedIds.length > 0
                          ? `Tanlangan ${selectedIds.length} ta buyum uchun PDF chiqarish`
                          : "Oxirgi buyumlar uchun QR PDF chiqarish"}
                      </button>
                      <button
                        className="btn btn-cyan"
                        onClick={() => {
                          localStorage.setItem("vaqf_label_settings", JSON.stringify(labelSettings));
                          const q = new URLSearchParams();
                          q.set("mode", "locations");
                          q.set("institution_id", String(selectedInstitutionId));
                          q.set("preset", labelSettings.preset);
                          q.set("cols", String(labelSettings.cols || 3));
                          q.set("rows", String(labelSettings.rows || 8));
                          q.set("width_mm", String(labelSettings.widthMm || 58));
                          q.set("height_mm", String(labelSettings.heightMm || 40));
                          if (labelSettings.baseUrl) q.set("base_url", labelSettings.baseUrl);
                          window.open(`/vaqf-api/labels?${q.toString()}`, "_blank");
                        }}
                      >
                        <Building2 size={16} /> Xona / Eshik QR Yorliqlari (PDF)
                      </button>
                      {selectedIds.length > 0 && (
                        <button className="btn" onClick={() => setSelectedIds([])}>
                          Tanlovni tozalash
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Visual Preview of Sticker */}
                <div className="glass-card">
                  <div className="section-header">
                    <div className="section-title">Yorliq ko'rinishi (Namuna)</div>
                  </div>
                  <div
                    style={{
                      background: "#ffffff",
                      color: "#0f172a",
                      borderRadius: 12,
                      padding: 18,
                      border: "2px solid #cbd5e1",
                      maxWidth: 360,
                      margin: "12px auto",
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
                    }}
                  >
                    <div
                      style={{
                        width: 84,
                        height: 84,
                        border: "2px solid #0f172a",
                        borderRadius: 6,
                        display: "grid",
                        placeItems: "center",
                        fontWeight: 800,
                        fontSize: 11,
                        flexShrink: 0,
                      }}
                    >
                      [QR KOD]
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <img src="/vaqf/ezan-logo.svg" alt="" style={{ width: 16, height: 20 }} />
                        <span style={{ fontWeight: 800, fontSize: 12, color: "#b45309" }}>EZAN VAKFI</span>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 15, fontFamily: "monospace", color: "#0f172a" }}>
                        EV-MZN-000001
                      </div>
                      <div style={{ fontSize: 12.5, color: "#1e293b", marginTop: 2, fontWeight: 600 }}>
                        O'quv partasi (2 kishilik)
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                        MZN • 301-xona • 12 dona
                      </div>
                    </div>
                  </div>
                  <p style={{ textAlign: "center", fontSize: 12.5, color: "var(--text-secondary)", marginTop: 12 }}>
                    Telefonda QR skanerlanganda <code>/vaqf/a/EV-MZN-...</code> manzili orqali buyum kartochkasi darhol ochiladi.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* 9. INVENTARIZATSIYA (SANOQ) — DIREKTOR MODULI */}
          {/* ============================================================== */}
          {page === "counts" && (
            <DirectorInventoryCountsSection
              institutions={institutions}
              selectedInstitutionId={activeNumericInstId}
              locations={locations}
              categories={categories}
              staff={staffList}
              staffList={staffList}
              notify={notify}
              onOpenMobileScanner={(cId) => {
                setMobileCountId(cId);
                setPage("mobile_count");
                window.history.pushState({}, "", `/vaqf/count/${cId}`);
              }}
            />
          )}

          {page === "documents" && (
            <DocumentsAndApprovalsSection
              mode="documents"
              institutionId={activeNumericInstId}
              institutions={institutions}
              flatLocations={flatLocationOptions}
              staffList={staffList}
              vAccess={auth.vaqfAccess}
              notify={notify}
              onOpenAsset={openAssetCard}
            />
          )}

          {page === "approvals" && (
            <DocumentsAndApprovalsSection
              mode="approvals"
              institutionId={activeNumericInstId}
              institutions={institutions}
              flatLocations={flatLocationOptions}
              staffList={staffList}
              vAccess={auth.vaqfAccess}
              notify={notify}
              onOpenAsset={openAssetCard}
            />
          )}

          {page === "my_assets" && <MyAssetsSection notify={notify} />}

          {page === "faults_offboarding" && (
            <FaultsAndOffboardingSection
              institutionId={activeNumericInstId}
              institutions={institutions}
              flatLocations={flatLocationOptions}
              staffList={staffList}
              notify={notify}
            />
          )}

          {page === "pending_expenses" && (
            <PendingFinanceExpensesSection
              categories={categories}
              locations={locations}
              staffList={staffList}
              isDirector={Boolean(auth.vaqfAccess?.isDirector || auth.vaqfAccess?.canManageRoles)}
              notify={notify}
              onOpenAsset={openAssetCard}
            />
          )}

          {page === "schedules" && (
            <SchedulesAndRemindersSection
              institutionId={selectedInstitutionId}
              assets={assetsData.items || []}
              locations={locations}
              staffList={staffList}
              canEdit={Boolean(auth.vaqfAccess?.canEdit)}
              notify={notify}
            />
          )}

          {page === "reports" && (
            <LifecycleReportsSection institutionId={activeNumericInstId} notify={notify} />
          )}

          {page === "roles_settings" && (
            <>
              <RolesAndSettingsSection institutions={institutions} notify={notify} />
              <SystemHealthAndMultiImportSection
                isDirector={Boolean(auth.vaqfAccess?.isDirector || auth.vaqfAccess?.canManageRoles)}
                notify={notify}
              />
            </>
          )}

          {page === "donations" && (
            <DonationsRegistryPanel
              institutionId={selectedInstitutionId}
              categories={categories}
              locations={locations}
              permissions={auth.vaqfAccess}
              notify={notify}
            />
          )}

          {page === "properties" && (
            <PropertiesAndLeasesPanel
              institutionId={selectedInstitutionId}
              permissions={auth.vaqfAccess}
              notify={notify}
            />
          )}

          {page === "archive" && (
            <ArchiveDocumentsPanel
              institutionId={selectedInstitutionId}
              permissions={auth.vaqfAccess}
              notify={notify}
            />
          )}

          {page === "board" && (
            <BoardDecisionsPanel
              permissions={auth.vaqfAccess}
              notify={notify}
            />
          )}

          {page === "annual_report" && (
            <AnnualVaqfReportPanel notify={notify} />
          )}

          {quickDocModalType && activeAsset && (
            <NewDocumentModal
              open={true}
              onClose={() => setQuickDocModalType(null)}
              initialType={quickDocModalType}
              initialAssets={[activeAsset]}
              initialFromPersonRef={activeAsset.responsible_ref || ""}
              initialFromPersonName={activeAsset.responsible_name || ""}
              institutionId={activeNumericInstId}
              institutions={institutions}
              flatLocations={flatLocationOptions}
              staffList={staffList}
              notify={notify}
              onCreated={async () => {
                await openAssetCard(activeAsset.id);
                loadAssets().catch(() => {});
                loadSummary().catch(() => {});
              }}
            />
          )}
        </main>
      </div>

      {/* Location Create/Edit Modal */}
      {locModal && (
        <div className="modal-backdrop" onClick={() => setLocModal(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="section-header">
              <div className="section-title">{locModal.id ? "Joyni tahrirlash" : "Yangi joy / xona qo'shish"}</div>
              <button className="btn btn-sm" onClick={() => setLocModal(null)}>
                <X size={15} />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  setBusy(true);
                  if (locModal.id) {
                    await apiFetch(`/vaqf-api/locations/${locModal.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({
                        parent_id: locModal.parent_id ? Number(locModal.parent_id) : null,
                        kind: locModal.kind,
                        name: locModal.name,
                        code: locModal.code || null,
                        notes: locModal.notes || null,
                      }),
                    });
                    notify("Joy ma'lumotlari yangilandi!");
                  } else {
                    await apiFetch("/vaqf-api/locations", {
                      method: "POST",
                      body: JSON.stringify({
                        institution_id: selectedInstitutionId,
                        parent_id: locModal.parent_id ? Number(locModal.parent_id) : null,
                        kind: locModal.kind,
                        name: locModal.name,
                        code: locModal.code || null,
                        notes: locModal.notes || null,
                      }),
                    });
                    notify("Yangi joy qo'shildi!");
                  }
                  setLocModal(null);
                  await loadReferenceData();
                } catch (err: any) {
                  notify(err.message, "err");
                } finally {
                  setBusy(false);
                }
              }}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="form-field">
                <label className="form-label">Joy turi *</label>
                <select
                  className="select"
                  value={locModal.kind}
                  onChange={(e) => setLocModal({ ...locModal, kind: e.target.value })}
                >
                  {Object.entries(KIND_META).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Yuqori joy (Bino yoki Qavat)</label>
                <select
                  className="select"
                  value={locModal.parent_id}
                  onChange={(e) => setLocModal({ ...locModal, parent_id: e.target.value })}
                >
                  <option value="">— Yuqori daraja (Asosiy) —</option>
                  {flatLocationOptions
                    .filter((l) => l.id !== locModal.id)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Nomi *</label>
                <input
                  className="input"
                  placeholder="Masalan: 302-xona yoki Kutubxona"
                  value={locModal.name}
                  onChange={(e) => setLocModal({ ...locModal, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-field">
                <label className="form-label">Qisqa kodi</label>
                <input
                  className="input"
                  placeholder="Masalan: 302"
                  value={locModal.code || ""}
                  onChange={(e) => setLocModal({ ...locModal, code: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Izoh</label>
                <input
                  className="input"
                  value={locModal.notes || ""}
                  onChange={(e) => setLocModal({ ...locModal, notes: e.target.value })}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                {locModal.id ? (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={async () => {
                      if (!window.confirm("Ushbu joyni o'chirishni tasdiqlaysizmi?")) return;
                      try {
                        await apiFetch(`/vaqf-api/locations/${locModal.id}`, { method: "DELETE" });
                        notify("Joy o'chirildi");
                        setLocModal(null);
                        await loadReferenceData();
                      } catch (err: any) {
                        notify(err.message, "err");
                      }
                    }}
                  >
                    <Trash2 size={14} /> O'chirish
                  </button>
                ) : (
                  <span />
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn" onClick={() => setLocModal(null)}>
                    Bekor qilish
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    Saqlash
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Create/Edit Modal */}
      {catModal && (
        <div className="modal-backdrop" onClick={() => setCatModal(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="section-header">
              <div className="section-title">
                {catModal.id ? "Kategoriyani tahrirlash" : "Yangi kategoriya qo'shish"}
              </div>
              <button className="btn btn-sm" onClick={() => setCatModal(null)}>
                <X size={15} />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  setBusy(true);
                  if (catModal.id) {
                    await apiFetch(`/vaqf-api/categories/${catModal.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({
                        parent_id: catModal.parent_id ? Number(catModal.parent_id) : null,
                        name: catModal.name,
                        tracking: catModal.tracking,
                        default_unit: catModal.default_unit || "dona",
                        description: catModal.description || null,
                      }),
                    });
                    notify("Kategoriya yangilandi!");
                  } else {
                    await apiFetch("/vaqf-api/categories", {
                      method: "POST",
                      body: JSON.stringify({
                        parent_id: catModal.parent_id ? Number(catModal.parent_id) : null,
                        name: catModal.name,
                        code: catModal.code || null,
                        tracking: catModal.tracking,
                        default_unit: catModal.default_unit || "dona",
                        description: catModal.description || null,
                      }),
                    });
                    notify("Yangi kategoriya qo'shildi!");
                  }
                  setCatModal(null);
                  await loadReferenceData();
                } catch (err: any) {
                  notify(err.message, "err");
                } finally {
                  setBusy(false);
                }
              }}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="form-field">
                <label className="form-label">Yuqori kategoriya (ixtiyoriy)</label>
                <select
                  className="select"
                  value={catModal.parent_id}
                  onChange={(e) => setCatModal({ ...catModal, parent_id: e.target.value })}
                >
                  <option value="">— Asosiy kategoriya —</option>
                  {categories
                    .filter((c) => !c.parent_id && c.id !== catModal.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Kategoriya nomi *</label>
                <input
                  className="input"
                  value={catModal.name}
                  onChange={(e) => setCatModal({ ...catModal, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-field">
                <label className="form-label">Standart hisob turi *</label>
                <select
                  className="select"
                  value={catModal.tracking}
                  onChange={(e) => setCatModal({ ...catModal, tracking: e.target.value })}
                >
                  <option value="individual">Donalab (Individual — har bir buyum alohida)</option>
                  <option value="batch">Partiya / Miqdoriy (Batch — bir xil buyumlar guruhi)</option>
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Standart o'lchov birligi</label>
                <input
                  className="input"
                  value={catModal.default_unit || "dona"}
                  onChange={(e) => setCatModal({ ...catModal, default_unit: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Tavsif</label>
                <input
                  className="input"
                  value={catModal.description || ""}
                  onChange={(e) => setCatModal({ ...catModal, description: e.target.value })}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                <button type="button" className="btn" onClick={() => setCatModal(null)}>
                  Bekor qilish
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<App />);
}
