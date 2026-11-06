import React, { useState, useEffect, useRef } from "react";

export function fmtDate(val: any, fallback = "—"): string {
  if (val === null || val === undefined || val === "") return fallback;
  const s = String(val).trim();
  if (!s || s === "—" || s === "-") return fallback;
  if (/^\d{2}\.\d{2}\.\d{4}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  const d = new Date(val);
  if (!Number.isNaN(d.getTime())) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Istanbul",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).formatToParts(d);
    const dd = parts.find((p) => p.type === "day")?.value || "01";
    const mm = parts.find((p) => p.type === "month")?.value || "01";
    const yyyy = parts.find((p) => p.type === "year")?.value || "2026";
    return `${dd}.${mm}.${yyyy}`;
  }
  return s;
}

export function fmtDateTime(val: any, fallback = "—"): string {
  if (val === null || val === undefined || val === "") return fallback;
  const s = String(val).trim();
  if (!s || s === "—" || s === "-") return fallback;
  if (/^\d{2}\.\d{2}\.\d{4}/.test(s)) return s;
  const plainMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}:\d{2})(?::\d{2})?$/);
  if (plainMatch) {
    return `${plainMatch[3]}.${plainMatch[2]}.${plainMatch[1]} ${plainMatch[4]}`;
  }
  const dateOnly = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return `${dateOnly[3]}.${dateOnly[2]}.${dateOnly[1]}`;
  }
  const d = new Date(val);
  if (!Number.isNaN(d.getTime())) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Istanbul",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const dd = parts.find((p) => p.type === "day")?.value || "01";
    const mm = parts.find((p) => p.type === "month")?.value || "01";
    const yyyy = parts.find((p) => p.type === "year")?.value || "2026";
    const hh = parts.find((p) => p.type === "hour")?.value || "00";
    const min = parts.find((p) => p.type === "minute")?.value || "00";
    return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
  }
  return s;
}

export function fmtMonth(val: any, fallback = "—"): string {
  if (!val) return fallback;
  const s = String(val).trim();
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${m[2]}.${m[1]}`;
  return s;
}

function toIsoDate(val: any): string {
  if (!val) return "";
  const s = String(val).trim();
  const mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mIso) return `${mIso[1]}-${mIso[2]}-${mIso[3]}`;
  const mDmy = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (mDmy) return `${mDmy[3]}-${mDmy[2]}-${mDmy[1]}`;
  return "";
}

export interface DateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function DateInput({
  value = "",
  onChange,
  className = "input",
  style,
  required,
  disabled,
  min,
  max,
  name,
  title,
  placeholder = "kk.oo.yyyy",
  ...rest
}: DateInputProps) {
  const isoVal = toIsoDate(value);
  const [text, setText] = useState<string>(() => (isoVal ? fmtDate(isoVal, "") : ""));
  const pickerRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const nextIso = toIsoDate(value);
    setText(nextIso ? fmtDate(nextIso, "") : "");
  }, [value]);

  const emitChange = (newIso: string) => {
    if (!onChange) return;
    const synthetic = {
      target: { value: newIso, name: name || "" },
      currentTarget: { value: newIso, name: name || "" },
    } as unknown as React.ChangeEvent<HTMLInputElement>;
    onChange(synthetic);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (!raw.trim()) {
      setText("");
      emitChange("");
      return;
    }
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    let formatted = digits;
    if (digits.length > 4) {
      formatted = `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4, 8)}`;
    } else if (digits.length > 2) {
      formatted = `${digits.slice(0, 2)}.${digits.slice(2, 4)}`;
    }
    setText(formatted);
    if (digits.length === 8) {
      const dd = Number(digits.slice(0, 2));
      const mm = Number(digits.slice(2, 4));
      const yyyy = Number(digits.slice(4, 8));
      if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && yyyy >= 1900 && yyyy <= 2100) {
        const nextIso = `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
        emitChange(nextIso);
      }
    }
  };

  const handleBlur = () => {
    if (!text.trim()) {
      if (isoVal) emitChange("");
      return;
    }
    const m = text.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (m) {
      const dd = String(Math.min(31, Math.max(1, Number(m[1])))).padStart(2, "0");
      const mm = String(Math.min(12, Math.max(1, Number(m[2])))).padStart(2, "0");
      const yyyy = m[3];
      const nextIso = `${yyyy}-${mm}-${dd}`;
      setText(`${dd}.${mm}.${yyyy}`);
      if (nextIso !== isoVal) emitChange(nextIso);
    } else {
      setText(isoVal ? fmtDate(isoVal, "") : "");
    }
  };

  const openPicker = () => {
    if (disabled) return;
    const el = pickerRef.current as any;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") {
        el.showPicker();
      } else {
        el.focus();
        el.click();
      }
    } catch {
      el.focus();
    }
  };

  const wrapperStyle: React.CSSProperties = {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    width: style?.width,
    flex: style?.flex,
    minWidth: style?.minWidth ?? 142,
    maxWidth: style?.maxWidth,
  };

  const inputStyle: React.CSSProperties = {
    ...style,
    width: "100%",
    paddingRight: 30,
  };

  return (
    <span className="date-input-wrap" style={wrapperStyle} title={title}>
      <input
        {...rest}
        type="text"
        inputMode="numeric"
        className={className}
        style={inputStyle}
        value={text}
        onChange={handleTextChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        tabIndex={-1}
        title="Kalendardan tanlash (Kun.Oy.Yil)"
        style={{
          position: "absolute",
          right: 6,
          top: "50%",
          transform: "translateY(-50%)",
          background: "transparent",
          border: "none",
          padding: "2px 4px",
          cursor: disabled ? "default" : "pointer",
          color: "var(--text-secondary, #94a3b8)",
          fontSize: 13,
          lineHeight: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        📅
      </button>
      <input
        ref={pickerRef}
        type="date"
        name={name}
        value={isoVal}
        min={min}
        max={max}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const v = e.target.value;
          setText(v ? fmtDate(v, "") : "");
          emitChange(v);
        }}
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: "none",
          border: "none",
          padding: 0,
        }}
      />
    </span>
  );
}
