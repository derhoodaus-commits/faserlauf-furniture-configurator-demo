"""End-to-end checks with Playwright (Python, Chromium + WebGL via SwiftShader).

Starts its own production server on a free port (with a temporary data folder), checks every page at
phone, tablet and desktop width (plus overflow at 320 px), walks the main journey
Home → Furniture → product page → configurator → quote request, and writes screenshots to screenshots/.

Usage:  python tests/e2e.py            (run `npm run build` first; `npm run test:e2e` does both)
Checks: HTTP status, console errors, horizontal scrolling, one h1, contrast (WCAG AA), tap targets,
        links, images, structured data, keyboard use, 3D viewer, URL sharing, validation, room mode,
        dimensions, compare, snapshot/PDF/GLB downloads, WebGL fallback, forms, server headers, page weight.
"""
import gzip
import io
import json
import os
import re
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "screenshots"
SHOTS.mkdir(exist_ok=True)
GL_ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--lang=en-US"]
WIDTHS = {"phone": (390, 844), "tablet": (768, 1024), "desktop": (1440, 900)}
PAGES = [
    ("home", "/"),
    ("furniture", "/furniture/"),
    ("product", "/furniture/dining-table/"),
    ("product-bookcase", "/furniture/bookcase/"),
    ("product-coffee-table", "/furniture/coffee-table/"),
    ("product-bench", "/furniture/bench/"),
    ("product-desk", "/furniture/desk/"),
    ("configurator", "/configurator/"),
    ("wood-and-finishes", "/wood-and-finishes/"),
    ("how-it-works", "/how-it-works/"),
    ("about", "/about/"),
    ("faq", "/faq/"),
    ("contact", "/contact/"),
    ("inquiry-sent", "/inquiry-sent/?ref=FL-ABC234&type=quote"),
    ("legal-notice", "/legal-notice/"),
    ("privacy", "/privacy/"),
    ("404", "/this-page-does-not-exist/"),
]
# Screenshots for these pages at all three widths (the other product pages are checked, not photographed)
SHOT_PAGES = {"home", "furniture", "product", "configurator", "wood-and-finishes", "how-it-works", "about", "faq", "contact",
              "inquiry-sent", "legal-notice", "privacy", "404"}
CONSENT = "try{localStorage.setItem('fl-consent-v1','necessary')}catch(e){}"

failures: list[str] = []
passes: list[str] = []
infos: list[str] = []


def check(cond, msg):
    (passes if cond else failures).append(msg)
    print(("  OK   " if cond else "  FAIL ") + msg, flush=True)


def info(msg):
    infos.append(msg)
    print("  INFO " + msg, flush=True)


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


CONTRAST_JS = r"""
() => {
  const lum = (c) => {
    const [r, g, b] = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
    return .2126 * r + .7152 * g + .0722 * b;
  };
  const parse = (s) => { const m = s.match(/[\d.]+/g); if (!m) return null; const v = m.map(Number);
    if (s.startsWith('color(srgb')) return [v[0] * 255, v[1] * 255, v[2] * 255, v.length > 3 ? v[3] : 1]; return v; };
  const bgOf = (el) => {
    while (el) {
      const st = getComputedStyle(el);
      if (st.backgroundImage && st.backgroundImage !== 'none' && !st.backgroundImage.startsWith('linear-gradient')) return null;
      const c = parse(st.backgroundColor);
      if (c && (c.length < 4 || c[3] > .5)) return c.slice(0, 3);
      el = el.parentElement;
    }
    return [255, 255, 255];
  };
  const bad = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const el = walker.currentNode.parentElement;
    if (!walker.currentNode.textContent.trim() || seen.has(el)) continue;
    seen.add(el);
    const st = getComputedStyle(el);
    // decorative text hidden from assistive technology is exempt (WCAG 1.4.3 "pure decoration")
    if (st.visibility === 'hidden' || st.display === 'none' || el.closest('[hidden],.visually-hidden,.hp,canvas,[aria-hidden=true]')) continue;
    if (parseFloat(st.opacity) < 0.5 || el.closest('button:disabled')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const bg = bgOf(el);
    if (!bg) continue;
    const fg = parse(st.color).slice(0, 3);
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
    const size = parseFloat(st.fontSize), bold = parseInt(st.fontWeight) >= 700;
    const need = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5;
    if (ratio < need) bad.push(`${el.tagName}.${el.className} "${el.textContent.trim().slice(0, 30)}" ${ratio.toFixed(2)} < ${need}`);
  }
  return bad;
}
"""

TAP_JS = r"""
() => [...document.querySelectorAll('a.btn, button, .site-nav a, .site-footer li a, select, .radio-card, .product-switch__item, .tool-btn, .icon-btn, .jump a')]
  .filter(e => e.offsetParent && !e.closest('.hp,[hidden],.cfg-presets'))
  .filter(e => { const r = e.getBoundingClientRect(); return r.height < 44 || r.width < 24; })
  .map(e => (e.textContent.trim() || e.getAttribute('aria-label') || e.className).slice(0, 30))
"""


def wait_viewer(page, timeout=90000):
    page.wait_for_selector(".cfg-viewer[data-state=ready]", timeout=timeout)


