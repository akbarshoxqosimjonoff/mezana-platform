#!/usr/bin/env python3
import os
import sys
import json
import time
import subprocess
import cv2
import numpy as np

BASE_DIR = "/srv/data/apps/mezana-platform/apps/finance-bff"
YUNET_PATH = os.path.join(BASE_DIR, "yunet.onnx")
SFACE_PATH = os.path.join(BASE_DIR, "sface.onnx")
GALLERY_NPZ = os.path.join(BASE_DIR, "student_face_gallery.npz")
GALLERY_META = os.path.join(BASE_DIR, "student_face_gallery.json")
UPLOADS_DIR = "/var/www/mezana-crm/backend/uploads/profile-pictures"
DB_URL = "postgresql://akbar:WanE6Y3jcf6fXAMPWQ626n8ckDh6fRyA@127.0.0.1:5432/mezana"

# Doorway & corridor ROI on gate camera (excludes left glass booth and upper street lights)
ROI_X1, ROI_Y1, ROI_X2, ROI_Y2 = 0.42, 0.14, 0.86, 0.88


def sim_to_pct(cos_sim: float) -> int:
    """Convert SFace cosine similarity on CCTV frames (0.18..0.68) to intuitive confidence % (55..99%)."""
    if cos_sim <= 0.15:
        return max(10, int(round(cos_sim * 200)))
    if cos_sim < 0.28:
        pct = 52.0 + (cos_sim - 0.15) / 0.13 * 26.0
    else:
        pct = 78.0 + (min(cos_sim, 0.65) - 0.28) / 0.37 * 20.0
    return int(np.clip(round(pct), 10, 99))


def normalize_lighting_lab(bgr_img):
    """Normalize face luminance in LAB space to reduce lighting mismatch between night gate & portrait."""
    if bgr_img is None or bgr_img.size == 0:
        return bgr_img
    lab = cv2.cvtColor(bgr_img, cv2.COLOR_BGR2LAB)
    l_chan, a_chan, b_chan = cv2.split(lab)
    h, w = l_chan.shape[:2]
    center_l = l_chan[int(h * 0.2):int(h * 0.8), int(w * 0.2):int(w * 0.8)]
    med_l = float(np.median(center_l)) if center_l.size > 0 else float(np.median(l_chan))
    clamped = np.clip(med_l, 60.0, 205.0)
    gamma = float(np.clip(np.log(148.0 / 255.0) / np.log(clamped / 255.0), 0.68, 1.32))
    lut = np.array([np.clip(((i / 255.0) ** gamma) * 255.0, 0, 255) for i in range(256)], dtype=np.uint8)
    l_gamma = cv2.LUT(l_chan, lut)
    clahe = cv2.createCLAHE(clipLimit=1.2, tileGridSize=(4, 4))
    l_clahe = clahe.apply(l_gamma)
    l_final = cv2.addWeighted(l_gamma, 0.75, l_clahe, 0.25, 0)
    return cv2.cvtColor(cv2.merge([l_final, a_chan, b_chan]), cv2.COLOR_LAB2BGR)


def simulate_cctv_scale(aligned_112, target_px=42):
    small = cv2.resize(aligned_112, (target_px, target_px), interpolation=cv2.INTER_AREA)
    return cv2.resize(small, (112, 112), interpolation=cv2.INTER_LINEAR)


