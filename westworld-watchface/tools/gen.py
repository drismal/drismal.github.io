#!/usr/bin/env python3
"""Asset generator for the "Westworld / Host" Zepp OS watch face.

Renders every image the watch face needs for each target resolution
(background, animated ring frames, digit sets, weekday labels, AOD set)
and writes watchface/metrics.js with the pixel metrics used by index.js.

    pip install pillow numpy
    python3 tools/gen.py
"""
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(ROOT, "tools")

# target name -> screen size (round screens only)
TARGETS = {"r480": 480, "r466": 466}

FRAMES = 20          # ring animation frames (loop)
BG = (239, 239, 237)
INK = (22, 22, 22)
GREY = (128, 128, 128)
LIGHT = (160, 160, 160)

RING_R = 176         # ring radius in 480-units
RING_BOX = 440       # ring frame image size in 480-units


def font(weight, size):
    return ImageFont.truetype(os.path.join(TOOLS, f"barlow-condensed-latin-{weight}-normal.woff"), size)


class Ctx:
    def __init__(self, name, W):
        self.name, self.W, self.s = name, W, W / 480.0
        self.out = os.path.join(ROOT, "assets", name)
        os.makedirs(self.out, exist_ok=True)
        self.metrics = {}

    def P(self, v):
        return int(round(v * self.s))

    def save(self, img, fn):
        img.save(os.path.join(self.out, fn), optimize=True)
        return fn


# --------------------------------------------------------------- text images
def glyph_set(c, prefix, chars, weight, size480, color, cell_w480=None, extra=None, pad480=2):
    """Render each char into its own RGBA image with a shared height.
    Digits share one cell width so that numbers don't jitter."""
    f = font(weight, c.P(size480))
    asc, desc = f.getmetrics()
    top = f.getbbox("0")[1]
    h = f.getbbox("0")[3] - top + c.P(2)
    digit_w = max(f.getbbox(d)[2] - f.getbbox(d)[0] for d in "0123456789") + max(1, c.P(pad480))
    if cell_w480:
        digit_w = c.P(cell_w480)
    files = {}
    for ch in chars:
        name = extra.get(ch, ch) if extra else ch
        if ch == "°":  # not in the font subset: draw it
            rr = h * 0.13
            w = int(rr * 2 + c.P(6))
            img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
            ImageDraw.Draw(img).ellipse([c.P(2), c.P(1), c.P(2) + 2 * rr, c.P(1) + 2 * rr],
                                        outline=color + (255,), width=max(1, c.P(2)))
            files[ch] = c.save(img, f"{prefix}_{name}.png")
            continue
        bb = f.getbbox(ch)
        w = digit_w if ch.isdigit() else max(1, bb[2] - bb[0]) + c.P(4)
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        x = (w - (bb[2] - bb[0])) // 2 - bb[0]
        d.text((x, -top), ch, font=f, fill=color + (255,))
        files[ch] = c.save(img, f"{prefix}_{name}.png")
    return files, digit_w, h


def text_image(c, fn, text, weight, size480, color, tracking=0):
    f = font(weight, c.P(size480))
    top = f.getbbox("A")[1]
    h = f.getbbox("Ag")[3] - top + c.P(2)
    w = int(sum(f.getlength(ch) for ch in text) + tracking * len(text)) + c.P(4)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x = 0
    for ch in text:
        d.text((x, -top), ch, font=f, fill=color + (255,))
        x += f.getlength(ch) + tracking
    return c.save(img, fn), w, h


# --------------------------------------------------------------- ring
def periodic_noise(rng, theta, t, n_terms, kmin, kmax, mmax, falloff):
    """Smooth noise, periodic in theta (2pi) and in t (0..1)."""
    out = np.zeros_like(theta)
    for _ in range(n_terms):
        k = rng.integers(kmin, kmax + 1)
        m = rng.integers(-mmax, mmax + 1)
        ph = rng.uniform(0, 2 * np.pi)
        out += np.sin(k * theta + 2 * np.pi * m * t + ph) / (k ** falloff)
    return out / (np.abs(out).max() + 1e-6)