def scroll_through(page):
    """Scroll down step by step so lazy images load (for full-page screenshots and image checks)."""
    h = page.evaluate("document.documentElement.scrollHeight")
    y = 0
    while y < h:
        y += 700
        page.evaluate(f"window.scrollTo(0, {y})")
        page.wait_for_timeout(60)
        h = page.evaluate("document.documentElement.scrollHeight")
    page.wait_for_timeout(250)
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(150)


def main():
    if not (ROOT / "dist" / "server" / "entry.mjs").exists():
        print("Build output missing. Run `npm run build` first.")
        sys.exit(1)
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    data_dir = Path(tempfile.mkdtemp(prefix="faserlauf-e2e-"))
    env = {**os.environ, "PORT": str(port), "DATA_DIR": str(data_dir)}
    server = subprocess.Popen(["node", "server.mjs"], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(base + "/", timeout=1)
                break
            except Exception:
                time.sleep(0.1)
        # Optional: run only some sections, e.g. ONLY=journey,downloads python tests/e2e.py
        only = [x for x in os.environ.get("ONLY", "").split(",") if x]
        run = lambda name: not only or name in only  # noqa: E731
        if run("http"):
            http_checks(base)
        with sync_playwright() as p:
            browser = p.chromium.launch(args=GL_ARGS)
            if run("pages"):
                pages_at_all_widths(browser, base)
                narrow_phones(browser, base)
            if run("journey"):
                journey(browser, base, data_dir, "desktop")
                journey(browser, base, data_dir, "phone")
            if run("features"):
                configurator_features(browser, base)
            if run("downloads"):
                downloads(browser, base)
            if run("phone"):
                phone_configurator(browser, base)
            if run("fallback"):
                webgl_fallback(browser, base)
            if run("site"):
                site_features(browser, base)
            if run("links"):
                links_and_images(browser, base)
            if run("performance"):
                performance(browser, base)
            browser.close()
    finally:
        server.terminate()
        shutil.rmtree(data_dir, ignore_errors=True)
    print(f"\n{len(passes)} checks passed, {len(failures)} failed")
    if infos:
        print("\n".join("  · " + i for i in infos))
    if failures:
        print("\n".join("- " + f for f in failures))
        sys.exit(1)


# ---------------------------------------------------------------- HTTP level
def fetch(url, headers=None, method="GET"):
    req = urllib.request.Request(url, headers=headers or {}, method=method)

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k):
            return None

    opener = urllib.request.build_opener(NoRedirect)
    try:
        r = opener.open(req, timeout=10)
        return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def http_checks(base):
    print("\n— Server and HTTP")
    s, h, body = fetch(base + "/", {"Accept-Encoding": "gzip"})
    check(s == 200 and h.get("Content-Encoding") == "gzip", "HTML is served gzip-compressed")
    html = gzip.decompress(body).decode()
    check('http-equiv="content-security-policy"' in html and "script-src 'self'" in html, "Pages carry a Content Security Policy with script hashes")
    s, h, _ = fetch(base + "/", {"Accept-Encoding": "br, gzip"})
    check(h.get("Content-Encoding") == "br", "Brotli is preferred when the browser supports it")
    check(h.get("X-Content-Type-Options") == "nosniff" and "frame-ancestors 'none'" in h.get("Content-Security-Policy", ""), "Security headers are set (nosniff, frame-ancestors)")
    asset = re.search(r'/_astro/[^"]+\.css', html)
    if asset:
        _, ah, _ = fetch(base + asset.group(0))
        check("immutable" in ah.get("Cache-Control", ""), "Hashed assets are cached as immutable")
    s, _, body = fetch(base + "/this-page-does-not-exist/")
    check(s == 404 and b"Lost in the shavings" in body, "Unknown pages answer 404 with the custom page")
    s, _, _ = fetch(base + "/..%2f..%2fpackage.json")
    check(s == 404, "Path traversal is blocked")
    s, h, _ = fetch(base + "/about")
    check(s == 301 and h.get("Location") == "/about/", "Missing trailing slash redirects (301)")
    s, _, _ = fetch(base + "/api/inquiry")
    check(s == 405, "GET on the API answers 405")
    s, _, body = fetch(base + "/robots.txt")
    check(s == 200 and b"Disallow: /render/" in body and b"Sitemap:" in body, "robots.txt is served and points to the sitemap")
    s, _, body = fetch(base + "/sitemap-0.xml")
    sm = body.decode()
    check(s == 200 and "/furniture/dining-table/" in sm and "/configurator/" in sm, "Sitemap lists products and the configurator")
    check("/render/" not in sm and "/inquiry-sent/" not in sm and "/privacy/" not in sm, "Sitemap excludes utility and noindex pages")
    s, h, _ = fetch(base + "/generated/og/home.jpg")
    check(s == 200 and h.get("Content-Type") == "image/jpeg", "Open Graph image is served")