class StudentFaceRecognizer:
    def __init__(self):
        self.detector = cv2.FaceDetectorYN.create(YUNET_PATH, "", (640, 540), 0.50, 0.3, 10)
        self.recognizer = cv2.FaceRecognizerSF.create(SFACE_PATH, "")
        self.students = []
        self.feats_orig = None
        self.feats_flip = None
        self.feats_cctv = None
        self.gallery_mtime = 0.0

    def _unit(self, vec):
        v = vec.flatten().astype(np.float32)
        n = np.linalg.norm(v)
        return v / n if n > 0 else v

    def _extract_portrait_features(self, bgr_img):
        h, w = bgr_img.shape[:2]
        self.detector.setInputSize((w, h))
        _, faces = self.detector.detect(bgr_img)
        if faces is None or len(faces) == 0:
            return None, None
        best_f = max(faces, key=lambda f: float(f[2]) * float(f[3]) * float(f[14]))
        aligned = self.recognizer.alignCrop(bgr_img, best_f)
        aligned_norm = normalize_lighting_lab(aligned)
        f_sharp = self._unit(self.recognizer.feature(aligned_norm))

        aligned_cctv42 = simulate_cctv_scale(aligned_norm, 42)
        aligned_cctv34 = simulate_cctv_scale(aligned_norm, 34)
        f_c42 = self._unit(self.recognizer.feature(aligned_cctv42))
        f_c34 = self._unit(self.recognizer.feature(aligned_cctv34))
        f_cctv = self._unit(0.40 * f_sharp + 0.35 * f_c42 + 0.25 * f_c34)
        return f_sharp, f_cctv

    def build_gallery(self) -> int:
        sql = """
        SELECT s.id,
               REPLACE(s.fullname, '|', ' ') AS fullname,
               COALESCE(REPLACE(g.name, '|', ' '), 'Guruhsiz') AS grp,
               s."profilePicture",
               s."isActive",
               s."isDeleted"
        FROM "Student" s
        LEFT JOIN "Group" g ON g.id = s."groupId"
        WHERE s."profilePicture" IS NOT NULL AND s."profilePicture" != ''
        ORDER BY s."isActive" DESC, s."isDeleted" ASC, s.id ASC;
        """
        p = subprocess.run(["psql", DB_URL, "-t", "-A", "-F", "|", "-c", sql], capture_output=True, text=True)
        if p.returncode != 0:
            raise RuntimeError(f"psql failed: {p.stderr}")

        seen_photos = set()
        students = []
        feats_orig = []
        feats_flip = []
        feats_cctv = []

        for line in p.stdout.splitlines():
            parts = line.strip().split("|")
            if len(parts) < 6:
                continue
            sid, fullname, grp, rel_pic, is_active, is_deleted = parts[:6]
            if is_deleted == "t":
                continue
            bname = os.path.basename(rel_pic)
            if bname in seen_photos:
                continue
            fpath = os.path.join(UPLOADS_DIR, bname)
            if not os.path.exists(fpath):
                continue
            img = cv2.imread(fpath)
            if img is None:
                continue

            f_orig, f_cctv_o = self._extract_portrait_features(img)
            if f_orig is None:
                continue
            img_flip = cv2.flip(img, 1)
            f_flip, f_cctv_f = self._extract_portrait_features(img_flip)
            if f_flip is None:
                f_flip = f_orig.copy()
                f_cctv_f = f_cctv_o.copy()

            f_cctv_combined = self._unit(0.55 * f_cctv_o + 0.45 * f_cctv_f)

            seen_photos.add(bname)
            students.append({
                "studentId": int(sid),
                "studentName": fullname.strip(),
                "studentGroup": grp.strip(),
                "photo": rel_pic.strip(),
                "isActive": is_active == "t",
            })
            feats_orig.append(f_orig)
            feats_flip.append(f_flip)
            feats_cctv.append(f_cctv_combined)

        feats_orig_arr = np.vstack(feats_orig) if feats_orig else np.zeros((0, 128), dtype=np.float32)
        feats_flip_arr = np.vstack(feats_flip) if feats_flip else np.zeros((0, 128), dtype=np.float32)
        feats_cctv_arr = np.vstack(feats_cctv) if feats_cctv else np.zeros((0, 128), dtype=np.float32)

        np.savez(GALLERY_NPZ, feats_orig=feats_orig_arr, feats_flip=feats_flip_arr, feats_cctv=feats_cctv_arr)
        with open(GALLERY_META, "w", encoding="utf-8") as f:
            json.dump({"updatedAt": time.time(), "count": len(students), "students": students}, f, ensure_ascii=False, indent=2)

        self.students = students
        self.feats_orig = feats_orig_arr
        self.feats_flip = feats_flip_arr
        self.feats_cctv = feats_cctv_arr
        self.gallery_mtime = os.path.getmtime(GALLERY_NPZ)
        return len(students)

    def ensure_gallery_loaded(self):
        if not os.path.exists(GALLERY_NPZ) or not os.path.exists(GALLERY_META):
            self.build_gallery()
            return
        mtime = os.path.getmtime(GALLERY_NPZ)
        if self.feats_orig is None or mtime > self.gallery_mtime:
            data = np.load(GALLERY_NPZ)
            with open(GALLERY_META, "r", encoding="utf-8") as f:
                meta = json.load(f)
            self.students = meta["students"]
            self.feats_orig = data["feats_orig"]
            self.feats_flip = data["feats_flip"]
            self.feats_cctv = data["feats_cctv"] if "feats_cctv" in data else data["feats_orig"]
            self.gallery_mtime = mtime

    def detect_faces_in_roi(self, bgr_img):
        """
        Ultra-fast doorway ROI detection (~6 ms): crops ONLY the doorway corridor (640x540)
        instead of resizing/scanning the entire 1920x1080 image, and computes face sharpness.
        """
        if bgr_img is None:
            return [], None
        h, w = bgr_img.shape[:2]
        rx1, ry1 = int(w * ROI_X1), int(h * ROI_Y1)
        rx2, ry2 = int(w * ROI_X2), int(h * ROI_Y2)
        roi = bgr_img[ry1:ry2, rx1:rx2]
        if roi.size == 0:
            return [], None

        rh, rw = roi.shape[:2]
        det_w = 640
        det_h = int(round(rh * det_w / float(rw)))
        roi_resized = cv2.resize(roi, (det_w, det_h), interpolation=cv2.INTER_LINEAR)
        self.detector.setInputSize((det_w, det_h))
        _, faces = self.detector.detect(roi_resized)
        if faces is None or len(faces) == 0:
            return [], roi_resized

        scale_to_1280 = 1280.0 / float(w) * (float(rw) / float(det_w))
        results = []
        for f in faces:
            fx, fy, fw, fh = [float(v) for v in f[0:4]]
            score = float(f[14])
            fw_1280 = fw * scale_to_1280
            fh_1280 = fh * scale_to_1280
            if fw_1280 < 22.0 or fh_1280 < 26.0 or score < 0.56:
                continue

            # Normalized coordinates in full frame
            cx_full = ROI_X1 + ((fx + fw * 0.5) / det_w) * (ROI_X2 - ROI_X1)
            cy_full = ROI_Y1 + ((fy + fh * 0.5) / det_h) * (ROI_Y2 - ROI_Y1)
            if cy_full < 0.16:
                continue

            # Compute sharpness (Laplacian variance) on face patch (~0.1 ms)
            x1 = max(0, int(fx))
            y1 = max(0, int(fy))
            x2 = min(det_w, int(fx + fw))
            y2 = min(det_h, int(fy + fh))
            patch = roi_resized[y1:y2, x1:x2]
            if patch.size == 0:
                continue
            gray = cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY)
            sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
            sweet_mult = 1.25 if (0.20 <= cy_full <= 0.62) else 0.85
            quality = (fw_1280 * fh_1280) * (score ** 2) * (min(sharpness, 250.0) ** 0.5) * sweet_mult

            results.append({
                "raw_face": f,
                "fw_px": round(fw_1280, 1),
                "fh_px": round(fh_1280, 1),
                "score": round(score, 3),
                "cx": round(cx_full, 4),
                "cy": round(cy_full, 4),
                "sharpness": round(sharpness, 1),
                "quality": round(quality, 1),
            })

        return results, roi_resized

    def match_single_aligned_face(self, roi_resized, raw_face):
        """Run SFace ONCE on the single sharpest face crop (~15 ms) and compare against all 102 students (~0.05 ms)."""
        aligned = self.recognizer.alignCrop(roi_resized, raw_face)
        aligned_norm = normalize_lighting_lab(aligned)
        feat = self._unit(self.recognizer.feature(aligned_norm))

        sims_o = np.dot(self.feats_orig, feat)
        sims_f = np.dot(self.feats_flip, feat)
        sims_c = np.dot(self.feats_cctv, feat)
        sims = np.maximum(np.maximum(sims_o, sims_f), sims_c)

        top_indices = np.argsort(sims)[::-1][:3]
        candidates = []
        for idx in top_indices:
            sim_val = float(sims[idx])
            if sim_val < 0.20:
                continue
            st = self.students[int(idx)]
            candidates.append({
                "studentId": st["studentId"],
                "studentName": st["studentName"],
                "studentGroup": st["studentGroup"],
                "photo": st["photo"],
                "cosine": round(sim_val, 4),
                "similarityPct": sim_to_pct(sim_val),
            })

        if not candidates:
            return {"recognized": False, "candidates": []}

        best = candidates[0]
        second_cos = candidates[1]["cosine"] if len(candidates) > 1 else 0.0
        is_recognized = best["cosine"] >= 0.285 or (best["cosine"] >= 0.265 and (best["cosine"] - second_cos) >= 0.02)

        return {
            "recognized": bool(is_recognized),
            "studentId": best["studentId"],
            "studentName": best["studentName"],
            "studentGroup": best["studentGroup"],
            "photo": best["photo"],
            "cosine": best["cosine"],
            "similarityPct": best["similarityPct"],
            "candidates": candidates,
        }

    def recognize_frames(self, frames_or_paths):
        """
        Pick the single sharpest frame across the wave (and separate multi-face people if >1 person enters),
        and run SFace only on the sharpest crop per person (~20 ms total!).
        """
        self.ensure_gallery_loaded()
        if self.feats_orig is None or len(self.students) == 0:
            return {"recognized": False, "reason": "empty_gallery", "candidates": []}

        # Cluster detected faces into person tracks across the frames (handles multi-face!)
        person_clusters = []  # each cluster: {"last_cx", "last_cy", "best_quality", "best_det", "best_roi", "best_idx", "best_path"}

        for idx, item in enumerate(frames_or_paths):
            img = cv2.imread(item) if isinstance(item, str) else item
            if img is None:
                continue
            dets, roi_resized = self.detect_faces_in_roi(img)
            for d in dets:
                # Match to existing person cluster if close horizontally/vertically
                matched_cluster = None
                best_dist = 999.0
                for cl in person_clusters:
                    dx = abs(d["cx"] - cl["last_cx"])
                    dy = abs(d["cy"] - cl["last_cy"])
                    if dx <= 0.13 and dy <= 0.28 and (dx + dy) < best_dist:
                        best_dist = dx + dy
                        matched_cluster = cl

                if matched_cluster is None:
                    person_clusters.append({
                        "last_cx": d["cx"],
                        "last_cy": d["cy"],
                        "best_quality": d["quality"],
                        "best_det": d,
                        "best_roi": roi_resized,
                        "best_idx": idx,
                        "best_path": item if isinstance(item, str) else None,
                        "hits": 1,
                    })
                else:
                    matched_cluster["last_cx"] = d["cx"]
                    matched_cluster["last_cy"] = d["cy"]
                    matched_cluster["hits"] += 1
                    if d["quality"] > matched_cluster["best_quality"]:
                        matched_cluster["best_quality"] = d["quality"]
                        matched_cluster["best_det"] = d
                        matched_cluster["best_roi"] = roi_resized
                        matched_cluster["best_idx"] = idx
                        matched_cluster["best_path"] = item if isinstance(item, str) else None

        if not person_clusters:
            return {"recognized": False, "reason": "no_face_in_frames", "candidates": [], "people": []}

        # Sort clusters by quality descending
        person_clusters.sort(key=lambda c: c["best_quality"], reverse=True)

        # Deduplicate clusters that end up recognizing the same student
        people_results = []
        seen_student_ids = set()
        for cl in person_clusters[:4]:
            match_res = self.match_single_aligned_face(cl["best_roi"], cl["best_det"]["raw_face"])
            sid = match_res.get("studentId")
            if sid and sid in seen_student_ids and len(people_results) > 0:
                continue
            if sid:
                seen_student_ids.add(sid)
            match_res["bestFrameIdx"] = cl["best_idx"]
            match_res["bestFramePath"] = cl["best_path"]
            match_res["faceBox"] = {
                "fw_px": cl["best_det"]["fw_px"],
                "fh_px": cl["best_det"]["fh_px"],
                "score": cl["best_det"]["score"],
                "sharpness": cl["best_det"]["sharpness"],
                "quality": cl["best_det"]["quality"],
                "cx": cl["best_det"]["cx"],
                "cy": cl["best_det"]["cy"],
            }
            people_results.append(match_res)

        primary = dict(people_results[0])
        primary["people"] = people_results
        primary["multiFaceCount"] = len(people_results)
        return primary


if __name__ == "__main__":
    rec = StudentFaceRecognizer()
    if len(sys.argv) > 1 and sys.argv[1] == "--build":
        cnt = rec.build_gallery()
        print(json.dumps({"built": True, "count": cnt}))
    elif len(sys.argv) > 1:
        t0 = time.time()
        paths = [p for p in sys.argv[1:] if os.path.exists(p)]
        res = rec.recognize_frames(paths)
        res["elapsedMs"] = round((time.time() - t0) * 1000, 1)
        print(json.dumps(res, ensure_ascii=False))
    else:
        cnt = rec.build_gallery()
        print(json.dumps({"built": True, "count": cnt}))