def wrap_noise(rng, shape):
    """Random grid, sampled with wrap-around bilinear interpolation."""
    return rng.random(shape).astype(np.float32)


def sample(grid, u, v):
    """u, v in grid cells; grid wraps in both directions."""
    gh, gw = grid.shape
    u0 = np.floor(u).astype(int)
    v0 = np.floor(v).astype(int)
    fu, fv = u - u0, v - v0
    fu = fu * fu * (3 - 2 * fu)
    fv = fv * fv * (3 - 2 * fv)
    a = grid[v0 % gh, u0 % gw]
    b = grid[v0 % gh, (u0 + 1) % gw]
    cc = grid[(v0 + 1) % gh, u0 % gw]
    d = grid[(v0 + 1) % gh, (u0 + 1) % gw]
    return (a * (1 - fu) + b * fu) * (1 - fv) + (cc * (1 - fu) + d * fu) * fv


def fbm(grids, th, rho, t):
    """Fractal noise over (angle, radial offset); rho flows outward with t
    and the field is periodic, so the animation loops seamlessly."""
    out = 0
    amp, tot = 1.0, 0
    for i, g in enumerate(grids):
        gh, gw = g.shape
        u = (th / (2 * np.pi)) * gw
        v = rho / 9.0 * (2 ** i) - t * gh
        out = out + amp * sample(g, u, v)
        tot += amp
        amp *= 0.62
    return out / tot


def render_ring(c, t, dark_bg=False):
    S = c.P(RING_BOX)
    R = RING_R * c.s
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    cx = cy = (S - 1) / 2.0
    dx, dy = xx - cx, yy - cy
    r = np.sqrt(dx * dx + dy * dy)
    th = np.arctan2(dx, -dy)  # 0 at 12 o'clock, clockwise

    rng = np.random.default_rng(11)
    grids = [wrap_noise(rng, (3 * 2 ** i, 90 * 2 ** i)) for i in range(5)]
    env_grid = wrap_noise(rng, (4, 9))

    # slow breathing of the line itself
    wob = (sample(env_grid, th / (2 * np.pi) * 9, np.full_like(th, t * 4)) - 0.5) * 2.4 * c.s
    rd = (r - R - wob) / c.s          # signed distance in 480-units
    # where the ring "burns": envelope along the circumference
    env = sample(env_grid, th / (2 * np.pi) * 9 + 3.3, np.full_like(th, t * 4 + 1.7))
    env = np.clip((env - 0.15) * 1.5, 0.08, 1.0)

    n = fbm(grids, th, np.abs(rd), t)
    reach = np.where(rd > 0, 24.0, 9.0) * env      # outward smoke is taller
    fall = np.clip(1 - np.abs(rd) / (reach + 1e-3), 0, 1)
    smoke = np.clip((n - 0.40) * 4.0, 0, 1) * fall ** 1.1 * 0.9

    core = np.exp(-(rd / 2.1) ** 2)
    halo = np.exp(-(rd / 4.5) ** 2) * 0.35

    # sharp waveform spikes (the ring in the show's title card)
    spikes = np.zeros_like(r)
    spike_defs = [(0.02, 30, 0.030), (0.36, 13, 0.045), (0.62, 16, 0.035), (0.98, 22, 0.040),
                  (1.12, 13, 0.030), (1.78, 12, 0.040), (3.98, 10, 0.050), (4.30, 15, 0.060)]
    for i, (a, h, wa) in enumerate(spike_defs):
        amp = h * (0.45 + 0.55 * (0.5 + 0.5 * math.sin(2 * math.pi * t * (1 + i % 3) + i * 1.7)))
        da = np.angle(np.exp(1j * (th - a)))
        prof = np.clip(1 - np.abs(da) / wa, 0, 1) ** 1.3
        top = amp * prof
        val = np.where((rd > 0) & (rd < top), 1 - rd / (top + 1e-3), 0) * prof
        spikes = np.maximum(spikes, val * 0.95)

    a = np.clip(np.maximum(core, halo + smoke) + spikes, 0, 1)
    img = np.zeros((S, S, 4), np.uint8)
    col = (170, 170, 170) if dark_bg else INK
    img[..., 0], img[..., 1], img[..., 2] = col
    img[..., 3] = (a * 255).astype(np.uint8)
    return Image.fromarray(img, "RGBA").filter(ImageFilter.GaussianBlur(0.35 * c.s))


