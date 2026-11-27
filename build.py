#!/usr/bin/env python3
"""Build 星鉴 into a multi-file site and a single self-contained HTML file."""

from __future__ import annotations

import base64
import re
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
SITE = DIST / "site"
CSS_FILES = ["fonts.css", "styles.css", "reading.css"]
JS_FILES = ["iztro.js", "star-library.js", "reading-library.js", "reading.js", "app.js"]
COPY_FILES = ["index.html", "styles.css", "reading.css", "fonts.css", *JS_FILES]
COPY_DIRS = ["assets", "art"]


def data_uri(path: Path, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def inline_css(name: str) -> str:
    css = (ROOT / name).read_text(encoding="utf-8")
    css = css.replace('url("./art/compass.svg")', f'url("{data_uri(ROOT / "art" / "compass.svg", "image/svg+xml")}")')
    css = css.replace('url("./art/paper.svg")', f'url("{data_uri(ROOT / "art" / "paper.svg", "image/svg+xml")}")')
    return css.replace("</style", "<\\/style")


def inline_js(name: str) -> str:
    js = (ROOT / name).read_text(encoding="utf-8")
    return re.sub(r"</script", r"<\\/script", js, flags=re.IGNORECASE)


def build_single_file() -> Path:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    # A single file uses inline styles/scripts, so the site CSP would block it.
    html = re.sub(r'\s*<meta http-equiv="Content-Security-Policy"[^>]*>', "", html)

    def replace_css(match: re.Match[str]) -> str:
        href = match.group(1)
        if href in CSS_FILES:
            return "<style>\n" + inline_css(href) + "\n</style>"
        return match.group(0)

    def replace_js(match: re.Match[str]) -> str:
        src = match.group(1)
        if src in JS_FILES:
            return "<script>\n" + inline_js(src) + "\n</script>"
        return match.group(0)

    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', replace_css, html)
    html = re.sub(r'<script(?: defer)? src="([^"]+)"></script>', replace_js, html)
    html = html.replace(
        'href="assets/favicon.svg"',
        f'href="{data_uri(ROOT / "assets" / "favicon.svg", "image/svg+xml")}"',
    )

    remaining = re.findall(r'(?:src|href)="(?!https?:|mailto:|#|data:)([^"]+)"', html)
    if remaining:
        raise SystemExit(f"Un-inlined local references remain: {sorted(set(remaining))}")

    target = DIST / "星鉴.html"
    target.write_text(html, encoding="utf-8")
    return target


def build_site() -> Path:
    if SITE.exists():
        shutil.rmtree(SITE)
    SITE.mkdir(parents=True)
    for name in COPY_FILES:
        shutil.copy2(ROOT / name, SITE / name)
    for name in COPY_DIRS:
        shutil.copytree(ROOT / name, SITE / name)
    (SITE / "robots.txt").write_text("User-agent: *\nAllow: /\n", encoding="utf-8")
    (SITE / ".nojekyll").write_text("", encoding="utf-8")
    (SITE / "README.txt").write_text(
        "星鉴 · 紫微斗数\n"
        "by 天水一壤\n\n"
        "入口：index.html\n"
        "直接把这个文件夹上传到任意静态托管即可；无需后端、无需登录。\n"
        "所有排盘与解读都在浏览器本地完成，不上传出生信息。\n",
        encoding="utf-8",
    )
    return SITE


def build_zip() -> Path:
    target = DIST / "星鉴-紫微斗数.zip"
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(SITE.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(SITE))
    return target


def main() -> None:
    DIST.mkdir(exist_ok=True)
    single = build_single_file()
    site = build_site()
    archive = build_zip()
    print(f"single: {single} ({single.stat().st_size / 1024:.0f} KB)")
    print(f"site:   {site}")
    print(f"zip:    {archive} ({archive.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
