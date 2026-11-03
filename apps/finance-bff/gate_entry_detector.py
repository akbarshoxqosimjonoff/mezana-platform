import os
import time
import json
import threading
import urllib.request
from collections import deque
from datetime import datetime, timezone, timedelta
import cv2
import numpy as np
from face_recognizer import StudentFaceRecognizer

STREAM_URLS = [
    os.environ.get("GATE_STREAM_URL", "http://127.0.0.1:1984/api/stream.mp4?src=ip34_c01_hd"),
    "http://127.0.0.1:1984/api/stream.mp4?src=ip34_c01",
]
SNAPSHOT_FALLBACK_URLS = [
    "http://127.0.0.1:1984/api/frame.jpeg?src=ip34_c01_hd",
    "http://127.0.0.1:1984/api/frame.jpeg?src=ip34_c01",
]
BFF_TRIGGER_URL = os.environ.get("BFF_TRIGGER_URL", "http://127.0.0.1:3000/fin-api/campus/gate/detector-event")
MODEL_PATH = "/srv/data/apps/mezana-platform/apps/finance-bff/yunet.onnx"
GATE_UPLOAD_DIR = "/srv/data/apps/mezana-platform/apps/finance/dist/uploads/gate"

os.makedirs(GATE_UPLOAD_DIR, exist_ok=True)

DETECT_W, DETECT_H = 1280, 720
POLL_INTERVAL_SEC = 0.16      # ~6 checks per second on live stream
MIN_WAVE_GAP_SEC = 3.2        # Minimum gap between consecutive entry waves
TRACK_TTL_SEC = 1.6           # Drop stale face tracks quickly

detector = cv2.FaceDetectorYN.create(
    MODEL_PATH,
    "",
    (DETECT_W, DETECT_H),
    score_threshold=0.55,
    nms_threshold=0.3,
    top_k=20,
)
detector_lock = threading.Lock()

face_recognizer = StudentFaceRecognizer()
try:
    face_recognizer.ensure_gallery_loaded()
except Exception as _e:
    print(f"[FaceRecognizer init warning] {_e}", flush=True)
recognizer_lock = threading.Lock()

ISTANBUL_TZ = timezone(timedelta(hours=3))

def get_istanbul_now():
    return datetime.now(ISTANBUL_TZ)

def is_active_window():
    now = get_istanbul_now()
    if now.hour >= 22 or now.hour < 5 or (now.hour == 5 and now.minute <= 30):
        return True, "TUNGI"
    return False, "INACTIVE"


class LiveGateStream:
    def __init__(self):
        self.lock = threading.Lock()
        self.buffer = deque(maxlen=90)
        self.latest_ts = 0.0
        self.running = True
        self.thread = threading.Thread(target=self._reader_loop, daemon=True)
        self.thread.start()

    def _fetch_http_snapshot(self):
        for url in SNAPSHOT_FALLBACK_URLS:
            try:
                req = urllib.request.Request(url)
                with urllib.request.urlopen(req, timeout=2.5) as resp:
                    data = resp.read()
                arr = np.frombuffer(data, dtype=np.uint8)
                img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                if img is not None:
                    return img
            except Exception:
                pass
        return None

    def _reader_loop(self):
        url_idx = 0
        while self.running:
            active, _ = is_active_window()
            if not active:
                time.sleep(2.0)
                continue

            stream_url = STREAM_URLS[url_idx % len(STREAM_URLS)]
            cap = None
            try:
                cap = cv2.VideoCapture(stream_url)
                if not cap.isOpened():
                    url_idx += 1
                    img = self._fetch_http_snapshot()
                    if img is not None:
                        now = time.time()
                        with self.lock:
                            self.buffer.append((now, img))
                            self.latest_ts = now
                    time.sleep(0.5)
                    continue

                print(f"[{get_istanbul_now().isoformat()}] Connected to live stream: {stream_url}", flush=True)
                last_push = 0.0
                consecutive_fails = 0
                while self.running:
                    active_now, _ = is_active_window()
                    if not active_now:
                        break
                    ok, frame = cap.read()
                    if not ok or frame is None:
                        consecutive_fails += 1
                        if consecutive_fails > 15:
                            break
                        time.sleep(0.05)
                        continue
                    consecutive_fails = 0
                    now = time.time()
                    if now - last_push >= 0.095:
                        h, w = frame.shape[:2]
                        if w > 1920:
                            stored = cv2.resize(frame, (1920, int(h * 1920 / w)))
                        else:
                            stored = frame.copy()
                        with self.lock:
                            self.buffer.append((now, stored))
                            self.latest_ts = now
                        last_push = now
            except Exception as e:
                print(f"[{get_istanbul_now().isoformat()}] Stream reader warning: {e}", flush=True)
            finally:
                if cap is not None:
                    try:
                        cap.release()
                    except Exception:
                        pass
            time.sleep(0.5)

    def get_latest_frame(self):
        now = time.time()
        with self.lock:
            if self.buffer and (now - self.latest_ts) <= 2.5:
                return self.latest_ts, self.buffer[-1][1]
        img = self._fetch_http_snapshot()
        if img is not None:
            ts = time.time()
            with self.lock:
                self.buffer.append((ts, img))
                self.latest_ts = ts
            return ts, img
        return 0.0, None

    def get_frames_in_range(self, start_ts, end_ts):
        with self.lock:
            return [img for (ts, img) in self.buffer if start_ts <= ts <= end_ts]


