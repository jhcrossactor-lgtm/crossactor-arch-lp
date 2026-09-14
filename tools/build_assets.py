"""LP 用の素材を生成する。

    python tools/build_assets.py

assets/structure.webp       … 骨組みの写真（Wikimedia Commons, CC BY 3.0）
assets/credits.json         … 上記のクレジット（フッターに載せる）
assets/plan-lines.webp      … 自社の平面図をシアンの線画にしたもの
assets/room-*.webp          … 自社の360度写真 3枚（現状 / 家具削除 / スタイリング）
assets/render-living.webp   … 自社の完成パース
assets/logo-light.png       … ロゴの暗色背景用

自社素材は Google Drive のポートフォリオフォルダから読む。
取得した外部画像は assets/_raw/ に残すので、2回目以降はダウンロードを省略できる。

依存: pillow, numpy
"""

import json
import os
import urllib.parse
import urllib.request

import numpy as np
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
RAW = os.path.join(ASSETS, "_raw")
OWN = r"G:\google drive_jh\★　Crossactor\ポートフォリオ"

UA = {"User-Agent": "crossactor-arch-lp/1.0 (personal landing-page prototype)"}

# 骨組みの写真。ライセンスは Commons のメタデータから都度取り直す
STRUCTURE_FILE = ("25 Wood frame condominium construction in Canada - "
                  "apartment building construction in Fernie, British Columbia.jpg")


def fetch(url: str, timeout: int = 120) -> bytes:
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def load(path: str) -> Image.Image:
    return ImageOps.exif_transpose(Image.open(path)).convert("RGB")


def save_webp(im: Image.Image, name: str, quality: int = 80) -> None:
    out = os.path.join(ASSETS, name)
    im.save(out, "WEBP", quality=quality, method=6)
    print(f"  {name:22} {im.size}  {os.path.getsize(out) // 1024} KB")


def build_structure() -> None:
    """Commons から画像とライセンス情報を取得する。CC BY 以外になっていたら止める。"""
    api = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "format": "json", "titles": "File:" + STRUCTURE_FILE,
        "prop": "imageinfo", "iiprop": "url|extmetadata"})
    page = next(iter(json.loads(fetch(api, 45))["query"]["pages"].values()))
    info = page["imageinfo"][0]
    meta = info["extmetadata"]
    license_name = meta["LicenseShortName"]["value"]
    if not license_name.startswith("CC BY") or "SA" in license_name:
        raise RuntimeError(f"想定外のライセンスです: {license_name}")

    raw = os.path.join(RAW, "structure-F6.jpg")
    if not os.path.exists(raw):
        os.makedirs(RAW, exist_ok=True)
        with open(raw, "wb") as f:
            f.write(fetch(info["url"]))
    im = load(raw)
    im.thumbnail((2400, 2400), Image.LANCZOS)
    save_webp(im, "structure.webp", quality=82)

    import html
    import re
    creator = html.unescape(re.sub(r"<[^>]+>", "", meta["Artist"]["value"])).strip()
    credits = [{
        "file": "assets/structure.webp",
        "title": STRUCTURE_FILE,
        "creator": creator,
        "license": license_name,
        "license_url": meta.get("LicenseUrl", {}).get("value", ""),
        "source": info["descriptionurl"],
        "changes": "リサイズ・トリミング",
    }]
    with open(os.path.join(ASSETS, "credits.json"), "w", encoding="utf-8") as f:
        json.dump(credits, f, ensure_ascii=False, indent=1)
    print(f"  credits.json           {license_name} / {creator}")


def build_plan_lines() -> None:
    """白地に濃い線の平面図を、白を透明・線をシアンにした線画へ変換する。"""
    im = load(os.path.join(OWN, "heimenzu.jpg"))
    im.thumbnail((2000, 2000), Image.LANCZOS)
    lum = np.array(im.convert("L")).astype(np.float32)
    alpha = np.clip((255 - lum - 28) * 1.7, 0, 255).astype(np.uint8)
    rgba = np.dstack([np.zeros_like(alpha), np.full_like(alpha, 200), np.full_like(alpha, 255), alpha])
    save_webp(Image.fromarray(rgba, "RGBA"), "plan-lines.webp", quality=85)


def build_rooms() -> None:
    """3枚は同じ位置から撮った360度写真。同寸にそろえると比較スライダーで重なる。"""
    for src, name in (("genjoh.JPEG", "room-before.webp"),
                      ("sakujo.jpeg", "room-cleared.webp"),
                      ("hokuoh.jpeg", "room-styled.webp")):
        save_webp(load(os.path.join(OWN, src)).resize((1440, 720), Image.LANCZOS), name)


def build_render() -> None:
    im = load(os.path.join(OWN, "札幌市中央区北6条　1号地　リビング.png"))
    im.thumbnail((2400, 2400), Image.LANCZOS)
    save_webp(im, "render-living.webp", quality=82)


def build_logo() -> None:
    """暗色背景で沈む灰色の文字だけを明るくする。シアン・紫・緑の線は残す。"""
    im = np.array(Image.open(os.path.join(OWN, "新ロゴ.png")).convert("RGBA")).astype(np.float32)
    rgb, a = im[..., :3], im[..., 3]
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    gray = ((mx - mn) / np.maximum(mx, 1) < 0.18) & (a > 0)

    t = np.clip(((255 - rgb.mean(axis=2)) - 90) / (255 - 90), 0, 1)   # 暗い灰ほど明るくする
    light = np.array([232, 232, 240], np.float32)
    mid = np.array([138, 147, 168], np.float32)
    out = rgb.copy()
    out[gray] = mid + (light - mid) * t[gray][:, None]

    path = os.path.join(ASSETS, "logo-light.png")
    Image.fromarray(np.dstack([out, a]).clip(0, 255).astype(np.uint8), "RGBA").save(path, optimize=True)
    print(f"  logo-light.png         {os.path.getsize(path) // 1024} KB")


if __name__ == "__main__":
    os.makedirs(ASSETS, exist_ok=True)
    print("素材を生成します")
    build_structure()
    build_plan_lines()
    build_rooms()
    build_render()
    build_logo()
    print("完了")
