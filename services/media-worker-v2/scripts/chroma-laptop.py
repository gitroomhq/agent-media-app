#!/usr/bin/env python3
"""
Chroma-key composite for laptop-ugc pipeline.

Per-frame:
  1. Threshold magenta region in the animated pose video
  2. Find the laptop screen quad (4 corners) from the largest connected component
  3. Apply temporal smoothing on corners to remove jitter
  4. Perspective-warp the matching frame of the screen recording onto the quad
  5. Composite over the dilated paint mask

Usage: chroma-laptop.py POSE_ANIM_MP4 RECORDING_MP4 OUT_MP4
"""

import sys
import cv2
import numpy as np

EMA_ALPHA = 0.25  # corner smoothing weight

def order_corners(pts):
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).flatten()
    return np.array([
        pts[np.argmin(s)],   # TL
        pts[np.argmin(d)],   # TR
        pts[np.argmax(s)],   # BR
        pts[np.argmax(d)],   # BL
    ], dtype=np.float32)

def detect_corners(frame):
    b, g, r = cv2.split(frame)
    tight = ((b > 150) & (r > 150) & (g < 80)).astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    tight = cv2.morphologyEx(tight, cv2.MORPH_CLOSE, kernel)
    tight = cv2.morphologyEx(tight, cv2.MORPH_OPEN, kernel)
    contours, _ = cv2.findContours(tight, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    contour = max(contours, key=cv2.contourArea)
    if cv2.contourArea(contour) < 5000:
        return None
    peri = cv2.arcLength(contour, True)
    quad = None
    for eps in [0.005, 0.01, 0.02, 0.03, 0.05, 0.08]:
        approx = cv2.approxPolyDP(contour, eps * peri, True)
        if len(approx) == 4:
            quad = approx.reshape(4, 2).astype(np.float32)
            break
    if quad is None:
        rect = cv2.minAreaRect(contour)
        quad = cv2.boxPoints(rect).astype(np.float32)
    return order_corners(quad)

def make_paint_mask(frame):
    b, g, r = cv2.split(frame)
    loose = ((b.astype(int) + r.astype(int) - 2 * g.astype(int)) > 200).astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    loose = cv2.morphologyEx(loose, cv2.MORPH_CLOSE, kernel)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(loose, connectivity=8)
    if n > 1:
        sizes = stats[1:, cv2.CC_STAT_AREA]
        biggest = 1 + int(np.argmax(sizes))
        loose = (labels == biggest).astype(np.uint8) * 255
    return cv2.dilate(loose, kernel, iterations=2)

def main():
    if len(sys.argv) != 4:
        print("usage: chroma-laptop.py POSE_ANIM RECORDING OUTPUT", file=sys.stderr)
        sys.exit(2)
    pose_path, rec_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]

    pose = cv2.VideoCapture(pose_path)
    rec = cv2.VideoCapture(rec_path)

    fps = pose.get(cv2.CAP_PROP_FPS)
    W = int(pose.get(cv2.CAP_PROP_FRAME_WIDTH))
    H = int(pose.get(cv2.CAP_PROP_FRAME_HEIGHT))
    rec_fps = rec.get(cv2.CAP_PROP_FPS) or 30.0
    rec_n = int(rec.get(cv2.CAP_PROP_FRAME_COUNT))

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(out_path, fourcc, fps, (W, H))

    smoothed = None
    idx = 0
    while True:
        ok, frame = pose.read()
        if not ok:
            break
        raw = detect_corners(frame)
        if raw is None and smoothed is None:
            writer.write(frame)
            idx += 1
            continue
        if raw is not None:
            smoothed = raw if smoothed is None else (EMA_ALPHA * raw + (1 - EMA_ALPHA) * smoothed)

        paint_mask = make_paint_mask(frame)
        t = idx / fps
        rec_idx = int(t * rec_fps) % max(rec_n, 1)
        rec.set(cv2.CAP_PROP_POS_FRAMES, rec_idx)
        ok2, rec_frame = rec.read()
        if not ok2:
            rec.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ok2, rec_frame = rec.read()

        # Pre-resize recording to roughly destination quad size (INTER_AREA),
        # then warp — avoids aliasing on small UI elements
        dst_w = int(np.linalg.norm(smoothed[1] - smoothed[0]))
        dst_h = int(np.linalg.norm(smoothed[3] - smoothed[0]))
        target_w = max(dst_w * 2, 320)
        target_h = max(dst_h * 2, 180)
        rec_small = cv2.resize(rec_frame, (target_w, target_h), interpolation=cv2.INTER_AREA)
        rh, rw = rec_small.shape[:2]
        src_quad = np.array([[0, 0], [rw, 0], [rw, rh], [0, rh]], dtype=np.float32)
        M = cv2.getPerspectiveTransform(src_quad, smoothed)
        warped = cv2.warpPerspective(rec_small, M, (W, H), flags=cv2.INTER_LANCZOS4)

        m3 = cv2.cvtColor(paint_mask, cv2.COLOR_GRAY2BGR) // 255
        out_frame = (frame * (1 - m3) + warped * m3).astype(np.uint8)
        writer.write(out_frame)
        idx += 1

    writer.release()
    pose.release()
    rec.release()

if __name__ == '__main__':
    main()