def find_entering_faces(img, max_cy=0.72):
    small = cv2.resize(img, (DETECT_W, DETECT_H))
    with detector_lock:
        _, faces = detector.detect(small)
    if faces is None:
        return []

    candidates = []
    for f in faces:
        x, y, fw, fh = [float(v) for v in f[0:4]]
        re_x, re_y = float(f[4]), float(f[5])
        le_x, le_y = float(f[6]), float(f[7])
        nose_x, nose_y = float(f[8]), float(f[9])
        score = float(f[14])

        if fw < 22.0 or fh < 26.0 or score < 0.56:
            continue

        cx = (x + fw * 0.5) / float(DETECT_W)
        cy = (y + fh * 0.5) / float(DETECT_H)

        if not (0.45 <= cx <= 0.745 and 0.15 <= cy <= max_cy):
            continue

        eye_dist = abs(le_x - re_x)
        if eye_dist < fw * 0.12:
            continue
        min_eye_x = min(re_x, le_x)
        max_eye_x = max(re_x, le_x)
        if not (min_eye_x - fw * 0.16 <= nose_x <= max_eye_x + fw * 0.16):
            continue

        candidates.append({
            "cx": round(float(cx), 4),
            "cy": round(float(cy), 4),
            "fw": round(float(fw) / float(DETECT_W), 4),
            "fh": round(float(fh) / float(DETECT_H), 4),
            "fw_px": int(round(fw)),
            "fh_px": int(round(fh)),
            "score": round(float(score), 3),
        })

    return candidates


def send_trigger_async(mode, note, file_paths, recognition=None):
    def _worker():
        try:
            payload = json.dumps({
                "testMode": (mode == "SINOV"),
                "note": note,
                "files": file_paths,
                "recognition": recognition,
            }).encode("utf-8")
            req = urllib.request.Request(
                BFF_TRIGGER_URL,
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=25.0) as resp:
                body = resp.read().decode("utf-8", errors="replace")
                print(
                    f"[{get_istanbul_now().isoformat()}] TRIGGERED ({mode}, {len(file_paths)} file, "
                    f"rec={recognition.get('studentName') if recognition else None}): {body[:200]}",
                    flush=True,
                )
        except Exception as e:
            print(f"[{get_istanbul_now().isoformat()}] Trigger send error: {e}", flush=True)

    t = threading.Thread(target=_worker, daemon=True)
    t.start()


UPLOADS_PROFILE_DIR = "/var/www/mezana-crm/backend/uploads/profile-pictures"