# ---------------------------------------------------------------- pages × widths
def pages_at_all_widths(browser, base):
    for label, (w, h) in WIDTHS.items():
        print(f"\n— All pages at {label} width ({w}px)")
        ctx = browser.new_context(viewport={"width": w, "height": h}, locale="en-US", device_scale_factor=1,
                                  is_mobile=label == "phone", has_touch=label != "desktop")
        ctx.add_init_script(CONSENT)
        page = ctx.new_page()
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        for name, path in PAGES:
            errors.clear()
            resp = page.goto(base + path, wait_until="networkidle")
            expected = 404 if name == "404" else 200
            check(resp.status == expected, f"[{label}] {name}: HTTP {resp.status}")
            if name == "configurator":
                wait_viewer(page)
                page.wait_for_timeout(500)
            else:
                scroll_through(page)
            overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            check(overflow <= 0, f"[{label}] {name}: no horizontal scrolling (overflow {overflow}px)")
            check(page.locator("h1").count() == 1, f"[{label}] {name}: exactly one h1")
            if name == "404":  # the browser logs the page's own 404 status as an error
                errors[:] = [e for e in errors if "status of 404" not in e]
            check(not errors, f"[{label}] {name}: no console errors {errors[:2]}")
            if label == "desktop":
                bad = page.evaluate(CONTRAST_JS)
                check(not bad, f"[{label}] {name}: text contrast WCAG AA {bad[:3]}")
            if label == "phone":
                small = page.evaluate(TAP_JS)
                check(not small, f"[{label}] {name}: tap targets ≥ 44px {small[:4]}")
            if name in SHOT_PAGES:
                page.screenshot(path=str(SHOTS / f"{name}-{label}.png"), full_page=name != "configurator")
        ctx.close()


def narrow_phones(browser, base):
    print("\n— Narrow phones (320px): overflow only")
    ctx = browser.new_context(viewport={"width": 320, "height": 640}, locale="en-US", is_mobile=True, has_touch=True)
    ctx.add_init_script(CONSENT)
    page = ctx.new_page()
    for name, path in PAGES:
        page.goto(base + path, wait_until="networkidle")
        if name == "configurator":
            page.wait_for_selector(".cfg-panel", timeout=30000)
        overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check(overflow <= 0, f"[320px] {name}: no horizontal scrolling (overflow {overflow}px)")
    ctx.close()


# ---------------------------------------------------------------- main journey
def journey(browser, base, data_dir, label):
    w, h = WIDTHS[label]
    print(f"\n— Journey on {label}: home → furniture → product → configurator → quote request")
    ctx = browser.new_context(viewport={"width": w, "height": h}, locale="en-US", is_mobile=label == "phone", has_touch=label == "phone")
    ctx.add_init_script(CONSENT)
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(base + "/", wait_until="networkidle")
    if label == "phone":
        page.click("[data-menu-btn]")
    page.click(".site-nav a[href='/furniture/']")
    page.wait_for_url("**/furniture/")
    check(page.locator(".product-card").count() == 5, f"[{label}] Furniture page lists 5 pieces")
    page.click(".product-card h2 a[href='/furniture/dining-table/']")
    page.wait_for_url("**/furniture/dining-table/")
    crumbs = page.locator(".breadcrumbs li").all_inner_texts()
    check(crumbs == ["Home", "Furniture", "Spree dining table"], f"[{label}] Product page has breadcrumbs {crumbs}")
    from_price = page.locator(".product__from").inner_text()
    check(from_price.startswith("from €"), f"[{label}] Product page shows a starting price ({from_price})")
    page.click("[data-configure]")
    page.wait_for_url("**/configurator/**")
    wait_viewer(page)
    check("p=dining-table" in page.url, f"[{label}] Configurator opens with the dining table (URL)")
    check(page.locator(".cfg-title").inner_text().startswith("Spree dining table"), f"[{label}] Configurator shows the Spree dining table")
    total_el = page.locator(".cfg-mobilebar__amount") if label == "phone" else page.locator("[data-testid=total]")
    before = total_el.inner_text()

    length = page.get_by_role("spinbutton", name="Length")
    length.fill("240")
    length.press("Enter")
    page.wait_for_timeout(400)
    after = total_el.inner_text()
    check(after != before, f"[{label}] Price updates live ({before} → {after})")
    check("l=240" in page.url, f"[{label}] Length is mirrored into the URL")
    page.get_by_role("tab", name="Wood").click()
    page.locator("label.radio-card", has_text="Walnut").click()
    page.wait_for_timeout(300)
    check("wood=walnut" in page.url, f"[{label}] Wood choice is mirrored into the URL")
    wait_viewer(page)
    page.get_by_role("tab", name="Review").click()
    check(page.locator(".spec-list").inner_text().find("Walnut") >= 0, f"[{label}] Review step shows the specification")
    if label == "phone":
        check(page.locator(".cfg-mobilebar").is_visible(), "[phone] Price bar is always visible at the bottom")
        page.locator(".cfg-mobilebar .btn--primary").click()
    else:
        page.locator(".pricebox .btn--primary").click()
    final_total = total_el.inner_text()
    dialog = page.locator("dialog.inquiry")
    dialog.wait_for(state="visible")
    img = dialog.locator(".inquiry__config img")
    check(img.count() == 1 and img.get_attribute("src").startswith("data:image/jpeg"), f"[{label}] Quote dialog shows an image of the configuration")
    dialog.locator("button[type=submit]").click()
    check(dialog.locator(".form-errors").is_visible(), f"[{label}] Empty request shows an error summary")
    check(dialog.locator("[aria-invalid=true]").count() >= 3, f"[{label}] Invalid fields are marked aria-invalid")
    if label == "desktop":
        page.screenshot(path=str(SHOTS / "configurator-quote-errors-desktop.png"))
    dialog.locator("input[name=name]").fill("Alex Example")
    dialog.locator("input[name=email]").fill("alex@example.com")
    dialog.locator("input[name=postcode]").fill("12059")
    dialog.locator("textarea[name=message]").fill("Third floor, no lift.")
    dialog.locator("input[name=consent]").check()
    if label == "phone":
        page.screenshot(path=str(SHOTS / "configurator-quote-phone.png"))
    dialog.locator("button[type=submit]").click()
    page.wait_for_url("**/inquiry-sent/**", timeout=20000)
    ref = page.locator("[data-ref]").inner_text()
    check(re.fullmatch(r"FL-[A-Z2-9]{6}", ref) is not None, f"[{label}] Confirmation page shows the reference {ref}")
    saved = data_dir / "inquiries" / f"{ref}.json"
    check(saved.exists(), f"[{label}] Request stored on the server")
    if saved.exists():
        d = json.loads(saved.read_text(encoding="utf-8"))
        check(d["config"]["species"] == "walnut" and d["config"]["lengthCm"] == 240, f"[{label}] Stored request contains the configuration")
        check((data_dir / "inquiries" / f"{ref}.jpg").exists(), f"[{label}] Stored request contains the image")
        check(d["contact"]["email"] == "alex@example.com", f"[{label}] Stored request contains the contact details")
        server_total = f"€{int(d['price']['total'] / 100 + 0.5):,}"
        check(server_total == final_total, f"[{label}] Server recalculated the same price as shown ({final_total})")
    check(not errors, f"[{label}] Journey without console errors {errors[:2]}")
    ctx.close()


