"""Background photos from Pixabay (free for commercial use, no credit needed).

Rules built in:
- vertical photos only, SafeSearch on, a minimum height
- no photo whose tags mention people or brands (publicity and trademark rights)
- the same photo is never used in two videos (data/images_used.json, kept in the repo)
- downloads are cached in video/public/bg, so a re-render never calls the API again

    python -m engine.images "city skyline night" invest     test one search
"""
import hashlib
import json
import os
import sys

import requests
from dotenv import load_dotenv

from config import DATA_DIR, ROOT

load_dotenv()
API = "https://pixabay.com/api/"
BG_DIR = ROOT / "video" / "public" / "bg"
USED = DATA_DIR / "images_used.json"
MIN_HEIGHT = 1200

# Safe fallback searches per topic type, used when the script's own search finds nothing
SAFE_TERMS = {
    "invest": ["stock market chart screen", "city skyline night", "money cash dollars", "server room lights",
               "gold bars", "wall street building", "financial district skyscrapers"],
    "wb": ["world map globe", "city skyline aerial", "earth from space", "container port ships", "highway night city"],
    "gta": ["miami beach night", "sports car night city", "palm trees sunset", "neon street night",
            "city skyline sunset", "highway night lights"],
}
# Tags that disqualify a photo: people, body parts, brands and logos
BLOCKED = {
    "person", "people", "man", "men", "woman", "women", "girl", "boy", "child", "children", "kid", "baby",
    "face", "portrait", "model", "human", "crowd", "businessman", "businesswoman", "lady", "guy", "selfie",
    "hand", "hands", "couple", "family", "male", "female", "beauty", "fashion", "smile",
    "logo", "brand", "apple", "iphone", "samsung", "nike", "coca", "cola", "tesla", "bmw", "ferrari",
    "lamborghini", "porsche", "mercedes", "audi", "starbucks", "mcdonalds", "google", "microsoft", "amazon",
    "facebook", "nvidia", "playstation", "xbox", "nintendo", "rockstar",
}


def load_used():
    return json.loads(USED.read_text()) if USED.exists() else {}


def save_used(used):
    USED.write_text(json.dumps(used, indent=1, sort_keys=True))


def clean(hit):
    tags = {t.strip().lower() for t in hit.get("tags", "").split(",")}
    words = {w for t in tags for w in t.split()}
    return not (tags | words) & BLOCKED and hit.get("imageHeight", 0) >= MIN_HEIGHT


def search(query, per_page=40):
    key = os.environ.get("PIXABAY_API_KEY")
    if not key:
        raise RuntimeError("PIXABAY_API_KEY missing")
    r = requests.get(API, params={"key": key, "q": query[:100], "image_type": "photo", "orientation": "vertical",
                                  "safesearch": "true", "min_height": MIN_HEIGHT, "order": "popular",
                                  "per_page": per_page}, timeout=30)
    r.raise_for_status()
    return [h for h in r.json().get("hits", []) if clean(h)]


def download(hit):
    BG_DIR.mkdir(parents=True, exist_ok=True)
    path = BG_DIR / f"pix_{hit['id']}.jpg"
    if not path.exists():
        r = requests.get(hit["largeImageURL"], timeout=60)
        r.raise_for_status()
        path.write_bytes(r.content)
    return f"bg/{path.name}"


def background(query, recipe, topic):
    """A fresh, safe background for one scene. Returns a video/public path, or None if nothing fits
    (the scene then falls back to the blurred-logo backdrop)."""
    used = load_used()
    mine = {pid for pid, t in used.items() if t == topic}  # photos already picked for this topic (re-renders)
    queries = [query] + [q for q in SAFE_TERMS.get(recipe, []) if q != query]
    for q in queries:
        try:
            hits = search(q)
        except (requests.RequestException, RuntimeError) as e:
            print(f"  image search failed ({e.__class__.__name__}): {q}")
            return None
        fresh = [h for h in hits if str(h["id"]) not in used or str(h["id"]) in mine]
        if not fresh:
            continue
        # a stable pick per topic and search, so re-renders choose the same photo
        k = int(hashlib.md5(f"{topic}|{q}".encode()).hexdigest(), 16) % min(len(fresh), 8)
        hit = fresh[k]
        try:
            path = download(hit)
        except requests.RequestException as e:
            print(f"  image download failed ({e.__class__.__name__})")
            continue
        used[str(hit["id"])] = topic
        save_used(used)
        return path
    return None


if __name__ == "__main__":
    q = sys.argv[1] if len(sys.argv) > 1 else "city skyline night"
    rec = sys.argv[2] if len(sys.argv) > 2 else "invest"
    print(background(q, rec, "test_topic"))
