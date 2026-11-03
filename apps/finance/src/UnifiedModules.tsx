import React, { useState, useEffect, useCallback, useMemo } from "react";
import { CampusSmartDashboard } from "./CampusSmartDashboard";
import {
  Users,
  UserCheck,
  Building2,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Plus,
  RefreshCw,
  Edit3,
  ShieldAlert,
  Layers,
  History,
  Activity,
  Globe,
  Eye,
  Filter,
  Search,
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

async function crmMutate(query: string, variables: any = {}) {
  const res = await apiFetch("/fin-api/crm/graphql", {
    method: "POST",
    body: JSON.stringify({ query, variables }),
  });
  return res.data;
}

async function erpCall(method: string, path: string, body?: any, query?: any) {
  return apiFetch("/fin-api/erp/proxy", {
    method: "POST",
    body: JSON.stringify({ method, path, body, query }),
  });
}


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
        onError={() => setImgErr(true)}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          objectFit: "cover",
          flexShrink: 0,
          border: "1px solid rgba(148, 163, 184, 0.28)",
          background: "var(--bg-input)",
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

export type UnifiedTabId =
  | "students_dir"
  | "groups_courses"
  | "attendance"
  | "canteen_mosque"
  | "discipline_rooms"
  | "hr_tasks"
  | "org_catalog"
  | "system_admin";

export function UnifiedModules({
  activeTab,
  notify,
  openPaymentModal,
  campusSubTab = "overview",
  access,
}: {
  activeTab: UnifiedTabId;
  notify: (msg: string, type?: "ok" | "err") => void;
  openPaymentModal: (student?: any) => void;
  campusSubTab?: "overview" | "canteen" | "mosque" | "gate";
  access?: any;
}) {
  const [loading, setLoading] = useState(false);

  // State per domain
  const [academic, setAcademic] = useState<any>({
    students: [],
    expiringIqoma: [],
    groups: [],
    teachers: [],
    degrees: [],
    lessonSessions: [],
    academicYears: [],
    stats: null,
  });

  const [campus, setCampus] = useState<any>({
    date: new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date()),
    mealStats: { totalMeals: 0, breakfast: 0, lunch: 0, dinner: 0 },
    canteenStudents: [],
    canteenEmployees: [],
    mealRecords: [],
    mealArchive: [],
    mealByDateSummary: [],
    prayerStats: { totalPrayers: 0, fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
    mosqueStudents: [],
    prayerRecords: [],
    prayerConfigs: [],
    phoneCycles: [],
    dutyStats: null,
    dutyRecords: [],
    rooms: [],
    zktecoStatus: null,
  });

  const [hr, setHr] = useState<any>({
    erpEmployees: [],
    erpOffices: [],
    crmEmployees: [],
    tasks: [],
  });

  const [sys, setSys] = useState<any>({
    erpCategories: [],
    erpOffices: [],
    erpNotifications: [],
    erpAuditLogs: [],
    erpTransactions: [],
    erpExpensesArchive: [],
    crmAdmins: [],
    crmRoots: [],
    crmAcademicYears: [],
    crmArchivedYears: [],
    crmAuditLogs: [],
  });

  // --- SMART FILTERS ---
  const [stuFilter, setStuFilter] = useState({
    archiveMode: "all" as "all" | "active" | "archived2025" | "deleted",
    studyPlace: "",
    gender: "",
    groupId: "",
    smartChip: "all" as "all" | "debtors" | "paid" | "overpaid" | "has_iqoma" | "expiring_iqoma",
    search: "",
  });

  const [grpSubView, setGrpSubView] = useState<"groups" | "teachers" | "courses">("groups");
  const [grpSearch, setGrpSearch] = useState("");

  const [campusDate, setCampusDate] = useState(() =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date())
  );
  const [campusSubView, setCampusSubView] = useState<"canteen" | "meal_archive" | "mosque">("canteen");
  const [campusSearch, setCampusSearch] = useState("");
  const [mealTypeFilter, setMealTypeFilter] = useState("");

  const [discSubView, setDiscSubView] = useState<"rooms" | "duty" | "phone">("rooms");
  const [roomSearch, setRoomSearch] = useState("");

  const [hrSubView, setHrSubView] = useState<"erp_emp" | "crm_emp" | "tasks">("erp_emp");
  const [hrArchiveMode, setHrArchiveMode] = useState<"all" | "active" | "archived">("all");
  const [hrSearch, setHrSearch] = useState("");

  const [orgSubView, setOrgSubView] = useState<"categories" | "offices" | "transactions" | "expenses_archive">("categories");
  const [txTypeFilter, setTxTypeFilter] = useState("");
  const [expArchFilter, setExpArchFilter] = useState<"all" | "active" | "deleted">("all");
  const [orgSearch, setOrgSearch] = useState("");

  const [sysSubView, setSysSubView] = useState<"admins" | "years" | "audit" | "notifications" | "sync">("admins");
  const [auditSourceFilter, setAuditSourceFilter] = useState<"ALL" | "ERP" | "CRM">("ALL");
  const [auditSearch, setAuditSearch] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);

  // Modals & inline inputs for Student 360 Detail
  const [studentModal, setStudentModal] = useState<any | null>(null);
  const [studentDetailModal, setStudentDetailModal] = useState<any | null>(null);
  const [cardForm, setCardForm] = useState({ cardId: "", cardNumber: "" });
  const [zkRecentCards, setZkRecentCards] = useState<any[]>([]);
  const [zkBusy, setZkBusy] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [contractEditVal, setContractEditVal] = useState("");
  const [groupModal, setGroupModal] = useState<any | null>(null);
  const [teacherModal, setTeacherModal] = useState<any | null>(null);
  const [roomModal, setRoomModal] = useState<any | null>(null);
  const [roomStuSearch, setRoomStuSearch] = useState("");
  const [dutyModal, setDutyModal] = useState<any | null>(null);
  const [phoneCreateModal, setPhoneCreateModal] = useState<any | null>(null);
  const [phoneRecordsModal, setPhoneRecordsModal] = useState<any | null>(null);
  const [adminModal, setAdminModal] = useState<any | null>(null);
  const [taskModal, setTaskModal] = useState<any | null>(null);
  const [categoryModal, setCategoryModal] = useState<any | null>(null);
  const [officeModal, setOfficeModal] = useState<any | null>(null);
  const [sessionModal, setSessionModal] = useState<any | null>(null);

  const loadDomain = useCallback(async () => {
    if (activeTab === "canteen_mosque") return;
    setLoading(true);
    try {
      if (activeTab === "students_dir" || activeTab === "groups_courses" || activeTab === "attendance") {
        const d = await apiFetch("/fin-api/academic/overview");
        setAcademic(d);
      } else if (activeTab === "discipline_rooms") {
        const d = await apiFetch(`/fin-api/campus/overview?date=${encodeURIComponent(campusDate)}`);
        setCampus(d);
        if (academic.students.length === 0) {
          apiFetch("/fin-api/academic/overview").then(setAcademic).catch(() => {});
        }
      } else if (activeTab === "hr_tasks") {
        const d = await apiFetch("/fin-api/hr/overview");
        setHr(d);
      } else if (activeTab === "org_catalog" || activeTab === "system_admin") {
        const d = await apiFetch("/fin-api/system/overview");
        setSys(d);
        if (academic.students.length === 0) {
          apiFetch("/fin-api/academic/overview").then(setAcademic).catch(() => {});
        }
      }
    } catch (e: any) {
      notify(e.message || "Ma'lumot yuklashda xatolik", "err");
    } finally {
      setLoading(false);
    }
  }, [activeTab, campusDate, notify, academic.students.length]);

  useEffect(() => {
    loadDomain();
  }, [loadDomain]);

  // --- CRUD Handlers ---
  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentModal) return;
    try {
      const res = await apiFetch("/fin-api/crm/students/save", {
        method: "POST",
        body: JSON.stringify({
          id: studentModal.id || undefined,
          username: studentModal.username || undefined,
          password: studentModal.password || undefined,
          fullname: studentModal.fullname,
          phone: studentModal.phone ?? "",
          turkPhone: studentModal.turkPhone ?? "",
          uzbPhone: studentModal.uzbPhone ?? "",
          fatherFullname: studentModal.fatherFullname ?? "",
          fatherPhone: studentModal.fatherPhone ?? "",
          passportNumber: studentModal.passportNumber ?? "",
          gender: studentModal.gender || "MALE",
          groupId: studentModal.groupId ? Number(studentModal.groupId) : null,
          studyPlace: studentModal.studyPlace || "Akademiya",
          roomNumber: studentModal.roomNumber ?? "",
          totalPayment: studentModal.totalPayment !== "" ? Number(studentModal.totalPayment) : 0,
          hasIqoma: Boolean(studentModal.hasIqoma || studentModal.iqomaNumber),
          iqomaNumber: studentModal.iqomaNumber ?? "",
          iqomaExpiryDate: studentModal.iqomaExpiryDate || null,
        }),
      });
      notify(res.message || "Saqlandi!");
      setStudentModal(null);
      loadDomain();
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupModal) return;
    try {
      if (groupModal.id) {
        await crmMutate(
          `mutation UpdGrp($id: Int!, $input: UpdateGroupInput!) {
            updateGroup(id: $id, input: $input) { id name }
          }`,
          {
            id: Number(groupModal.id),
            input: {
              name: groupModal.name,
              gender: groupModal.gender || "MALE",
              studyPlace: groupModal.studyPlace || "2026-2027 Akademiya",
              institutionType: groupModal.institutionType || "ACADEMY",
              teacherId: groupModal.teacherId ? Number(groupModal.teacherId) : null,
            },
          }
        );
        notify("Guruh yangilandi");
      } else {
        await crmMutate(
          `mutation AddGrp($input: CreateGroupInput!) {
            createGroup(input: $input) { id name }
          }`,
          {
            input: {
              name: groupModal.name,
              gender: groupModal.gender || "MALE",
              studyPlace: groupModal.studyPlace || "2026-2027 Akademiya",
              institutionType: groupModal.institutionType || "ACADEMY",
              teacherId: groupModal.teacherId ? Number(groupModal.teacherId) : null,
            },
          }
        );
        notify("Yangi guruh yaratildi");
      }
      setGroupModal(null);
      loadDomain();
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  const handleSaveTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherModal) return;
    try {
      await crmMutate(
        `mutation AddTch($username: String!, $password: String!, $fullname: String!, $gender: Gender!, $phone: Phone, $tgUsername: String) {
          addTeacher(username: $username, password: $password, fullname: $fullname, gender: $gender, phone: $phone, tgUsername: $tgUsername) {
            success message
          }
        }`,
        {
          username: teacherModal.username,
          password: teacherModal.password || "Mezana2026!",
          fullname: teacherModal.fullname,
          gender: teacherModal.gender || "MALE",
          phone: teacherModal.phone || undefined,
          tgUsername: teacherModal.tgUsername || undefined,
        }
      );
      notify("O'qituvchi qo'shildi");
      setTeacherModal(null);
      loadDomain();
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  const handleSaveRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomModal) return;
    try {
      const res = await apiFetch("/fin-api/campus/rooms/save", {
        method: "POST",
        body: JSON.stringify({
          id: roomModal.id || undefined,
          roomNumber: roomModal.roomNumber,
          floor: Number(roomModal.floor) || 1,
          capacity: Number(roomModal.capacity) || 4,
          studyPlace: roomModal.studyPlace || "Akademiya",
          status: roomModal.status || "AVAILABLE",
          description: roomModal.description || "",
          studentIds: Array.isArray(roomModal.studentIds) ? roomModal.studentIds : undefined,
        }),
      });
      notify(res.message || "Xona saqlandi!");
      setRoomModal(null);
      loadDomain();
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  const handleDeleteRoom = async (roomId: number | string) => {
    try {
      const res = await apiFetch(`/fin-api/campus/rooms/${roomId}`, { method: "DELETE" });
      notify(res.message || "Xona o'chirildi");
      loadDomain();
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  const handleSaveDuty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dutyModal) return;
    try {
      await crmMutate(
        `mutation CreateDuty($studentId: Int!, $supervisorType: String!, $reason: String!, $dutyDate: Date!) {
          createDutyRecord(studentId: $studentId, supervisorType: $supervisorType, reason: $reason, dutyDate: $dutyDate) {
            success message
          }
        }`,
        {
          studentId: Number(dutyModal.studentId),
          supervisorType: dutyModal.supervisorType || "ADMIN",
          reason: dutyModal.reason || "Navbatchilik",
          dutyDate: dutyModal.dutyDate,
        }
      );
      notify("Navbatchilik yozuvi qo'shildi");
      setDutyModal(null);
      loadDomain();
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  const handleUpdateDutyStatus = async (id: number | string, status: string) => {
    try {
      const res = await apiFetch("/fin-api/campus/duty/status", {
        method: "POST",
        body: JSON.stringify({ id, status }),
      });
      notify(res.message || "Navbatchilik holati yangilandi");
      loadDomain();
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  const handleDeleteDuty = async (id: number | string) => {
    try {
      const res = await apiFetch(`/fin-api/campus/duty/${id}`, { method: "DELETE" });
      notify(res.message || "Navbatchilik o'chirildi");
      loadDomain();
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  const handleCreatePhoneCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneCreateModal) return;
    try {
      const res = await apiFetch("/fin-api/campus/phone-cycles/create", {
        method: "POST",
        body: JSON.stringify(phoneCreateModal),
      });
      notify(res.message || "Yangi telefon davri ochildi!");
      setPhoneCreateModal(null);
      loadDomain();
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  const handleClosePhoneCycle = async (cycleId: number | string) => {
    try {
      const res = await apiFetch("/fin-api/campus/phone-cycles/close", {
        method: "POST",
        body: JSON.stringify({ cycleId }),
      });
      notify(res.message || "Telefon davri yopildi!");
      loadDomain();
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  const openPhoneRecords = async (cycle: any) => {
    try {
      setPhoneRecordsModal({ cycle, records: [], loading: true });
      const res = await apiFetch(`/fin-api/campus/phone-cycles/${cycle.id}/records`);
      setPhoneRecordsModal({ cycle, records: res.records || [], loading: false });
    } catch (err: any) {
      notify(err.message, "err");
      setPhoneRecordsModal(null);
    }
  };

  const handleTogglePhoneStatus = async (cycleId: number | string, studentId: number | string, status: string) => {
    try {
      await apiFetch(`/fin-api/campus/phone-cycles/${cycleId}/toggle-student`, {
        method: "POST",
        body: JSON.stringify({ studentId, status }),
      });
      const res = await apiFetch(`/fin-api/campus/phone-cycles/${cycleId}/records`);
      setPhoneRecordsModal((prev: any) => (prev ? { ...prev, records: res.records || [] } : null));
      loadDomain();
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  const handleSaveAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminModal) return;
    try {
      const res = await apiFetch("/fin-api/system/admins/save", {
        method: "POST",
        body: JSON.stringify(adminModal),
      });
      notify(res.message || "Boshqaruvchi saqlandi!");
      setAdminModal(null);
      loadDomain();
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskModal) return;
    try {
      await crmMutate(
        `mutation CreateTsk($input: CreateTaskInput!) {
          createTask(input: $input) { id title status }
        }`,
        {
          input: {
            title: taskModal.title,
            description: taskModal.description || "",
            floor: taskModal.floor || "ALL_FLOORS",
            priority: taskModal.priority || "MEDIUM",
            deadline: taskModal.deadline,
            assignedToId: Number(taskModal.assignedToId),
          },
        }
      );
      notify("Vazifa biriktirildi");
      setTaskModal(null);
      loadDomain();
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryModal) return;
    try {
      await erpCall("POST", "/categories", {
        name: categoryModal.name,
        description: categoryModal.description || undefined,
      });
      notify("Kategoriya qo'shildi");
      setCategoryModal(null);
      loadDomain();
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  const handleSaveOffice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!officeModal) return;
    try {
      await erpCall("POST", "/offices", {
        name: officeModal.name,
        address: officeModal.address || undefined,
      });
      notify("Filial qo'shildi");
      setOfficeModal(null);
      loadDomain();
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  // Unique studyPlaces across all 309 students
  const allStudyPlaces = useMemo(() => {
    const set = new Set<string>();
    for (const s of academic.students || []) {
      if (s.studyPlace) set.add(s.studyPlace);
    }
    return Array.from(set).sort();
  }, [academic.students]);

  const expiringIds = useMemo(() => {
    return new Set((academic.expiringIqoma || []).map((x: any) => String(x.id)));
  }, [academic.expiringIqoma]);

  // ===========================================================================
  // 1. TALABALAR BAZASI, ARXIV VA IQOMA (students_dir — 309 ta talaba)
  // ===========================================================================
  if (activeTab === "students_dir") {
    const allStudents = academic.students || [];
    const activeCount = allStudents.filter((s: any) => s.isActive && !s.isArchived && !s.isDeleted).length;
    const archived2025Count = allStudents.filter((s: any) => (!s.isActive || s.isArchived) && !s.isDeleted).length;
    const deletedCount = allStudents.filter((s: any) => s.isDeleted).length;
    const iqomaCount = allStudents.filter((s: any) => s.hasIqoma).length;
    const overpaidCount = allStudents.filter((s: any) => Number(s.overpaidAmount || 0) > 0).length;

    const filteredStudents = allStudents.filter((s: any) => {
      // 1. Archive status filter
      if (stuFilter.archiveMode === "active" && (!s.isActive || s.isArchived || s.isDeleted)) return false;
      if (stuFilter.archiveMode === "archived2025" && ((s.isActive && !s.isArchived) || s.isDeleted)) return false;
      if (stuFilter.archiveMode === "deleted" && !s.isDeleted) return false;

      // 2. StudyPlace / Year filter
      if (stuFilter.studyPlace && (s.studyPlace || "") !== stuFilter.studyPlace) return false;

      // 3. Gender filter
      if (stuFilter.gender && s.gender !== stuFilter.gender) return false;

      // 4. Group filter
      if (stuFilter.groupId && String(s.group?.id || s.groupId || "") !== String(stuFilter.groupId)) return false;

      // 5. Smart Chips
      if (stuFilter.smartChip === "debtors" && Number(s.remainingAmount || 0) <= 0) return false;
      if (stuFilter.smartChip === "paid" && (Number(s.totalPayment || 0) <= 0 || Number(s.remainingAmount || 0) > 0)) return false;
      if (stuFilter.smartChip === "overpaid" && Number(s.overpaidAmount || 0) <= 0) return false;
      if (stuFilter.smartChip === "has_iqoma" && !s.hasIqoma) return false;
      if (stuFilter.smartChip === "expiring_iqoma" && !expiringIds.has(String(s.id))) return false;

      // 6. Smart Search
      if (stuFilter.search) {
        const q = stuFilter.search.toLowerCase();
        const match =
          s.fullname?.toLowerCase().includes(q) ||
          s.username?.toLowerCase().includes(q) ||
          s.phone?.toLowerCase().includes(q) ||
          s.turkPhone?.toLowerCase().includes(q) ||
          s.fatherFullname?.toLowerCase().includes(q) ||
          s.motherFullname?.toLowerCase().includes(q) ||
          s.iqomaNumber?.toLowerCase().includes(q) ||
          s.passportNumber?.toLowerCase().includes(q) ||
          s.studyPlace?.toLowerCase().includes(q) ||
          s.roomNumber?.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Archive & Status KPI Cards */}
        <div className="kpi-grid">
          <div
            className="glass-card kpi-card"
            onClick={() => setStuFilter({ ...stuFilter, archiveMode: "all" })}
            style={{ cursor: "pointer", borderColor: stuFilter.archiveMode === "all" ? "#10b981" : undefined }}
          >
            <div className="kpi-label"><Users size={15} color="#10b981" /> BARCHA TALABALAR (BAZA + ARXIV)</div>
            <div className="kpi-value">{allStudents.length} ta</div>
            <div className="kpi-sub">Barcha yillar va arxivlar jamlanmasi</div>
          </div>

          <div
            className="glass-card kpi-card"
            onClick={() => setStuFilter({ ...stuFilter, archiveMode: "active" })}
            style={{ cursor: "pointer", borderColor: stuFilter.archiveMode === "active" ? "#06b6d4" : undefined }}
          >
            <div className="kpi-label"><UserCheck size={15} color="#06b6d4" /> FAOL TALABALAR (2026-2027)</div>
            <div className="kpi-value" style={{ color: "#38bdf8" }}>{activeCount} ta</div>
            <div className="kpi-sub">Hozir o'qiyotgan faol talabalar</div>
          </div>

          <div
            className="glass-card kpi-card"
            onClick={() => setStuFilter({ ...stuFilter, archiveMode: "archived2025" })}
            style={{ cursor: "pointer", borderColor: stuFilter.archiveMode === "archived2025" ? "#f59e0b" : undefined }}
          >
            <div className="kpi-label"><History size={15} color="#f59e0b" /> 2025-2026 O'QUV YILI ARXIVI</div>
            <div className="kpi-value" style={{ color: "#fcd34d" }}>{archived2025Count} ta</div>
            <div className="kpi-sub">O'tgan o'quv yili (Akademiya va Madrasa)</div>
          </div>

          <div
            className="glass-card kpi-card"
            onClick={() => setStuFilter({ ...stuFilter, archiveMode: "deleted" })}
            style={{ cursor: "pointer", borderColor: stuFilter.archiveMode === "deleted" ? "#f43f5e" : undefined }}
          >
            <div className="kpi-label"><AlertTriangle size={15} color="#f43f5e" /> O'CHIRILGANLAR ARXIVI</div>
            <div className="kpi-value" style={{ color: "#fda4af" }}>
              {deletedCount} ta <span style={{ fontSize: 12, color: "#38bdf8" }}>• Iqoma: {iqomaCount}</span>
            </div>
            <div className="kpi-sub">Chetlashtirilgan yoki o'chirilgan yozuvlar</div>
          </div>
        </div>

        {/* Smart Filter Panel */}
        <div className="glass-card" style={{ padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 5 }}>
                <Filter size={14} /> Arxiv holati:
              </span>
              <button className={`btn btn-sm ${stuFilter.archiveMode === "all" ? "btn-primary" : ""}`} onClick={() => setStuFilter({ ...stuFilter, archiveMode: "all" })}>
                🌐 Barchasi ({allStudents.length})
              </button>
              <button className={`btn btn-sm ${stuFilter.archiveMode === "active" ? "btn-primary" : ""}`} onClick={() => setStuFilter({ ...stuFilter, archiveMode: "active" })}>
                🟢 Faol ({activeCount})
              </button>
              <button className={`btn btn-sm ${stuFilter.archiveMode === "archived2025" ? "btn-primary" : ""}`} onClick={() => setStuFilter({ ...stuFilter, archiveMode: "archived2025" })}>
                📦 2025-2026 Arxiv ({archived2025Count})
              </button>
              <button className={`btn btn-sm ${stuFilter.archiveMode === "deleted" ? "btn-primary" : ""}`} onClick={() => setStuFilter({ ...stuFilter, archiveMode: "deleted" })}>
                🗑️ O'chirilganlar ({deletedCount})
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn"
                disabled={zkBusy}
                onClick={async () => {
                  setZkBusy(true);
                  try {
                    const res = await apiFetch("/fin-api/crm/student-cards/sync-zkteco", { method: "POST" });
                    notify(res.message || "Barcha kartalar ZKTeco qurilmalarga sinxronlandi!");
                  } catch (err: any) {
                    notify(err.message, "err");
                  } finally {
                    setZkBusy(false);
                  }
                }}
                title="Barcha faol talaba kartalarini Oshxona va Kirish ZKTeco turniketlariga yozish"
              >
                <RefreshCw size={14} className={zkBusy ? "spin" : ""} /> {zkBusy ? "ZKTeco sinxronlanmoqda..." : "🪪 ZKTeco sinxronlash"}
              </button>
              <button
                className="btn btn-primary"
                onClick={() =>
                  setStudentModal({
                    username: "",
                    password: "",
                    fullname: "",
                    gender: "MALE",
                    phone: "",
                    turkPhone: "",
                    uzbPhone: "",
                    fatherFullname: "",
                    fatherPhone: "",
                    passportNumber: "",
                    roomNumber: "",
                    groupId: "",
                    studyPlace: "2026-2027 Akademiya",
                    totalPayment: 0,
                    hasIqoma: false,
                    iqomaNumber: "",
                    iqomaExpiryDate: "",
                  })
                }
              >
                <Plus size={15} /> Yangi talaba qo'shish
              </button>
              <button className="btn" onClick={loadDomain} title="Yangilash"><RefreshCw size={14} className={loading ? "spin" : ""} /></button>
            </div>
          </div>

          {/* Second Row: Smart Chips & Dropdowns */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14, paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className={`btn btn-sm ${stuFilter.smartChip === "all" ? "btn-cyan" : ""}`} onClick={() => setStuFilter({ ...stuFilter, smartChip: "all" })}>
                Barcha toifalar
              </button>
              <button className={`btn btn-sm ${stuFilter.smartChip === "debtors" ? "btn-cyan" : ""}`} onClick={() => setStuFilter({ ...stuFilter, smartChip: "debtors" })}>
                🔴 Qarzdorlar
              </button>
              <button className={`btn btn-sm ${stuFilter.smartChip === "paid" ? "btn-cyan" : ""}`} onClick={() => setStuFilter({ ...stuFilter, smartChip: "paid" })}>
                🟢 To'liq to'laganlar
              </button>
              {overpaidCount > 0 && (
                <button className={`btn btn-sm ${stuFilter.smartChip === "overpaid" ? "btn-cyan" : ""}`} onClick={() => setStuFilter({ ...stuFilter, smartChip: "overpaid" })}>
                  💎 Ortiqcha to'laganlar ({overpaidCount})
                </button>
              )}
              <button className={`btn btn-sm ${stuFilter.smartChip === "has_iqoma" ? "btn-cyan" : ""}`} onClick={() => setStuFilter({ ...stuFilter, smartChip: "has_iqoma" })}>
                🪪 Iqomasi bor ({iqomaCount})
              </button>
              <button className={`btn btn-sm ${stuFilter.smartChip === "expiring_iqoma" ? "btn-cyan" : ""}`} onClick={() => setStuFilter({ ...stuFilter, smartChip: "expiring_iqoma" })}>
                ⚠️ Iqoma muddati yaqin ({academic.expiringIqoma?.length || 0})
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ position: "relative" }}>
                <input
                  className="input"
                  placeholder="Ism, login, tel, ota-ona, pasport, xona..."
                  value={stuFilter.search}
                  onChange={(e) => setStuFilter({ ...stuFilter, search: e.target.value })}
                  style={{ width: 260 }}
                />
              </div>
              <select
                className="select"
                value={stuFilter.studyPlace}
                onChange={(e) => setStuFilter({ ...stuFilter, studyPlace: e.target.value })}
                style={{ width: 195 }}
              >
                <option value="">Barcha o'quv yillari / joylar</option>
                {allStudyPlaces.map((sp) => (
                  <option key={sp} value={sp}>{sp}</option>
                ))}
              </select>
              <select
                className="select"
                value={!access?.isDirector && access?.gender ? access.gender : stuFilter.gender}
                disabled={!access?.isDirector && Boolean(access?.gender)}
                onChange={(e) => setStuFilter({ ...stuFilter, gender: e.target.value })}
                style={{ width: 130 }}
              >
                <option value="">Barcha jins</option>
                <option value="MALE">Erkaklar</option>
                <option value="FEMALE">Ayollar</option>
              </select>
              <select
                className="select"
                value={stuFilter.groupId}
                onChange={(e) => setStuFilter({ ...stuFilter, groupId: e.target.value })}
                style={{ width: 170 }}
              >
                <option value="">Barcha guruhlar</option>
                {(academic.groups || []).map((g: any) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              {(stuFilter.search || stuFilter.studyPlace || stuFilter.gender || stuFilter.groupId || stuFilter.smartChip !== "all" || stuFilter.archiveMode !== "all") && (
                <button
                  className="btn btn-sm"
                  onClick={() =>
                    setStuFilter({
                      archiveMode: "all",
                      studyPlace: "",
                      gender: "",
                      groupId: "",
                      smartChip: "all",
                      search: "",
                    })
                  }
                >
                  Filtrni tozalash
                </button>
              )}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              Natija: <strong style={{ color: "var(--text-primary)" }}>{filteredStudents.length} nafar</strong> talaba ko'rsatilmoqda (bazada jami {allStudents.length} nafar)
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 12.5 }}>
              <span>Jami shartnoma: <strong style={{ color: "#38bdf8" }}>{fmtUSD(filteredStudents.reduce((s: number, x: any) => s + Number(x.totalPayment || 0), 0))}</strong></span>
              <span>To'langan: <strong style={{ color: "#10b981" }}>{fmtUSD(filteredStudents.reduce((s: number, x: any) => s + Number(x.paidAmount || 0), 0))}</strong></span>
              <span>Qoldiq qarz: <strong style={{ color: "#f59e0b" }}>{fmtUSD(filteredStudents.reduce((s: number, x: any) => s + Number(x.remainingAmount || 0), 0))}</strong></span>
            </div>
          </div>

          <div className="table-wrap">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Talaba va Holati</th>
                  <th>Guruh va O'quv Yili</th>
                  <th>Aloqa va Ota-Ona</th>
                  <th>Hujjat va Karta</th>
                  <th>Shartnoma va To'lov ($)</th>
                  <th>Qolgan Qarz ($)</th>
                  <th style={{ textAlign: "right" }}>Boshqaruv</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((s: any) => {
                  const initials = String(s.fullname || "T")
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((w: string) => w[0]?.toUpperCase())
                    .join("");
                  const contract = Number(s.totalPayment || 0);
                  const paid = Number(s.paidAmount || 0);
                  const debt = Number(s.remainingAmount || 0);
                  const pct = contract > 0 ? Math.min(100, Math.round((paid / contract) * 100)) : 0;

                  return (
                    <tr key={s.id} style={{ opacity: s.isDeleted ? 0.65 : 1 }}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <StudentAvatar student={s} size={38} />
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 700, fontSize: 13.5 }}>{s.fullname}</span>
                              {s.isDeleted ? (
                                <span className="badge badge-rose">O'chirilgan</span>
                              ) : !s.isActive || s.isArchived ? (
                                <span className="badge badge-amber">Arxiv (25-26)</span>
                              ) : (
                                <span className="badge badge-emerald">Faol</span>
                              )}
                            </div>
                            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>
                              @{s.username} • {s.gender === "FEMALE" ? "Qiz bola" : "O'g'il bola"}
                              {s.roomNumber ? ` • Xona: ${s.roomNumber}` : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{s.group?.name || "Guruhsiz"}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 2 }}>
                          {s.studyPlace || "Akademiya"}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{s.phone || s.turkPhone || s.uzbPhone || "—"}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>
                          {s.fatherFullname
                            ? `Ota: ${s.fatherFullname}${s.fatherPhone ? " (" + s.fatherPhone + ")" : ""}`
                            : s.motherFullname
                            ? `Ona: ${s.motherFullname}`
                            : "Ota-ona kiritilmagan"}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {s.hasIqoma ? (
                            <span className="badge badge-cyan">Iqoma: {s.iqomaNumber || "Bor"}</span>
                          ) : (
                            <span className="badge badge-slate">Iqoma yo'q</span>
                          )}
                          {s.card?.cardId && (
                            <span className={`badge ${s.card.isActive ? "badge-emerald" : "badge-rose"}`}>
                              Karta: {s.card.cardId}
                            </span>
                          )}
                          {(s.comments || []).length > 0 && (
                            <span className="badge badge-violet">{s.comments.length} izoh</span>
                          )}
                        </div>
                        {s.iqomaExpiryDate && (
                          <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 3, fontWeight: 600 }}>
                            Muddati: {String(s.iqomaExpiryDate).slice(0, 10)}
                          </div>
                        )}
                      </td>
                      <td style={{ minWidth: 145 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700 }}>
                          <span style={{ color: "#10b981" }}>{fmtUSD(paid)}</span>
                          <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>/ {fmtUSD(contract)}</span>
                        </div>
                        <div className="progress-track" style={{ height: 5, marginTop: 5 }}>
                          <div className="progress-fill" style={{ width: `${pct}%`, background: pct >= 100 ? "#10b981" : "#06b6d4" }} />
                        </div>
                      </td>
                      <td>
                        {debt > 0 ? (
                          <span style={{ fontWeight: 800, color: "#f59e0b", fontSize: 13.5 }}>{fmtUSD(debt)}</span>
                        ) : (
                          <span className="badge badge-emerald">To'liq to'langan</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          <button
                            className="btn btn-sm"
                            onClick={() => {
                              setStudentDetailModal(s);
                              setCardForm({
                                cardId: s.card?.cardId || "",
                                cardNumber: s.card?.cardNumber ? String(s.card.cardNumber) : "",
                              });
                              setZkRecentCards([]);
                              setContractEditVal(String(s.totalPayment || 0));
                              setCommentText("");
                            }}
                            title="To'liq ma'lumot, karta, izohlar va arxiv boshqaruvi"
                          >
                            <Eye size={13} /> Profil
                          </button>
                          <button
                            className="btn btn-sm"
                            title="Tahrirlash"
                            onClick={() =>
                              setStudentModal({
                                id: s.id,
                                fullname: s.fullname || "",
                                phone: s.phone || "",
                                turkPhone: s.turkPhone || "",
                                uzbPhone: s.uzbPhone || "",
                                fatherFullname: s.fatherFullname || "",
                                fatherPhone: s.fatherPhone || "",
                                passportNumber: s.passportNumber || "",
                                gender: s.gender || "MALE",
                                groupId: s.group?.id || s.groupId || "",
                                studyPlace: s.studyPlace || "",
                                roomNumber: s.roomNumber || "",
                                totalPayment: s.totalPayment ?? 0,
                                hasIqoma: Boolean(s.hasIqoma),
                                iqomaNumber: s.iqomaNumber || "",
                                iqomaExpiryDate: s.iqomaExpiryDate ? String(s.iqomaExpiryDate).slice(0, 10) : "",
                              })
                            }
                          >
                            <Edit3 size={13} />
                          </button>
                          <button className="btn btn-sm btn-primary" onClick={() => openPaymentModal(s)}>
                            + To'lov
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredStudents.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: 30, color: "var(--text-muted)" }}>
                      Tanlangan filtr bo'yicha talabalar topilmadi
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Student Profile Modal (To'liq ma'lumot, Turniket kartasi, Izohlar, Kursdan-kursga o'tkazish) */}
        {studentDetailModal && (
          <div className="modal-backdrop" onClick={() => setStudentDetailModal(null)}>
            <div className="modal-box modal-card animate-in" style={{ maxWidth: 780, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <StudentAvatar student={studentDetailModal} size={54} />
                  <div>
                    <h3 style={{ margin: 0 }}>{studentDetailModal.fullname} — To'liq ma'lumot va boshqaruv</h3>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span>Raqami: #{studentDetailModal.id} • Login: @{studentDetailModal.username} • {studentDetailModal.studyPlace || "O'quv joyi kiritilmagan"}</span>
                      <label className="btn btn-sm" style={{ padding: "2px 8px", fontSize: 11, cursor: "pointer" }}>
                        Rasm yuklash
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(ev) => {
                            const file = ev.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = async () => {
                              try {
                                const res = await apiFetch("/fin-api/crm/students/upload-photo", {
                                  method: "POST",
                                  body: JSON.stringify({ studentId: studentDetailModal.id, dataUrl: String(reader.result || "") }),
                                });
                                notify(res.message || "Rasm yangilandi!");
                                setStudentDetailModal({ ...studentDetailModal, profilePicture: res.profilePicture });
                                loadDomain();
                              } catch (err: any) {
                                notify(err.message, "err");
                              }
                            };
                            reader.readAsDataURL(file);
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className={`badge ${studentDetailModal.isDeleted ? "badge-rose" : !studentDetailModal.isActive ? "badge-amber" : "badge-emerald"}`}>
                    {studentDetailModal.isDeleted ? "O'chirilgan arxiv" : !studentDetailModal.isActive ? "2025-2026 o'quv yili arxivi" : "Faol talaba"}
                  </span>
                  {(!studentDetailModal.isActive || studentDetailModal.isDeleted) ? (
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={async () => {
                        try {
                          const res = await apiFetch("/fin-api/crm/students/archive-action", {
                            method: "POST",
                            body: JSON.stringify({ studentId: studentDetailModal.id, action: "restore_to_active" }),
                          });
                          notify(res.message || "Faol o'quv yiliga o'tkazildi!");
                          setStudentDetailModal(null);
                          loadDomain();
                        } catch (err: any) {
                          notify(err.message, "err");
                        }
                      }}
                    >
                      🎓 2026-2027 o'quv yiliga o'tkazish
                    </button>
                  ) : (
                    <button
                      className="btn btn-sm"
                      onClick={async () => {
                        try {
                          const res = await apiFetch("/fin-api/crm/students/archive-action", {
                            method: "POST",
                            body: JSON.stringify({ studentId: studentDetailModal.id, action: "move_to_archive" }),
                          });
                          notify(res.message || "Arxivga o'tkazildi!");
                          setStudentDetailModal(null);
                          loadDomain();
                        } catch (err: any) {
                          notify(err.message, "err");
                        }
                      }}
                    >
                      📦 Arxivga o'tkazish
                    </button>
                  )}
                </div>
              </div>

              <div className="grid-2" style={{ gap: 12, fontSize: 13 }}>
                <div className="glass-card" style={{ padding: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8, color: "#38bdf8" }}>Shaxsiy va aloqa ma'lumotlari</div>
                  <div><b>Asosiy telefon:</b> {studentDetailModal.phone || "—"}</div>
                  <div><b>Turkiya telefoni:</b> {studentDetailModal.turkPhone || "—"}</div>
                  <div><b>O'zbekiston telefoni:</b> {studentDetailModal.uzbPhone || "—"}</div>
                  <div><b>Telegram:</b> {studentDetailModal.tgUsername ? `@${studentDetailModal.tgUsername}` : "—"}</div>
                  <div><b>Tug'ilgan sana:</b> {studentDetailModal.birthDate ? String(studentDetailModal.birthDate).slice(0, 10) : "—"}</div>
                  <div><b>Yashash manzili:</b> {studentDetailModal.address || "—"}</div>
                </div>
                <div className="glass-card" style={{ padding: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8, color: "#10b981" }}>Ota-ona va hujjatlar</div>
                  <div><b>Otasi:</b> {studentDetailModal.fatherFullname || "—"} ({studentDetailModal.fatherPhone || "—"})</div>
                  <div><b>Onasi:</b> {studentDetailModal.motherFullname || "—"} ({studentDetailModal.motherPhone || "—"})</div>
                  <div><b>Pasport seriyasi:</b> {studentDetailModal.passportNumber || "—"}</div>
                  <div><b>Iqoma guvohnomasi:</b> {studentDetailModal.hasIqoma ? `${studentDetailModal.iqomaNumber || "Mavjud"} (${studentDetailModal.iqomaExpiryDate ? String(studentDetailModal.iqomaExpiryDate).slice(0, 10) : ""})` : "Yo'q"}</div>
                  <div><b>Yotoqxona xonasi:</b> {studentDetailModal.roomNumber || "—"}</div>
                  <div><b>O'quv guruhi:</b> {studentDetailModal.group?.name || "Guruhsiz"}</div>
                </div>
              </div>

              {/* Turniket va Oshxona Kartasi Boshqaruvi */}
              <div className="glass-card" style={{ padding: 12, marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: "#34d399" }}>
                    🪪 Turniket va oshxona kartasi (ZKTeco Avto-Sinxron)
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-cyan"
                      disabled={zkBusy}
                      onClick={async () => {
                        setZkBusy(true);
                        try {
                          const res = await apiFetch("/fin-api/crm/student-cards/zkteco-recent");
                          const items = res.items || [];
                          setZkRecentCards(items);
                          const unbound = items.find((c: any) => !c.studentId);
                          const pick = unbound || items[0];
                          if (pick) {
                            setCardForm({
                              cardId: String(pick.userId || pick.cardNumber || ""),
                              cardNumber: pick.cardNumber ? String(pick.cardNumber) : "",
                            });
                            notify(
                              unbound
                                ? `Yangi karta topildi: ID ${pick.userId}${pick.cardNumber ? " (RFID #" + pick.cardNumber + ")" : ""}`
                                : `Oxirgi karta o'qildi: ID ${pick.userId}`
                            );
                          } else {
                            notify("Qurilmalardan yangi karta topilmadi", "err");
                          }
                        } catch (err: any) {
                          notify(err.message, "err");
                        } finally {
                          setZkBusy(false);
                        }
                      }}
                      title="Turniketga bosilgan oxirgi kartalarni qurilmadan avtomatik o'qib olish"
                    >
                      📡 {zkBusy ? "O'qilmoqda..." : "Qurilmadan oxirgi kartani o'qish"}
                    </button>
                    {studentDetailModal.card && (
                      <>
                        <span className={`badge ${studentDetailModal.card.isActive ? "badge-emerald" : "badge-rose"}`}>
                          {studentDetailModal.card.isActive ? `Faol (#${studentDetailModal.card.cardId})` : `Bloklangan (#${studentDetailModal.card.cardId})`}
                        </span>
                        <button
                          className="btn btn-sm"
                          onClick={async () => {
                            try {
                              const res = await apiFetch("/fin-api/crm/student-cards/status", {
                                method: "POST",
                                body: JSON.stringify({
                                  id: studentDetailModal.card.id,
                                  isActive: !studentDetailModal.card.isActive,
                                }),
                              });
                              notify(res.message);
                              setStudentDetailModal({
                                ...studentDetailModal,
                                card: { ...studentDetailModal.card, isActive: !studentDetailModal.card.isActive },
                              });
                              loadDomain();
                            } catch (err: any) {
                              notify(err.message, "err");
                            }
                          }}
                        >
                          {studentDetailModal.card.isActive ? "Vaqtincha bloklash" : "Faollashtirish"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {zkRecentCards.length > 0 && (
                  <div style={{ marginBottom: 10, padding: "8px 10px", borderRadius: 8, background: "var(--bg-surface-elevated)", border: "1px solid var(--border-subtle)", fontSize: 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6, color: "var(--text-secondary)" }}>
                       Qurilmalardagi oxirgi kartalar (tanlash uchun bosing):
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {zkRecentCards.slice(0, 8).map((c: any, idx: number) => (
                        <button
                          key={idx}
                          type="button"
                          className={`btn btn-sm ${!c.studentId ? "btn-primary" : ""}`}
                          onClick={() =>
                            setCardForm({
                              cardId: String(c.userId || c.cardNumber || ""),
                              cardNumber: c.cardNumber ? String(c.cardNumber) : "",
                            })
                          }
                        >
                          ID: {c.userId} {c.cardNumber ? `(RFID: ${c.cardNumber})` : ""} • {c.studentName ? `🔗 ${c.studentName}` : "🆕 Bo'sh karta"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      const res = await apiFetch("/fin-api/crm/student-cards", {
                        method: "POST",
                        body: JSON.stringify({
                          studentId: studentDetailModal.id,
                          cardId: cardForm.cardId,
                          cardNumber: cardForm.cardNumber ? Number(cardForm.cardNumber) : null,
                        }),
                      });
                      notify(res.message || "Karta saqlandi va ZKTeco qurilmalarga yozildi!");
                      setStudentDetailModal({
                        ...studentDetailModal,
                        card: {
                          ...(studentDetailModal.card || {}),
                          cardId: cardForm.cardId,
                          cardNumber: cardForm.cardNumber ? Number(cardForm.cardNumber) : null,
                          isActive: true,
                        },
                      });
                      loadDomain();
                    } catch (err: any) {
                      notify(err.message, "err");
                    }
                  }}
                  style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                >
                  <input
                    className="input"
                    placeholder="Karta ID raqami (masalan: 10120)"
                    value={cardForm.cardId}
                    onChange={(e) => setCardForm({ ...cardForm, cardId: e.target.value })}
                    style={{ flex: 1, minWidth: 160 }}
                    required
                  />
                  <input
                    className="input"
                    type="number"
                    placeholder="RFID Karta raqami (ixtiyoriy)"
                    value={cardForm.cardNumber}
                    onChange={(e) => setCardForm({ ...cardForm, cardNumber: e.target.value })}
                    style={{ flex: 1, minWidth: 160 }}
                  />
                  <button type="submit" className="btn btn-sm btn-primary">
                    {studentDetailModal.card ? "Kartani yangilash + ZKTeco" : "Karta biriktirish + ZKTeco"}
                  </button>
                </form>
              </div>

              {/* Talaba izohlari va eslatmalari (StudentComment) */}
              <div className="glass-card" style={{ padding: 12, marginTop: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: "#c084fc", marginBottom: 8 }}>
                  💬 Talaba bo'yicha eslatmalar va izohlar ({(studentDetailModal.comments || []).length})
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!commentText.trim()) return;
                    try {
                      await apiFetch("/fin-api/crm/student-comments", {
                        method: "POST",
                        body: JSON.stringify({ studentId: studentDetailModal.id, text: commentText.trim() }),
                      });
                      notify("Izoh qo'shildi!");
                      const newComment = {
                        id: Date.now(),
                        text: commentText.trim(),
                        authorName: "Ma'muriyat",
                        createdAt: new Date().toISOString(),
                      };
                      setStudentDetailModal({
                        ...studentDetailModal,
                        comments: [newComment, ...(studentDetailModal.comments || [])],
                      });
                      setCommentText("");
                      loadDomain();
                    } catch (err: any) {
                      notify(err.message, "err");
                    }
                  }}
                  style={{ display: "flex", gap: 8, marginBottom: 10 }}
                >
                  <input
                    className="input"
                    placeholder="Talaba haqida muhim eslatma yoki izoh yozing..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button type="submit" className="btn btn-sm btn-primary">+ Izoh qo'shish</button>
                </form>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 140, overflowY: "auto" }}>
                  {(studentDetailModal.comments || []).map((cm: any) => (
                    <div
                      key={cm.id}
                      style={{
                        padding: "7px 10px",
                        borderRadius: 8,
                        background: "var(--bg-surface-elevated)",
                        border: "1px solid var(--border-subtle)",
                        fontSize: 12.5,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div>{cm.text}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          {cm.authorName || "Ma'mur"} • {String(cm.createdAt || "").slice(0, 16).replace("T", " ")}
                        </div>
                      </div>
                    </div>
                  ))}
                  {(studentDetailModal.comments || []).length === 0 && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Hozircha izoh kiritilmagan.</div>
                  )}
                </div>
              </div>

              {/* Shartnoma va to'lovlar boshqaruvi */}
              <div className="glass-card" style={{ padding: 12, marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>SHARTNOMA, TO'LANGAN VA QOLDIQ QARZ</div>
                    <div style={{ fontWeight: 700, fontSize: 15, marginTop: 3 }}>
                      Shartnoma: {fmtUSD(studentDetailModal.totalPayment)} •{" "}
                      <span style={{ color: "#34d399" }}>To'langan: {fmtUSD(studentDetailModal.paidAmount)}</span> •{" "}
                      <span style={{ color: "#fda4af" }}>Qarz: {fmtUSD(studentDetailModal.remainingAmount)}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      type="number"
                      className="input"
                      style={{ width: 120 }}
                      value={contractEditVal}
                      onChange={(e) => setContractEditVal(e.target.value)}
                      placeholder="Shartnoma ($)"
                    />
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={async () => {
                        try {
                          const res = await apiFetch("/fin-api/crm/students/archive-action", {
                            method: "POST",
                            body: JSON.stringify({
                              studentId: studentDetailModal.id,
                              action: "update_contract",
                              totalPayment: Number(contractEditVal || 0),
                            }),
                          });
                          notify(res.message);
                          const newTotal = Number(contractEditVal || 0);
                          setStudentDetailModal({
                            ...studentDetailModal,
                            totalPayment: newTotal,
                            remainingAmount: Math.max(0, newTotal - Number(studentDetailModal.paidAmount || 0)),
                          });
                          loadDomain();
                        } catch (err: any) {
                          notify(err.message, "err");
                        }
                      }}
                    >
                      Shartnomani yangilash
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        const st = studentDetailModal;
                        setStudentDetailModal(null);
                        openPaymentModal(st);
                      }}
                    >
                      + To'lov qabul qilish
                    </button>
                    <button className="btn" onClick={() => setStudentDetailModal(null)}>Yopish</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {studentModal && (
          <div className="modal-backdrop" onClick={() => setStudentModal(null)}>
            <div className="modal-box modal-card animate-in" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>{studentModal.id ? "Talaba ma'lumotlarini tahrirlash" : "Yangi talaba qo'shish"}</h3>
              <form onSubmit={handleSaveStudent} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="grid-2">
                  <div>
                    <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>F.I.Sh. *</label>
                    <input className="input" required value={studentModal.fullname} onChange={(e) => setStudentModal({ ...studentModal, fullname: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Jinsi</label>
                    <select className="select" value={studentModal.gender} onChange={(e) => setStudentModal({ ...studentModal, gender: e.target.value })}>
                      <option value="MALE">Erkak</option>
                      <option value="FEMALE">Ayol</option>
                    </select>
                  </div>
                </div>
                {!studentModal.id && (
                  <div className="grid-2">
                    <div>
                      <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Foydalanuvchi nomi (login) *</label>
                      <input className="input" required value={studentModal.username} onChange={(e) => setStudentModal({ ...studentModal, username: e.target.value })} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Parol *</label>
                      <input className="input" required value={studentModal.password} onChange={(e) => setStudentModal({ ...studentModal, password: e.target.value })} placeholder="Mezana2026!" />
                    </div>
                  </div>
                )}
                <div className="grid-2">
                  <div>
                    <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Asosiy telefon</label>
                    <input className="input" value={studentModal.phone || ""} onChange={(e) => setStudentModal({ ...studentModal, phone: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Turkiya / O'zbekiston tel.</label>
                    <input className="input" value={studentModal.turkPhone || ""} onChange={(e) => setStudentModal({ ...studentModal, turkPhone: e.target.value })} placeholder="+90..." />
                  </div>
                </div>
                <div className="grid-2">
                  <div>
                    <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Otasining F.I.Sh.</label>
                    <input className="input" value={studentModal.fatherFullname || ""} onChange={(e) => setStudentModal({ ...studentModal, fatherFullname: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Otasining telefoni</label>
                    <input className="input" value={studentModal.fatherPhone || ""} onChange={(e) => setStudentModal({ ...studentModal, fatherPhone: e.target.value })} />
                  </div>
                </div>
                <div className="grid-2">
                  <div>
                    <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Guruh</label>
                    <select className="select" value={studentModal.groupId} onChange={(e) => setStudentModal({ ...studentModal, groupId: e.target.value })}>
                      <option value="">Guruh tanlang</option>
                      {(academic.groups || []).map((g: any) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Yotoqxona xonasi / Pasport</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input className="input" placeholder="Xona (101)" value={studentModal.roomNumber || ""} onChange={(e) => setStudentModal({ ...studentModal, roomNumber: e.target.value })} style={{ width: "45%" }} />
                      <input className="input" placeholder="Pasport №" value={studentModal.passportNumber || ""} onChange={(e) => setStudentModal({ ...studentModal, passportNumber: e.target.value })} style={{ width: "55%" }} />
                    </div>
                  </div>
                </div>
                <div className="grid-2">
                  <div>
                    <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>O'quv joyi / Yili</label>
                    <input className="input" value={studentModal.studyPlace} onChange={(e) => setStudentModal({ ...studentModal, studyPlace: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Shartnoma summasi ($)</label>
                    <input type="number" className="input" value={studentModal.totalPayment} onChange={(e) => setStudentModal({ ...studentModal, totalPayment: e.target.value })} />
                  </div>
                </div>
                <div className="grid-2">
                  <div>
                    <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Iqoma raqami</label>
                    <input className="input" value={studentModal.iqomaNumber} onChange={(e) => setStudentModal({ ...studentModal, iqomaNumber: e.target.value, hasIqoma: Boolean(e.target.value) })} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Iqoma muddati</label>
                    <input type="date" className="input" value={studentModal.iqomaExpiryDate} onChange={(e) => setStudentModal({ ...studentModal, iqomaExpiryDate: e.target.value, hasIqoma: Boolean(e.target.value || studentModal.iqomaNumber) })} />
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                  <button type="button" className="btn" onClick={() => setStudentModal(null)}>Bekor qilish</button>
                  <button type="submit" className="btn btn-primary">Saqlash</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===========================================================================
  // 2. GURUHLAR, O'QITUVCHILAR VA O'QUV YILLARI (groups_courses)
  // ===========================================================================
  if (activeTab === "groups_courses") {
    const filteredGroups = (academic.groups || []).filter((g: any) =>
      !grpSearch ||
      g.name?.toLowerCase().includes(grpSearch.toLowerCase()) ||
      g.studyPlace?.toLowerCase().includes(grpSearch.toLowerCase())
    );

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="kpi-grid">
          <div className="glass-card kpi-card" onClick={() => setGrpSubView("groups")} style={{ cursor: "pointer" }}>
            <div className="kpi-label"><Layers size={15} color="#10b981" /> GURUHLAR</div>
            <div className="kpi-value">{(academic.groups || []).length}</div>
            <div className="kpi-sub">Akademiya va Madrasa guruhlari</div>
          </div>
          <div className="glass-card kpi-card" onClick={() => setGrpSubView("teachers")} style={{ cursor: "pointer" }}>
            <div className="kpi-label"><UserCheck size={15} color="#06b6d4" /> O'QITUVCHILAR</div>
            <div className="kpi-value">{(academic.teachers || []).length}</div>
            <div className="kpi-sub">Faol ustoz va o'qituvchilar</div>
          </div>
          <div className="glass-card kpi-card" onClick={() => setGrpSubView("courses")} style={{ cursor: "pointer" }}>
            <div className="kpi-label"><Building2 size={15} color="#8b5cf6" /> O'QUV YILLARI VA ARXIV</div>
            <div className="kpi-value">{allStudyPlaces.length} ta oqim</div>
            <div className="kpi-sub">2025-2026 Arxiv va 2026-2027 Faol</div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button className={`btn ${grpSubView === "groups" ? "btn-primary" : ""}`} onClick={() => setGrpSubView("groups")}>
                Guruhlar ({(academic.groups || []).length})
              </button>
              <button className={`btn ${grpSubView === "teachers" ? "btn-primary" : ""}`} onClick={() => setGrpSubView("teachers")}>
                O'qituvchilar ({(academic.teachers || []).length})
              </button>
              <button className={`btn ${grpSubView === "courses" ? "btn-primary" : ""}`} onClick={() => setGrpSubView("courses")}>
                O'quv Yillari Kesimi (2025-2026 / 2026-2027)
              </button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="input"
                placeholder="Guruh yoki ustoz qidirish..."
                value={grpSearch}
                onChange={(e) => setGrpSearch(e.target.value)}
                style={{ width: 220 }}
              />
              {grpSubView === "groups" && (
                <button
                  className="btn btn-primary"
                  onClick={() => setGroupModal({ name: "", gender: "MALE", studyPlace: "2026-2027 Akademiya", institutionType: "ACADEMY", teacherId: "" })}
                >
                  <Plus size={15} /> Yangi guruh
                </button>
              )}
              {grpSubView === "teachers" && (
                <button
                  className="btn btn-primary"
                  onClick={() => setTeacherModal({ username: "", password: "", fullname: "", gender: "MALE", phone: "", tgUsername: "" })}
                >
                  <Plus size={15} /> Yangi o'qituvchi
                </button>
              )}
              <button className="btn" onClick={loadDomain}><RefreshCw size={14} /></button>
            </div>
          </div>

          {grpSubView === "groups" && (
            <div className="table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Guruh nomi</th>
                    <th>Muassasa / O'quv joyi</th>
                    <th>Jinsi</th>
                    <th>Mas'ul o'qituvchi</th>
                    <th>Talabalar soni</th>
                    <th>Jami shartnoma / Qarz</th>
                    <th>Amallar</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGroups.map((g: any) => (
                    <tr key={g.id}>
                      <td style={{ fontWeight: 700 }}>{g.name}</td>
                      <td>
                        <span className="badge badge-cyan">{g.institutionType === "MADRASA" ? "Madrasa" : "Akademiya"}</span>{" "}
                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{g.studyPlace}</span>
                      </td>
                      <td>{g.gender === "FEMALE" ? "Ayollar" : "Erkaklar"}</td>
                      <td>{g.teacher?.fullname || "Biriktirilmagan"}</td>
                      <td><span className="badge badge-emerald">{g.studentsCount ?? 0} ta</span></td>
                      <td>
                        <div>{fmtUSD(g.totalPayment)}</div>
                        <div style={{ fontSize: 11.5, color: "#fda4af" }}>Qarz: {fmtUSD(g.remainingAmount)} ({g.debtorsCount || 0} ta)</div>
                      </td>
                      <td>
                        <button
                          className="btn btn-sm"
                          onClick={() =>
                            setGroupModal({
                              id: g.id,
                              name: g.name,
                              gender: g.gender,
                              studyPlace: g.studyPlace || "",
                              institutionType: g.institutionType || "ACADEMY",
                              teacherId: g.teacherId || "",
                            })
                          }
                        >
                          <Edit3 size={13} /> Tahrirlash
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {grpSubView === "teachers" && (
            <div className="table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>F.I.Sh.</th>
                    <th>Login</th>
                    <th>Jinsi</th>
                    <th>Telefon</th>
                    <th>Telegram</th>
                    <th>Holati</th>
                  </tr>
                </thead>
                <tbody>
                  {(academic.teachers || [])
                    .filter(
                      (t: any) =>
                        !grpSearch ||
                        t.fullname?.toLowerCase().includes(grpSearch.toLowerCase()) ||
                        t.username?.toLowerCase().includes(grpSearch.toLowerCase()) ||
                        t.phone?.toLowerCase().includes(grpSearch.toLowerCase())
                    )
                    .map((t: any) => (
                      <tr key={t.id}>
                        <td style={{ fontWeight: 700 }}>{t.fullname}</td>
                        <td>@{t.username}</td>
                        <td>{t.gender === "FEMALE" ? "Ayol" : "Erkak"}</td>
                        <td>{t.phone || "—"}</td>
                        <td>{t.tgUsername ? `@${t.tgUsername}` : "—"}</td>
                        <td>
                          <span className={`badge ${t.isActive ? "badge-emerald" : "badge-rose"}`}>
                            {t.isActive ? "Faol" : "Nofaol"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  {(academic.teachers || []).length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: 30, color: "var(--text-muted)" }}>
                        O'qituvchilar ro'yxati bo'sh. "+ Yangi o'qituvchi" tugmasi orqali qo'shishingiz mumkin.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {grpSubView === "courses" && (
            <div className="table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>O'quv yili va Muassasa (Oqim)</th>
                    <th>Jami talabalar</th>
                    <th>Faol talabalar</th>
                    <th>Arxiv (2025-2026)</th>
                    <th>O'chirilganlar</th>
                    <th>Jami Qarz</th>
                  </tr>
                </thead>
                <tbody>
                  {allStudyPlaces
                    .filter((sp) => !grpSearch || sp.toLowerCase().includes(grpSearch.toLowerCase()))
                    .map((sp) => {
                      const list = (academic.students || []).filter((s: any) => s.studyPlace === sp);
                      const act = list.filter((s: any) => s.isActive && !s.isArchived && !s.isDeleted).length;
                      const arch = list.filter((s: any) => (!s.isActive || s.isArchived) && !s.isDeleted).length;
                      const del = list.filter((s: any) => s.isDeleted).length;
                      const debt = list.reduce((sum: number, s: any) => sum + Number(s.remainingAmount || 0), 0);
                      return (
                        <tr key={sp}>
                          <td style={{ fontWeight: 700 }}>{sp}</td>
                          <td><b>{list.length} ta</b></td>
                          <td><span className="badge badge-emerald">{act} ta</span></td>
                          <td><span className="badge badge-amber">{arch} ta</span></td>
                          <td><span className="badge badge-rose">{del} ta</span></td>
                          <td style={{ fontWeight: 700, color: debt > 0 ? "#fda4af" : "#34d399" }}>{fmtUSD(debt)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {groupModal && (
          <div className="modal-backdrop" onClick={() => setGroupModal(null)}>
            <div className="modal-box modal-card animate-in" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>{groupModal.id ? "Guruhni tahrirlash" : "Yangi guruh yaratish"}</h3>
              <form onSubmit={handleSaveGroup} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12 }}>Guruh nomi *</label>
                  <input className="input" required value={groupModal.name} onChange={(e) => setGroupModal({ ...groupModal, name: e.target.value })} />
                </div>
                <div className="grid-2">
                  <div>
                    <label style={{ fontSize: 12 }}>Muassasa turi</label>
                    <select className="select" value={groupModal.institutionType} onChange={(e) => setGroupModal({ ...groupModal, institutionType: e.target.value })}>
                      <option value="ACADEMY">Akademiya</option>
                      <option value="MADRASA">Madrasa</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12 }}>Jinsi</label>
                    <select className="select" value={groupModal.gender} onChange={(e) => setGroupModal({ ...groupModal, gender: e.target.value })}>
                      <option value="MALE">Erkaklar</option>
                      <option value="FEMALE">Ayollar</option>
                    </select>
                  </div>
                </div>
                <div className="grid-2">
                  <div>
                    <label style={{ fontSize: 12 }}>O'quv joyi / Yili</label>
                    <input className="input" value={groupModal.studyPlace} onChange={(e) => setGroupModal({ ...groupModal, studyPlace: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12 }}>Mas'ul o'qituvchi</label>
                    <select className="select" value={groupModal.teacherId || ""} onChange={(e) => setGroupModal({ ...groupModal, teacherId: e.target.value })}>
                      <option value="">O'qituvchi biriktirilmagan</option>
                      {(academic.teachers || []).map((t: any) => (
                        <option key={t.id} value={t.id}>{t.fullname}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button type="button" className="btn" onClick={() => setGroupModal(null)}>Bekor qilish</button>
                  <button type="submit" className="btn btn-primary">Saqlash</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {teacherModal && (
          <div className="modal-backdrop" onClick={() => setTeacherModal(null)}>
            <div className="modal-box modal-card animate-in" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>Yangi o'qituvchi qo'shish</h3>
              <form onSubmit={handleSaveTeacher} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12 }}>F.I.Sh. *</label>
                  <input className="input" required value={teacherModal.fullname} onChange={(e) => setTeacherModal({ ...teacherModal, fullname: e.target.value })} />
                </div>
                <div className="grid-2">
                  <div>
                    <label style={{ fontSize: 12 }}>Foydalanuvchi nomi (login) *</label>
                    <input className="input" required value={teacherModal.username} onChange={(e) => setTeacherModal({ ...teacherModal, username: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12 }}>Parol *</label>
                    <input className="input" required value={teacherModal.password} onChange={(e) => setTeacherModal({ ...teacherModal, password: e.target.value })} placeholder="Mezana2026!" />
                  </div>
                </div>
                <div className="grid-2">
                  <div>
                    <label style={{ fontSize: 12 }}>Telefon</label>
                    <input className="input" value={teacherModal.phone} onChange={(e) => setTeacherModal({ ...teacherModal, phone: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12 }}>Telegram (@siz) va Jinsi</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input className="input" placeholder="tg_username" value={teacherModal.tgUsername || ""} onChange={(e) => setTeacherModal({ ...teacherModal, tgUsername: e.target.value })} style={{ width: "55%" }} />
                      <select className="select" value={teacherModal.gender} onChange={(e) => setTeacherModal({ ...teacherModal, gender: e.target.value })} style={{ width: "45%" }}>
                        <option value="MALE">Erkak</option>
                        <option value="FEMALE">Ayol</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button type="button" className="btn" onClick={() => setTeacherModal(null)}>Bekor qilish</button>
                  <button type="submit" className="btn btn-primary">Qo'shish</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===========================================================================
  // 3. DAVOMAT VA DARS SESSIYALARI (attendance)
  // ===========================================================================
  if (activeTab === "attendance") {
    const sessions = academic.lessonSessions || [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="kpi-grid">
          <div className="glass-card kpi-card">
            <div className="kpi-label"><Calendar size={15} color="#10b981" /> DARS SESSIYALARI</div>
            <div className="kpi-value">{sessions.length}</div>
            <div className="kpi-sub">Qayd etilgan dars davomatlari</div>
          </div>
          <div className="glass-card kpi-card">
            <div className="kpi-label"><Layers size={15} color="#06b6d4" /> FAOL GURUHLAR</div>
            <div className="kpi-value">{(academic.groups || []).length}</div>
            <div className="kpi-sub">Davomat olinadigan guruhlar</div>
          </div>
          <div className="glass-card kpi-card">
            <div className="kpi-label"><Users size={15} color="#8b5cf6" /> JAMI TALABALAR</div>
            <div className="kpi-value">{(academic.students || []).length}</div>
            <div className="kpi-sub">Barcha bazadagi va arxivdagi talabalar</div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ margin: 0 }}>Guruh Dars Sessiyalari va Davomat Jadvali</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-primary"
                onClick={() =>
                  setSessionModal({
                    groupId: academic.groups?.[0]?.id || "",
                    subjectName: "",
                    lessonDate: new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date()),
                    lessonOrder: 1,
                  })
                }
              >
                <Plus size={15} /> Yangi dars sessiyasi
              </button>
              <button className="btn" onClick={loadDomain}><RefreshCw size={14} /></button>
            </div>
          </div>

          <div className="table-wrap">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Sana / Para</th>
                  <th>Guruh</th>
                  <th>Fan nomi</th>
                  <th>Holati</th>
                  <th>Qatnashganlar</th>
                  <th>Sababli / Sababsiz</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((ls: any) => {
                  const atts = ls.attendances || [];
                  const present = atts.filter((a: any) => a.isPresent).length;
                  const absent = atts.length - present;
                  return (
                    <tr key={ls.id}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{String(ls.lessonDate).slice(0, 10)}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{ls.lessonOrder}-para</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{ls.group?.name}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{ls.group?.studyPlace}</div>
                      </td>
                      <td style={{ fontWeight: 600 }}>{ls.subjectName}</td>
                      <td>
                        <span className="badge badge-cyan">
                          {ls.status === "COMPLETED" ? "Yakunlangan" : ls.status === "ACTIVE" ? "Davom etmoqda" : "Rejalashtirilgan"}
                        </span>
                      </td>
                      <td><span className="badge badge-emerald">{present} ta bor</span></td>
                      <td><span className="badge badge-rose">{absent} ta yo'q</span></td>
                    </tr>
                  );
                })}
                {sessions.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 30, color: "var(--text-muted)" }}>
                      Hozircha dars sessiyalari yo'q. "Yangi dars sessiyasi" tugmasi orqali qo'shishingiz mumkin.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {sessionModal && (
          <div className="modal-backdrop" onClick={() => setSessionModal(null)}>
            <div className="modal-box modal-card animate-in" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>Yangi dars sessiyasi yaratish</h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await crmMutate(
                      `mutation CreateLS($input: CreateLessonSessionInput!) {
                        createLessonSession(input: $input) { id subjectName }
                      }`,
                      {
                        input: {
                          groupId: Number(sessionModal.groupId),
                          subjectName: sessionModal.subjectName,
                          lessonDate: sessionModal.lessonDate,
                          lessonOrder: Number(sessionModal.lessonOrder) || 1,
                        },
                      }
                    );
                    notify("Dars sessiyasi yaratildi");
                    setSessionModal(null);
                    loadDomain();
                  } catch (err: any) {
                    notify(err.message, "err");
                  }
                }}
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                <div>
                  <label style={{ fontSize: 12 }}>Guruh *</label>
                  <select className="select" required value={sessionModal.groupId} onChange={(e) => setSessionModal({ ...sessionModal, groupId: e.target.value })}>
                    <option value="">Guruh tanlang</option>
                    {(academic.groups || []).map((g: any) => (
                      <option key={g.id} value={g.id}>{g.name} ({g.studyPlace})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12 }}>Fan nomi *</label>
                  <input className="input" required value={sessionModal.subjectName} onChange={(e) => setSessionModal({ ...sessionModal, subjectName: e.target.value })} placeholder="Masalan: Fiqh, Arab tili..." />
                </div>
                <div className="grid-2">
                  <div>
                    <label style={{ fontSize: 12 }}>Sana *</label>
                    <input type="date" className="input" required value={sessionModal.lessonDate} onChange={(e) => setSessionModal({ ...sessionModal, lessonDate: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12 }}>Dars tartibi (Para)</label>
                    <input type="number" min={1} max={8} className="input" value={sessionModal.lessonOrder} onChange={(e) => setSessionModal({ ...sessionModal, lessonOrder: e.target.value })} />
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button type="button" className="btn" onClick={() => setSessionModal(null)}>Bekor qilish</button>
                  <button type="submit" className="btn btn-primary">Saqlash</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===========================================================================
  // 4. OSHXONA, MASJID VA KIRISH ESHIGI SMART DASHBOARD (canteen_mosque)
  // ===========================================================================
  if (activeTab === "canteen_mosque") {
    return <CampusSmartDashboard apiFetch={apiFetch} notify={notify} initialSubTab={campusSubTab} />;
  }

  // ===========================================================================
  // 5. XONALAR, TELEFON VA NAVBATCHILIK (discipline_rooms)
  // ===========================================================================
  if (activeTab === "discipline_rooms") {
    const rooms = campus.rooms || [];
    const totalCap = rooms.reduce((s: number, r: any) => s + Number(r.capacity || 0), 0);
    const totalOcc = rooms.reduce((s: number, r: any) => s + Number(r.studentsCount || r.students?.length || 0), 0);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="kpi-grid">
          <div className="glass-card kpi-card" onClick={() => setDiscSubView("rooms")} style={{ cursor: "pointer" }}>
            <div className="kpi-label"><Building2 size={15} color="#10b981" /> YOTOQXONA XONALARI</div>
            <div className="kpi-value">{rooms.length} ta xona</div>
            <div className="kpi-sub">Joylashgan: {totalOcc} / Sig'im: {totalCap} kishi</div>
          </div>
          <div className="glass-card kpi-card" onClick={() => setDiscSubView("duty")} style={{ cursor: "pointer" }}>
            <div className="kpi-label"><ShieldAlert size={15} color="#f59e0b" /> NAVBATCHILIK VA INTIZOM</div>
            <div className="kpi-value">{(campus.dutyRecords || []).length}</div>
            <div className="kpi-sub">Navbatchilik va jazo qaydlari</div>
          </div>
          <div className="glass-card kpi-card" onClick={() => setDiscSubView("phone")} style={{ cursor: "pointer" }}>
            <div className="kpi-label"><History size={15} color="#06b6d4" /> TELEFON NAZORATI</div>
            <div className="kpi-value">{(campus.phoneCycles || []).length}</div>
            <div className="kpi-sub">Telefon topshirish davrlari va arxivi</div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button className={`btn ${discSubView === "rooms" ? "btn-primary" : ""}`} onClick={() => setDiscSubView("rooms")}>
                Xonalar ({rooms.length})
              </button>
              <button className={`btn ${discSubView === "duty" ? "btn-primary" : ""}`} onClick={() => setDiscSubView("duty")}>
                Navbatchilik ({(campus.dutyRecords || []).length})
              </button>
              <button className={`btn ${discSubView === "phone" ? "btn-primary" : ""}`} onClick={() => setDiscSubView("phone")}>
                Telefon davrlari ({(campus.phoneCycles || []).length})
              </button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="input"
                placeholder="Xona raqami yoki talaba..."
                value={roomSearch}
                onChange={(e) => setRoomSearch(e.target.value)}
                style={{ width: 200 }}
              />
              {discSubView === "rooms" && (
                <button className="btn btn-primary" onClick={() => setRoomModal({ roomNumber: "", floor: 1, capacity: 4, studyPlace: "Akademiya", status: "AVAILABLE", description: "", studentIds: [] })}>
                  <Plus size={15} /> Yangi xona
                </button>
              )}
              {discSubView === "duty" && (
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    setDutyModal({
                      studentId: academic.students?.[0]?.id || "",
                      supervisorType: "ADMIN",
                      reason: "",
                      dutyDate: new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date()),
                    })
                  }
                >
                  <Plus size={15} /> Navbatchi belgilash
                </button>
              )}
              {discSubView === "phone" && (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
                    const nextWeek = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date(Date.now() + 7 * 86400000));
                    setPhoneCreateModal({
                      groupId: academic.groups?.[0]?.id || "",
                      weekStart: today,
                      weekEnd: nextWeek,
                    });
                  }}
                >
                  <Plus size={15} /> Yangi telefon davri
                </button>
              )}
              <button className="btn" onClick={loadDomain}><RefreshCw size={14} /></button>
            </div>
          </div>

          {discSubView === "rooms" && (
            <div className="table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Xona №</th>
                    <th>Qavat / Bino</th>
                    <th>Bandlik / Sig'im</th>
                    <th>Holati</th>
                    <th>Xonadagi talabalar</th>
                    <th style={{ textAlign: "right" }}>Amallar</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms
                    .filter(
                      (r: any) =>
                        !roomSearch ||
                        String(r.roomNumber).toLowerCase().includes(roomSearch.toLowerCase()) ||
                        (r.students || []).some((st: any) => st.fullname?.toLowerCase().includes(roomSearch.toLowerCase()))
                    )
                    .map((r: any) => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 700 }}>Xona {r.roomNumber}</td>
                        <td>{r.floor}-qavat • {r.studyPlace || "Akademiya"}</td>
                        <td>
                          <b>{r.studentsCount ?? r.students?.length ?? 0}</b> / {r.capacity} kishi
                        </td>
                        <td>
                          <span className={`badge ${r.status === "AVAILABLE" ? "badge-emerald" : r.status === "FULL" ? "badge-amber" : "badge-rose"}`}>
                            {r.status === "AVAILABLE" ? "Bo'sh joy bor" : r.status === "FULL" ? "To'lgan" : "Ta'mirda"}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {(r.students || []).map((st: any) => (
                              <span key={st.id} className="badge badge-slate">{st.fullname}</span>
                            ))}
                            {(!r.students || r.students.length === 0) && <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Bo'sh</span>}
                          </div>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button
                              className="btn btn-sm"
                              onClick={() => {
                                setRoomStuSearch("");
                                setRoomModal({
                                  id: r.id,
                                  roomNumber: r.roomNumber,
                                  floor: r.floor,
                                  capacity: r.capacity,
                                  studyPlace: r.studyPlace || "Akademiya",
                                  status: r.status || "AVAILABLE",
                                  description: r.description || "",
                                  studentIds: (r.students || []).map((st: any) => Number(st.id)),
                                });
                              }}
                            >
                              ✏️ Tahrirlash / Talaba biriktirish
                            </button>
                            <button className="btn btn-sm" style={{ color: "var(--rose)" }} onClick={() => handleDeleteRoom(r.id)}>
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {discSubView === "duty" && (
            <div className="table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Sana</th>
                    <th>Talaba</th>
                    <th>Guruh</th>
                    <th>Sabab</th>
                    <th>Nazoratchi</th>
                    <th>Holati</th>
                    <th style={{ textAlign: "right" }}>Amallar</th>
                  </tr>
                </thead>
                <tbody>
                  {(campus.dutyRecords || [])
                    .filter(
                      (d: any) =>
                        !roomSearch ||
                        d.student?.fullname?.toLowerCase().includes(roomSearch.toLowerCase()) ||
                        d.reason?.toLowerCase().includes(roomSearch.toLowerCase()) ||
                        d.supervisorName?.toLowerCase().includes(roomSearch.toLowerCase())
                    )
                    .map((d: any) => (
                      <tr key={d.id}>
                        <td>{String(d.dutyDate).slice(0, 10)}</td>
                        <td style={{ fontWeight: 700 }}>{d.student?.fullname}</td>
                        <td>{d.student?.group?.name || d.class}</td>
                        <td>{d.reason}</td>
                        <td>{d.supervisorName} ({d.supervisorType === "TEACHER" ? "O'qituvchi" : "Boshqaruvchi"})</td>
                        <td>
                          <span className={`badge ${d.status === "COMPLETED" ? "badge-emerald" : "badge-amber"}`}>
                            {d.status === "COMPLETED" ? "Bajarilgan" : "Biriktirilgan"}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            {d.status !== "COMPLETED" ? (
                              <button className="btn btn-sm btn-emerald" onClick={() => handleUpdateDutyStatus(d.id, "COMPLETED")}>
                                ✓ Bajarildi
                              </button>
                            ) : (
                              <button className="btn btn-sm" onClick={() => handleUpdateDutyStatus(d.id, "ASSIGNED")}>
                                ⏳ Kutmoqda
                              </button>
                            )}
                            <button className="btn btn-sm" style={{ color: "var(--rose)" }} onClick={() => handleDeleteDuty(d.id)}>
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  {(campus.dutyRecords || []).length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: 30, color: "var(--text-muted)" }}>
                        Navbatchilik yozuvlari yo'q
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {discSubView === "phone" && (
            <div className="table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Guruh</th>
                    <th>Hafta boshlanishi</th>
                    <th>Hafta tugashi</th>
                    <th>Topshirilgan</th>
                    <th>Holati</th>
                    <th style={{ textAlign: "right" }}>Amallar</th>
                  </tr>
                </thead>
                <tbody>
                  {(campus.phoneCycles || [])
                    .filter(
                      (pc: any) =>
                        !roomSearch ||
                        (pc.group?.name || `Guruh #${pc.groupId}`).toLowerCase().includes(roomSearch.toLowerCase())
                    )
                    .map((pc: any) => (
                      <tr key={pc.id}>
                        <td style={{ fontWeight: 700 }}>{pc.group?.name || `Guruh #${pc.groupId}`}</td>
                        <td>{String(pc.weekStart).slice(0, 10)}</td>
                        <td>{String(pc.weekEnd).slice(0, 10)}</td>
                        <td>
                          <b>{pc.submittedCount ?? 0}</b> / {pc.totalRecords ?? 0} ta
                        </td>
                        <td>
                          <span className={`badge ${pc.isActive ? "badge-emerald" : "badge-slate"}`}>
                            {pc.isActive ? "Faol davr" : "Arxivlangan davr"}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button className="btn btn-sm btn-primary" onClick={() => openPhoneRecords(pc)}>
                              📋 Talabalar ({pc.submittedCount ?? 0}/{pc.totalRecords ?? 0})
                            </button>
                            {pc.isActive && (
                              <button className="btn btn-sm" onClick={() => handleClosePhoneCycle(pc.id)}>
                                🔒 Yopish
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  {(campus.phoneCycles || []).length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: 30, color: "var(--text-muted)" }}>
                        Telefon davrlari topilmadi
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {roomModal && (
          <div className="modal-backdrop" onClick={() => setRoomModal(null)}>
            <div className="modal-box modal-card animate-in" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>{roomModal.id ? `Xona ${roomModal.roomNumber} tahrirlash` : "Yangi xona qo'shish"}</h3>
              <form onSubmit={handleSaveRoom} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="grid-2">
                  <div>
                    <label style={{ fontSize: 12 }}>Xona raqami *</label>
                    <input className="input" required value={roomModal.roomNumber} onChange={(e) => setRoomModal({ ...roomModal, roomNumber: e.target.value })} placeholder="101" />
                  </div>
                  <div>
                    <label style={{ fontSize: 12 }}>Qavat *</label>
                    <input type="number" className="input" required value={roomModal.floor} onChange={(e) => setRoomModal({ ...roomModal, floor: e.target.value })} />
                  </div>
                </div>
                <div className="grid-3">
                  <div>
                    <label style={{ fontSize: 12 }}>Sig'imi (kishi)</label>
                    <input type="number" className="input" value={roomModal.capacity} onChange={(e) => setRoomModal({ ...roomModal, capacity: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12 }}>Bino / O'quv joyi</label>
                    <input className="input" value={roomModal.studyPlace} onChange={(e) => setRoomModal({ ...roomModal, studyPlace: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12 }}>Holati</label>
                    <select className="select" value={roomModal.status || "AVAILABLE"} onChange={(e) => setRoomModal({ ...roomModal, status: e.target.value })}>
                      <option value="AVAILABLE">Bo'sh joy bor</option>
                      <option value="FULL">To'lgan</option>
                      <option value="MAINTENANCE">Ta'mirda</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                    Xonaga biriktirilgan talabalar ({(roomModal.studentIds || []).length} ta tanlangan)
                  </label>
                  <input
                    className="input"
                    placeholder="Talaba ismidan qidirish..."
                    value={roomStuSearch}
                    onChange={(e) => setRoomStuSearch(e.target.value)}
                    style={{ marginBottom: 8 }}
                  />
                  <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8, padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                    {(academic.students || [])
                      .filter((s: any) => !s.isDeleted && s.isActive && (!roomStuSearch || s.fullname?.toLowerCase().includes(roomStuSearch.toLowerCase())))
                      .slice(0, 80)
                      .map((s: any) => {
                        const checked = (roomModal.studentIds || []).includes(Number(s.id));
                        return (
                          <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", padding: "3px 4px" }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const cur = roomModal.studentIds || [];
                                const next = e.target.checked
                                  ? [...cur, Number(s.id)]
                                  : cur.filter((id: number) => id !== Number(s.id));
                                setRoomModal({ ...roomModal, studentIds: next });
                              }}
                            />
                            <span><b>{s.fullname}</b> <span style={{ color: "var(--text-muted)", fontSize: 11 }}>({s.group?.name || s.studyPlace || "Guruhsiz"}{s.room?.roomNumber ? ` • Xona ${s.room.roomNumber}` : ""})</span></span>
                          </label>
                        );
                      })}
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button type="button" className="btn" onClick={() => setRoomModal(null)}>Bekor qilish</button>
                  <button type="submit" className="btn btn-primary">Saqlash</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {phoneCreateModal && (
          <div className="modal-backdrop" onClick={() => setPhoneCreateModal(null)}>
            <div className="modal-box modal-card animate-in" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>Yangi telefon yig'ish davri</h3>
              <form onSubmit={handleCreatePhoneCycle} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12 }}>Guruh *</label>
                  <select className="select" required value={phoneCreateModal.groupId} onChange={(e) => setPhoneCreateModal({ ...phoneCreateModal, groupId: e.target.value })}>
                    <option value="">Guruh tanlang</option>
                    {(academic.groups || []).map((g: any) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid-2">
                  <div>
                    <label style={{ fontSize: 12 }}>Hafta boshlanishi *</label>
                    <input type="date" className="input" required value={phoneCreateModal.weekStart} onChange={(e) => setPhoneCreateModal({ ...phoneCreateModal, weekStart: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12 }}>Hafta tugashi *</label>
                    <input type="date" className="input" required value={phoneCreateModal.weekEnd} onChange={(e) => setPhoneCreateModal({ ...phoneCreateModal, weekEnd: e.target.value })} />
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button type="button" className="btn" onClick={() => setPhoneCreateModal(null)}>Bekor qilish</button>
                  <button type="submit" className="btn btn-primary">Davrni ochish</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {phoneRecordsModal && (
          <div className="modal-backdrop" onClick={() => setPhoneRecordsModal(null)}>
            <div className="modal-box modal-card animate-in" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>
                  📱 {phoneRecordsModal.cycle?.group?.name || `Guruh #${phoneRecordsModal.cycle?.groupId}`} — Telefon topshirish ro'yxati
                </h3>
                <button className="btn btn-sm" onClick={() => setPhoneRecordsModal(null)}>✕</button>
              </div>
              <div style={{ maxHeight: 420, overflowY: "auto" }}>
                <table className="fin-table">
                  <thead>
                    <tr>
                      <th>Talaba</th>
                      <th>Telefon</th>
                      <th>Holati</th>
                      <th style={{ textAlign: "right" }}>Amal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(phoneRecordsModal.records || []).map((rec: any) => (
                      <tr key={rec.studentId}>
                        <td style={{ fontWeight: 700 }}>{rec.fullname}</td>
                        <td>{rec.phone || "—"}</td>
                        <td>
                          <span className={`badge ${rec.status === "SUBMITTED" ? "badge-emerald" : "badge-rose"}`}>
                            {rec.status === "SUBMITTED" ? "Topshirdi" : "Topshirmadi"}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            className={`btn btn-sm ${rec.status === "SUBMITTED" ? "" : "btn-emerald"}`}
                            onClick={() => handleTogglePhoneStatus(phoneRecordsModal.cycle.id, rec.studentId, rec.status === "SUBMITTED" ? "NOT_SUBMITTED" : "SUBMITTED")}
                          >
                            {rec.status === "SUBMITTED" ? "Qaytarib berildi" : "✓ Telefonni qabul qilish"}
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

        {dutyModal && (
          <div className="modal-backdrop" onClick={() => setDutyModal(null)}>
            <div className="modal-box modal-card animate-in" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>Navbatchilik belgilash</h3>
              <form onSubmit={handleSaveDuty} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12 }}>Talaba *</label>
                  <select className="select" required value={dutyModal.studentId} onChange={(e) => setDutyModal({ ...dutyModal, studentId: e.target.value })}>
                    <option value="">Talaba tanlang</option>
                    {(academic.students || []).map((s: any) => (
                      <option key={s.id} value={s.id}>{s.fullname} ({s.studyPlace || "Guruhsiz"})</option>
                    ))}
                  </select>
                </div>
                <div className="grid-2">
                  <div>
                    <label style={{ fontSize: 12 }}>Sana *</label>
                    <input type="date" className="input" required value={dutyModal.dutyDate} onChange={(e) => setDutyModal({ ...dutyModal, dutyDate: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12 }}>Nazoratchi turi</label>
                    <select className="select" value={dutyModal.supervisorType} onChange={(e) => setDutyModal({ ...dutyModal, supervisorType: e.target.value })}>
                      <option value="ADMIN">Boshqaruvchi</option>
                      <option value="TEACHER">O'qituvchi</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 12 }}>Sabab *</label>
                  <input className="input" required value={dutyModal.reason} onChange={(e) => setDutyModal({ ...dutyModal, reason: e.target.value })} placeholder="Sababni kiriting..." />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button type="button" className="btn" onClick={() => setDutyModal(null)}>Bekor qilish</button>
                  <button type="submit" className="btn btn-primary">Saqlash</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===========================================================================
  // 6. XODIMLAR (FAOL + ARXIV) VA TOPSHIRIQLAR (hr_tasks)
  // ===========================================================================
  if (activeTab === "hr_tasks") {
    const erpList = (hr.erpEmployees || []).filter((e: any) => {
      if (hrArchiveMode === "active" && e.deletedAt) return false;
      if (hrArchiveMode === "archived" && !e.deletedAt) return false;
      if (hrSearch) {
        const q = hrSearch.toLowerCase();
        if (!e.fullName?.toLowerCase().includes(q) && !e.username?.toLowerCase().includes(q) && !e.department?.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="kpi-grid">
          <div className="glass-card kpi-card" onClick={() => setHrSubView("erp_emp")} style={{ cursor: "pointer" }}>
            <div className="kpi-label"><Users size={15} color="#10b981" /> MOLIYA BO'LIMI XODIMLARI</div>
            <div className="kpi-value">{(hr.erpEmployees || []).length} ta</div>
            <div className="kpi-sub">
              Faol: {(hr.erpEmployees || []).filter((x: any) => !x.deletedAt).length} • Arxiv: {(hr.erpEmployees || []).filter((x: any) => x.deletedAt).length}
            </div>
          </div>
          <div className="glass-card kpi-card" onClick={() => setHrSubView("crm_emp")} style={{ cursor: "pointer" }}>
            <div className="kpi-label"><UserCheck size={15} color="#06b6d4" /> O'QUV MARKAZI XODIMLARI</div>
            <div className="kpi-value">{(hr.crmEmployees || []).length} ta</div>
            <div className="kpi-sub">Ichki xo'jalik va xizmat xodimlari</div>
          </div>
          <div className="glass-card kpi-card" onClick={() => setHrSubView("tasks")} style={{ cursor: "pointer" }}>
            <div className="kpi-label"><CheckCircle2 size={15} color="#8b5cf6" /> XODIM VAZIFALARI</div>
            <div className="kpi-value">{(hr.tasks || []).length} ta</div>
            <div className="kpi-sub">Biriktirilgan topshiriqlar va arxiv</div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className={`btn ${hrSubView === "erp_emp" ? "btn-primary" : ""}`} onClick={() => setHrSubView("erp_emp")}>
                Moliya bo'limi xodimlari ({(hr.erpEmployees || []).length})
              </button>
              <button className={`btn ${hrSubView === "crm_emp" ? "btn-primary" : ""}`} onClick={() => setHrSubView("crm_emp")}>
                O'quv markazi xodimlari ({(hr.crmEmployees || []).length})
              </button>
              <button className={`btn ${hrSubView === "tasks" ? "btn-primary" : ""}`} onClick={() => setHrSubView("tasks")}>
                Topshiriqlar ({(hr.tasks || []).length})
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input className="input" placeholder="Xodim qidirish..." value={hrSearch} onChange={(e) => setHrSearch(e.target.value)} style={{ width: 200 }} />
              {hrSubView === "erp_emp" && (
                <select className="select" value={hrArchiveMode} onChange={(e) => setHrArchiveMode(e.target.value as any)} style={{ width: 170 }}>
                  <option value="all">🌐 Barchasi (Faol + Arxiv)</option>
                  <option value="active">🟢 Faqat faollar</option>
                  <option value="archived">📦 O'chirilgan arxiv</option>
                </select>
              )}
              {hrSubView === "tasks" && (
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    setTaskModal({
                      title: "",
                      description: "",
                      floor: "ALL_FLOORS",
                      priority: "MEDIUM",
                      deadline: new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date()),
                      assignedToId: hr.crmEmployees?.[0]?.id || "",
                    })
                  }
                >
                  <Plus size={15} /> Vazifa biriktirish
                </button>
              )}
              <button className="btn" onClick={loadDomain}><RefreshCw size={14} /></button>
            </div>
          </div>

          {hrSubView === "erp_emp" && (
            <div className="table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>F.I.Sh. / Kod</th>
                    <th>Login / Elektron pochta</th>
                    <th>Bo'lim / Lavozim</th>
                    <th>Filial</th>
                    <th>Hamyon qoldig'i / Jami berilgan</th>
                    <th>Holati</th>
                  </tr>
                </thead>
                <tbody>
                  {erpList.map((e: any) => (
                    <tr key={e.id} style={{ opacity: e.deletedAt ? 0.72 : 1 }}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{e.fullName}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                          {e.employeeCode} • {e.role === "DIRECTOR" ? "Rahbar" : e.role === "FINANCE" ? "Hisobchi" : "Xodim"}
                        </div>
                      </td>
                      <td>
                        <div>@{e.username}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{e.email}</div>
                      </td>
                      <td>{e.department || "—"} • {e.position || "—"}</td>
                      <td>{e.officeName || "Asosiy"}</td>
                      <td>
                        <div style={{ fontWeight: 700, color: "#34d399" }}>{fmtTL(e.walletBalance)}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          Berilgan: {fmtTL(e.walletTotalAssigned)} • Sarflangan: {fmtTL(e.walletTotalSpent)}
                        </div>
                      </td>
                      <td>
                        {e.deletedAt ? (
                          <span className="badge badge-rose">Arxiv ({String(e.deletedAt).slice(0, 10)})</span>
                        ) : (
                          <span className="badge badge-emerald">Faol</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {hrSubView === "crm_emp" && (
            <div className="table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>F.I.Sh.</th>
                    <th>Lavozim</th>
                    <th>Telefon (Turkiya / O'zbekiston)</th>
                    <th>Telegram</th>
                    <th>Pasport</th>
                    <th>Holati</th>
                  </tr>
                </thead>
                <tbody>
                  {(hr.crmEmployees || [])
                    .filter(
                      (e: any) =>
                        !hrSearch ||
                        e.fullname?.toLowerCase().includes(hrSearch.toLowerCase()) ||
                        e.position?.toLowerCase().includes(hrSearch.toLowerCase()) ||
                        e.turkPhone?.toLowerCase().includes(hrSearch.toLowerCase()) ||
                        e.uzbPhone?.toLowerCase().includes(hrSearch.toLowerCase())
                    )
                    .map((e: any) => (
                      <tr key={e.id}>
                        <td style={{ fontWeight: 700 }}>{e.fullname}</td>
                        <td>{e.position}</td>
                        <td>{e.turkPhone || e.uzbPhone || "—"}</td>
                        <td>{e.tgUsername ? `@${e.tgUsername}` : "—"}</td>
                        <td>{e.passportNumber || "—"}</td>
                        <td>
                          <span className={`badge ${e.isDeleted ? "badge-rose" : e.isActive ? "badge-emerald" : "badge-amber"}`}>
                            {e.isDeleted ? "Arxiv" : e.isActive ? "Faol" : "Nofaol"}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {hrSubView === "tasks" && (
            <div className="table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Vazifa</th>
                    <th>Mas'ul xodim</th>
                    <th>Qavat / Muhimlik</th>
                    <th>Muddat</th>
                    <th>Holati</th>
                    <th style={{ textAlign: "right" }}>Amal</th>
                  </tr>
                </thead>
                <tbody>
                  {(hr.tasks || [])
                    .filter(
                      (t: any) =>
                        !hrSearch ||
                        t.title?.toLowerCase().includes(hrSearch.toLowerCase()) ||
                        t.description?.toLowerCase().includes(hrSearch.toLowerCase()) ||
                        t.assignedTo?.fullname?.toLowerCase().includes(hrSearch.toLowerCase())
                    )
                    .map((t: any) => (
                      <tr key={t.id}>
                        <td>
                          <div style={{ fontWeight: 700 }}>{t.title}</div>
                          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{t.description}</div>
                        </td>
                        <td>{t.assignedTo?.fullname || "—"}</td>
                        <td>
                          <span className="badge badge-slate">{t.floor === "ALL_FLOORS" ? "Barcha qavatlar" : `${t.floor}-qavat`}</span>{" "}
                          <span className={`badge ${t.priority === "HIGH" || t.priority === "URGENT" ? "badge-rose" : "badge-cyan"}`}>
                            {t.priority === "URGENT" ? "Juda muhim" : t.priority === "HIGH" ? "Yuqori" : t.priority === "MEDIUM" ? "O'rtacha" : "Oddiy"}
                          </span>
                        </td>
                        <td>{String(t.deadline).slice(0, 10)}</td>
                        <td>
                          <span className={`badge ${t.status === "COMPLETED" ? "badge-emerald" : t.status === "IN_PROGRESS" ? "badge-cyan" : "badge-amber"}`}>
                            {t.status === "COMPLETED" ? "Bajarilgan" : t.status === "IN_PROGRESS" ? "Jarayonda" : "Kutilmoqda"}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {t.status !== "COMPLETED" && (
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={async () => {
                                try {
                                  await crmMutate(
                                    `mutation UpdTask($id: Int!, $input: UpdateTaskInput!) {
                                      updateTask(id: $id, input: $input) { id status }
                                    }`,
                                    { id: Number(t.id), input: { status: "COMPLETED" } }
                                  );
                                  notify("Vazifa bajarildi deb belgilandi!");
                                  loadDomain();
                                } catch (err: any) {
                                  notify(err.message, "err");
                                }
                              }}
                            >
                              ✓ Bajarildi
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  {(hr.tasks || []).length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: 30, color: "var(--text-muted)" }}>
                        Topshiriqlar yo'q
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {taskModal && (
          <div className="modal-backdrop" onClick={() => setTaskModal(null)}>
            <div className="modal-box modal-card animate-in" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>Xodimga vazifa biriktirish</h3>
              <form onSubmit={handleSaveTask} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12 }}>Sarlavha *</label>
                  <input className="input" required value={taskModal.title} onChange={(e) => setTaskModal({ ...taskModal, title: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 12 }}>Tavsif *</label>
                  <input className="input" required value={taskModal.description} onChange={(e) => setTaskModal({ ...taskModal, description: e.target.value })} />
                </div>
                <div className="grid-2">
                  <div>
                    <label style={{ fontSize: 12 }}>Xodim *</label>
                    <select className="select" required value={taskModal.assignedToId} onChange={(e) => setTaskModal({ ...taskModal, assignedToId: e.target.value })}>
                      <option value="">Tanlang</option>
                      {(hr.crmEmployees || []).map((e: any) => (
                        <option key={e.id} value={e.id}>{e.fullname}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12 }}>Muddat *</label>
                    <input type="date" className="input" required value={taskModal.deadline} onChange={(e) => setTaskModal({ ...taskModal, deadline: e.target.value })} />
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button type="button" className="btn" onClick={() => setTaskModal(null)}>Bekor qilish</button>
                  <button type="submit" className="btn btn-primary">Saqlash</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===========================================================================
  // 7. FILIALLAR, KATEGORIYALAR, XARAJATLAR ARXIVI VA TRANZAKSIYALAR (org_catalog)
  // ===========================================================================
  if (activeTab === "org_catalog") {
    const allExpArch = sys.erpExpensesArchive || [];
    const deletedExpCount = allExpArch.filter((x: any) => x.deletedAt).length;

    const filteredExpArch = allExpArch.filter((x: any) => {
      if (expArchFilter === "active" && x.deletedAt) return false;
      if (expArchFilter === "deleted" && !x.deletedAt) return false;
      if (orgSearch) {
        const q = orgSearch.toLowerCase();
        if (
          !x.description?.toLowerCase().includes(q) &&
          !x.categoryName?.toLowerCase().includes(q) &&
          !x.employeeName?.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });

    const filteredTx = (sys.erpTransactions || []).filter((tx: any) => {
      if (txTypeFilter && tx.type !== txTypeFilter) return false;
      if (orgSearch) {
        const q = orgSearch.toLowerCase();
        if (!tx.description?.toLowerCase().includes(q) && !tx.employeeName?.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="kpi-grid">
          <div className="glass-card kpi-card" onClick={() => setOrgSubView("categories")} style={{ cursor: "pointer" }}>
            <div className="kpi-label"><Layers size={15} color="#10b981" /> XARAJAT TURLARI</div>
            <div className="kpi-value">{(sys.erpCategories || []).length} ta</div>
            <div className="kpi-sub">Xarajat va byudjet toifalari</div>
          </div>
          <div className="glass-card kpi-card" onClick={() => setOrgSubView("offices")} style={{ cursor: "pointer" }}>
            <div className="kpi-label"><Building2 size={15} color="#06b6d4" /> FILIALLAR VA MARKAZLAR</div>
            <div className="kpi-value">{(sys.erpOffices || []).length} ta</div>
            <div className="kpi-sub">Tashkilot filiallari va markazlari</div>
          </div>
          <div className="glass-card kpi-card" onClick={() => setOrgSubView("transactions")} style={{ cursor: "pointer" }}>
            <div className="kpi-label"><History size={15} color="#8b5cf6" /> HAMYON AMALIYOTLARI</div>
            <div className="kpi-value">{(sys.erpTransactions || []).length} ta</div>
            <div className="kpi-sub">Barcha pul ajratish, sarf va tuzatishlar</div>
          </div>
          <div className="glass-card kpi-card" onClick={() => setOrgSubView("expenses_archive")} style={{ cursor: "pointer" }}>
            <div className="kpi-label"><AlertTriangle size={15} color="#f59e0b" /> XARAJATLAR ARXIVI</div>
            <div className="kpi-value">{allExpArch.length} ta</div>
            <div className="kpi-sub">Shundan {deletedExpCount} tasi bekor qilingan arxiv</div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className={`btn ${orgSubView === "categories" ? "btn-primary" : ""}`} onClick={() => setOrgSubView("categories")}>
                Xarajat turlari ({(sys.erpCategories || []).length})
              </button>
              <button className={`btn ${orgSubView === "offices" ? "btn-primary" : ""}`} onClick={() => setOrgSubView("offices")}>
                Filiallar ({(sys.erpOffices || []).length})
              </button>
              <button className={`btn ${orgSubView === "transactions" ? "btn-primary" : ""}`} onClick={() => setOrgSubView("transactions")}>
                Hamyon amaliyotlari ({(sys.erpTransactions || []).length})
              </button>
              <button className={`btn ${orgSubView === "expenses_archive" ? "btn-primary" : ""}`} onClick={() => setOrgSubView("expenses_archive")}>
                📦 Xarajatlar arxivi ({allExpArch.length})
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                className="input"
                placeholder="Qidirish..."
                value={orgSearch}
                onChange={(e) => setOrgSearch(e.target.value)}
                style={{ width: 200 }}
              />
              {orgSubView === "transactions" && (
                <select className="select" value={txTypeFilter} onChange={(e) => setTxTypeFilter(e.target.value)} style={{ width: 175 }}>
                  <option value="">Barcha amaliyot turlari</option>
                  <option value="ASSIGNMENT">Mablag' ajratildi</option>
                  <option value="EXPENSE">Xarajat to'landi</option>
                  <option value="ADJUSTMENT">Summa tuzatildi</option>
                  <option value="REFUND">Qaytarildi</option>
                </select>
              )}
              {orgSubView === "expenses_archive" && (
                <select className="select" value={expArchFilter} onChange={(e) => setExpArchFilter(e.target.value as any)} style={{ width: 185 }}>
                  <option value="all">🌐 Barchasi ({allExpArch.length})</option>
                  <option value="active">🟢 Faol ({allExpArch.length - deletedExpCount})</option>
                  <option value="deleted">🗑️ Bekor qilingan arxiv ({deletedExpCount})</option>
                </select>
              )}
              {orgSubView === "categories" && (
                <button className="btn btn-primary" onClick={() => setCategoryModal({ name: "", description: "" })}>
                  <Plus size={15} /> Yangi xarajat turi
                </button>
              )}
              {orgSubView === "offices" && (
                <button className="btn btn-primary" onClick={() => setOfficeModal({ name: "", address: "" })}>
                  <Plus size={15} /> Yangi filial
                </button>
              )}
              <button className="btn" onClick={loadDomain}><RefreshCw size={14} /></button>
            </div>
          </div>

          {orgSubView === "categories" && (
            <div className="table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Xarajat turi nomi</th>
                    <th>Tavsif</th>
                    <th>Holati</th>
                  </tr>
                </thead>
                <tbody>
                  {(sys.erpCategories || [])
                    .filter((c: any) => !orgSearch || c.name?.toLowerCase().includes(orgSearch.toLowerCase()))
                    .map((c: any) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 700 }}>{c.name}</td>
                        <td>{c.description || "—"}</td>
                        <td><span className="badge badge-emerald">{c.isActive !== false ? "Faol" : "Nofaol"}</span></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {orgSubView === "offices" && (
            <div className="table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Filial nomi</th>
                    <th>Manzil</th>
                    <th>Qo'shilgan sana</th>
                  </tr>
                </thead>
                <tbody>
                  {(sys.erpOffices || [])
                    .filter(
                      (o: any) =>
                        !orgSearch ||
                        o.name?.toLowerCase().includes(orgSearch.toLowerCase()) ||
                        o.address?.toLowerCase().includes(orgSearch.toLowerCase())
                    )
                    .map((o: any) => (
                      <tr key={o.id}>
                        <td style={{ fontWeight: 700 }}>{o.name}</td>
                        <td>{o.address || "—"}</td>
                        <td>{o.createdAt ? String(o.createdAt).slice(0, 10) : "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {orgSubView === "transactions" && (
            <div className="table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Sana</th>
                    <th>Xodim / Hamyon</th>
                    <th>Amaliyot turi</th>
                    <th>Summa</th>
                    <th>Izoh</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTx.map((tx: any) => (
                    <tr key={tx.id}>
                      <td>{tx.createdAt ? String(tx.createdAt).slice(0, 16).replace("T", " ") : "—"}</td>
                      <td style={{ fontWeight: 600 }}>{tx.employeeName || "Hamyon"}</td>
                      <td>
                        <span className={`badge ${tx.type === "ASSIGNMENT" ? "badge-emerald" : tx.type === "ADJUSTMENT" ? "badge-cyan" : "badge-amber"}`}>
                          {tx.type === "ASSIGNMENT" ? "Mablag' ajratildi" : tx.type === "ADJUSTMENT" ? "Summa tuzatildi" : tx.type === "REFUND" ? "Qaytarildi" : "Xarajat to'landi"}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700 }}>{fmtTL(tx.amount)}</td>
                      <td>{tx.description || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {orgSubView === "expenses_archive" && (
            <div className="table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Sana</th>
                    <th>Xodim / Xarajat turi</th>
                    <th>Tavsif</th>
                    <th>Summa</th>
                    <th>Holati / Arxiv</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpArch.map((ex: any) => {
                    const stLabel =
                      ex.status === "PAID"
                        ? "To'langan"
                        : ex.status === "APPROVED"
                        ? "Tasdiqlangan"
                        : ex.status === "PENDING"
                        ? "Tasdiq kutilmoqda"
                        : "Rad etilgan";
                    return (
                      <tr key={ex.id} style={{ opacity: ex.deletedAt ? 0.75 : 1 }}>
                        <td>{ex.expenseDate ? String(ex.expenseDate).slice(0, 10) : "—"}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{ex.employeeName || "—"}</div>
                          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{ex.categoryName || "—"}</div>
                        </td>
                        <td>
                          <div>{ex.description}</div>
                          {ex.rejectionReason && <div style={{ fontSize: 11, color: "#fda4af" }}>Sabab: {ex.rejectionReason}</div>}
                        </td>
                        <td style={{ fontWeight: 700 }}>{fmtTL(ex.amountInDefault || ex.amount)}</td>
                        <td>
                          <span className={`badge ${ex.deletedAt ? "badge-rose" : ex.status === "PAID" ? "badge-emerald" : "badge-amber"}`}>
                            {ex.deletedAt ? `Arxiv (${stLabel})` : stLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {categoryModal && (
          <div className="modal-backdrop" onClick={() => setCategoryModal(null)}>
            <div className="modal-box modal-card animate-in" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>Yangi xarajat turi qo'shish</h3>
              <form onSubmit={handleSaveCategory} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12 }}>Nomi *</label>
                  <input className="input" required value={categoryModal.name} onChange={(e) => setCategoryModal({ ...categoryModal, name: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 12 }}>Tavsif</label>
                  <input className="input" value={categoryModal.description} onChange={(e) => setCategoryModal({ ...categoryModal, description: e.target.value })} />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button type="button" className="btn" onClick={() => setCategoryModal(null)}>Bekor qilish</button>
                  <button type="submit" className="btn btn-primary">Saqlash</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {officeModal && (
          <div className="modal-backdrop" onClick={() => setOfficeModal(null)}>
            <div className="modal-box modal-card animate-in" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>Yangi filial qo'shish</h3>
              <form onSubmit={handleSaveOffice} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12 }}>Filial nomi *</label>
                  <input className="input" required value={officeModal.name} onChange={(e) => setOfficeModal({ ...officeModal, name: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 12 }}>Manzil</label>
                  <input className="input" value={officeModal.address} onChange={(e) => setOfficeModal({ ...officeModal, address: e.target.value })} />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button type="button" className="btn" onClick={() => setOfficeModal(null)}>Bekor qilish</button>
                  <button type="submit" className="btn btn-primary">Saqlash</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===========================================================================
  // 8. RAHBARIAT, O'QUV YILLARI ARXIVI VA HARAKATLAR TARIXI (system_admin)
  // ===========================================================================
  const combinedAudit = [
    ...(auditSourceFilter !== "CRM"
      ? (sys.erpAuditLogs || []).map((l: any) => ({
          id: `erp-${l.id}`,
          source: "Moliya bo'limi",
          rawSource: "ERP",
          time: l.createdAt ? String(l.createdAt).slice(0, 16).replace("T", " ") : "—",
          action: l.action,
          detail: `${l.entityType || "Amal"} (${l.actorEmail || "Xodim"})`,
        }))
      : []),
    ...(auditSourceFilter !== "ERP"
      ? (sys.crmAuditLogs || []).map((l: any) => ({
          id: `crm-${l.id}`,
          source: "O'quv markazi",
          rawSource: "CRM",
          time: l.timestamp ? String(l.timestamp).slice(0, 16).replace("T", " ") : "—",
          action: l.eventType || "Tizim amali",
          detail: `@${l.username || "foydalanuvchi"} • ${l.ipAddress || ""}`,
        }))
      : []),
  ]
    .filter(
      (x) =>
        !auditSearch ||
        x.action?.toLowerCase().includes(auditSearch.toLowerCase()) ||
        x.detail?.toLowerCase().includes(auditSearch.toLowerCase())
    )
    .sort((a, b) => String(b.time || "").localeCompare(String(a.time || "")));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="kpi-grid">
        <div className="glass-card kpi-card" onClick={() => setSysSubView("admins")} style={{ cursor: "pointer" }}>
          <div className="kpi-label"><UserCheck size={15} color="#10b981" /> RAHBARIAT VA BOSHQARUVCHILAR</div>
          <div className="kpi-value">{(sys.crmAdmins || []).length + (sys.crmRoots || []).length}</div>
          <div className="kpi-sub">Bosh rahbar: {(sys.crmRoots || []).length} • Boshqaruvchi: {(sys.crmAdmins || []).length}</div>
        </div>
        <div className="glass-card kpi-card" onClick={() => setSysSubView("years")} style={{ cursor: "pointer" }}>
          <div className="kpi-label"><Calendar size={15} color="#06b6d4" /> O'QUV YILLARI VA ARXIV</div>
          <div className="kpi-value">{allStudyPlaces.length} oqim</div>
          <div className="kpi-sub">2025-2026 arxiv va 2026-2027 faol</div>
        </div>
        <div className="glass-card kpi-card" onClick={() => setSysSubView("audit")} style={{ cursor: "pointer" }}>
          <div className="kpi-label"><History size={15} color="#8b5cf6" /> HARAKATLAR TARIXI</div>
          <div className="kpi-value">{(sys.erpAuditLogs || []).length + (sys.crmAuditLogs || []).length}</div>
          <div className="kpi-sub">Barcha bo'limlar bo'yicha amallar tarixi</div>
        </div>
        <div className="glass-card kpi-card" onClick={() => setSysSubView("sync")} style={{ cursor: "pointer" }}>
          <div className="kpi-label"><AlertTriangle size={15} color="#f59e0b" /> GOOGLE JADVAL VA BILDIRISHNOMALAR</div>
          <div className="kpi-value">{(sys.syncLogs || []).length} ta</div>
          <div className="kpi-sub">Google Jadval sinxronlash yozuvlari</div>
        </div>
      </div>

      <div className="glass-card" style={{ padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className={`btn ${sysSubView === "admins" ? "btn-primary" : ""}`} onClick={() => setSysSubView("admins")}>
              Rahbariyat va boshqaruvchilar
            </button>
            <button className={`btn ${sysSubView === "years" ? "btn-primary" : ""}`} onClick={() => setSysSubView("years")}>
              O'quv yillari va arxivlar
            </button>
            <button className={`btn ${sysSubView === "audit" ? "btn-primary" : ""}`} onClick={() => setSysSubView("audit")}>
              Harakatlar tarixi ({combinedAudit.length})
            </button>
            <button className={`btn ${sysSubView === "sync" ? "btn-primary" : ""}`} onClick={() => setSysSubView("sync")}>
              🔄 Google Jadval sinxronlash ({(sys.syncLogs || []).length})
            </button>
            <button className={`btn ${sysSubView === "notifications" ? "btn-primary" : ""}`} onClick={() => setSysSubView("notifications")}>
              Bildirishnomalar ({(sys.erpNotifications || []).length})
            </button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {sysSubView === "admins" && access?.isDirector && (
              <button
                className="btn btn-primary"
                onClick={() =>
                  setAdminModal({
                    fullname: "",
                    username: "",
                    password: "",
                    phone: "",
                    tgUsername: "",
                    gender: "MALE",
                    isActive: true,
                    allowedPages: ["dashboard", "students", "groups", "teachers", "subjects", "payments", "debtors", "attendance"],
                    readOnlyPages: [],
                  })
                }
              >
                <Plus size={14} /> Yangi boshqaruvchi
              </button>
            )}
            {sysSubView === "sync" && (
              <button
                className="btn btn-primary"
                disabled={syncBusy}
                onClick={async () => {
                  setSyncBusy(true);
                  try {
                    const res = await apiFetch("/fin-api/system/sync-sheets", {
                      method: "POST",
                      body: JSON.stringify({ mode: "all" }),
                    });
                    notify(res.message || "Google Jadval bilan sinxronlash bajarildi!");
                    loadDomain();
                  } catch (err: any) {
                    notify(err.message, "err");
                  } finally {
                    setSyncBusy(false);
                  }
                }}
              >
                <RefreshCw size={14} /> {syncBusy ? "Sinxronlanmoqda..." : "Google Jadval bilan hozir sinxronlash"}
              </button>
            )}
            {sysSubView === "audit" && (
              <>
                <input className="input" placeholder="Tarixdan qidirish..." value={auditSearch} onChange={(e) => setAuditSearch(e.target.value)} style={{ width: 200 }} />
                <select className="select" value={auditSourceFilter} onChange={(e) => setAuditSourceFilter(e.target.value as any)} style={{ width: 165 }}>
                  <option value="ALL">Barcha bo'limlar</option>
                  <option value="ERP">Moliya bo'limi</option>
                  <option value="CRM">O'quv markazi</option>
                </select>
              </>
            )}
            <button className="btn" onClick={loadDomain}><RefreshCw size={14} /></button>
          </div>
        </div>

        {sysSubView === "sync" && (
          <div className="table-wrap">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Raqam</th>
                  <th>Vaqt</th>
                  <th>Talaba</th>
                  <th>Yo'nalish</th>
                  <th>Amal turi</th>
                  <th>Holati</th>
                  <th>Izoh / Xatolik</th>
                </tr>
              </thead>
              <tbody>
                {(sys.syncLogs || []).map((sl: any) => (
                  <tr key={sl.id}>
                    <td>#{sl.id}</td>
                    <td>{String(sl.timestamp || sl.createdAt || "").slice(0, 16).replace("T", " ")}</td>
                    <td style={{ fontWeight: 600 }}>{sl.studentName || (sl.studentId ? `Talaba #${sl.studentId}` : "Umumiy jadval")}</td>
                    <td>
                      <span className="badge badge-cyan">
                        {sl.direction === "to_sheets" ? "Tizimdan → Google Jadvalga" : "Google Jadvaldan → Tizimga"}
                      </span>
                    </td>
                    <td>{sl.operationType === "update" ? "Yangilash" : sl.operationType === "create" ? "Yaratish" : sl.operationType || "Sinxronlash"}</td>
                    <td>
                      <span className={`badge ${sl.status === "success" ? "badge-emerald" : "badge-rose"}`}>
                        {sl.status === "success" ? "Muvaffaqiyatli" : "Xatolik"}
                      </span>
                    </td>
                    <td>{sl.errorMessage || "—"}</td>
                  </tr>
                ))}
                {(sys.syncLogs || []).length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: 30, color: "var(--text-muted)" }}>
                      Sinxronlash tarixi topilmadi
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {sysSubView === "admins" && (
          <div className="table-wrap">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>F.I.Sh.</th>
                  <th>Login</th>
                  <th>Lavozimi / Bo'limi</th>
                  <th>Ruxsat etilgan sahifalar</th>
                  <th>Telefon / Telegram</th>
                  <th>Holati</th>
                  <th style={{ textAlign: "right" }}>Amallar</th>
                </tr>
              </thead>
              <tbody>
                {(sys.crmRoots || []).map((r: any) => (
                  <tr key={`root-${r.id}`}>
                    <td style={{ fontWeight: 700 }}>{r.fullname}</td>
                    <td>@{r.username}</td>
                    <td><span className="badge badge-violet">Bosh rahbar (To'liq ruxsat)</span></td>
                    <td><span className="badge badge-emerald">Barcha bo'limlar</span></td>
                    <td>—</td>
                    <td><span className="badge badge-emerald">Faol</span></td>
                    <td style={{ textAlign: "right", color: "var(--text-muted)", fontSize: 12 }}>To'liq huquq</td>
                  </tr>
                ))}
                {(sys.crmAdmins || []).map((a: any) => (
                  <tr key={`adm-${a.id}`}>
                    <td style={{ fontWeight: 700 }}>{a.fullname}</td>
                    <td>@{a.username}</td>
                    <td>
                      <span className="badge badge-cyan">Boshqaruvchi</span>{" "}
                      <span className="badge badge-slate" style={{ fontSize: 11 }}>
                        {a.gender === "FEMALE" ? "Ayollar bo'limi" : a.gender === "MALE" ? "Erkaklar bo'limi" : "Umumiy"}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: 280 }}>
                        {(a.allowedPages || []).map((p: string) => (
                          <span key={p} className="badge badge-slate" style={{ fontSize: 10 }}>{p}</span>
                        ))}
                        {(!a.allowedPages || a.allowedPages.length === 0) && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Standart o'quv bo'limlari</span>}
                      </div>
                    </td>
                    <td>{a.phone || "—"} {a.tgUsername ? `• @${a.tgUsername}` : ""}</td>
                    <td><span className={`badge ${a.isActive ? "badge-emerald" : "badge-rose"}`}>{a.isActive ? "Faol" : "Nofaol"}</span></td>
                    <td style={{ textAlign: "right" }}>
                      {access?.isDirector && (
                        <button
                          className="btn btn-sm"
                          onClick={() =>
                            setAdminModal({
                              id: a.id,
                              fullname: a.fullname || "",
                              username: a.username || "",
                              password: "",
                              phone: a.phone || "",
                              tgUsername: a.tgUsername || "",
                              gender: a.gender || "MALE",
                              isActive: a.isActive ?? true,
                              allowedPages: Array.isArray(a.allowedPages) ? a.allowedPages : [],
                              readOnlyPages: Array.isArray(a.readOnlyPages) ? a.readOnlyPages : [],
                            })
                          }
                        >
                          ✏️ Huquqlar va Tahrir
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {sysSubView === "years" && (
          <div className="table-wrap">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>O'quv yili / Muassasa oqimi</th>
                  <th>Jami talabalar</th>
                  <th>Faollar</th>
                  <th>Arxivdagi (2025-2026)</th>
                  <th>O'chirilganlar</th>
                </tr>
              </thead>
              <tbody>
                {allStudyPlaces.map((sp) => {
                  const list = (academic.students || []).filter((s: any) => s.studyPlace === sp);
                  return (
                    <tr key={sp}>
                      <td style={{ fontWeight: 700 }}>{sp}</td>
                      <td><b>{list.length} ta</b></td>
                      <td><span className="badge badge-emerald">{list.filter((s: any) => s.isActive && !s.isDeleted).length} ta</span></td>
                      <td><span className="badge badge-amber">{list.filter((s: any) => !s.isActive && !s.isDeleted).length} ta</span></td>
                      <td><span className="badge badge-rose">{list.filter((s: any) => s.isDeleted).length} ta</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {sysSubView === "audit" && (
          <div className="table-wrap">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Vaqt</th>
                  <th>Bo'lim</th>
                  <th>Bajarilgan amal</th>
                  <th>Mas'ul shaxs va tafsilot</th>
                </tr>
              </thead>
              <tbody>
                {combinedAudit.map((l) => (
                  <tr key={l.id}>
                    <td>{l.time}</td>
                    <td><span className={`badge ${l.rawSource === "ERP" ? "badge-cyan" : "badge-emerald"}`}>{l.source}</span></td>
                    <td style={{ fontWeight: 600 }}>{l.action}</td>
                    <td>{l.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {sysSubView === "notifications" && (
          <div className="table-wrap">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Vaqt</th>
                  <th>Sarlavha</th>
                  <th>Xabar</th>
                  <th>Holat</th>
                </tr>
              </thead>
              <tbody>
                {(sys.erpNotifications || []).map((n: any) => (
                  <tr key={n.id}>
                    <td>{n.createdAt ? String(n.createdAt).slice(0, 16).replace("T", " ") : "—"}</td>
                    <td style={{ fontWeight: 700 }}>{n.title}</td>
                    <td>{n.message}</td>
                    <td>
                      <span className={`badge ${n.isRead ? "badge-slate" : "badge-amber"}`}>
                        {n.isRead ? "O'qilgan" : "Yangi"}
                      </span>
                    </td>
                  </tr>
                ))}
                {(sys.erpNotifications || []).length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: 30, color: "var(--text-muted)" }}>
                      Bildirishnomalar yo'q
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {adminModal && (
        <div className="modal-backdrop" onClick={() => setAdminModal(null)}>
          <div className="modal-box modal-card animate-in" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{adminModal.id ? `Boshqaruvchi huquqlarini tahrirlash: ${adminModal.fullname}` : "Yangi boshqaruvchi qo'shish"}</h3>
            <form onSubmit={handleSaveAdmin} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="grid-2">
                <div>
                  <label style={{ fontSize: 12 }}>F.I.Sh. *</label>
                  <input className="input" required value={adminModal.fullname} onChange={(e) => setAdminModal({ ...adminModal, fullname: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 12 }}>Login (username) *</label>
                  <input className="input" required value={adminModal.username} onChange={(e) => setAdminModal({ ...adminModal, username: e.target.value })} />
                </div>
              </div>
              <div className="grid-3">
                <div>
                  <label style={{ fontSize: 12 }}>{adminModal.id ? "Yangi parol (ixtiyoriy)" : "Parol *"}</label>
                  <input type="password" className="input" required={!adminModal.id} value={adminModal.password || ""} onChange={(e) => setAdminModal({ ...adminModal, password: e.target.value })} placeholder={adminModal.id ? "O'zgartirish uchun yozing" : "Parol"} />
                </div>
                <div>
                  <label style={{ fontSize: 12 }}>Bo'lim (Jins izolyatsiyasi)</label>
                  <select className="select" value={adminModal.gender || "MALE"} onChange={(e) => setAdminModal({ ...adminModal, gender: e.target.value })}>
                    <option value="MALE">Erkaklar bo'limi (MALE)</option>
                    <option value="FEMALE">Ayollar bo'limi (FEMALE)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12 }}>Holati</label>
                  <select className="select" value={adminModal.isActive ? "1" : "0"} onChange={(e) => setAdminModal({ ...adminModal, isActive: e.target.value === "1" })}>
                    <option value="1">Faol</option>
                    <option value="0">Nofaol (Bloklangan)</option>
                  </select>
                </div>
              </div>
              <div className="grid-2">
                <div>
                  <label style={{ fontSize: 12 }}>Telefon</label>
                  <input className="input" value={adminModal.phone || ""} onChange={(e) => setAdminModal({ ...adminModal, phone: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 12 }}>Telegram username</label>
                  <input className="input" value={adminModal.tgUsername || ""} onChange={(e) => setAdminModal({ ...adminModal, tgUsername: e.target.value })} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, display: "block", marginBottom: 6 }}>Ruxsat etilgan sahifalar (allowedPages):</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, padding: 10, border: "1px solid var(--border)", borderRadius: 8 }}>
                  {[
                    { id: "dashboard", label: "Bosh ko'rsatkichlar" },
                    { id: "students", label: "Talabalar" },
                    { id: "groups", label: "Guruhlar" },
                    { id: "teachers", label: "O'qituvchilar" },
                    { id: "subjects", label: "Fanlar va jadval" },
                    { id: "payments", label: "Talaba to'lovlari" },
                    { id: "debtors", label: "Qarzdorlar" },
                    { id: "attendance", label: "Davomat va ZKTeco" },
                    { id: "rooms", label: "Yotoqxona va intizom" },
                    { id: "events", label: "Tadbirlar va ruxsatnoma" },
                    { id: "tasks", label: "Xodimlar va vazifalar" },
                  ].map((pg) => {
                    const checked = (adminModal.allowedPages || []).includes(pg.id);
                    return (
                      <label key={pg.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const cur = adminModal.allowedPages || [];
                            const next = e.target.checked ? [...cur, pg.id] : cur.filter((x: string) => x !== pg.id);
                            setAdminModal({ ...adminModal, allowedPages: next });
                          }}
                        />
                        <span>{pg.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="btn" onClick={() => setAdminModal(null)}>Bekor qilish</button>
                <button type="submit" className="btn btn-primary">Saqlash</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