# ---------------------------------------------------------------- configurator features
def configurator_features(browser, base):
    print("\n— Configurator features (desktop)")
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="en-US", accept_downloads=True)
    ctx.add_init_script(CONSENT)
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(base + "/configurator/?p=dining-table", wait_until="networkidle")
    wait_viewer(page)

    # Dimension labels
    check(page.locator(".dim-label").count() == 3, "Dimension lines are shown with 3 labels")
    labels = page.locator(".dim-label").all_inner_texts()
    check("200 cm" in labels and "90 cm" in labels and "75 cm" in labels, f"Labels show the dimensions {labels}")
    page.get_by_role("button", name="Dimensions").click()
    page.wait_for_timeout(200)
    check(page.locator(".dim-label").count() == 0 and "dims=0" in page.url, "Dimensions can be hidden (and the URL remembers it)")
    page.get_by_role("button", name="Dimensions").click()

    # Input validation: out-of-range value is corrected with a note
    length = page.get_by_role("spinbutton", name="Length")
    length.fill("999")
    length.blur()
    page.wait_for_timeout(200)
    check(length.input_value() == "300", "Out-of-range length is corrected to the maximum (300 cm)")
    check("outside 120–300 cm" in page.locator(".field-note").first.inner_text(), "Correction is explained next to the field")

    # Impossible combination: thin top on a long trestle span
    page.get_by_role("tab", name="Build").click()
    page.locator("label.radio-card", has_text="Trestle base").click()
    page.get_by_role("tab", name="Size").click()
    page.locator(".radio-cards--compact label.radio-card", has_text="20 mm").click()
    page.wait_for_timeout(300)
    err = page.locator(".issue--error")
    check(err.count() >= 1 and "cannot span" in err.first.inner_text(), "Thin top over a long span shows a blocking error")
    check("35 mm" in err.first.inner_text() or "40 mm" in err.first.inner_text() or "50 mm" in err.first.inner_text(), "Error suggests a sufficient thickness")
    check(page.locator(".pricebox .btn--primary").get_attribute("aria-disabled") == "true", "Quote request is disabled while the error exists")
    check(page.locator("#tab-size.has-error").count() == 1, "The step with the problem is flagged in the tabs")
    page.screenshot(path=str(SHOTS / "configurator-error-desktop.png"))
    # aria-disabled (not disabled): the button stays focusable and explains why; Playwright needs force for that
    page.locator(".pricebox .btn--primary").click(force=True)
    check(page.locator(".toast.is-visible").count() == 1 and not page.locator("dialog.inquiry").is_visible(), "Clicking request explains instead of opening the form")
    page.locator(".radio-cards--compact label.radio-card", has_text="50 mm").click()
    page.wait_for_timeout(300)
    check(page.locator(".issue--error").count() == 0, "Choosing 50 mm resolves the error")

    # Keyboard: tabs with arrow keys
    page.get_by_role("tab", name="Size").focus()
    page.keyboard.press("ArrowRight")
    check(page.evaluate("document.activeElement.id") == "tab-build" and page.locator("#panel-build").count() == 1, "Step tabs work with the arrow keys")
    names = [page.get_by_role("button", name=n).count() for n in ["Rotate left", "Rotate right", "Zoom in", "Zoom out", "Reset view"]]
    check(all(n == 1 for n in names), "Camera has keyboard-accessible buttons (rotate, zoom, reset)")
    page.get_by_role("button", name="Rotate left").click()
    page.get_by_role("button", name="Zoom in").click()
    page.wait_for_timeout(800)
    desc = page.locator(".cfg-viewer").get_attribute("aria-label")
    check(desc.startswith("3D view: Spree dining table, 300 × 90 × 75 cm"), f"3D view has a text alternative ({desc[:60]}…)")

    # Share link round trip in a fresh page
    page.wait_for_timeout(400)
    url = page.url
    total = page.locator("[data-testid=total]").inner_text()
    p2 = ctx.new_page()
    p2.goto(url, wait_until="networkidle")
    wait_viewer(p2)
    check(p2.locator("[data-testid=total]").inner_text() == total, f"Shared link restores the same configuration and price ({total})")
    check(p2.get_by_role("spinbutton", name="Length").input_value() == "300", "Shared link restores the dimensions")
    p2.close()

    # Room mode with wall colour and person
    page.get_by_role("button", name="Room").click()
    page.wait_for_selector(".cfg-room--overlay")
    page.locator(".cfg-room--overlay label[title='Sage']").click()
    page.get_by_role("button", name="Person 175 cm").click()
    page.wait_for_timeout(300)
    wait_viewer(page)
    page.wait_for_timeout(1200)
    check("room=1" in page.url and "wall=sage" in page.url and "person=1" in page.url, "Room mode, wall colour and person are in the URL")
    page.screenshot(path=str(SHOTS / "configurator-room-desktop.png"))

    # Compare: variant B side by side
    page.get_by_role("button", name="Studio").click()
    page.get_by_role("tab", name="Review").click()
    page.get_by_role("button", name="Compare with a variant").click()
    page.wait_for_timeout(300)
    check(page.locator(".variant-bar").is_visible() and page.locator(".variant-tag").count() == 2, "Compare shows variants A and B side by side")
    page.get_by_role("tab", name="Wood").click()
    page.locator("label.radio-card", has_text="Ash").click()
    page.get_by_role("tab", name="Size").click()
    length = page.get_by_role("spinbutton", name="Length")
    length.fill("200")
    length.press("Enter")
    page.get_by_role("tab", name="Review").click()
    page.wait_for_timeout(400)
    wait_viewer(page)
    page.wait_for_timeout(1000)
    diffs = page.locator(".compare-table tr.is-diff").count()
    check(diffs >= 3, f"Compare table highlights the differences ({diffs} rows)")
    check("compare=1" in page.url and "b=" in page.url, "Both variants are stored in the URL")
    page.screenshot(path=str(SHOTS / "configurator-compare-desktop.png"))
    page.get_by_role("button", name=re.compile(r"^A ")).click()
    page.get_by_role("tab", name="Size").click()
    check(page.get_by_role("spinbutton", name="Length").input_value() == "300", "Switching to A shows A's values")
    check(not errors, f"Configurator features without console errors {errors[:2]}")
    ctx.close()


