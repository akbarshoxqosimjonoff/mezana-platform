import React, { useState, useRef, useEffect } from "react";
import {
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Maximize2,
  Minimize2,
  Send,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";

interface AiMessage {
  role: "user" | "ai";
  text: string;
  pendingAction?: any;
  actionStatus?: string;
}

interface AiAssistantModalProps {
  open: boolean;
  onClose: () => void;
  messages: AiMessage[];
  onClearMessages: () => void;
  question: string;
  setQuestion: (v: string) => void;
  busy: boolean;
  askAi: (customPrompt?: string) => void;
  executeAiAction: (idx: number, pendingAction: any) => void;
  cancelAiAction: (idx: number) => void;
}

const QUICK_PROMPTS = [
  {
    icon: "\u{1F4CA}",
    title: "Bugungi moliya xulosasi",
    subtitle: "Tushumlar, xarajatlar va xazina qoldig\x27i",
    prompt: "Bugungi umumiy moliyaviy holat, tushumlar, xarajatlar va xazina qoldig\x27i bo\x27yicha aniq xulosa ber.",
    accent: "#10b981",
  },
  {
    icon: "\u{1F393}",
    title: "Qarzdorlar va 2025\u20132026 arxiv",
    subtitle: "Faol va arxiv talabalar qarz tahlili",
    prompt: "Faol (2026-2027) va o\x27tgan o\x27quv yili (2025-2026) arxividagi talabalar hamda ularning qarz holati bo\x27yicha batafsil tahlil ber.",
    accent: "#8b5cf6",
  },
  {
    icon: "\u{1F37D}\u{FE0F}",
    title: "Oshxona va porsiyalar (+/-)",
    subtitle: "Nonushta, tushlik, kechki ovqat tahlili",
    prompt: "Oshxona bo\x27yicha bugungi va shu oydagi nonushta, tushlik, kechki ovqat porsiyalari hamda ishtirok foizi haqida ma\x27lumot ber.",
    accent: "#f59e0b",
  },
  {
    icon: "\u{1F54C}",
    title: "Masjid: 5 mahal namoz",
    subtitle: "Namozga qatnashmagan talabalar fokus tahlili",
    prompt: "Masjid 5 mahal namoz davomati va namozga qatnashmagan talabalar bo\x27yicha ma\x27lumot ber.",
    accent: "#06b6d4",
  },
  {
    icon: "\u{1F6AA}",
    title: "Kirish eshigi: Kech qolganlar",
    subtitle: "Surunkali kech qoluvchilar va #sababli holatlar",
    prompt: "Kechki kirish eshigidan (22:00-05:30) kech qolib kirgan talabalar va #sababli holatlar bo\x27yicha hisobot ber.",
    accent: "#f43f5e",
  },
  {
    icon: "\u{1F4BC}",
    title: "Hamyonlar va xarajatlar",
    subtitle: "Xodim hamyonlari qoldig\x27i va kutilayotgan sarflar",
    prompt: "Xodim hamyonlari qoldig\x27i va kutilayotgan hamda tasdiqlangan xarajatlar tahlilini jadval ko\x27rinishida ber.",
    accent: "#3b82f6",
  },
];

function formatInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} className="ai-inline-strong">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={i} className="ai-inline-code">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function renderAiMarkdown(rawText: string): React.ReactNode {
  if (!rawText) return null;
  const lines = rawText.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line) {
      i++;
      continue;
    }

    // Markdown Table block
    if (line.startsWith("|") && line.endsWith("|") && i + 1 < lines.length && lines[i + 1].trim().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }
      const rows = tableLines
        .filter((tl) => !/^\|[\s\-:|]+\|$/.test(tl))
        .map((tl) =>
          tl
            .replace(/^\||\|$/g, "")
            .split("|")
            .map((c) => c.trim())
        );
      if (rows.length > 0) {
        const header = rows[0];
        const body = rows.slice(1);
        blocks.push(
          <div key={"tbl-" + i} className="ai-md-table-wrap">
            <table className="fin-table ai-md-table">
              <thead>
                <tr>
                  {header.map((h, hIdx) => (
                    <th key={hIdx}>{formatInline(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((r, rIdx) => (
                  <tr key={rIdx}>
                    {r.map((c, cIdx) => (
                      <td key={cIdx}>{formatInline(c)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // Headings (#, ##, ###)
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2].replace(/\*\*/g, "");
      blocks.push(
        <div key={"hd-" + i} className={"ai-md-heading level-" + level}>
          {content}
        </div>
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line)) {
      blocks.push(<hr key={"hr-" + i} className="ai-md-hr" />);
      i++;
      continue;
    }

    // Unordered or Ordered List block
    if (/^([-*\u2022]|\d+[.)])\s+/.test(line)) {
      const items: { marker: string; text: string; isOrdered: boolean }[] = [];
      while (i < lines.length) {
        const l = lines[i].trim();
        const m = l.match(/^([-*\u2022]|\d+[.)])\s+(.+)$/);
        if (!m) break;
        items.push({
          marker: m[1],
          text: m[2],
          isOrdered: /\d/.test(m[1]),
        });
        i++;
      }
      blocks.push(
        <div key={"lst-" + i} className="ai-md-list">
          {items.map((it, idx) => (
            <div key={idx} className="ai-md-list-item">
              <span className={"ai-md-bullet " + (it.isOrdered ? "ordered" : "dot")}>
                {it.isOrdered ? it.marker : "\u2022"}
              </span>
              <div className="ai-md-list-content">{formatInline(it.text)}</div>
            </div>
          ))}
        </div>
      );
      continue;
    }

    // Regular paragraph
    blocks.push(
      <p key={"p-" + i} className="ai-md-paragraph">
        {formatInline(line)}
      </p>
    );
    i++;
  }

  return <div className="ai-md-body">{blocks}</div>;
}

export function AiAssistantModal({
  open,
  onClose,
  messages,
  onClearMessages,
  question,
  setQuestion,
  busy,
  askAi,
  executeAiAction,
  cancelAiAction,
}: AiAssistantModalProps) {
  const [expanded, setExpanded] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
        inputRef.current?.focus();
      }, 60);
    }
  }, [open, messages.length, busy]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const copyMessage = (text: string, idx: number) => {
    navigator.clipboard?.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1800);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-box wide animate-in ai-modal-shell"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: expanded ? 1080 : 860,
          height: expanded ? "88vh" : "82vh",
          maxHeight: 860,
          display: "flex",
          flexDirection: "column",
          padding: 0,
          overflow: "hidden",
        }}
      >
        {/* HEADER */}
        <div className="ai-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="ai-avatar-badge">
              <Sparkles size={20} color="#ffffff" />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
                  Mezana Aqlli Yordamchi
                </h3>
                <span className="badge badge-emerald" style={{ fontSize: 11 }}>
                  {"GPT-4o \u2022 Jonli baza + Arxiv"}
                </span>
              </div>
              <p style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 2 }}>
                {"Moliya, talabalar arxivi, oshxona, masjid va kirish eshigi ma'lumotlarini tahlil qiladi hamda tasdig'ingiz bilan ma'lumot kiritadi."}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {messages.length > 0 && (
              <button
                type="button"
                className="btn btn-sm"
                title="Suhbatni tozalash"
                onClick={onClearMessages}
                style={{ gap: 5 }}
              >
                <Trash2 size={14} /> Tozalash
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm"
              title={expanded ? "Kichraytirish" : "Kattalashtirish"}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button type="button" className="btn btn-sm" onClick={onClose} title="Yopish">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* COMPACT QUICK CHIPS WHEN CONVERSATION IS ACTIVE */}
        {messages.length > 0 && (
          <div className="ai-quick-strip">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q.title}
                type="button"
                className="ai-chip-btn"
                disabled={busy}
                onClick={() => askAi(q.prompt)}
              >
                <span>{q.icon}</span>
                <span>{q.title}</span>
              </button>
            ))}
          </div>
        )}

        {/* CHAT SCROLL CANVAS */}
        <div className="ai-chat-canvas">
          {messages.length === 0 ? (
            <div className="ai-welcome-container">
              <div className="ai-welcome-hero">
                <div className="ai-welcome-title">
                  {"\u{1F44B} Assalomu alaykum! Qanday ma'lumot yoki tahlil kerak?"}
                </div>
                <div className="ai-welcome-desc">
                  {"Quyidagi tayyor yo'nalishlardan birini tanlang yoki pastdagi maydonga o'z savolingizni / topshirig'ingizni yozing:"}
                </div>
              </div>

              <div className="ai-prompt-grid">
                {QUICK_PROMPTS.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    className="ai-prompt-card"
                    disabled={busy}
                    onClick={() => askAi(item.prompt)}
                  >
                    <div
                      className="ai-prompt-icon"
                      style={{
                        background: item.accent + "18",
                        borderColor: item.accent + "40",
                      }}
                    >
                      {item.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="ai-prompt-card-title">{item.title}</div>
                      <div className="ai-prompt-card-sub">{item.subtitle}</div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="ai-capabilities-box">
                <div className="ai-cap-item">
                  <span className="ai-cap-dot" style={{ background: "#10b981" }} />
                  <div>
                    <strong>{"Ma'lumot olish va solishtirma tahlil:"}</strong>{" Faol talabalar, 2025\u20132026 arxiv talabalari, qarzdorlar, to'lovlar, oshxona porsiyalari, 5 mahal namoz davomati, kech qolganlar va xodim hamyonlarini birlashtirib aniq jadvallar bilan chiqarib beradi."}
                  </div>
                </div>
                <div className="ai-cap-item">
                  <span className="ai-cap-dot" style={{ background: "#8b5cf6" }} />
                  <div>
                    <strong>{"Tasdiq orqali ma'lumot kiritish:"}</strong> Masalan,{" "}
                    <em
                      className="ai-example-click"
                      onClick={() => setQuestion("Talabaga 1500 lira naqd to'lov kiritishni tayyorla")}>"Talabaga 1500 lira naqd to'lov kiritishni tayyorla"</em>{" "}
                    yoki{" "}
                    <em
                      className="ai-example-click"
                      onClick={() => setQuestion("Yangi xarajat qo'shishni tayyorla")}>"Yangi xarajat qo'shishni tayyorla"</em>{" "}
                    {"desangiz, avval tayyorlab sizdan tasdiq so'raydi."}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="ai-messages-list">
              {messages.map((m, idx) => {
                const isUser = m.role === "user";
                return (
                  <div
                    key={idx}
                    className={"ai-msg-row " + (isUser ? "is-user" : "is-ai")}
                  >
                    {!isUser && (
                      <div className="ai-msg-avatar ai">
                        <Bot size={17} />
                      </div>
                    )}

                    <div className={"ai-msg-bubble " + (isUser ? "user-bubble" : "ai-bubble")}>
                      {!isUser && (
                        <div className="ai-msg-bubble-header">
                          <span className="ai-msg-author">Mezana AI</span>
                          <button
                            type="button"
                            className="ai-copy-btn"
                            onClick={() => copyMessage(m.text, idx)}
                            title="Javobdan nusxa olish"
                          >
                            {copiedIdx === idx ? (
                              <>
                                <Check size={12} /> Nusxalandi
                              </>
                            ) : (
                              <>
                                <Copy size={12} /> Nusxa olish
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {isUser ? (
                        <div style={{ whiteSpace: "pre-wrap", fontWeight: 500 }}>{m.text}</div>
                      ) : (
                        renderAiMarkdown(m.text)
                      )}

                      {m.pendingAction && (
                        <div className="ai-action-card">
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <strong style={{ fontSize: 13.5, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                              <span>{"\u{1F4CB}"}</span>
                              <span>Tasdiqlash uchun tayyorlangan amal: {m.pendingAction.title}</span>
                            </strong>
                            <span
                              className={
                                "badge " +
                                (m.actionStatus === "executed"
                                  ? "badge-emerald"
                                  : m.actionStatus === "cancelled"
                                  ? "badge-rose"
                                  : "badge-amber")
                              }
                            >
                              {m.actionStatus === "executed"
                                ? "Bajarildi"
                                : m.actionStatus === "cancelled"
                                ? "Bekor qilindi"
                                : "Tasdiq kutilmoqda"}
                            </span>
                          </div>

                          {m.pendingAction.summary && (
                            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>
                              {m.pendingAction.summary}
                            </div>
                          )}

                          {Array.isArray(m.pendingAction.fields) && m.pendingAction.fields.length > 0 && (
                            <div className="ai-action-fields-grid">
                              {m.pendingAction.fields.map((f: any, fIdx: number) => (
                                <div key={fIdx} className="ai-action-field-item">
                                  <span style={{ color: "var(--text-secondary)", fontSize: 11.5 }}>{f.label}</span>
                                  <strong style={{ color: "var(--text-primary)", fontSize: 13 }}>{f.value}</strong>
                                </div>
                              ))}
                            </div>
                          )}

                          {(!m.actionStatus || m.actionStatus === "pending") && (
                            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
                              <button
                                type="button"
                                className="btn btn-sm"
                                disabled={busy}
                                onClick={() => cancelAiAction(idx)}
                              >
                                Bekor qilish
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                disabled={busy}
                                onClick={() => executeAiAction(idx, m.pendingAction)}
                              >
                                <CheckCircle2 size={14} /> Tasdiqlash va kiritish
                              </button>
                            </div>
                          )}

                          {m.actionStatus === "executing" && (
                            <div style={{ fontSize: 12.5, color: "#d97706", fontWeight: 600, marginTop: 8 }}>
                              Amal bajarilmoqda...
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {isUser && (
                      <div className="ai-msg-avatar user">
                        <User size={16} />
                      </div>
                    )}
                  </div>
                );
              })}

              {busy && (
                <div className="ai-msg-row is-ai">
                  <div className="ai-msg-avatar ai">
                    <Bot size={17} />
                  </div>
                  <div className="ai-msg-bubble ai-bubble ai-typing-bubble">
                    <div className="ai-typing-dots">
                      <span />
                      <span />
                      <span />
                    </div>
                    <span>{"Ma'lumotlar bazasi va arxiv tahlil qilinmoqda..."}</span>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* FOOTER INPUT BAR */}
        <form
          className="ai-modal-footer"
          onSubmit={(e) => {
            e.preventDefault();
            askAi();
          }}
        >
          <textarea
            ref={inputRef}
            className="input ai-chat-input"
            rows={1}
            placeholder="Savolingizni yoki kiritilishi kerak bo'lgan ma'lumotni yozing... (Yuborish uchun Enter)"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!busy && question.trim()) askAi();
              }
            }}
          />
          <button
            type="submit"
            className="btn btn-primary ai-send-btn"
            disabled={busy || !question.trim()}
          >
            <Send size={15} />
            <span>Yuborish</span>
          </button>
        </form>
      </div>
    </div>
  );
}