def annotate_gate_frame(frame, person_rec, person_idx, total_people):
    """Highlight the detected face with a green box and overlay the matched database portrait in bottom-left."""
    out = frame.copy()
    h, w = out.shape[:2]
    face_box = person_rec.get("faceBox") or {}
    pct = person_rec.get("similarityPct", 0)
    cx = face_box.get("cx", 0.5) * w
    cy = face_box.get("cy", 0.4) * h
    scale = w / 1280.0
    fw = face_box.get("fw_px", 40) * scale * 1.35
    fh = face_box.get("fh_px", 50) * scale * 1.35
    x1 = max(0, int(cx - fw * 0.5))
    y1 = max(0, int(cy - fh * 0.5))
    x2 = min(w - 1, int(cx + fw * 0.5))
    y2 = min(h - 1, int(cy + fh * 0.5))
    color = (0, 230, 64) if person_rec.get("recognized") else (0, 190, 255)
    cv2.rectangle(out, (x1, y1), (x2, y2), color, 3)
    label = f"#{person_idx}/{total_people} ({pct}%)" if total_people >= 2 else (f"{pct}%" if pct else "")
    if label:
        cv2.putText(out, label, (x1, max(26, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.78, color, 2, cv2.LINE_AA)

    if person_rec.get("photo") and person_rec.get("similarityPct", 0) >= 50:
        bname = os.path.basename(person_rec.get("photo"))
        db_path = os.path.join(UPLOADS_PROFILE_DIR, bname)
        if bname and os.path.exists(db_path):
            portrait = cv2.imread(db_path)
            if portrait is not None:
                thumb_sz = int(min(w, h) * 0.26)
                thumb = cv2.resize(portrait, (thumb_sz, thumb_sz), interpolation=cv2.INTER_AREA)
                px1, py1 = 22, h - thumb_sz - 22
                px2, py2 = px1 + thumb_sz, py1 + thumb_sz
                cv2.rectangle(out, (px1 - 4, py1 - 32), (px2 + 4, py2 + 4), (20, 25, 30), -1)
                cv2.rectangle(out, (px1 - 4, py1 - 32), (px2 + 4, py2 + 4), (0, 230, 64), 2)
                out[py1:py2, px1:px2] = thumb
                cv2.putText(out, "BAZADAGI RASMI", (px1 + 6, py1 - 9), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 230, 64), 2, cv2.LINE_AA)
    return out


def capture_wave_and_send(stream: LiveGateStream, mode: str, trigger_ts: float, reason_note: str):
    def _capture_worker():
        try:
            # Wait 1.4s so the entering person(s) walk through the sweet-spot zone
            wait_sec = (trigger_ts + 1.45) - time.time()
            if wait_sec > 0:
                time.sleep(wait_sec)

            wave_frames = stream.get_frames_in_range(trigger_ts - 0.75, trigger_ts + 1.50)
            if len(wave_frames) > 10:
                step = max(1, len(wave_frames) // 10)
                wave_frames = wave_frames[::step]

            if not wave_frames:
                _, latest = stream.get_latest_frame()
                if latest is not None:
                    wave_frames = [latest]

            with recognizer_lock:
                rec_res = face_recognizer.recognize_frames(wave_frames)

            people = rec_res.get("people") or []
            if not people:
                print(f"[{get_istanbul_now().isoformat()}] SKIPPED EMPTY WAVE (no valid face in wave): {reason_note}", flush=True)
                return

            batch_id = int(time.time() * 1000)
            total_people = len(people)

            for idx, person_rec in enumerate(people, start=1):
                best_idx = person_rec.get("bestFrameIdx", 0)
                if 0 <= best_idx < len(wave_frames):
                    best_frame = wave_frames[best_idx]
                else:
                    best_frame = wave_frames[0]

                fb = person_rec.get("faceBox") or {}
                if fb.get("fw_px", 0) < 22 or fb.get("score", 0) < 0.58:
                    continue

                frame_to_save = annotate_gate_frame(best_frame, person_rec, idx, total_people)
                if total_people >= 2:
                    person_note = f"{reason_note} [Guruh bo'lib kirish: {idx}/{total_people}-shaxs]"
                else:
                    person_note = reason_note

                file_path = os.path.join(GATE_UPLOAD_DIR, f"gate_{batch_id}_p{idx}.jpg")
                cv2.imwrite(file_path, frame_to_save, [int(cv2.IMWRITE_JPEG_QUALITY), 92])

                print(
                    f"[{get_istanbul_now().isoformat()}] WAVE PERSON #{idx}/{total_people}: "
                    f"recognized={person_rec.get('recognized')} "
                    f"student={person_rec.get('studentName')} "
                    f"cosine={person_rec.get('cosine')} "
                    f"pct={person_rec.get('similarityPct')}%",
                    flush=True,
                )
                send_trigger_async(mode, person_note, [file_path], person_rec)
        except Exception as e:
            print(f"[{get_istanbul_now().isoformat()}] Wave capture error: {e}", flush=True)

    threading.Thread(target=_capture_worker, daemon=True).start()


def main():
    print(
        f"[{get_istanbul_now().isoformat()}] Upgraded 1-Photo + MultiFace Gate Detector started "
        f"(res={DETECT_W}x{DETECT_H}, poll={POLL_INTERVAL_SEC}s, gallery={len(face_recognizer.students)} students)",
        flush=True,
    )
    stream = LiveGateStream()
    last_wave_ts = 0.0
    last_processed_frame_ts = 0.0
    tracks = []
    next_track_id = 1

    while True:
        active, mode = is_active_window()
        if not active:
            tracks = []
            time.sleep(3.0)
            continue

        try:
            frame_ts, img = stream.get_latest_frame()
            if img is None or frame_ts <= last_processed_frame_ts:
                time.sleep(0.05)
                continue
            last_processed_frame_ts = frame_ts
            now_ts = time.time()

            faces = find_entering_faces(img)
            tracks = [t for t in tracks if (now_ts - t["last_ts"]) <= TRACK_TTL_SEC]

            used_track_ids = set()
            for face in faces:
                best_track = None
                best_dist = 999.0
                for t in tracks:
                    if t["id"] in used_track_ids:
                        continue
                    dx = abs(face["cx"] - t["last_cx"])
                    dy_step = face["cy"] - t["last_cy"]
                    if dx <= 0.14 and -0.02 <= dy_step <= 0.30:
                        dist = dx + abs(dy_step)
                        if dist < best_dist:
                            best_dist = dist
                            best_track = t

                if best_track is None:
                    if face["cy"] <= 0.38:
                        tracks.append({
                            "id": next_track_id,
                            "start_ts": now_ts,
                            "last_ts": now_ts,
                            "start_cy": face["cy"],
                            "last_cy": face["cy"],
                            "last_cx": face["cx"],
                            "max_score": face["score"],
                            "max_fw_px": face["fw_px"],
                            "hits": 1,
                            "captured": False,
                        })
                        used_track_ids.add(next_track_id)
                        next_track_id += 1
                else:
                    used_track_ids.add(best_track["id"])
                    if face["cy"] >= best_track["last_cy"] - 0.01:
                        best_track["hits"] += 1
                    best_track["last_cy"] = face["cy"]
                    best_track["last_cx"] = face["cx"]
                    best_track["last_ts"] = now_ts
                    if face["score"] > best_track["max_score"]:
                        best_track["max_score"] = face["score"]
                    if face["fw_px"] > best_track.get("max_fw_px", 0):
                        best_track["max_fw_px"] = face["fw_px"]

            if (now_ts - last_wave_ts) >= MIN_WAVE_GAP_SEC:
                confirmed_tracks = []
                for t in tracks:
                    if t["captured"]:
                        continue
                    total_dy = t["last_cy"] - t["start_cy"]
                    if (
                        t["hits"] >= 2
                        and total_dy >= 0.020
                        and t["start_cy"] <= 0.38
                        and t["last_cy"] >= 0.185
                        and t["max_score"] >= 0.60
                        and t.get("max_fw_px", 0) >= 24
                    ):
                        confirmed_tracks.append(t)

                if confirmed_tracks:
                    active_people_count = max(len(confirmed_tracks), len(faces), 1)
                    for t in tracks:
                        if t["last_cy"] >= 0.185 or t in confirmed_tracks:
                            t["captured"] = True

                    last_wave_ts = now_ts
                    best_t = max(confirmed_tracks, key=lambda item: item["max_score"])
                    reason = (
                        f"Eshikdan kirish aniqlandi (yuz={best_t['max_score']}, "
                        f"kadrdagi yuzlar={active_people_count})"
                    )
                    print(
                        f"[{get_istanbul_now().isoformat()}] ENTERING WAVE CONFIRMED: "
                        f"tracks={len(confirmed_tracks)} faces_now={len(faces)} "
                        f"start_cy={best_t['start_cy']} end_cy={best_t['last_cy']} "
                        f"score={best_t['max_score']} fw_px={best_t.get('max_fw_px')}",
                        flush=True,
                    )
                    capture_wave_and_send(stream, mode, now_ts, reason)

        except Exception as e:
            print(f"[{get_istanbul_now().isoformat()}] Detector warning: {e}", flush=True)

        time.sleep(POLL_INTERVAL_SEC)


if __name__ == "__main__":
    main()
