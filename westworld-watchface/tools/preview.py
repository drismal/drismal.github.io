#!/usr/bin/env python3
"""Rough desktop mock-up of the face (normal + AOD) from the generated assets."""
import os, sys
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W = int(sys.argv[1]) if len(sys.argv) > 1 else 480
A = os.path.join(ROOT, "assets", {480: "r480", 466: "r466"}[W])
import json
LAYOUT = json.loads(open(os.path.join(ROOT, "watchface", "metrics.js")).read().split("export const LAYOUT = ")[1])
s = W / 480; P = lambda v: int(round(v * s))
im = lambda f: Image.open(os.path.join(A, f)).convert("RGBA")
sys_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", P(24))
sys_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", P(15))

def row(canvas, x, y, files):
    for f in files:
        g = im(f); canvas.alpha_composite(g, (x, y)); x += g.width
    return x

def face(aod, frame=0, sec=12):
    c = Image.new("RGBA", (W, W), (0, 0, 0, 255))
    L = LAYOUT; tx = P(L["text_x"])
    pre = "a" if aod else ""
    if not aod:
        c.alpha_composite(im("bg.png"))
        r = im(f"anim/ring_{frame}.png"); c.alpha_composite(r, ((W - r.width) // 2,) * 2)
        sp = im("sec.png"); big = Image.new("RGBA", (W, W)); big.alpha_composite(sp, (W // 2 - sp.width // 2, W // 2 - sp.height))
        c.alpha_composite(big.rotate(-sec * 6, center=(W // 2, W // 2)))
    else:
        r = im("aod_ring.png"); r.putalpha(r.getchannel("A").point(lambda v: v * 0.6)); c.alpha_composite(r, ((W - r.width) // 2,) * 2)
    dp = "adt" if aod else "dt"
    row(c, tx, P(L["date_y"]), [f"{dp}_{'dot' if ch == '.' else ch}.png" for ch in "27.09.26"])
    bp = "aod" if aod else "big"
    row(c, tx - P(3), P(L["time_y"]), [f"{bp}_{'colon' if ch == ':' else ch}.png" for ch in "16:46"])
    c.alpha_composite(im(f"{pre}wk_5.png" if aod else "wk_5.png"), (tx, P(L["week_y"])))
    if not aod:
        d = ImageDraw.Draw(c)
        d.text((tx, P(L["city_y"]) + P(4)), "МОСКВА", font=sys_font, fill=(138, 138, 138))
        d.text((tx, P(L["coord_y"]) + P(3)), "55°45'N  037°37'E", font=sys_small, fill=(22, 22, 22))
        for x, val in zip(L["vitals_x"], [["7", "2"], ["8", "4", "2", "1"], ["8", "4", "pct"], ["1", "4", "deg"]]):
            files = [f"v_{v}.png" for v in val]
            w = sum(im(f).width for f in files)
            row(c, P(x) - w // 2, P(L["vitals_y"]), files)
    m = Image.new("L", (W, W), 0); ImageDraw.Draw(m).ellipse([0, 0, W - 1, W - 1], fill=255)
    out = Image.new("RGBA", (W, W), (30, 30, 30, 255)); out.paste(c, (0, 0), m)
    return out

sheet = Image.new("RGBA", (W * 2 + 20, W), (30, 30, 30, 255))
sheet.paste(face(False), (0, 0)); sheet.paste(face(True), (W + 20, 0))
out = os.path.join(ROOT, "preview", f"mockup_{W}.png"); os.makedirs(os.path.dirname(out), exist_ok=True)
sheet.convert("RGB").save(out)
frames = [face(False, i, 12 + i // 10).convert("P", palette=Image.ADAPTIVE) for i in range(20)]
frames[0].save(os.path.join(ROOT, "preview", f"anim_{W}.gif"), save_all=True, append_images=frames[1:], duration=100, loop=0)
print(out)
