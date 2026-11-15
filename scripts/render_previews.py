"""Renders the website's preview images with the real 3D configurator (headless Chromium + WebGL).

Usage:  npm run generate:renders        (builds the site first)
        python scripts/render_previews.py --no-build

Writes  public/generated/renders/*.webp   product cards, gallery, home hero
        public/generated/og/*.jpg         Open Graph images (1200x630)

The list of images comes from scripts/render-jobs.ts (product defaults and the gallery data), so the
pictures always match the configurations shown on the site. Requires Python with `playwright` and
`Pillow`, and Chromium installed for Playwright (`python -m playwright install chromium`).
"""
import base64
import io
import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
RENDERS = ROOT / "public" / "generated" / "renders"
OG = ROOT / "public" / "generated" / "og"
GL_ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--lang=en-US"]
NPM = "npm.cmd" if os.name == "nt" else "npm"


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def font_face(family, path):
    data = base64.b64encode(path.read_bytes()).decode()
    return f"@font-face{{font-family:'{family}';src:url(data:font/woff2;base64,{data}) format('woff2');font-weight:100 900;}}"


def og_html(job, image_path):
    fonts = font_face("Fraunces", ROOT / "node_modules/@fontsource-variable/fraunces/files/fraunces-latin-soft-normal.woff2")
    fonts += font_face("Hanken", ROOT / "node_modules/@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2")
    img = base64.b64encode(image_path.read_bytes()).decode()
    logo = (ROOT / "public" / "favicon.svg").read_text(encoding="utf-8")
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{fonts}
    *{{box-sizing:border-box}} body{{margin:0;width:1200px;height:630px;background:#f4eee4;font-family:Hanken,sans-serif;color:#221a14;display:grid;grid-template-columns:520px 680px;overflow:hidden}}
    .t{{padding:56px 44px 48px 60px;display:flex;flex-direction:column}}
    .brand{{display:flex;align-items:center;gap:14px;font-family:Fraunces;font-size:34px;font-weight:600;font-variation-settings:'SOFT' 100}}
    .brand svg{{width:44px;height:44px}}
    .k{{margin-top:auto;font-size:22px;font-weight:700;color:#9c3f22;display:flex;align-items:center;gap:14px}}
    .k:before{{content:'';width:44px;height:12px;border-left:2px solid #9c3f22;border-right:2px solid #9c3f22;background:linear-gradient(#9c3f22,#9c3f22) center/100% 2px no-repeat}}
    h1{{font-family:Fraunces;font-weight:540;font-variation-settings:'SOFT' 60;font-size:52px;line-height:1.06;margin:14px 0 22px;letter-spacing:-.01em}}
    .d{{font-size:19px;color:#66574b;font-weight:600}}
    .i{{background:url(data:image/webp;base64,{img}) center/cover;border-left:1px solid #d8cbb8}}
    </style></head><body><div class="t"><div class="brand">{logo}Faserlauf</div>
    <div class="k">{job['kicker']}</div><h1>{job['title']}</h1><div class="d">Demo project · fictional workshop</div></div><div class="i"></div></body></html>"""


def main():
    if "--no-build" not in sys.argv:
        subprocess.run([NPM, "run", "build"], cwd=ROOT, check=True)
    jobs = json.loads(subprocess.run(["node", "scripts/render-jobs.ts"], cwd=ROOT, check=True, capture_output=True, text=True).stdout)
    RENDERS.mkdir(parents=True, exist_ok=True)
    OG.mkdir(parents=True, exist_ok=True)
    port = free_port()
    server = subprocess.Popen(["node", "server.mjs"], cwd=ROOT, env={**os.environ, "PORT": str(port)}, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    base = f"http://127.0.0.1:{port}"
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(base + "/", timeout=1)
                break
            except Exception:
                time.sleep(0.1)
        with sync_playwright() as p:
            browser = p.chromium.launch(args=GL_ARGS)
            only = [a for a in sys.argv[1:] if not a.startswith("--")]
            for job in jobs["renders"]:
                if only and job["name"] not in only:
                    continue
                t0 = time.time()
                ctx = browser.new_context(viewport={"width": job["width"], "height": job["height"]}, device_scale_factor=1, locale="en-US")
                page = ctx.new_page()
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.goto(f"{base}/render/?{job['query']}", wait_until="networkidle")
                page.wait_for_selector("html[data-ready='1']", timeout=120000)
                page.wait_for_timeout(400)
                png = page.screenshot(type="png")
                ctx.close()
                if errors:
                    raise SystemExit(f"{job['name']}: {errors}")
                img = Image.open(io.BytesIO(png)).convert("RGB")
                img.save(RENDERS / f"{job['name']}.webp", "WEBP", quality=80, method=6)
                print(f"  render {job['name']:<28} {job['width']}x{job['height']}  {time.time() - t0:.1f}s")
            for job in jobs["og"]:
                if only and job["name"] not in only:
                    continue
                ctx = browser.new_context(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
                page = ctx.new_page()
                page.set_content(og_html(job, RENDERS / f"{job['image']}.webp"), wait_until="load")
                page.wait_for_timeout(200)
                png = page.screenshot(type="png")
                ctx.close()
                Image.open(io.BytesIO(png)).convert("RGB").save(OG / f"{job['name']}.jpg", "JPEG", quality=86, optimize=True, progressive=True)
                print(f"  og     {job['name']}")
            browser.close()
    finally:
        server.terminate()


if __name__ == "__main__":
    main()