def downloads(browser, base):
    print("\n— Snapshot, PDF quote and GLB export")
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="en-US", accept_downloads=True)
    ctx.add_init_script(CONSENT)
    page = ctx.new_page()
    page.goto(base + "/configurator/?p=desk&drawers=2&wood=oak&finish=oiled", wait_until="networkidle")
    wait_viewer(page)
    with page.expect_download() as d:
        page.get_by_role("button", name="Snapshot").first.click()
    data = Path(d.value.path()).read_bytes()
    check(data[:8] == b"\x89PNG\r\n\x1a\n" and d.value.suggested_filename.endswith(".png"), f"Snapshot downloads a PNG ({len(data) // 1024} KB, {d.value.suggested_filename})")
    w, h = struct.unpack(">II", data[16:24])
    check(w >= 800 and h >= 500, f"Snapshot has the size of the view ({w}×{h})")
    shutil.copy(d.value.path(), SHOTS / "snapshot-example.png")

    page.get_by_role("tab", name="Review").click()
    ui_total = page.locator(".price-table__total td").inner_text()  # with cents, as in the PDF
    with page.expect_download() as d:
        page.get_by_role("button", name="PDF quote").click()
    pdf = Path(d.value.path()).read_bytes()
    check(pdf[:5] == b"%PDF-", f"PDF quote downloads ({len(pdf) // 1024} KB)")
    try:
        import pdfplumber

        with pdfplumber.open(io.BytesIO(pdf)) as doc:
            text = "\n".join(p.extract_text() or "" for p in doc.pages)
            images = sum(len(p.images) for p in doc.pages)
            # Render page 1 for the screenshots folder
            doc.pages[0].to_image(resolution=110).save(str(SHOTS / "quote-pdf-page1.png"))
        check("Quote for your desk" in text and "DEMO PROJECT" in text, "PDF has the title and the demo label")
        check("Total incl. VAT" in text and ui_total in text, f"PDF total matches the configurator ({ui_total})")
        check("Cut list" in text and "Drawer front" in text and "Leg (tapered)" in text, "PDF contains the cut list")
        check(images >= 1, "PDF contains the image of the configuration")
    except ImportError:
        info("pdfplumber not installed: PDF content not checked")

    with page.expect_download() as d:
        page.get_by_role("button", name="3D file (GLB)").click()
    glb = Path(d.value.path()).read_bytes()
    check(glb[:4] == b"glTF" and struct.unpack("<I", glb[4:8])[0] == 2, f"GLB export is a glTF 2.0 binary ({len(glb) // 1024} KB)")
    jlen = struct.unpack("<I", glb[12:16])[0]
    gltf = json.loads(glb[20:20 + jlen])
    check(len(gltf.get("meshes", [])) >= 10 and len(gltf.get("images", [])) >= 2, f"GLB contains the parts and the wood textures ({len(gltf.get('meshes', []))} meshes, {len(gltf.get('images', []))} images)")
    names = {n.get("name", "") for n in gltf.get("nodes", [])}
    check("top" in names and not any("wall" in n for n in names), "GLB contains the furniture only (no room)")
    ctx.close()


