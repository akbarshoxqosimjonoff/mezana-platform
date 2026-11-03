#!/usr/bin/env python3
import os
import glob
import json
import time
from face_recognizer import StudentFaceRecognizer

LATE_PHOTOS_DIR = "/srv/data/apps/mezana-platform/apps/telegram-bot/late-photos"

def main():
    t0 = time.time()
    rec = StudentFaceRecognizer()
    rec.ensure_gallery_loaded()

    folders = sorted(
        glob.glob(os.path.join(LATE_PHOTOS_DIR, "inc_*")),
        key=lambda x: int(os.path.basename(x).split("_")[1]) if os.path.basename(x).split("_")[1].isdigit() else 0,
    )
    results = []
    for folder in folders:
        jpgs = sorted(glob.glob(os.path.join(folder, "*.jpg")))
        if not jpgs:
            continue
        res = rec.recognize_frames(jpgs)
        if not res.get("candidates"):
            continue
        fb = res.get("faceBox") or {}
        if fb.get("fw_px", 0) < 25 or fb.get("score", 0) < 0.65:
            continue
        results.append({
            "folder": os.path.basename(folder),
            "bestFrame": res.get("bestFramePath"),
            "faceBox": fb,
            "recognition": res,
        })

    results.sort(key=lambda r: (r["recognition"].get("cosine", 0.0), r["faceBox"].get("quality", 0.0)), reverse=True)
    elapsed = time.time() - t0
    print(f"Scanned {len(folders)} folders in {elapsed:.1f}s -> found {len(results)} clear face entries")
    for idx, r in enumerate(results[:35], start=1):
        rec_info = r["recognition"]
        fb = r["faceBox"]
        print(
            f"{idx:2d}. {r['folder']:8s} | best={os.path.basename(r['bestFrame'] or '')} "
            f"(fw={fb.get('fw_px')} score={fb.get('score')} sharp={fb.get('sharpness')}) -> "
            f"ID={rec_info.get('studentId')} {rec_info.get('studentName')} "
            f"[cos={rec_info.get('cosine')} pct={rec_info.get('similarityPct')}% multi={rec_info.get('multiFaceCount')}]"
        )

    with open("/tmp/past_incidents_scan.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()
