import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  Filter,
  Layers,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Users,
  X,
} from "lucide-react";

interface Props {
  apiFetch: (url: string, opts?: any) => Promise<any>;
  notify: (msg: string, type?: "ok" | "err") => void;
  initialSubTab?: "overview" | "canteen" | "mosque" | "gate";
}

function StudentAvatar({ student, size = 34 }: { student: any; size?: number }) {
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

export function CampusSmartDashboard({ apiFetch, notify, initialSubTab = "overview" }: Props) {
  const [subTab, setSubTab] = useState<"overview" | "canteen" | "mosque" | "gate">(initialSubTab);
  useEffect(() => {
    if (initialSubTab) setSubTab(initialSubTab);
  }, [initialSubTab]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Canteen drill-down states (Oy -> Hafta -> Kun -> Mahal/Guruh)
  const [calcBasis, setCalcBasis] = useState<"active" | "full">("active");
  const [drillLevel, setDrillLevel] = useState<"month_weeks" | "week_days" | "day_meals">("month_weeks");
  const [selectedWeekNum, setSelectedWeekNum] = useState<number>(3);
  const [canteenGroupFilter, setCanteenGroupFilter] = useState<string>("");

  // Mosque filter states
  const [mosqueFocus, setMosqueFocus] = useState<"MISSING_ANY" | "ALL_FIVE" | "ALL">("MISSING_ANY");
  const [specificMissedPrayer, setSpecificMissedPrayer] = useState<string>("");
  const [mosqueGroupFilter, setMosqueGroupFilter] = useState<string>("");
  const [mosqueSearch, setMosqueSearch] = useState<string>("");
  const [prayerConfigModal, setPrayerConfigModal] = useState<boolean>(false);
  const [prayerTimesEdit, setPrayerTimesEdit] = useState<any[]>([]);

  // Turnstile simulator states
  const [simStudentId, setSimStudentId] = useState<string>("");
  const [simTimeStr, setSimTimeStr] = useState<string>("06:15");
  const [simBusy, setSimBusy] = useState<boolean>(false);
  const [lastSimResult, setLastSimResult] = useState<any>(null);

  // Gate states
  const [gateStatusFilter, setGateStatusFilter] = useState<"ALL" | "PENDING" | "CONFIRMED" | "EXCUSED">("ALL");
  const [lateCategoryFilter, setLateCategoryFilter] = useState<"ALL" | "CHRONIC" | "ONE_TIME">("ALL");
  const [capturingGate, setCapturingGate] = useState<boolean>(false);
  const [liveFrameTick, setLiveFrameTick] = useState<number>(Date.now());
  const [confirmInputs, setConfirmInputs] = useState<Record<number, { studentId: string; studentName: string; note: string }>>({});
  const [lightboxPhoto, setLightboxPhoto] = useState<{ urls: string[]; index: number; title: string } | null>(null);
  const [botModalOpen, setBotModalOpen] = useState<boolean>(false);
  const [botForm, setBotForm] = useState({
    botToken: "",
    chatId: "",
    responsiblePerson: "Navbatchi tarbiyachi",
    activeStart: "22:00",
    activeEnd: "05:30",
  });

  const loadAnalytics = useCallback(
    async (overrideDate?: string, overrideMonth?: string) => {
      setLoading(true);
      try {
        const dParam = overrideDate !== undefined ? overrideDate : selectedDate;
        const mParam = overrideMonth !== undefined ? overrideMonth : selectedMonth;
        const q = new URLSearchParams();
        if (dParam) q.set("date", dParam);
        if (mParam) q.set("month", mParam);
        const res = await apiFetch(`/fin-api/campus/smart-analytics?${q.toString()}`);
        setData(res);
        const activeD = dParam || res.meta?.selectedDate || "";
        if (!selectedDate && activeD) setSelectedDate(activeD);
        if (!selectedMonth && res.meta?.selectedMonth) setSelectedMonth(res.meta.selectedMonth);

        // Automatically select the week containing selectedDate
        if (activeD && Array.isArray(res.canteen?.monthly?.weeks)) {
          const foundW = res.canteen.monthly.weeks.find((w: any) => activeD >= w.startDate && activeD <= w.endDate);
          if (foundW) setSelectedWeekNum(foundW.weekNum);
        }

        if (!simStudentId && res.activeStudents?.length > 0) {
          setSimStudentId(String(res.activeStudents[0].id));
        }
        if (res.mosque?.prayers) {
          setPrayerTimesEdit(
            res.mosque.prayers.map((p: any) => ({
              prayerType: p.prayerType,
              label: p.label,
              startTime: p.startTime,
              endTime: p.endTime,
            }))
          );
        }
        if (res.gate?.botConfig) {
          setBotForm((prev) => ({
            ...prev,
            chatId: res.gate.botConfig.chatId || "",
            responsiblePerson: res.gate.botConfig.responsiblePerson || "Navbatchi tarbiyachi",
            activeStart: res.gate.botConfig.activeStart || "22:00",
            activeEnd: res.gate.botConfig.activeEnd || "05:30",
          }));
        }
      } catch (err: any) {
        notify(err.message || "Tahlil ma'lumotlarini yuklashda xatolik", "err");
      } finally {
        setLoading(false);
      }
    },
    [apiFetch, notify, selectedDate, selectedMonth, simStudentId]
  );

  useEffect(() => {
    loadAnalytics();
  }, []);

  const renderCs2Badge = (diff: number, suffix = "porsiya") => {
    const isPos = diff > 0;
    const isZero = diff === 0;
    const bg = isZero
      ? "rgba(148,163,184,0.16)"
      : isPos
      ? "rgba(16,185,129,0.16)"
      : "rgba(244,63,94,0.15)";
    const border = isZero
      ? "rgba(148,163,184,0.35)"
      : isPos
      ? "rgba(16,185,129,0.45)"
      : "rgba(244,63,94,0.45)";
    const color = isZero ? "var(--text-secondary)" : isPos ? "#10b981" : "#e11d48";
    const sign = isPos ? "+" : "";
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 8px",
          borderRadius: 6,
          fontSize: 11.5,
          fontWeight: 800,
          fontFamily: "monospace",
          background: bg,
          border: `1px solid ${border}`,
          color,
        }}
        title="Rejaga nisbatan porsiya farqi (CS2 uslubidagi +/- ko'rsatkich)"
      >
        {sign}
        {diff} {suffix}
      </span>
    );
  };

  const handleSimulateScan = async (deviceType: "CANTEEN" | "MOSQUE") => {
    if (!simStudentId) return;
    setSimBusy(true);
    try {
      const res = await apiFetch("/fin-api/campus/simulate-scan", {
        method: "POST",
        body: JSON.stringify({
          deviceType,
          studentId: Number(simStudentId),
          customTimeStr: simTimeStr,
          customDateStr: selectedDate || null,
        }),
      });
      setLastSimResult(res);
      if (res.accepted) {
        notify(res.message || "Karta muvaffaqiyatli qabul qilindi!");
      } else {
        notify(res.reason || "Qizil signal: Urinish rad etildi!", "err");
      }
      await loadAnalytics(selectedDate, selectedMonth);
    } catch (err: any) {
      notify(err.message, "err");
    } finally {
      setSimBusy(false);
    }
  };

  const handleToggleBotRecipient = async (telegramId: string, isLateResponsible: boolean) => {
    try {
      await apiFetch("/fin-api/campus/gate/toggle-recipient", {
        method: "POST",
        body: JSON.stringify({ telegramId, isLateResponsible }),
      });
      notify(isLateResponsible ? "Mas'ul xodim yoqildi!" : "Mas'ul xodim o'chirildi");
      await loadAnalytics(selectedDate, selectedMonth);
    } catch (e: any) {
      notify(e.message || "Mas'ul holatini o'zgartirishda xatolik", "err");
    }
  };

  const handleCaptureSixPhotos = async () => {
    setCapturingGate(true);
    try {
      notify("Kirish eshigi kamerasidan 4 soniya davomida 4 ta rasm olinmoqda...");
      const res = await apiFetch("/fin-api/campus/gate/capture", {
        method: "POST",
        body: JSON.stringify({
          note: "Soat 22:00 - 05:30 kechki nazorat: 4 soniyada olingan 4 ta rasm",
        }),
      });
      notify(res.message || "4 ta rasm muvaffaqiyatli olindi!");
      setLiveFrameTick(Date.now());
      await loadAnalytics(selectedDate, selectedMonth);
    } catch (err: any) {
      notify(err.message, "err");
    } finally {
      setCapturingGate(false);
    }
  };

  const handleConfirmGateIncident = async (incId: number, isExcused = false) => {
    const inp = confirmInputs[incId] || { studentId: "", studentName: "", note: "" };
    const hasSababliText = /#sababli/i.test(inp.studentName) || /#sababli/i.test(inp.note);
    const excusedFlag = isExcused || hasSababliText;
    if (!excusedFlag && !inp.studentId && !inp.studentName.trim()) {
      notify("Iltimos, talabani tanlang yoki #sababli tugmasini bosing!", "err");
      return;
    }
    try {
      const res = await apiFetch("/fin-api/campus/gate/confirm", {
        method: "POST",
        body: JSON.stringify({
          id: incId,
          isExcused: excusedFlag,
          studentId: inp.studentId ? Number(inp.studentId) : null,
          studentName: inp.studentName.trim() || (excusedFlag ? "Sababli (Xodim / Ruxsatli) #sababli" : ""),
          note: inp.note.trim() || (excusedFlag ? "#sababli — Sababli / Ruxsatli / Xodim" : null),
        }),
      });
      notify(res.message || (excusedFlag ? "#sababli sifatida saqlandi!" : "Talaba kech qoluvchilar ro'yxatiga qo'shildi!"));
      await loadAnalytics(selectedDate, selectedMonth);
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  const handleDismissGateIncident = async (incId: number) => {
    try {
      await apiFetch("/fin-api/campus/gate/dismiss", {
        method: "POST",
        body: JSON.stringify({ id: incId, note: "Xodim / ruxsat etilgan kirish" }),
      });
      notify("Holat bekor qilindi (Xodim / ruxsatli)");
      await loadAnalytics(selectedDate, selectedMonth);
    } catch (err: any) {
      notify(err.message, "err");
    }
  };

  const meta = data?.meta || {};
  const canteen = data?.canteen || {};
  const mosque = data?.mosque || {};
  const gate = data?.gate || {};
  const activeStudents: any[] = data?.activeStudents || [];

  const allGroups = useMemo(() => {
    const s = new Set<string>();
    for (const st of activeStudents) {
      if (st.group) s.add(st.group);
    }
    return Array.from(s).sort();
  }, [activeStudents]);

  // Mosque group breakdown for diagram
  const mosqueByGroup = useMemo(() => {
    const map = new Map<string, { group: string; totalStudents: number; totalMissedPrayers: number; studentsWithMissed: number; fullFiveStudents: number }>();
    for (const st of mosque.studentRows || []) {
      const g = st.group || "Guruhsiz";
      if (!map.has(g)) {
        map.set(g, { group: g, totalStudents: 0, totalMissedPrayers: 0, studentsWithMissed: 0, fullFiveStudents: 0 });
      }
      const item = map.get(g)!;
      item.totalStudents++;
      item.totalMissedPrayers += Number(st.missedCount || 0);
      if (st.missedCount > 0) item.studentsWithMissed++;
      if (st.attendedCount === 5) item.fullFiveStudents++;
    }
    return Array.from(map.values()).sort((a, b) => b.studentsWithMissed - a.studentsWithMissed);
  }, [mosque.studentRows]);

  const filteredMosqueStudents = useMemo(() => {
    return (mosque.studentRows || []).filter((st: any) => {
      if (mosqueGroupFilter && st.group !== mosqueGroupFilter) return false;
      if (mosqueFocus === "MISSING_ANY" && st.missedCount === 0) return false;
      if (mosqueFocus === "ALL_FIVE" && st.attendedCount !== 5) return false;
      if (specificMissedPrayer && st.prayers?.[specificMissedPrayer]) return false;
      if (mosqueSearch) {
        const q = mosqueSearch.toLowerCase();
        if (!st.fullname?.toLowerCase().includes(q) && !st.cardId?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [mosque.studentRows, mosqueGroupFilter, mosqueFocus, specificMissedPrayer, mosqueSearch]);

  const filteredGateIncidents = useMemo(() => {
    return (gate.incidents || []).filter((inc: any) => {
      const isExcused = inc.status === "EXCUSED" || /#sababli/i.test(String(inc.note || "")) || /#sababli/i.test(String(inc.studentName || ""));
      if (gateStatusFilter === "PENDING") return inc.status === "PENDING";
      if (gateStatusFilter === "EXCUSED") return isExcused;
      if (gateStatusFilter === "CONFIRMED") return inc.status === "CONFIRMED" && !isExcused;
      return inc.status !== "DISMISSED";
    });
  }, [gate.incidents, gateStatusFilter]);

  const filteredLeaderboard = useMemo(() => {
    return (gate.leaderboard || []).filter((item: any) => {
      if (lateCategoryFilter === "CHRONIC") return item.category === "CHRONIC";
      if (lateCategoryFilter === "ONE_TIME") return item.category === "ONE_TIME";
      return true;
    });
  }, [gate.leaderboard, lateCategoryFilter]);

  if (loading && !data) {
    return (
      <div className="glass-card" style={{ padding: 36, textAlign: "center" }}>
        <RefreshCw size={22} className="pulse-dot" color="#10b981" style={{ marginBottom: 10 }} />
        <div style={{ fontWeight: 700 }}>Oshxona, Masjid va Kirish Eshigi aqlli tahlili yuklanmoqda...</div>
      </div>
    );
  }

  const daily = canteen.daily || {};
  const weekly = canteen.weekly || {};
  const monthly = canteen.monthly || {};
  const mTotals = monthly.totals || {};
  const mPerSt = monthly.perStudent || {};
  const currentWeekObj = (monthly.weeks || []).find((w: any) => w.weekNum === selectedWeekNum) || (monthly.weeks || [])[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* ===================================================================== */}
      {/* TOP NAVIGATION & FILTER HEADER                                        */}
      {/* ===================================================================== */}
      <div className="glass-card" style={{ padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {subTab !== "overview" && (
              <button
                className="btn btn-sm"
                onClick={() => setSubTab("overview")}
                style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}
              >
                <ArrowLeft size={15} /> Umumiy oynaga qaytish
              </button>
            )}
            <div>
              <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0, display: "flex", alignItems: "center", gap: 8, color: "var(--text-primary)" }}>
                <Sparkles size={19} color="#10b981" />
                {subTab === "overview" && "Oshxona, Masjid va Kirish Eshigi — Umumiy Boshqaruv Oynasi"}
                {subTab === "canteen" && "🍽️ Oshxona Smart Dashboard — Porsiya, Foizlar va CS2 (+/-) Tahlili"}
                {subTab === "mosque" && "🕌 Masjid Smart Dashboard — 5 Mahal Namoz va Qatnashmaganlar Nazorati"}
                {subTab === "gate" && "🚪 Kirish Eshigi Smart Dashboard — AI FaceID, 4 ta Rasm va Kech Qoluvchilar Reytingi"}
              </h2>
              <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
                {subTab === "overview" && (
                  <>
                    Jami faol talabalar: <strong style={{ color: "#10b981" }}>{meta.totalActiveStudents || 0} nafar</strong> •
                    Quyida uchala tizimning umumiy holati keltirilgan. Har birining ichiga kirib maxsus diagramma va tahlillarni ko'rishingiz mumkin.
                  </>
                )}
                {subTab === "canteen" && (
                  <>
                    <strong>Fokus:</strong> Kim kelgani emas, necha odam va necha porsiya ketayotgani • Nonushta <b>05:00-07:00</b>, Tushlik <b>12:00-14:00</b>, Kechki <b>17:30-19:30</b> (1 talaba = 1 porsiya)
                  </>
                )}
                {subTab === "mosque" && (
                  <>
                    <strong>Fokus:</strong> Har bir talaba 5 mahal namozga qatnashishi shart — <b>Qatnashmagan talabalar</b> aniq ro'yxati va ertalab 5 marta karta urishdan himoya
                  </>
                )}
                {subTab === "gate" && (
                  <>
                    <strong>Fokus:</strong> Soat <b>22:00 - 05:30</b> oralig'ida 4 soniyada 4 ta rasm olish, Bot/Jadval orqali ism-familiya biriktirish va <b>Surunkali kech qoluvchilar</b> reytingi
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Date & Month Filters */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Oy:</span>
              <select
                className="select"
                value={selectedMonth}
                onChange={(e) => {
                  const m = e.target.value;
                  setSelectedMonth(m);
                  const firstMatchingDate = (meta.availableDates || []).find((d: string) => d.startsWith(m)) || `${m}-01`;
                  setSelectedDate(firstMatchingDate);
                  loadAnalytics(firstMatchingDate, m);
                }}
                style={{ width: 115 }}
              >
                {(meta.availableMonths || [selectedMonth]).map((m: string) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Sana:</span>
              <select
                className="select"
                value={selectedDate}
                onChange={(e) => {
                  const d = e.target.value;
                  setSelectedDate(d);
                  const m = d.slice(0, 7);
                  setSelectedMonth(m);
                  loadAnalytics(d, m);
                }}
                style={{ width: 155 }}
              >
                {meta.todayIstanbul && !(meta.availableDates || []).includes(meta.todayIstanbul) && (
                  <option value={meta.todayIstanbul}>{meta.todayIstanbul} (Bugun)</option>
                )}
                {(meta.availableDates || []).map((d: string) => (
                  <option key={d} value={d}>
                    {d} {d === meta.latestActiveDate ? "(Oxirgi faol)" : ""}
                  </option>
                ))}
              </select>
              <input
                type="date"
                className="input"
                value={selectedDate}
                onChange={(e) => {
                  const d = e.target.value;
                  if (!d) return;
                  setSelectedDate(d);
                  setSelectedMonth(d.slice(0, 7));
                  loadAnalytics(d, d.slice(0, 7));
                }}
                style={{ width: 140 }}
              />
            </div>

            <button
              className="btn btn-sm"
              onClick={() => {
                const d = meta.latestActiveDate || selectedDate;
                setSelectedDate(d);
                setSelectedMonth(d.slice(0, 7));
                loadAnalytics(d, d.slice(0, 7));
              }}
            >
              Oxirgi faol kun
            </button>
            <button
              className="btn btn-sm"
              onClick={() => {
                const d = meta.todayIstanbul;
                if (!d) return;
                setSelectedDate(d);
                setSelectedMonth(d.slice(0, 7));
                loadAnalytics(d, d.slice(0, 7));
              }}
            >
              Bugun
            </button>
            <button className="btn btn-sm" onClick={() => loadAnalytics(selectedDate, selectedMonth)}>
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* NAVIGATION PILLS: UMUMIY vs 3 INNER FOCUSED DASHBOARDS */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}>
          <button
            className={`btn ${subTab === "overview" ? "btn-primary" : ""}`}
            onClick={() => setSubTab("overview")}
          >
            📊 Umumiy ko'rinish (Uchalasi)
          </button>
          <button
            className={`btn ${subTab === "canteen" ? "btn-primary" : ""}`}
            onClick={() => setSubTab("canteen")}
          >
            🍽️ 1. Oshxona Dashboard (Porsiya va %)
          </button>
          <button
            className={`btn ${subTab === "mosque" ? "btn-primary" : ""}`}
            onClick={() => setSubTab("mosque")}
          >
            🕌 2. Masjid Dashboard (5 Mahal va Qatnashmaganlar)
          </button>
          <button
            className={`btn ${subTab === "gate" ? "btn-primary" : ""}`}
            onClick={() => setSubTab("gate")}
          >
            🚪 3. Kirish Eshigi Dashboard (Kech qoluvchilar va 4 ta rasm)
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* VIEW 0: UMUMIY KO'RINISH (UCHALASI BO'YICHA UMUMIY SUMMARY)           */}
      {/* ===================================================================== */}
      {subTab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* 3 MASTER OVERVIEW CARDS SIDE-BY-SIDE */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 16 }}>
            {/* CARD 1: OSHXONA */}
            <div
              className="glass-card"
              style={{
                padding: 20,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                borderTop: "3px solid #10b981",
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#10b981", letterSpacing: "0.05em" }}>
                      1-BO'LIM • FOKUS: PORSIYA VA FOIZLAR
                    </div>
                    <h3 style={{ fontSize: 17.5, fontWeight: 800, margin: "2px 0 0 0", color: "var(--text-primary)" }}>
                      🍽️ Oshxona (Porsiya Hisobi)
                    </h3>
                  </div>
                  {renderCs2Badge(daily.portions?.cs2Diff || 0, "porsiya")}
                </div>

                {/* Kunlik va Oylik qisqacha KPI */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "12px 0" }}>
                  <div style={{ padding: 10, borderRadius: 10, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.22)" }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Kunlik berilgan porsiya:</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#10b981" }}>
                      {daily.portions?.served || 0} / {daily.portions?.expected || 0}{" "}
                      <span style={{ fontSize: 12.5 }}>({daily.portions?.pct || 0}%)</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                      Berilmadi: <b>{daily.portions?.unserved || 0} porsiya</b>
                    </div>
                  </div>

                  <div style={{ padding: 10, borderRadius: 10, background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.22)" }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Uchchalasida (3/3 mahal):</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#0284c7" }}>
                      {daily.allThreeMeals?.pct || 0}%{" "}
                      <span style={{ fontSize: 12.5 }}>({daily.allThreeMeals?.count || 0} nafar)</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                      Oylik jami: <b>{mTotals.servedPortions || 0} porsiya</b>
                    </div>
                  </div>
                </div>

                {/* Mini visual bars for Breakfast, Lunch, Dinner */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "14px 0" }}>
                  {[
                    { label: "Nonushta (05:00-07:00)", stat: daily.breakfast, color: "#10b981" },
                    { label: "Tushlik (12:00-14:00)", stat: daily.lunch, color: "#0ea5e9" },
                    { label: "Kechki ovqat (17:30-19:30)", stat: daily.dinner, color: "#8b5cf6" },
                  ].map((m) => (
                    <div key={m.label}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                        <span style={{ fontWeight: 600 }}>{m.label}</span>
                        <span>
                          <b>{m.stat?.served || 0}</b> / {m.stat?.expected || 0} ({m.stat?.pct || 0}%) •{" "}
                          <span style={{ color: "#e11d48", fontWeight: 700 }}>{m.stat?.cs2Diff || 0}</span>
                        </span>
                      </div>
                      <div style={{ width: "100%", height: 7, background: "rgba(148,163,184,0.18)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, m.stat?.pct || 0)}%`, height: "100%", background: m.color, borderRadius: 4 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
                <span style={{ fontSize: 12, color: "#e11d48", fontWeight: 700 }}>
                  🔴 Qizil signallar: {(canteen.alerts || []).length} ta
                </span>
                <button className="btn btn-sm btn-primary" onClick={() => setSubTab("canteen")}>
                  Oshxona Dashboardiga kirish <ArrowRight size={14} />
                </button>
              </div>
            </div>

            {/* CARD 2: MASJID — 5 MAHAL NAMOZ */}
            <div
              className="glass-card"
              style={{
                padding: 20,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                borderTop: "3px solid #06b6d4",
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#0891b2", letterSpacing: "0.05em" }}>
                      2-BO'LIM • FOKUS: QATNASHMAGAN TALABALAR
                    </div>
                    <h3 style={{ fontSize: 17.5, fontWeight: 800, margin: "2px 0 0 0", color: "var(--text-primary)" }}>
                      🕌 Masjid — 5 Mahal Namoz
                    </h3>
                  </div>
                  <span className="badge badge-rose">
                    Qatnashmagan: {mosque.missedAtLeastOneCount || 0} nafar
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "12px 0" }}>
                  <div style={{ padding: 10, borderRadius: 10, background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.22)" }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Namoz qoldirganlar:</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#e11d48" }}>
                      {mosque.missedAtLeastOneCount || 0} nafar{" "}
                      <span style={{ fontSize: 12.5 }}>({mosque.missedAtLeastOnePct || 0}%)</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                      Asosiy nazoratdagi ro'yxat
                    </div>
                  </div>

                  <div style={{ padding: 10, borderRadius: 10, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.22)" }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>5 mahal to'liq kirganlar:</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#10b981" }}>
                      {mosque.allFiveAttendedCount || 0} nafar{" "}
                      <span style={{ fontSize: 12.5 }}>({mosque.allFiveAttendedPct || 0}%)</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                      Jami talabalar: <b>{mosque.totalStudents || 0} nafar</b>
                    </div>
                  </div>
                </div>

                {/* Mini 5-prayer status bars */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
                  {(mosque.prayers || []).map((p: any) => (
                    <div key={p.prayerType} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ width: 125, fontWeight: 600 }}>
                        {p.label} <span style={{ color: "var(--text-muted)", fontSize: 11 }}>({p.startTime})</span>
                      </span>
                      <div style={{ flex: 1, height: 7, background: "rgba(244,63,94,0.2)", borderRadius: 4, margin: "0 10px", overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, p.pct || 0)}%`, height: "100%", background: "#10b981", borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 11.5 }}>
                        <b style={{ color: "#10b981" }}>{p.attendedCount}</b> /{" "}
                        <b style={{ color: "#e11d48" }}>-{p.missingCount} yo'q</b>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  🛡️ Ertalab 5x urishdan himoyalangan
                </span>
                <button className="btn btn-sm btn-primary" onClick={() => setSubTab("mosque")}>
                  Masjid Dashboardiga kirish <ArrowRight size={14} />
                </button>
              </div>
            </div>

            {/* CARD 3: KIRISH ESHIGI (22:00 - 05:30) */}
            <div
              className="glass-card"
              style={{
                padding: 20,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                borderTop: "3px solid #a855f7",
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#9333ea", letterSpacing: "0.05em" }}>
                      3-BO'LIM • FOKUS: AI FACEID VA KECH QOLUVCHILAR
                    </div>
                    <h3 style={{ fontSize: 17.5, fontWeight: 800, margin: "2px 0 0 0", color: "var(--text-primary)" }}>
                      🚪 Kirish Eshigi (22:00 - 05:30)
                    </h3>
                  </div>
                  <span className="badge badge-amber">
                    ⏳ Kutilmoqda: {gate.summary?.pendingCount || 0} ta
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "12px 0" }}>
                  <div style={{ padding: 10, borderRadius: 10, background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.22)" }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Surunkali kech qoluvchilar:</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#e11d48" }}>
                      {gate.summary?.chronicStudentsCount || 0} nafar
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                      2 va undan ko'p kech kirgan
                    </div>
                  </div>

                  <div style={{ padding: 10, borderRadius: 10, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.22)" }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Bir martalik kech qolgan:</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#d97706" }}>
                      {gate.summary?.oneTimeStudentsCount || 0} nafar
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                      Rasmlar 7 kun saqlanadi
                    </div>
                  </div>
                </div>

                {/* Top Latecomers preview */}
                <div style={{ margin: "12px 0" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>
                    ENG KO'P KECH QOLUVCHILAR REYTINGI (TOP):
                  </div>
                  {(gate.leaderboard || []).slice(0, 3).map((l: any, i: number) => (
                    <div
                      key={l.key}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "6px 8px",
                        borderRadius: 8,
                        background: "rgba(148,163,184,0.08)",
                        marginBottom: 5,
                        fontSize: 12,
                      }}
                    >
                      <span>
                        <b>#{i + 1} {l.studentName}</b> <span style={{ color: "var(--text-muted)" }}>({l.studentGroup})</span>
                      </span>
                      <span className={`badge ${l.category === "CHRONIC" ? "badge-rose" : "badge-amber"}`}>
                        {l.totalLateCount} marta ({l.category === "CHRONIC" ? "Surunkali" : "1 martalik"})
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  🤖 AI FaceID + 4 kadr + Bot
                </span>
                <button className="btn btn-sm btn-primary" onClick={() => setSubTab("gate")}>
                  Kirish Eshigi Dashboardi <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* COMPARATIVE OVERVIEW TABLE FOR ALL 3 ZONES */}
          <div className="glass-card" style={{ padding: 18 }}>
            <h3 style={{ fontSize: 15.5, fontWeight: 800, marginTop: 0, marginBottom: 10, color: "var(--text-primary)" }}>
              📌 Uchala Nazorat Nuqtasi Bo'yicha Yagona Xulosa ({selectedDate})
            </h3>
            <div className="table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Nazorat nuqtasi va Qurilma</th>
                    <th>Asosiy Fokus</th>
                    <th>Vaqt oynasi (Istanbul)</th>
                    <th>Bugungi / Oylik Ko'rsatkich</th>
                    <th>Muhim Signal / Ogohlantirish</th>
                    <th>Batafsil</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <div style={{ fontWeight: 800 }}>🍽️ 1. Oshxona Turniketi</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>IP: 192.168.1.201 / 192.168.1.199</div>
                    </td>
                    <td>Porsiya hisobi, % ishtirok va CS2 (+/-) farq</td>
                    <td>05:00-07:00 • 12:00-14:00 • 17:30-19:30</td>
                    <td>
                      Kunlik: <b>{daily.portions?.served || 0} / {daily.portions?.expected || 0} porsiya ({daily.portions?.pct || 0}%)</b> •
                      Uchchalasida: <b>{daily.allThreeMeals?.pct || 0}%</b>
                    </td>
                    <td>
                      {renderCs2Badge(daily.portions?.cs2Diff || 0, "porsiya")} •{" "}
                      <span style={{ color: "#e11d48", fontWeight: 700 }}>🔴 {(canteen.alerts || []).length} ta qizil signal</span>
                    </td>
                    <td>
                      <button className="btn btn-sm btn-primary" onClick={() => setSubTab("canteen")}>
                        Ochish →
                      </button>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div style={{ fontWeight: 800 }}>🕌 2. Masjid Turniketi</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>IP: 192.168.1.172</div>
                    </td>
                    <td>5 mahal namozda qatnashmagan talabalarni aniqlash</td>
                    <td>Bomdod, Peshin, Asr, Shom, Xufton</td>
                    <td>
                      5 mahal to'liq: <b>{mosque.allFiveAttendedCount || 0} nafar ({mosque.allFiveAttendedPct || 0}%)</b>
                    </td>
                    <td>
                      <span className="badge badge-rose">🔴 Qatnashmagan: {mosque.missedAtLeastOneCount || 0} nafar</span>
                    </td>
                    <td>
                      <button className="btn btn-sm btn-primary" onClick={() => setSubTab("mosque")}>
                        Ochish →
                      </button>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div style={{ fontWeight: 800 }}>🚪 3. Kirish Eshigi IP Kamerasi</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>IP: 192.168.1.32 (ip34_c01)</div>
                    </td>
                    <td>4 soniyada 4 ta rasm, Bot tasdig'i va Surunkali kech qoluvchilar</td>
                    <td>22:00 - 05:30 (7 kunlik rasm arxivi)</td>
                    <td>
                      Tasdiqlangan: <b>{gate.summary?.confirmedCount || 0} ta</b> • Surunkali: <b>{gate.summary?.chronicStudentsCount || 0} nafar</b>
                    </td>
                    <td>
                      <span className="badge badge-amber">⏳ Kutilmoqda (4 ta rasm): {gate.summary?.pendingCount || 0} ta</span>
                    </td>
                    <td>
                      <button className="btn btn-sm btn-primary" onClick={() => setSubTab("gate")}>
                        Ochish →
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* VIEW 1: OSHXONA DEDICATED DASHBOARD (FOKUS: PORSIYA, % VA DIAGRAMMA)  */}
      {/* ===================================================================== */}
      {subTab === "canteen" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* ROW 1: NONUSHTA, TUSHLIK, KECHKI VA UCHCHALASIDA ISHTIROK FOIZLARI */}
          <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
            <div className="glass-card kpi-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="kpi-label">🌅 NONUSHTA (05:00 - 07:00)</span>
                {renderCs2Badge(daily.breakfast?.cs2Diff || 0, "")}
              </div>
              <div className="kpi-value" style={{ color: "#10b981", margin: "6px 0" }}>
                {daily.breakfast?.pct || 0}%{" "}
                <span style={{ fontSize: 14, color: "var(--text-secondary)", fontWeight: 600 }}>
                  ({daily.breakfast?.served || 0} / {daily.breakfast?.expected || 0} porsiya)
                </span>
              </div>
              <div className="kpi-sub">
                Berildi: <b>{daily.breakfast?.served || 0}</b> • Berilmadi:{" "}
                <b style={{ color: "#d97706" }}>{daily.breakfast?.unserved || 0} porsiya</b>
              </div>
            </div>

            <div className="glass-card kpi-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="kpi-label">☀️ TUSHLIK (12:00 - 14:00)</span>
                {renderCs2Badge(daily.lunch?.cs2Diff || 0, "")}
              </div>
              <div className="kpi-value" style={{ color: "#0284c7", margin: "6px 0" }}>
                {daily.lunch?.pct || 0}%{" "}
                <span style={{ fontSize: 14, color: "var(--text-secondary)", fontWeight: 600 }}>
                  ({daily.lunch?.served || 0} / {daily.lunch?.expected || 0} porsiya)
                </span>
              </div>
              <div className="kpi-sub">
                Berildi: <b>{daily.lunch?.served || 0}</b> • Berilmadi:{" "}
                <b style={{ color: "#d97706" }}>{daily.lunch?.unserved || 0} porsiya</b>
              </div>
            </div>

            <div className="glass-card kpi-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="kpi-label">🌙 KECHKI OVQAT (17:30 - 19:30)</span>
                {renderCs2Badge(daily.dinner?.cs2Diff || 0, "")}
              </div>
              <div className="kpi-value" style={{ color: "#7c3aed", margin: "6px 0" }}>
                {daily.dinner?.pct || 0}%{" "}
                <span style={{ fontSize: 14, color: "var(--text-secondary)", fontWeight: 600 }}>
                  ({daily.dinner?.served || 0} / {daily.dinner?.expected || 0} porsiya)
                </span>
              </div>
              <div className="kpi-sub">
                Berildi: <b>{daily.dinner?.served || 0}</b> • Berilmadi:{" "}
                <b style={{ color: "#d97706" }}>{daily.dinner?.unserved || 0} porsiya</b>
              </div>
            </div>

            <div className="glass-card kpi-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="kpi-label">🔥 BIR KUNDA UCHCHALASIDA (3/3)</span>
                <span className="badge badge-emerald">{daily.allThreeMeals?.count || 0} nafar</span>
              </div>
              <div className="kpi-value" style={{ color: "#d97706", margin: "6px 0" }}>
                {daily.allThreeMeals?.pct || 0}%{" "}
                <span style={{ fontSize: 13.5, color: "var(--text-secondary)", fontWeight: 600 }}>
                  to'liq 3 mahal kirgan
                </span>
              </div>
              <div className="kpi-sub">
                Kamida 1 mahal kirganlar: <b>{daily.atLeastOneMeal?.count || 0} nafar</b> ({daily.atLeastOneMeal?.pct || 0}%)
              </div>
            </div>
          </div>

          {/* ROW 2: KUNLIK, HAFTALIK, OYLIK VA TALABA BOSHIGA PORSIYA HISOB-KITOBI (CS2 KILL DIFF) */}
          <div className="glass-card" style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                  🎯 Kunlik, Haftalik va Oylik Porsiya Hisob-kitobi (CS2 Kill Difference uslubida +/- Farq)
                </h3>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                  Oshxonada aynan kim kelgani emas, balki <b>umumiy va talaba boshiga necha porsiya ketishi kerak edi, necha porsiya berildi va qancha berilmadi</b> ko'rsatkichi
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className={`btn btn-sm ${calcBasis === "active" ? "btn-primary" : ""}`}
                  onClick={() => setCalcBasis("active")}
                >
                  Faol ish kunlari ({monthly.activeDaysCount || 0} kun) bo'yicha
                </button>
                <button
                  className={`btn btn-sm ${calcBasis === "full" ? "btn-primary" : ""}`}
                  onClick={() => setCalcBasis("full")}
                >
                  To'liq kalendar oy ({monthly.daysInMonth || 30} kun) bo'yicha
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 14 }}>
              {/* 1. Kunlik Porsiya */}
              <div style={{ padding: 14, borderRadius: 12, background: "rgba(16,185,129,0.06)", border: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 13.5, color: "#10b981" }}>📅 KUNLIK ({selectedDate})</span>
                  {renderCs2Badge(daily.portions?.cs2Diff || 0, "porsiya")}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12.5 }}>
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>Rejadagi (100%):</div>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{daily.portions?.expected || 0} porsiya</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>Amalda berildi:</div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: "#10b981" }}>
                      {daily.portions?.served || 0} ({daily.portions?.pct || 0}%)
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>Berilmadi (Tejaldi):</div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "#d97706" }}>{daily.portions?.unserved || 0} porsiya</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>O'rtacha kunga nisbatan:</div>
                    <div>{renderCs2Badge(daily.portions?.vsAvgDiff || 0, "porsiya")}</div>
                  </div>
                </div>
              </div>

              {/* 2. Haftalik Porsiya */}
              <div style={{ padding: 14, borderRadius: 12, background: "rgba(14,165,233,0.06)", border: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 13.5, color: "#0284c7" }}>
                    📆 HAFTALIK ({weekly.startDate?.slice(5)} - {weekly.endDate?.slice(5)})
                  </span>
                  {renderCs2Badge(
                    calcBasis === "active" ? weekly.cs2DiffActiveDays || 0 : weekly.cs2Diff7Days || 0,
                    "porsiya"
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12.5 }}>
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>Rejadagi porsiya:</div>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>
                      {calcBasis === "active" ? weekly.expectedPortionsActiveDays || 0 : weekly.expectedPortions7Days || 0} porsiya
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>Berilgan porsiya:</div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: "#0284c7" }}>
                      {weekly.servedPortions || 0} ({calcBasis === "active" ? weekly.pctActiveDays || 0 : weekly.pct7Days || 0}%)
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>Berilmadi:</div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "#d97706" }}>
                      {calcBasis === "active" ? weekly.unservedPortionsActiveDays || 0 : weekly.unservedPortions7Days || 0} porsiya
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>3 mahal to'liq:</div>
                    <div style={{ fontWeight: 800, color: "#d97706" }}>{weekly.allThreeCount || 0} talaba-kun</div>
                  </div>
                </div>
              </div>

              {/* 3. Oylik Umumiy Porsiya */}
              <div style={{ padding: 14, borderRadius: 12, background: "rgba(139,92,246,0.06)", border: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 13.5, color: "#7c3aed" }}>
                    🗓️ OYLIK UMUMIY ({selectedMonth})
                  </span>
                  {renderCs2Badge(
                    calcBasis === "active" ? mTotals.cs2DiffActiveDays || 0 : mTotals.cs2DiffFullMonth || 0,
                    "porsiya"
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12.5 }}>
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>Oyda ketishi kerak edi:</div>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>
                      {calcBasis === "active" ? mTotals.expectedActiveDays || 0 : mTotals.expectedFullMonth || 0} porsiya
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>Amalda berildi:</div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: "#7c3aed" }}>
                      {mTotals.servedPortions || 0} ({calcBasis === "active" ? mTotals.pctActiveDays || 0 : mTotals.pctFullMonth || 0}%)
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>Berilmadi (Farq):</div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "#d97706" }}>
                      {calcBasis === "active" ? mTotals.unservedActiveDays || 0 : mTotals.unservedFullMonth || 0} porsiya
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>N / T / K taqsimoti:</div>
                    <div style={{ fontWeight: 700 }}>
                      {mTotals.breakfastServed || 0} / {mTotals.lunchServed || 0} / {mTotals.dinnerServed || 0}
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Talaba boshiga oylik porsiya */}
              <div style={{ padding: 14, borderRadius: 12, background: "rgba(245,158,11,0.06)", border: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 13.5, color: "#d97706" }}>
                    👤 1 TALABA BOSHIGA ({selectedMonth})
                  </span>
                  {renderCs2Badge(
                    calcBasis === "active" ? mPerSt.cs2DiffActiveDays || 0 : mPerSt.cs2DiffFullMonth || 0,
                    "porsiya"
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12.5 }}>
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>Talaba boshiga me'yor:</div>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>
                      {calcBasis === "active" ? mPerSt.expectedActiveDays || 0 : mPerSt.expectedFullMonth || 0} porsiya
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>O'rtacha berildi:</div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: "#10b981" }}>
                      {mPerSt.servedAvg || 0} porsiya
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>Berilmadi (1 talabaga):</div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "#d97706" }}>
                      {calcBasis === "active" ? mPerSt.unservedActiveDaysAvg || 0 : mPerSt.unservedFullMonthAvg || 0} porsiya
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>3 mahal to'liq kunlar:</div>
                    <div style={{ fontWeight: 700 }}>{mTotals.allThreeStudentDays || 0} talaba-kun</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ROW 3: INTERACTIVE VISUAL DRILL-DOWN DIAGRAM (OY -> HAFTA -> KUN -> MAHALLAR) */}
          <div className="glass-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 16.5, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                  📊 Interaktiv Ichma-ich Diagramma (Ustunga bosib ichiga kirib boring)
                </h3>
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 2 }}>
                  Bosqich:{" "}
                  <b style={{ color: "#10b981" }}>
                    1. Oy haftalari ({selectedMonth}) → 2. Hafta kunlari ({currentWeekObj?.label || ""}) → 3. Kunlik mahallar va soatlar ({selectedDate})
                  </b>
                </div>
              </div>

              {/* Breadcrumb / Level Switcher */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  className={`btn btn-sm ${drillLevel === "month_weeks" ? "btn-primary" : ""}`}
                  onClick={() => setDrillLevel("month_weeks")}
                >
                  1-bosqich: Oy haftalari ({selectedMonth})
                </button>
                <button
                  className={`btn btn-sm ${drillLevel === "week_days" ? "btn-primary" : ""}`}
                  onClick={() => setDrillLevel("week_days")}
                >
                  2-bosqich: {selectedWeekNum}-hafta kunlari
                </button>
                <button
                  className={`btn btn-sm ${drillLevel === "day_meals" ? "btn-primary" : ""}`}
                  onClick={() => setDrillLevel("day_meals")}
                >
                  3-bosqich: Kunlik 3 mahal va Soatlar ({selectedDate})
                </button>
              </div>
            </div>

            {/* LEVEL 1 DIAGRAM: WEEKS OF THE MONTH */}
            {drillLevel === "month_weeks" && (
              <div>
                <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 12 }}>
                  👇 Istalgan hafta ustuniga bosing — o'sha haftaning 7 kunlik porsiya diagrammasi ochiladi:
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
                  {(monthly.weeks || []).map((w: any) => {
                    const pct = calcBasis === "active" ? w.activePct : w.pct;
                    const exp = calcBasis === "active" ? w.expectedActivePortions : w.expectedPortions;
                    const diff = calcBasis === "active" ? w.activeCs2Diff : w.cs2Diff;
                    return (
                      <div
                        key={w.weekNum}
                        onClick={() => {
                          setSelectedWeekNum(w.weekNum);
                          setDrillLevel("week_days");
                        }}
                        style={{
                          padding: 16,
                          borderRadius: 12,
                          cursor: "pointer",
                          background: "rgba(148,163,184,0.06)",
                          border: selectedWeekNum === w.weekNum ? "2px solid #10b981" : "1px solid var(--border-subtle)",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <span style={{ fontWeight: 800, fontSize: 14 }}>{w.label.replace(/\?/g, "-")}</span>
                            {renderCs2Badge(diff, "")}
                          </div>

                          {/* Visual Vertical Column Chart inside card */}
                          <div style={{ height: 120, display: "flex", alignItems: "flex-end", gap: 10, padding: "10px 6px", background: "rgba(148,163,184,0.08)", borderRadius: 8, margin: "10px 0" }}>
                            {[
                              { k: "N", v: w.breakfast, c: "#10b981", title: "Nonushta" },
                              { k: "T", v: w.lunch, c: "#0ea5e9", title: "Tushlik" },
                              { k: "K", v: w.dinner, c: "#8b5cf6", title: "Kechki" },
                              { k: "3/3", v: w.allThreeCount, c: "#f59e0b", title: "Uchchalasi" },
                            ].map((bar) => {
                              const maxBar = Math.max(1, w.breakfast, w.lunch, w.dinner, 100);
                              const hPct = Math.max(6, Math.round((bar.v / maxBar) * 100));
                              return (
                                <div key={bar.k} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
                                  <span style={{ fontSize: 10.5, fontWeight: 800, marginBottom: 3 }}>{bar.v}</span>
                                  <div style={{ width: "100%", height: `${hPct}%`, background: bar.c, borderRadius: "4px 4px 0 0" }} title={`${bar.title}: ${bar.v} porsiya`} />
                                  <span style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4, fontWeight: 700 }}>{bar.k}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700 }}>
                            <span>Berildi: {w.servedPortions}</span>
                            <span style={{ color: "#10b981" }}>{pct}%</span>
                          </div>
                          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                            Reja: {exp} • Berilmadi: {Math.max(0, exp - w.servedPortions)}
                          </div>
                          <div style={{ marginTop: 8, fontSize: 11.5, color: "#0284c7", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                            Kunlar diagrammasiga kirish <ArrowRight size={12} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* LEVEL 2 DIAGRAM: 7 DAYS OF THE SELECTED WEEK */}
            {drillLevel === "week_days" && currentWeekObj && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                    👇 <b>{currentWeekObj.label.replace(/\?/g, "-")}</b> kunlari. Istalgan kun ustiga bosing — o'sha kunning soatlar va guruhlar kesimi ochiladi:
                  </span>
                  <button className="btn btn-sm" onClick={() => setDrillLevel("month_weeks")}>
                    <ArrowLeft size={13} /> Oy haftalariga qaytish
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
                  {(currentWeekObj.days || []).map((d: any) => {
                    const isSel = d.date === selectedDate;
                    return (
                      <div
                        key={d.date}
                        onClick={() => {
                          setSelectedDate(d.date);
                          loadAnalytics(d.date, selectedMonth);
                          setDrillLevel("day_meals");
                        }}
                        style={{
                          padding: 14,
                          borderRadius: 12,
                          cursor: "pointer",
                          background: isSel ? "rgba(16,185,129,0.1)" : "rgba(148,163,184,0.06)",
                          border: isSel ? "2px solid #10b981" : "1px solid var(--border-subtle)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <span style={{ fontWeight: 800, fontSize: 13.5 }}>{d.date.slice(5)}</span>
                          {renderCs2Badge(d.portions.cs2Diff, "")}
                        </div>

                        <div style={{ height: 110, display: "flex", alignItems: "flex-end", gap: 8, padding: "8px 4px", background: "rgba(148,163,184,0.08)", borderRadius: 8, margin: "8px 0" }}>
                          {[
                            { k: "Non", v: d.breakfast.served, pct: d.breakfast.pct, c: "#10b981" },
                            { k: "Tush", v: d.lunch.served, pct: d.lunch.pct, c: "#0ea5e9" },
                            { k: "Kech", v: d.dinner.served, pct: d.dinner.pct, c: "#8b5cf6" },
                            { k: "3/3", v: d.allThreeMeals.count, pct: d.allThreeMeals.pct, c: "#f59e0b" },
                          ].map((b) => (
                            <div key={b.k} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
                              <span style={{ fontSize: 10, fontWeight: 800 }}>{b.pct}%</span>
                              <div style={{ width: "100%", height: `${Math.max(6, b.pct)}%`, background: b.c, borderRadius: "4px 4px 0 0" }} />
                              <span style={{ fontSize: 9.5, color: "var(--text-muted)", marginTop: 3, fontWeight: 700 }}>{b.k}</span>
                            </div>
                          ))}
                        </div>

                        <div style={{ fontSize: 12, fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
                          <span>Berildi: {d.portions.served}</span>
                          <span style={{ color: "#10b981" }}>{d.portions.pct}%</span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          Berilmadi: {d.portions.unserved} porsiya
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* LEVEL 3 DIAGRAM: SELECTED DAY MEALS, HOURLY FLOW & GROUP BREAKDOWN */}
            {drillLevel === "day_meals" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>
                    📅 {selectedDate} — Soatlar va Guruhlar kesimidagi porsiya diagrammasi:
                  </span>
                  <button className="btn btn-sm" onClick={() => setDrillLevel("week_days")}>
                    <ArrowLeft size={13} /> Hafta kunlariga qaytish
                  </button>
                </div>

                <div className="grid-2" style={{ alignItems: "start" }}>
                  {/* Hourly Flow Chart */}
                  <div style={{ padding: 14, borderRadius: 12, background: "rgba(148,163,184,0.06)", border: "1px solid var(--border-subtle)" }}>
                    <h4 style={{ margin: "0 0 10px 0", fontSize: 14 }}>
                      🕒 Soatlar kesimida turniketdan o'tgan porsiyalar ({selectedDate})
                    </h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {(canteen.hourlyBreakdown || []).map((h: any) => {
                        const maxH = Math.max(1, ...(canteen.hourlyBreakdown || []).map((x: any) => x.count));
                        const wPct = Math.round((h.count / maxH) * 100);
                        return (
                          <div key={h.hour} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
                            <span style={{ width: 55, fontWeight: 700 }}>{h.hour}</span>
                            <div style={{ flex: 1, height: 10, background: "rgba(148,163,184,0.18)", borderRadius: 5, overflow: "hidden" }}>
                              <div style={{ width: `${wPct}%`, height: "100%", background: "linear-gradient(90deg, #10b981, #0ea5e9)", borderRadius: 5 }} />
                            </div>
                            <span style={{ width: 85, textAlign: "right", fontWeight: 800 }}>{h.count} porsiya</span>
                          </div>
                        );
                      })}
                      {(canteen.hourlyBreakdown || []).length === 0 && (
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Shu kunda turniket yozuvlari yo'q</div>
                      )}
                    </div>
                  </div>

                  {/* Group Portion Bars */}
                  <div style={{ padding: 14, borderRadius: 12, background: "rgba(148,163,184,0.06)", border: "1px solid var(--border-subtle)" }}>
                    <h4 style={{ margin: "0 0 10px 0", fontSize: 14 }}>
                      🏫 Guruhlar kesimida porsiya foizi va CS2 (+/-) farqi ({selectedDate})
                    </h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: 9, maxHeight: 280, overflowY: "auto" }}>
                      {(canteen.byGroup || []).map((g: any) => (
                        <div key={g.group}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                            <span>
                              <b>{g.group}</b> ({g.studentCount} talaba • 3/3 kirgan: {g.allThree})
                            </span>
                            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <b>{g.servedPortions} / {g.expectedPortions} ({g.pct}%)</b>
                              {renderCs2Badge(g.cs2Diff, "")}
                            </span>
                          </div>
                          <div style={{ width: "100%", height: 8, background: "rgba(148,163,184,0.18)", borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ width: `${Math.min(100, g.pct)}%`, height: "100%", background: "#10b981", borderRadius: 4 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ROW 4: SMART TURNIKET TEKSHIRUVI VA QIZIL SIGNALLAR */}
          <div className="grid-2" style={{ alignItems: "start" }}>
            <div className="glass-card" style={{ padding: 18 }}>
              <h3 style={{ fontSize: 15.5, fontWeight: 800, margin: "0 0 8px 0", color: "#e11d48" }}>
                🔴 Oshxona Qizil Signallari — Rad etilgan 2-marta yoki vaqtidan tashqari urinishlar ({(canteen.alerts || []).length})
              </h3>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 0, marginBottom: 10 }}>
                Nonushta (<b>05:00-07:00</b>), Tushlik (<b>12:00-14:00</b>), Kechki ovqat (<b>17:30-19:30</b>) vaqtida bitta talaba faqat 1 marta karta ura oladi. Ikkinchi marta urilgan karta qabul qilinmaydi va qizil signal beradi.
              </p>
              <div className="table-wrap" style={{ maxHeight: 260, overflowY: "auto" }}>
                <table className="fin-table">
                  <thead>
                    <tr>
                      <th>Vaqt (Istanbul)</th>
                      <th>Talaba</th>
                      <th>Karta</th>
                      <th>Sabab (Qizil signal)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(canteen.alerts || []).map((al: any) => (
                      <tr key={al.id}>
                        <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{al.istanbulTime}</td>
                        <td style={{ fontWeight: 700 }}>{al.studentName}</td>
                        <td><span className="badge badge-slate">{al.cardId}</span></td>
                        <td style={{ color: "#e11d48", fontSize: 12, fontWeight: 600 }}>{al.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="glass-card" style={{ padding: 18 }}>
              <h3 style={{ fontSize: 15.5, fontWeight: 800, marginTop: 0, marginBottom: 6, color: "var(--text-primary)" }}>
                🛡️ Oshxona Smart Turniket Qoidasini Sinab Ko'rish
              </h3>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 0, marginBottom: 12 }}>
                Sinov: talaba <b>06:15</b> da 1-marta ursa — <b>🟢 Yashil signal (1 porsiya)</b>, darhol 2-marta ursa yoki <b>10:30</b> da ursa — <b>🔴 Qizil signal (Rad etildi)</b>!
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 130px", gap: 10, marginBottom: 10 }}>
                <select className="select" value={simStudentId} onChange={(e) => setSimStudentId(e.target.value)}>
                  {activeStudents.map((st: any) => (
                    <option key={st.id} value={st.id}>
                      {st.fullname} ({st.group})
                    </option>
                  ))}
                </select>
                <input type="time" className="input" value={simTimeStr} onChange={(e) => setSimTimeStr(e.target.value)} />
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                <button className="btn btn-sm" onClick={() => setSimTimeStr("06:15")}>Nonushta (06:15)</button>
                <button className="btn btn-sm" onClick={() => setSimTimeStr("12:45")}>Tushlik (12:45)</button>
                <button className="btn btn-sm" onClick={() => setSimTimeStr("18:15")}>Kechki (18:15)</button>
                <button className="btn btn-sm" onClick={() => setSimTimeStr("10:30")}>Vaqtdan tashqari (10:30)</button>
              </div>

              <button className="btn btn-primary" disabled={simBusy} onClick={() => handleSimulateScan("CANTEEN")}>
                🍽️ Oshxona kartasini urish (Sinov)
              </button>

              {lastSimResult && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: lastSimResult.accepted ? "rgba(16,185,129,0.14)" : "rgba(244,63,94,0.15)",
                    border: lastSimResult.accepted ? "1px solid #10b981" : "1px solid #e11d48",
                    color: lastSimResult.accepted ? "#10b981" : "#e11d48",
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  {lastSimResult.accepted ? lastSimResult.message : `🔴 ${lastSimResult.reason}`}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* VIEW 2: MASJID DEDICATED DASHBOARD (FOKUS: 5 MAHAL VA QATNASHMAGANLAR)*/}
      {/* ===================================================================== */}
      {subTab === "mosque" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* ROW 1: 5 MAHAL NAMOZ DIAGRAMMASI VA KARTOCHKALARI */}
          <div className="grid-2" style={{ alignItems: "stretch" }}>
            {/* Visual Stacked Column Chart of 5 Prayers */}
            <div className="glass-card" style={{ padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                  📊 5 Mahal Namoz: Qatnashganlar vs Qatnashmaganlar Diagrammasi
                </h3>
                <button className="btn btn-sm" onClick={() => setPrayerConfigModal(true)}>
                  <Settings size={14} /> Namoz vaqtlari
                </button>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 0, marginBottom: 14 }}>
                Har bir ustun ustiga bossangiz, pastdagi jadvalda aynan shu namozga <b>qatnashmagan talabalar</b> chiqadi.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, height: 190, alignItems: "end", padding: "12px 10px", background: "rgba(148,163,184,0.06)", borderRadius: 12 }}>
                {(mosque.prayers || []).map((p: any) => {
                  const isSel = specificMissedPrayer === p.prayerType;
                  const attPct = Math.max(4, p.pct || 0);
                  const missPct = Math.max(4, 100 - (p.pct || 0));
                  return (
                    <div
                      key={p.prayerType}
                      onClick={() => {
                        setMosqueFocus("MISSING_ANY");
                        setSpecificMissedPrayer(isSel ? "" : p.prayerType);
                      }}
                      style={{
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        height: "100%",
                        justifyContent: "flex-end",
                        padding: 6,
                        borderRadius: 10,
                        border: isSel ? "2px solid #e11d48" : "1px solid transparent",
                        background: isSel ? "rgba(244,63,94,0.1)" : undefined,
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#e11d48", marginBottom: 4 }}>
                        -{p.missingCount} yo'q
                      </div>
                      <div style={{ width: "70%", height: 110, display: "flex", flexDirection: "column", borderRadius: 6, overflow: "hidden", border: "1px solid rgba(148,163,184,0.25)" }}>
                        <div
                          style={{ height: `${missPct}%`, background: "rgba(244,63,94,0.75)", width: "100%" }}
                          title={`Qatnashmagan: ${p.missingCount} nafar`}
                        />
                        <div
                          style={{ height: `${attPct}%`, background: "#10b981", width: "100%" }}
                          title={`Qatnashgan: ${p.attendedCount} nafar`}
                        />
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 12.5, marginTop: 6 }}>{p.label}</div>
                      <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{p.startTime}-{p.endTime}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Group Discipline Breakdown Diagram */}
            <div className="glass-card" style={{ padding: 18 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 6px 0", color: "var(--text-primary)" }}>
                🏫 Guruhlar Kesimida Namoz Qoldirgan Talabalar Diagrammasi
              </h3>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 0, marginBottom: 12 }}>
                Guruh ustiga bossangiz, pastdagi ro'yxatda shu guruhning namozga kirmagan talabalari filtrlanadi.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 210, overflowY: "auto" }}>
                {mosqueByGroup.map((g) => {
                  const missRatio = g.totalStudents > 0 ? Math.round((g.studentsWithMissed / g.totalStudents) * 100) : 0;
                  const isSel = mosqueGroupFilter === g.group;
                  return (
                    <div
                      key={g.group}
                      onClick={() => setMosqueGroupFilter(isSel ? "" : g.group)}
                      style={{
                        cursor: "pointer",
                        padding: "8px 10px",
                        borderRadius: 8,
                        background: isSel ? "rgba(244,63,94,0.12)" : "rgba(148,163,184,0.05)",
                        border: isSel ? "1px solid #e11d48" : "1px solid var(--border-subtle)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700 }}>{g.group} ({g.totalStudents} talaba)</span>
                        <span>
                          <b style={{ color: "#e11d48" }}>Qatnashmagan: {g.studentsWithMissed} nafar ({missRatio}%)</b> •{" "}
                          <span style={{ color: "#10b981" }}>To'liq: {g.fullFiveStudents}</span>
                        </span>
                      </div>
                      <div style={{ width: "100%", height: 7, background: "rgba(16,185,129,0.25)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${missRatio}%`, height: "100%", background: "#e11d48", borderRadius: 4 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ROW 2: QATNASHMAGAN TALABALAR FOKUS JADVALI */}
          <div className="glass-card" style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className={`btn ${mosqueFocus === "MISSING_ANY" ? "btn-danger" : ""}`}
                  onClick={() => setMosqueFocus("MISSING_ANY")}
                >
                  🔴 Qatnashmagan talabalar ({mosque.missedAtLeastOneCount || 0} nafar)
                </button>
                <button
                  className={`btn ${mosqueFocus === "ALL_FIVE" ? "btn-primary" : ""}`}
                  onClick={() => {
                    setSpecificMissedPrayer("");
                    setMosqueFocus("ALL_FIVE");
                  }}
                >
                  ✅ 5 mahal to'liq qatnashganlar ({mosque.allFiveAttendedCount || 0} nafar)
                </button>
                <button
                  className={`btn ${mosqueFocus === "ALL" ? "btn-primary" : ""}`}
                  onClick={() => {
                    setSpecificMissedPrayer("");
                    setMosqueFocus("ALL");
                  }}
                >
                  Barcha talabalar ({mosque.totalStudents || 0})
                </button>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <select
                  className="select"
                  value={specificMissedPrayer}
                  onChange={(e) => {
                    setSpecificMissedPrayer(e.target.value);
                    if (e.target.value) setMosqueFocus("MISSING_ANY");
                  }}
                  style={{ width: 190 }}
                >
                  <option value="">Barcha 5 mahal namoz</option>
                  <option value="FAJR">Bomdodga qatnashmaganlar</option>
                  <option value="DHUHR">Peshinga qatnashmaganlar</option>
                  <option value="ASR">Asrga qatnashmaganlar</option>
                  <option value="MAGHRIB">Shomga qatnashmaganlar</option>
                  <option value="ISHA">Xuftonga qatnashmaganlar</option>
                </select>

                <select
                  className="select"
                  value={mosqueGroupFilter}
                  onChange={(e) => setMosqueGroupFilter(e.target.value)}
                  style={{ width: 150 }}
                >
                  <option value="">Barcha guruhlar</option>
                  {allGroups.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>

                <input
                  className="input"
                  placeholder="Talaba ismini qidirish..."
                  value={mosqueSearch}
                  onChange={(e) => setMosqueSearch(e.target.value)}
                  style={{ width: 200 }}
                />
              </div>
            </div>

            <div className="table-wrap" style={{ maxHeight: 460, overflowY: "auto" }}>
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Talaba</th>
                    <th>Guruh / Xona</th>
                    <th>Bomdod</th>
                    <th>Peshin</th>
                    <th>Asr</th>
                    <th>Shom</th>
                    <th>Xufton</th>
                    <th>Qatnashdi</th>
                    <th>Qatnashmagan mahallari</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMosqueStudents.map((st: any) => (
                    <tr key={st.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <StudentAvatar student={st} size={34} />
                          <div>
                            <div style={{ fontWeight: 700 }}>{st.fullname}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{st.phone}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-slate">{st.group}</span> • Xona: {st.room}
                      </td>
                      {(["FAJR", "DHUHR", "ASR", "MAGHRIB", "ISHA"] as const).map((pKey) => (
                        <td key={pKey}>
                          {st.prayers?.[pKey] ? (
                            <span className="badge badge-emerald">✓ {st.prayers[pKey]}</span>
                          ) : (
                            <span className="badge badge-rose">✗ Kirmadi</span>
                          )}
                        </td>
                      ))}
                      <td>
                        <b style={{ color: st.attendedCount === 5 ? "#10b981" : "#e11d48" }}>
                          {st.attendedCount} / 5
                        </b>
                      </td>
                      <td>
                        {st.missedList?.length > 0 ? (
                          <span style={{ color: "#e11d48", fontSize: 12, fontWeight: 700 }}>
                            {st.missedList.join(", ")} ({st.missedCount} mahal)
                          </span>
                        ) : (
                          <span className="badge badge-emerald">5 mahal to'liq</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ROW 3: MASJID RED SIGNALS & ANTI-CHEAT TESTER */}
          <div className="grid-2" style={{ alignItems: "start" }}>
            <div className="glass-card" style={{ padding: 18 }}>
              <h3 style={{ fontSize: 15.5, fontWeight: 800, marginTop: 0, marginBottom: 8, color: "#e11d48" }}>
                🔴 Masjid Qizil Signallari — Ertalab ketma-ket urilgan yoki vaqtidan tashqari kartalar ({(mosque.alerts || []).length})
              </h3>
              <div className="table-wrap" style={{ maxHeight: 240, overflowY: "auto" }}>
                <table className="fin-table">
                  <thead>
                    <tr>
                      <th>Vaqt (Istanbul)</th>
                      <th>Talaba</th>
                      <th>Karta</th>
                      <th>Sabab</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(mosque.alerts || []).map((al: any) => (
                      <tr key={al.id}>
                        <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{al.istanbulTime}</td>
                        <td style={{ fontWeight: 700 }}>{al.studentName}</td>
                        <td><span className="badge badge-slate">{al.cardId}</span></td>
                        <td style={{ color: "#e11d48", fontSize: 12, fontWeight: 600 }}>{al.reason}</td>
                      </tr>
                    ))}
                    {(mosque.alerts || []).length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                          Hozircha masjid turniketida qoidabuzarlik qaydlari yo'q
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="glass-card" style={{ padding: 18 }}>
              <h3 style={{ fontSize: 15.5, fontWeight: 800, marginTop: 0, marginBottom: 6, color: "var(--text-primary)" }}>
                🛡️ Masjid Turniketi Himoyasini Sinash (Ertalab 5 marta urish testi)
              </h3>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 0, marginBottom: 12 }}>
                Talaba Bomdod vaqtida (masalan <b>05:30</b>) 1-marta ursa — <b>Bomdod</b> yoziladi. Yana ursa — 5 mahalga o'tib ketmaydi, <b>🔴 Qizil signal</b> beradi!
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 130px", gap: 10, marginBottom: 10 }}>
                <select className="select" value={simStudentId} onChange={(e) => setSimStudentId(e.target.value)}>
                  {activeStudents.map((st: any) => (
                    <option key={st.id} value={st.id}>
                      {st.fullname} ({st.group})
                    </option>
                  ))}
                </select>
                <input type="time" className="input" value={simTimeStr} onChange={(e) => setSimTimeStr(e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                <button className="btn btn-sm" onClick={() => setSimTimeStr("05:30")}>Bomdod (05:30)</button>
                <button className="btn btn-sm" onClick={() => setSimTimeStr("13:00")}>Peshin (13:00)</button>
                <button className="btn btn-sm" onClick={() => setSimTimeStr("16:00")}>Asr (16:00)</button>
                <button className="btn btn-sm" onClick={() => setSimTimeStr("18:30")}>Shom (18:30)</button>
                <button className="btn btn-sm" onClick={() => setSimTimeStr("20:30")}>Xufton (20:30)</button>
              </div>
              <button className="btn btn-primary" disabled={simBusy} onClick={() => handleSimulateScan("MOSQUE")}>
                🕌 Masjid kartasini urish (Sinov)
              </button>
              {lastSimResult && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: lastSimResult.accepted ? "rgba(16,185,129,0.14)" : "rgba(244,63,94,0.15)",
                    border: lastSimResult.accepted ? "1px solid #10b981" : "1px solid #e11d48",
                    color: lastSimResult.accepted ? "#10b981" : "#e11d48",
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  {lastSimResult.accepted ? lastSimResult.message : `🔴 ${lastSimResult.reason}`}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* VIEW 3: KIRISH ESHIGI DEDICATED DASHBOARD (FOKUS: 6 RASM & KECHLAR)   */}
      {/* ===================================================================== */}
      {subTab === "gate" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* ROW 1: LIVE CAMERA, 6-PHOTO BURST & LATECOMERS DIAGRAM */}
          <div className="grid-2" style={{ alignItems: "stretch" }}>
            <div className="glass-card" style={{ padding: 18, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, display: "flex", alignItems: "center", gap: 8, color: "var(--text-primary)" }}>
                    <Camera size={18} color="#9333ea" />
                    Kirish Eshigi IP Kamerasi ({gate.cameraIp || "192.168.1.32"})
                  </h3>
                  <span className="badge badge-violet">Faol: {gate.activeWindow || "22:00 - 05:30"}</span>
                </div>
                <p style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5, marginTop: 0 }}>
                  Soat <b>22:00 dan 05:30 gacha</b> kirish eshigida kamera <b>soniyasiga 1 martadan 4 soniyada 4 ta rasm</b> oladi va Telegram botga hamda quyidagi <b>"Kutilmoqda"</b> jadvaliga yuboradi. Ism-familiya berilgach, talaba <b>Kech qoluvchilar reytingiga</b> tushadi.
                </p>

                {/* Visual Summary Bars for Gate */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, margin: "12px 0" }}>
                  <div style={{ padding: 10, borderRadius: 10, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>⏳ Kutilmoqda</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#d97706" }}>{gate.summary?.pendingCount || 0} ta</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-secondary)" }}>4 tadan rasm bilan</div>
                  </div>
                  <div style={{ padding: 10, borderRadius: 10, background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>🔴 Surunkali (2+)</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#e11d48" }}>{gate.summary?.chronicStudentsCount || 0} nafar</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-secondary)" }}>Doimiy kech qoluvchi</div>
                  </div>
                  <div style={{ padding: 10, borderRadius: 10, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>🟡 Bir martalik</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#10b981" }}>{gate.summary?.oneTimeStudentsCount || 0} nafar</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-secondary)" }}>1 marta kech qolgan</div>
                  </div>
                </div>

                <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 12 }}>
                  🧹 <b>7 kunlik qoida:</b> Bazada bu rasmlar bir haftadan ko'p saqlanmaydi (avtomatik tozalanadi).
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btn btn-primary" disabled={capturingGate} onClick={handleCaptureSixPhotos}>
                  <Camera size={16} />
                  {capturingGate ? "4 soniyada 4 ta rasm olinmoqda..." : "📸 Hozir 4 ta rasm olish (AI FaceID + Bot)"}
                </button>
                <button className="btn" onClick={() => setLiveFrameTick(Date.now())}>
                  <RefreshCw size={15} /> Kadrni yangilash
                </button>
                <button className="btn" onClick={() => setBotModalOpen(true)}>
                  <Settings size={15} /> Telegram Bot sozlamalari
                </button>
              </div>
            </div>

            <div className="glass-card" style={{ padding: 14, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "#10b981" }}>
                  🟢 JONLI TASVIR: Kirish eshigi (ip34_c01)
                </span>
                <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>192.168.1.32 • HD Oqim</span>
              </div>
              <img
                src={`/fin-api/campus/gate/live-frame?t=${liveFrameTick}`}
                alt="Kirish eshigi jonli kamera"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.opacity = "0.35";
                }}
                onLoad={(e) => {
                  (e.currentTarget as HTMLImageElement).style.opacity = "1";
                }}
                style={{
                  width: "100%",
                  maxHeight: 230,
                  objectFit: "cover",
                  borderRadius: 10,
                  border: "1px solid var(--border-subtle)",
                  background: "#090d16",
                }}
              />
            </div>
          </div>

          {/* ROW 2: KECH QOLUVCHILAR REYTINGI JADVALI (ENG KO'P KECH QOLUVCHILAR YUQORIDA) */}
          <div className="glass-card" style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                  🏆 Kech Qoluvchilar Jadvali (Eng ko'p kech qoluvchilar eng yuqorida)
                </h3>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                  Surunkali va bir martalik kech qoluvchilar reytingi — eng ko'p kech qolgan talabalar jadvalning eng yuqorisida turadi
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className={`btn btn-sm ${lateCategoryFilter === "ALL" ? "btn-primary" : ""}`}
                  onClick={() => setLateCategoryFilter("ALL")}
                >
                  Barchasi ({(gate.leaderboard || []).length})
                </button>
                <button
                  className={`btn btn-sm ${lateCategoryFilter === "CHRONIC" ? "btn-danger" : ""}`}
                  onClick={() => setLateCategoryFilter("CHRONIC")}
                >
                  🔴 Surunkali kech qoluvchilar ({gate.summary?.chronicStudentsCount || 0})
                </button>
                <button
                  className={`btn btn-sm ${lateCategoryFilter === "ONE_TIME" ? "btn-primary" : ""}`}
                  onClick={() => setLateCategoryFilter("ONE_TIME")}
                >
                  🟡 Bir martaliklar ({gate.summary?.oneTimeStudentsCount || 0})
                </button>
              </div>
            </div>

            <div className="table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>O'rin</th>
                    <th>Talaba Ism-familiyasi</th>
                    <th>Guruh va Xona</th>
                    <th>Toifasi</th>
                    <th>Kech qolishlar soni</th>
                    <th>Oxirgi kech kirgan vaqti</th>
                    <th>Tasdiqlangan holatlar va 4 ta rasm</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeaderboard.map((item: any, idx: number) => (
                    <tr key={item.key}>
                      <td style={{ fontWeight: 800, fontSize: 14, color: idx === 0 ? "#e11d48" : "#d97706" }}>
                        #{idx + 1}
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <StudentAvatar student={item} size={36} />
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 14 }}>{item.studentName}</div>
                            <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{item.phone}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-slate">{item.studentGroup}</span> • Xona: {item.room}
                      </td>
                      <td>
                        {item.category === "CHRONIC" ? (
                          <span className="badge badge-rose">🔴 Surunkali kech qoluvchi</span>
                        ) : (
                          <span className="badge badge-amber">🟡 Bir martalik</span>
                        )}
                      </td>
                      <td>
                        <span style={{ fontWeight: 800, fontSize: 16, color: item.category === "CHRONIC" ? "#e11d48" : "#d97706" }}>
                          {item.totalLateCount} marta
                        </span>
                      </td>
                      <td style={{ fontSize: 12.5 }}>{item.lastLateAt}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {(item.incidents || []).map((inc: any) => (
                            <button
                              key={inc.id}
                              className="btn btn-sm"
                              onClick={() => {
                                if (inc.photos?.length > 0) {
                                  setLightboxPhoto({
                                    urls: inc.photos,
                                    index: 0,
                                    title: `${item.studentName} — ${inc.istanbulTime} (4 ta rasm)`,
                                  });
                                }
                              }}
                            >
                              <Eye size={13} /> #{inc.id} ({inc.istanbulTime.slice(5, 16)})
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ROW 3: KUTILMOQDA (PENDING) VA TASDIQLANGAN 6-RASMLI QAYDLAR */}
          <div className="glass-card" style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                  📸 Kirish Eshigi Fotonazorat Qaydlari (Kutilmoqda vs Tasdiqlangan — 4 tadan rasm bilan)
                </h3>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                  Botdan tashqari shu jadvalning o'zida ham "Kutilmoqda" turgan 4 ta rasmga qarab talabaning ism-familiyasini biriktirib tasdiqlashingiz mumkin.
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className={`btn btn-sm ${gateStatusFilter === "ALL" ? "btn-primary" : ""}`}
                  onClick={() => setGateStatusFilter("ALL")}
                >
                  Barchasi ({(gate.incidents || []).filter((x: any) => x.status !== "DISMISSED").length})
                </button>
                <button
                  className={`btn btn-sm ${gateStatusFilter === "PENDING" ? "btn-primary" : ""}`}
                  onClick={() => setGateStatusFilter("PENDING")}
                >
                  ⏳ Kutilmoqda ({gate.summary?.pendingCount || 0})
                </button>
                <button
                  className={`btn btn-sm ${gateStatusFilter === "CONFIRMED" ? "btn-primary" : ""}`}
                  onClick={() => setGateStatusFilter("CONFIRMED")}
                >
                  🔴 Kech qolgan ({gate.summary?.confirmedCount || 0})
                </button>
                <button
                  className={`btn btn-sm ${gateStatusFilter === "EXCUSED" ? "btn-primary" : ""}`}
                  onClick={() => setGateStatusFilter("EXCUSED")}
                >
                  🟢 #sababli ({gate.summary?.excusedCount || 0})
                </button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {filteredGateIncidents.map((inc: any) => {
                const inp = confirmInputs[inc.id] || { studentId: "", studentName: "", note: "" };
                const photos: string[] = Array.isArray(inc.photos) ? inc.photos : [];
                const isIncExcused =
                  inc.status === "EXCUSED" ||
                  /#sababli/i.test(String(inc.note || "")) ||
                  /#sababli/i.test(String(inc.studentName || ""));
                return (
                  <div
                    key={inc.id}
                    style={{
                      padding: 16,
                      borderRadius: 12,
                      background: "rgba(148,163,184,0.04)",
                      border:
                        inc.status === "PENDING"
                          ? "1.5px solid rgba(245,158,11,0.5)"
                          : isIncExcused
                          ? "1px solid rgba(16,185,129,0.45)"
                          : "1px solid rgba(244,63,94,0.4)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 800, fontSize: 15 }}>Holat #{inc.id}</span>
                        <span className="badge badge-slate">🕒 {inc.istanbulTime}</span>
                        {inc.status === "PENDING" ? (
                          <span className="badge badge-amber">⏳ Kutilmoqda (Ism-familiya kiritilishi kerak)</span>
                        ) : isIncExcused ? (
                          <span className="badge badge-emerald">
                            🟢 #sababli (Ruxsatli / Xodim): {inc.studentName || "Sababli kirish"}
                          </span>
                        ) : (
                          <span className="badge badge-rose">
                            🔴 Kech qolgan: {inc.studentName} ({inc.studentGroup || "Guruhsiz"})
                          </span>
                        )}
                        {inc.confirmedBy && (
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                            Tasdiqladi: {inc.confirmedBy}
                          </span>
                        )}
                      </div>
                      {inc.note && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{inc.note}</div>}
                    </div>

                    {photos.length > 0 ? (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                          gap: 8,
                          marginBottom: inc.status === "PENDING" ? 14 : 0,
                        }}
                      >
                        {photos.map((url: string, pIdx: number) => (
                          <div
                            key={pIdx}
                            onClick={() =>
                              setLightboxPhoto({
                                urls: photos,
                                index: pIdx,
                                title: `Holat #${inc.id} — ${inc.istanbulTime} (${pIdx + 1}/4 kadr)`,
                              })
                            }
                            style={{
                              position: "relative",
                              cursor: "pointer",
                              borderRadius: 8,
                              overflow: "hidden",
                              border: "1px solid var(--border-subtle)",
                            }}
                          >
                            <img
                              src={url}
                              alt={`Kadr ${pIdx + 1}`}
                              style={{ width: "100%", height: 100, objectFit: "cover", display: "block" }}
                            />
                            <span
                              style={{
                                position: "absolute",
                                bottom: 4,
                                right: 6,
                                background: "rgba(0,0,0,0.75)",
                                color: "#fff",
                                fontSize: 10.5,
                                fontWeight: 700,
                                padding: "1px 6px",
                                borderRadius: 4,
                              }}
                            >
                              {pIdx + 1}/4 ({pIdx + 1}s)
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
                        🧹 7 kundan oshgani sababli rasmlar bazadan avtomatik o'chirilgan.
                      </div>
                    )}

                    {inc.status === "PENDING" && (
                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                          flexWrap: "wrap",
                          paddingTop: 10,
                          borderTop: "1px solid var(--border-subtle)",
                        }}
                      >
                        <select
                          className="select"
                          value={inp.studentId}
                          onChange={(e) => {
                            const st = activeStudents.find((s) => String(s.id) === e.target.value);
                            setConfirmInputs({
                              ...confirmInputs,
                              [inc.id]: {
                                ...inp,
                                studentId: e.target.value,
                                studentName: st ? st.fullname : inp.studentName,
                              },
                            });
                          }}
                          style={{ minWidth: 230 }}
                        >
                          <option value="">Ro'yxatdan talabani tanlang...</option>
                          {activeStudents.map((st: any) => (
                            <option key={st.id} value={st.id}>
                              {st.fullname} ({st.group})
                            </option>
                          ))}
                        </select>

                        <input
                          className="input"
                          placeholder="Yoki ism-familiyasini yozing..."
                          value={inp.studentName}
                          onChange={(e) =>
                            setConfirmInputs({
                              ...confirmInputs,
                              [inc.id]: { ...inp, studentName: e.target.value },
                            })
                          }
                          style={{ minWidth: 210 }}
                        />

                        <input
                          className="input"
                          placeholder="Izoh (ixtiyoriy)..."
                          value={inp.note}
                          onChange={(e) =>
                            setConfirmInputs({
                              ...confirmInputs,
                              [inc.id]: { ...inp, note: e.target.value },
                            })
                          }
                          style={{ flex: 1, minWidth: 160 }}
                        />

                        <button className="btn btn-danger" onClick={() => handleConfirmGateIncident(inc.id, false)}>
                          <CheckCircle2 size={15} /> 🔴 Kech qoldi (Qizil ro'yxatga)
                        </button>

                        <button
                          className="btn btn-primary"
                          style={{ background: "#10b981", borderColor: "#059669" }}
                          onClick={() => handleConfirmGateIncident(inc.id, true)}
                        >
                          🟢 #sababli (Qizilga tushmasin — Xodim / Ruxsatli)
                        </button>

                        <button className="btn btn-sm" onClick={() => handleDismissGateIncident(inc.id)}>
                          🗑️ Xatolik (O'chirish)
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: NAMOZ VAQTLARINI SOZLASH                                       */}
      {/* ===================================================================== */}
      {prayerConfigModal && (
        <div className="modal-backdrop" onClick={() => setPrayerConfigModal(false)}>
          <div className="modal-box animate-in" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>🕌 5 Mahal Namoz Vaqti Oynalarini Sozlash</h3>
              <button className="btn btn-sm" onClick={() => setPrayerConfigModal(false)}><X size={15} /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {prayerTimesEdit.map((pt, idx) => (
                <div key={pt.prayerType} style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr", gap: 10, alignItems: "center" }}>
                  <span style={{ fontWeight: 700 }}>{pt.label}:</span>
                  <input
                    type="time"
                    className="input"
                    value={pt.startTime}
                    onChange={(e) => {
                      const next = [...prayerTimesEdit];
                      next[idx] = { ...pt, startTime: e.target.value };
                      setPrayerTimesEdit(next);
                    }}
                  />
                  <input
                    type="time"
                    className="input"
                    value={pt.endTime}
                    onChange={(e) => {
                      const next = [...prayerTimesEdit];
                      next[idx] = { ...pt, endTime: e.target.value };
                      setPrayerTimesEdit(next);
                    }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button className="btn" onClick={() => setPrayerConfigModal(false)}>Yopish</button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  try {
                    await apiFetch("/fin-api/campus/config", {
                      method: "POST",
                      body: JSON.stringify({ prayerTimes: prayerTimesEdit }),
                    });
                    notify("Namoz vaqtlari saqlandi!");
                    setPrayerConfigModal(false);
                    loadAnalytics(selectedDate, selectedMonth);
                  } catch (err: any) {
                    notify(err.message, "err");
                  }
                }}
              >
                Saqlash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: TELEGRAM BOT SOZLAMALARI                                       */}
      {/* ===================================================================== */}
      {botModalOpen && (
        <div className="modal-backdrop" onClick={() => setBotModalOpen(false)}>
          <div className="modal-box animate-in" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>🤖 Kirish Eshigi Telegram Bot Sozlamalari</h3>
              <button className="btn btn-sm" onClick={() => setBotModalOpen(false)}><X size={15} /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12 }}>Telegram Bot Token</label>
                <input
                  className="input"
                  placeholder={gate.botConfig?.botTokenMasked || "123456789:AAH..."}
                  value={botForm.botToken}
                  onChange={(e) => setBotForm({ ...botForm, botToken: e.target.value })}
                />
              </div>
              <div>
                <label style={{ fontSize: 12 }}>Mas'ul xodim yoki guruh Chat ID raqami</label>
                <input
                  className="input"
                  placeholder="Masalan: 987654321"
                  value={botForm.chatId}
                  onChange={(e) => setBotForm({ ...botForm, chatId: e.target.value })}
                />
              </div>
              <div>
                <label style={{ fontSize: 12 }}>Mas'ul xodim lavozimi / ismi</label>
                <input
                  className="input"
                  value={botForm.responsiblePerson}
                  onChange={(e) => setBotForm({ ...botForm, responsiblePerson: e.target.value })}
                />
              </div>
              <div className="grid-2">
                <div>
                  <label style={{ fontSize: 12 }}>Kechki rejim boshlanishi</label>
                  <input
                    type="time"
                    className="input"
                    value={botForm.activeStart}
                    onChange={(e) => setBotForm({ ...botForm, activeStart: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12 }}>Kechki rejim tugashi</label>
                  <input
                    type="time"
                    className="input"
                    value={botForm.activeEnd}
                    onChange={(e) => setBotForm({ ...botForm, activeEnd: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button className="btn" onClick={() => setBotModalOpen(false)}>Yopish</button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  try {
                    await apiFetch("/fin-api/campus/config", {
                      method: "POST",
                      body: JSON.stringify({ botConfig: botForm }),
                    });
                    notify("Telegram Bot va kamera vaqti sozlamalari saqlandi!");
                    setBotModalOpen(false);
                    loadAnalytics(selectedDate, selectedMonth);
                  } catch (err: any) {
                    notify(err.message, "err");
                  }
                }}
              >
                Saqlash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: 6-PHOTO LIGHTBOX                                               */}
      {/* ===================================================================== */}
      {lightboxPhoto && (
        <div className="modal-backdrop" onClick={() => setLightboxPhoto(null)}>
          <div className="modal-box animate-in" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
                {lightboxPhoto.title} — Kadr {lightboxPhoto.index + 1} / {lightboxPhoto.urls.length}
              </h3>
              <button className="btn btn-sm" onClick={() => setLightboxPhoto(null)}><X size={15} /></button>
            </div>
            <img
              src={lightboxPhoto.urls[lightboxPhoto.index]}
              alt="Katta rasm"
              style={{ width: "100%", maxHeight: 460, objectFit: "contain", borderRadius: 10, background: "#000" }}
            />
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 12 }}>
              {lightboxPhoto.urls.map((u, idx) => (
                <button
                  key={idx}
                  className={`btn btn-sm ${lightboxPhoto.index === idx ? "btn-primary" : ""}`}
                  onClick={() => setLightboxPhoto({ ...lightboxPhoto, index: idx })}
                >
                  {idx + 1}-rasm ({idx + 1}s)
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