# --------------------------------------------------------------- background
def hexagon(d, cx, cy, r, color, width):
    pts = [(cx + r * math.cos(math.pi / 3 * i), cy + r * math.sin(math.pi / 3 * i)) for i in range(7)]
    d.line(pts, fill=color, width=width)


def render_bg(c, L):
    W = c.W
    # soft studio vignette
    yy, xx = np.mgrid[0:W, 0:W].astype(np.float32)
    rr = np.sqrt((xx - W / 2) ** 2 + (yy - W / 2) ** 2) / (W / 2)
    v = np.clip(1 - 0.10 * rr ** 2.5, 0, 1)
    arr = np.stack([BG[i] * v for i in range(3)], -1).astype(np.uint8)
    img = Image.fromarray(arr, "RGB").convert("RGBA")
    d = ImageDraw.Draw(img)
    P = c.P
    lw = max(1, P(1))
    # leader line: ring anchor -> down-left -> along under the date
    ax, ay = L["anchor"]
    d.line([(P(ax), P(ay)), (P(L["elbow"][0]), P(L["elbow"][1])), (P(L["text_x"] + 4), P(L["elbow"][1]))],
           fill=(120, 120, 120), width=lw)
    hexagon(d, P(ax), P(ay), P(7), (110, 110, 110), lw)
    # bracket on the left of the text block, like the original title card
    bx = P(L["text_x"] - 8)
    d.line([(P(L["text_x"] + 4), P(L["elbow"][1])), (bx, P(L["elbow"][1] + 8)), (bx, P(L["bracket_bottom"])),
            (bx + P(5), P(L["bracket_bottom"] + 4))], fill=(150, 150, 150), width=lw)

    # small captions for the vitals row
    for (x, label) in zip(L["vitals_x"], ["BPM", "STEPS", "CORE", "EXT"]):
        fn, w, h = text_image(c, "_tmp.png", label, 500, 13, GREY, tracking=c.s * 1.2)
        lab = Image.open(os.path.join(c.out, fn))
        img.alpha_composite(lab, (P(x) - w // 2, P(L["vitals_label_y"])))
    # hairline separators between vitals
    for x in L["vitals_sep"]:
        d.line([(P(x), P(L["vitals_y"] + 2)), (P(x), P(L["vitals_label_y"] + 12))], fill=(185, 185, 185), width=lw)
    # tiny credits along the bottom
    fn, w, h = text_image(c, "_tmp.png", "DELOS INC.  //  HOST MONITOR", 500, 12, LIGHT, tracking=c.s * 1.5)
    lab = Image.open(os.path.join(c.out, fn))
    img.alpha_composite(lab, ((W - w) // 2, P(446)))
    os.remove(os.path.join(c.out, "_tmp.png"))
    return c.save(img.convert("RGB"), "bg.png")


def render_second_marker(c):
    """Pointer image: a small hex marker riding on the ring, pivot at bottom."""
    R = RING_R * c.s
    w = c.P(18)
    h = int(R + c.P(10))
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cy = h - R
    hexagon(d, w / 2, cy, c.P(6), INK + (255,), max(1, c.P(2)))
    d.ellipse([w / 2 - c.P(1.5), cy - c.P(1.5), w / 2 + c.P(1.5), cy + c.P(1.5)], fill=INK + (255,))
    c.save(img, "sec.png")
    return w, h


# --------------------------------------------------------------- main
LAYOUT = {
    # everything in 480-units, screen centre (240, 240)
    "anchor": (240 + RING_R * math.sin(math.radians(32)), 240 - RING_R * math.cos(math.radians(32))),
    "elbow": (300, 128),
    "text_x": 104,
    "date_y": 101,
    "time_y": 136,
    "week_y": 222,
    "city_y": 250,
    "coord_y": 286,
    "bracket_bottom": 306,
    "vitals_y": 326,
    "vitals_label_y": 352,
    "vitals_x": [146, 210, 274, 336],
    "vitals_sep": [178, 242, 305],
}


def build(name, W):
    c = Ctx(name, W)
    import shutil
    shutil.rmtree(c.out)
    os.makedirs(os.path.join(c.out, "anim"))
    m = c.metrics
    m["bg"] = render_bg(c, LAYOUT)

    for i in range(FRAMES):
        c.save(render_ring(c, i / FRAMES), f"anim/ring_{i}.png")
    c.save(render_ring(c, 0.0, dark_bg=True), "aod_ring.png")
    m["ring_box"] = c.P(RING_BOX)
    m["ring_frames"] = FRAMES
    m["sec_w"], m["sec_h"] = render_second_marker(c)
    m["ring_r"] = RING_R * c.s

    # big time digits (normal = black, aod = light grey)
    _, m["big_w"], m["big_h"] = glyph_set(c, "big", "0123456789:", 300, 104, INK, extra={":": "colon"})
    glyph_set(c, "aod", "0123456789:", 300, 104, (205, 205, 205), extra={":": "colon"})
    # date digits
    g, m["date_w"], m["date_h"] = glyph_set(c, "dt", "0123456789.", 500, 30, GREY, extra={".": "dot"})
    m["date_dot_w"] = Image.open(os.path.join(c.out, g["."])).width
    glyph_set(c, "adt", "0123456789.", 500, 30, (120, 120, 120), extra={".": "dot"})
    # vitals digits
    _, m["vit_w"], m["vit_h"] = glyph_set(c, "v", "0123456789-%°", 500, 25, INK, pad480=1,
                                         extra={"-": "minus", "%": "pct", "°": "deg"})
    text_image(c, "v_none.png", "--", 500, 25, LIGHT)
    Image.new("RGBA", (c.P(60), c.P(50)), (0, 0, 0, 0)).save(os.path.join(c.out, "click.png"))

    # weekday labels
    days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]
    for i, dname in enumerate(days):
        text_image(c, f"wk_{i}.png", dname, 500, 30, INK, tracking=c.s * 0.5)
        text_image(c, f"awk_{i}.png", dname, 500, 30, (150, 150, 150), tracking=c.s * 0.5)

    # preview / icon
    prev = Image.open(os.path.join(c.out, "bg.png")).convert("RGBA")
    ring = Image.open(os.path.join(c.out, "anim/ring_0.png"))
    off = (W - ring.width) // 2
    prev.alpha_composite(ring, (off, off))
    mask = Image.new("L", (W, W), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, W - 1, W - 1], fill=255)
    out = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    out.paste(prev, (0, 0), mask)
    c.save(out, "preview.png")
    c.save(out.resize((c.P(248), c.P(248)), Image.LANCZOS), "icon.png")
    return m


def main():
    metrics = {}
    for name, W in TARGETS.items():
        metrics[W] = build(name, W)
        print("built", name)
    layout = {k: v for k, v in LAYOUT.items()}
    with open(os.path.join(ROOT, "watchface", "metrics.js"), "w") as f:
        f.write("// generated by tools/gen.py - do not edit\n")
        f.write("export const METRICS = " + json.dumps(metrics, indent=2) + "\n")
        f.write("export const LAYOUT = " + json.dumps(layout, indent=2) + "\n")


if __name__ == "__main__":
    main()
