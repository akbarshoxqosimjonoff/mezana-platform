// Kechki kirish (kech kelganlar) sozlamalari.
export const LATE = {
  deviceName: "kirish",
  cameraSrcs: (process.env.LATE_CAMERA_SRCS ?? "ip34_c01_hd,ip34_c01").split(","),
  go2rtc: process.env.GO2RTC_URL ?? "http://127.0.0.1:1984",
  photosDir: process.env.LATE_PHOTOS_DIR ?? "/srv/data/apps/mezana-platform/apps/telegram-bot/late-photos",
  tz: process.env.LATE_TZ ?? "Europe/Istanbul",
  fromHour: 22,
  toHour: 5,
  toMinute: 30,
  frames: 4, // 4 soniyada 4 ta rasm (soniyasiga 1 tadan)
  spanMs: 4000, // 4 soniya
  pollMs: Number(process.env.LATE_POLL_MS ?? 3000),
  dedupeSec: 60,
  responsibleWindowMin: 30,
};

export function dbWallToDate(dbVal?: Date | null): Date {
  if (!dbVal) return new Date();
  const y = dbVal.getUTCFullYear();
  const m = String(dbVal.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dbVal.getUTCDate()).padStart(2, "0");
  const hh = String(dbVal.getUTCHours()).padStart(2, "0");
  const mm = String(dbVal.getUTCMinutes()).padStart(2, "0");
  const ss = String(dbVal.getUTCSeconds()).padStart(2, "0");
  const ms = String(dbVal.getUTCMilliseconds()).padStart(3, "0");
  return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}.${ms}+03:00`);
}

export function isNightTime(at: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LATE.tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h >= LATE.fromHour || h < LATE.toHour || (h === LATE.toHour && m <= LATE.toMinute);
}

export function fmtLocal(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LATE.tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const hh = map.hour === "24" ? "00" : (map.hour || "00");
  return `${map.year}-${map.month}-${map.day}, soat ${hh}:${map.minute}:${map.second}`;
}