def phone_configurator(browser, base):
    print("\n— Configurator on a phone")
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, locale="en-US", is_mobile=True, has_touch=True)
    ctx.add_init_script(CONSENT)
    page = ctx.new_page()
    page.goto(base + "/configurator/?p=bookcase", wait_until="networkidle")
    wait_viewer(page)
    stage = page.locator(".cfg-stage").bounding_box()
    bar = page.locator(".cfg-mobilebar").bounding_box()
    check(stage["height"] >= 300 and stage["y"] < 100, f"3D view takes the upper part of the screen ({stage['height']:.0f}px)")
    check(bar["y"] + bar["height"] <= 844 + 1 and page.locator(".cfg-mobilebar__amount").is_visible(), "Price and request button sit in a bar at the bottom")
    page.get_by_role("tab", name="Build").click()
    page.evaluate("window.scrollTo(0, 500)")
    page.wait_for_timeout(300)
    stage2 = page.locator(".cfg-stage").bounding_box()
    tabs = page.locator(".steps").bounding_box()
    check(stage2["y"] >= -1 and stage2["y"] <= 1, "3D view stays pinned while the options scroll")
    check(abs(tabs["y"] - (stage2["y"] + stage2["height"])) < 3, "Step tabs stay pinned under the 3D view")
    page.screenshot(path=str(SHOTS / "configurator-controls-phone.png"))
    page.locator(".stepper button[aria-label='Shelves: one more']").click()
    page.wait_for_timeout(300)
    check("shelves=5" in page.url, "Shelf stepper works with touch")
    # Touch rotate: a one-finger swipe on the 3D view must not scroll the page
    y0 = page.evaluate("window.scrollY")
    box = page.locator(".cfg-viewer").bounding_box()
    page.touchscreen.tap(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    check(page.evaluate("getComputedStyle(document.querySelector('.cfg-viewer')).touchAction") == "none", "3D view handles touch gestures itself (touch-action: none)")
    check(page.evaluate("window.scrollY") == y0, "Touching the 3D view doesn't scroll the page")
    page.evaluate("window.scrollTo(0, 0)")
    page.get_by_role("button", name="Room").click()
    page.wait_for_timeout(300)
    wait_viewer(page)
    page.wait_for_timeout(1000)
    page.screenshot(path=str(SHOTS / "configurator-room-phone.png"))
    page.get_by_role("tab", name="Review").click()
    page.get_by_role("button", name="Compare with a variant").click()
    page.wait_for_timeout(300)
    page.locator(".variant-bar .toggle input").uncheck()
    page.wait_for_timeout(200)
    check(page.locator(".variant-tag").count() == 0, "On the phone, A/B can be viewed one at a time (toggle)")
    page.locator(".variant-bar .toggle input").check()
    wait_viewer(page)
    page.wait_for_timeout(800)
    page.screenshot(path=str(SHOTS / "configurator-compare-phone.png"))
    ctx.close()

    ctx = browser.new_context(viewport={"width": 768, "height": 1024}, locale="en-US", has_touch=True)
    ctx.add_init_script(CONSENT)
    page = ctx.new_page()
    page.goto(base + "/configurator/?p=coffee-table&room=1&wall=clay&floor=terracotta&person=1", wait_until="networkidle")
    wait_viewer(page)
    page.wait_for_timeout(1000)
    page.screenshot(path=str(SHOTS / "configurator-room-tablet.png"))
    ctx.close()


def webgl_fallback(browser, base):
    print("\n— Without WebGL")
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="en-US")
    ctx.add_init_script(CONSENT)
    ctx.add_init_script("""
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...a) {
        if (String(type).startsWith('webgl') || type === 'experimental-webgl') return null;
        return orig.call(this, type, ...a);
      };""")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(base + "/configurator/?p=bench", wait_until="networkidle")
    page.wait_for_selector(".cfg-nowebgl")
    check("3D view not available" in page.locator(".cfg-nowebgl").inner_text(), "Without WebGL a clear message is shown")
    check(page.locator("[data-testid=total]").inner_text().startswith("€"), "Without WebGL the price and options still work")
    check(not errors, f"Without WebGL no console errors {errors[:2]}")
    page.screenshot(path=str(SHOTS / "configurator-no-webgl-desktop.png"))
    ctx.close()


