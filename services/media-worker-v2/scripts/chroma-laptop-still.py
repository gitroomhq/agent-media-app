#!/usr/bin/env python3
"""
Single-frame chroma-key composite — paste the saas screenshot/asset
onto the magenta-colored laptop screen region of a pose still.

Output: a PNG identical to the input pose, with the magenta region
replaced by the (perspective-warped) saas asset.

Usage: chroma-laptop-still.py POSE_STILL_PNG SAAS_PNG OUT_PNG

Mirrors the per-frame logic in chroma-laptop.py but operates on still
images so the result can be passed to seedance-2.0-image-to-video as
a fully-composited starting frame (no magenta-bleed-through artifacts
in the first generated frames).
"""

import sys
import cv2
import numpy as np


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
        print("usage: chroma-laptop-still.py POSE_STILL SAAS OUTPUT", file=sys.stderr)
        sys.exit(2)
    pose_path, saas_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]

    frame = cv2.imread(pose_path)
    if frame is None:
        print(f"failed to read pose still: {pose_path}", file=sys.stderr)
        sys.exit(1)
    saas = cv2.imread(saas_path)
    if saas is None:
        print(f"failed to read saas image: {saas_path}", file=sys.stderr)
        sys.exit(1)

    H, W = frame.shape[:2]
    corners = detect_corners(frame)
    if corners is None:
        print("no magenta region detected — falling back to copy-as-is", file=sys.stderr)
        cv2.imwrite(out_path, frame)
        return

    paint_mask = make_paint_mask(frame)

    # Pre-resize the saas image to roughly destination quad size with INTER_AREA
    # before warp. Avoids aliasing on small UI elements at extreme downsample.
    dst_w = int(np.linalg.norm(corners[1] - corners[0]))
    dst_h = int(np.linalg.norm(corners[3] - corners[0]))
    target_w = max(dst_w * 2, 320)
    target_h = max(dst_h * 2, 180)
    saas_small = cv2.resize(saas, (target_w, target_h), interpolation=cv2.INTER_AREA)
    rh, rw = saas_small.shape[:2]
    src_quad = np.array([[0, 0], [rw, 0], [rw, rh], [0, rh]], dtype=np.float32)
    M = cv2.getPerspectiveTransform(src_quad, corners)
    warped = cv2.warpPerspective(saas_small, M, (W, H), flags=cv2.INTER_LANCZOS4)

    m3 = cv2.cvtColor(paint_mask, cv2.COLOR_GRAY2BGR) // 255
    out = (frame * (1 - m3) + warped * m3).astype(np.uint8)
    cv2.imwrite(out_path, out)


if __name__ == '__main__':
    main()