# ---------------------------------------------------------------- site features
def site_features(browser, base):
    print("\n— Navigation, cookies, keyboard, forms, structured data")
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="en-US")
    page = ctx.new_page()
    page.goto(base + "/", wait_until="networkidle")
    banner = page.locator("#consent")
    check(banner.is_visible(), "Cookie notice appears on the first visit")
    page.screenshot(path=str(SHOTS / "cookie-notice-desktop.png"))
    page.click("[data-consent='necessary']")
    check(banner.is_hidden(), "Cookie notice closes after a choice")
    page.reload()
    check(banner.is_hidden(), "Cookie choice persists")
    page.click("footer [data-open-consent]")
    check(banner.is_visible(), "Cookie settings can be reopened from the footer")
    page.click("[data-consent='all']")
    check(page.evaluate("document.documentElement.dataset.consent") == "all", "Consent choice is applied")

    page.goto(base + "/", wait_until="networkidle")
    page.keyboard.press("Tab")
    check(page.evaluate("document.activeElement.className") == "skip-link", "First tab stop is the skip link")
    page.keyboard.press("Enter")
    check(page.evaluate("location.hash") == "#main", "Skip link jumps to the content")
    ring = page.evaluate("() => { const a = document.querySelector('.site-nav a'); a.focus(); return getComputedStyle(a).outlineStyle; }")
    check(ring != "none", "Focus ring visible on navigation links")

    # Structured data
    page.goto(base + "/furniture/desk/", wait_until="networkidle")
    lds = [json.loads(s) for s in page.eval_on_selector_all("script[type='application/ld+json']", "els => els.map(e => e.textContent)")]
    prod = next((d for d in lds if d.get("@type") == "Product"), None)
    check(prod is not None and prod["offers"]["@type"] == "AggregateOffer" and float(prod["offers"]["lowPrice"]) > 0, "Product pages have Product structured data with prices")
    check(any(d.get("@type") == "BreadcrumbList" for d in lds), "Product pages have BreadcrumbList structured data")
    page.goto(base + "/faq/", wait_until="networkidle")
    lds = [json.loads(s) for s in page.eval_on_selector_all("script[type='application/ld+json']", "els => els.map(e => e.textContent)")]
    check(any(d.get("@type") == "FAQPage" and len(d["mainEntity"]) >= 10 for d in lds), "FAQ page has FAQPage structured data")
    titles = set()
    descs = set()
    for name, path in PAGES:
        page.goto(base + path, wait_until="domcontentloaded")
        titles.add(page.title())
        descs.add(page.eval_on_selector("meta[name=description]", "e => e.content"))
    check(len(titles) == len(PAGES) and len(descs) == len(PAGES), f"Every page has its own title and meta description ({len(titles)}/{len(PAGES)})")

    # Phone menu
    mctx = browser.new_context(viewport={"width": 390, "height": 844}, locale="en-US", is_mobile=True, has_touch=True)
    mctx.add_init_script(CONSENT)
    mp = mctx.new_page()
    mp.goto(base + "/about/", wait_until="networkidle")
    mp.click("[data-menu-btn]")
    check(mp.locator("#site-nav").is_visible() and mp.get_attribute("[data-menu-btn]", "aria-expanded") == "true", "Phone menu opens")
    mp.screenshot(path=str(SHOTS / "menu-open-phone.png"))
    mp.keyboard.press("Escape")
    check(mp.locator("#site-nav").is_hidden(), "Escape closes the phone menu")
    mctx.close()

    # Contact form
    page.goto(base + "/contact/", wait_until="networkidle")
    page.click("[data-contact-form] button[type=submit]")
    check(page.locator("#form-errors").is_visible() and page.evaluate("document.activeElement.id") == "form-errors", "Empty contact form: error summary gets focus")
    check(page.locator("#c-email[aria-invalid=true]").count() == 1, "Contact form marks invalid fields")
    page.screenshot(path=str(SHOTS / "contact-errors-desktop.png"), full_page=True)
    page.fill("#c-name", "Robin Example")
    page.fill("#c-email", "robin@example.com")
    page.select_option("#c-topic", "custom")
    page.fill("#c-message", "Could you build a round dining table, 120 cm across?")
    page.check("#c-consent")
    page.click("[data-contact-form] button[type=submit]")
    page.wait_for_url("**/inquiry-sent/**")
    check("message" in page.locator("h1").inner_text().lower(), "Contact message leads to the confirmation page")
    page.goto(base + "/contact/?invalid=1", wait_until="networkidle")
    check(page.locator("#form-errors").is_visible(), "No-JavaScript fallback errors are explained on the form")
    page.goto(base + "/inquiry-sent/?ref=<script>&type=quote", wait_until="networkidle")
    check(page.locator("[data-ref-box]").is_hidden(), "Confirmation page ignores tampered references")
    ctx.close()


def links_and_images(browser, base):
    print("\n— Links and images")
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="en-US")
    ctx.add_init_script(CONSENT)
    page = ctx.new_page()
    hrefs = set()
    missing_alt = []
    broken_imgs = []
    for name, path in PAGES:
        page.goto(base + path, wait_until="networkidle")
        if name == "configurator":
            wait_viewer(page)
        else:
            scroll_through(page)
        # skip same-page anchors (the skip link on the 404 page would point to the 404 URL itself)
        hrefs.update(page.eval_on_selector_all("a[href]:not([href^='#'])", "els => els.map(e => e.href)"))
        for i in page.eval_on_selector_all("img", "els => els.map(e => ({src: e.currentSrc || e.src, alt: e.getAttribute('alt'), ok: e.complete && e.naturalWidth > 0}))"):
            if i["alt"] is None:
                missing_alt.append(f"{name}: {i['src']}")
            if not i["ok"]:
                broken_imgs.append(f"{name}: {i['src']}")
    check(not missing_alt, f"All images have an alt attribute (decorative ones empty) {missing_alt[:3]}")
    check(not broken_imgs, f"All images load {broken_imgs[:3]}")
    internal = sorted({h.split("#")[0] for h in hrefs if h.startswith(base)})
    broken = []
    for h in internal:
        r = page.request.get(h)
        if r.status != 200:
            broken.append(f"{h} → {r.status}")
    check(not broken, f"All {len(internal)} internal links return 200 {broken[:3]}")
    external = sorted({h for h in hrefs if not h.startswith(base)})
    info("external links (not fetched): " + (", ".join(sorted({h.split(':')[0] for h in external})) or "none"))
    ctx.close()


def performance(browser, base):
    print("\n— Page weight and 3D performance (local, headless; not a phone benchmark)")
    results = {}
    for name, path in [("home", "/"), ("product", "/furniture/dining-table/"), ("configurator", "/configurator/")]:
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        ctx.add_init_script(CONSENT)
        page = ctx.new_page()
        page.goto(base + path, wait_until="load")
        if name == "configurator":
            wait_viewer(page)
        page.wait_for_timeout(500)
        perf = page.evaluate("""() => { const n = performance.getEntriesByType('navigation')[0];
          const r = performance.getEntriesByType('resource');
          const js = r.filter(x => x.name.endsWith('.js'));
          return { load: n.loadEventEnd, bytes: n.transferSize + r.reduce((s, x) => s + (x.transferSize || 0), 0),
                   js: js.reduce((s, x) => s + (x.transferSize || 0), 0), requests: r.length + 1,
                   three: js.some(x => /Viewer|exporters/.test(x.name)) } }""")
        results[name] = perf
        info(f"{name}: {perf['bytes'] / 1024:.0f} KB transferred ({perf['js'] / 1024:.0f} KB JS), {perf['requests']} requests, load {perf['load']:.0f} ms")
        ctx.close()
    check(not results["home"]["three"] and not results["product"]["three"], "Pages without 3D don't load the 3D code")
    check(results["home"]["js"] < 20 * 1024, f"Home page ships less than 20 KB of JavaScript ({results['home']['js'] / 1024:.1f} KB)")
    check(results["home"]["bytes"] < 450 * 1024, "Home page under 450 KB")
    check(results["configurator"]["three"], "Configurator loads the 3D code")

    # Frame rate while orbiting (SwiftShader = software rendering on the CPU)
    for label, (w, h), q in [("desktop", (1440, 900), ""), ("phone", (390, 844), "")]:
        ctx = browser.new_context(viewport={"width": w, "height": h}, is_mobile=label == "phone", has_touch=label == "phone")
        ctx.add_init_script(CONSENT)
        page = ctx.new_page()
        page.goto(base + "/configurator/?p=bookcase" + q, wait_until="networkidle")
        wait_viewer(page)
        page.wait_for_timeout(500)
        box = page.locator(".cfg-viewer").bounding_box()
        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        page.evaluate("""() => { window.__frames = []; const loop = (t) => { window.__frames.push(t); if (window.__frames.length < 10000) requestAnimationFrame(loop); }; requestAnimationFrame(loop); }""")
        idle0 = page.evaluate("window.__frames.length")
        page.mouse.move(cx, cy)
        page.mouse.down()
        t0 = time.time()
        steps = 0
        while time.time() - t0 < 2.5:
            steps += 1
            page.mouse.move(cx + 200 * ((steps % 40) / 40), cy, steps=1)
            page.wait_for_timeout(16)
        page.mouse.up()
        stats = page.evaluate("""() => { const f = window.__frames; const d = f.slice(1).map((t, i) => t - f[i]);
            d.sort((a, b) => a - b); return { n: f.length, median: d[Math.floor(d.length / 2)], p95: d[Math.floor(d.length * .95)] } }""")
        info(f"{label}: while orbiting the bookcase in headless Chromium/SwiftShader: median frame {stats['median']:.1f} ms (~{1000 / max(stats['median'], 0.1):.0f} fps), 95th percentile {stats['p95']:.1f} ms")
        ctx.close()


if __name__ == "__main__":
    main()
