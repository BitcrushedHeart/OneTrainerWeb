import re
import time
import urllib.request
import urllib.error
from typing import Optional

from fastapi import APIRouter
from fastapi.responses import Response

router = APIRouter(prefix="/wiki", tags=["wiki"])

# Organized wiki page list with sections (matching the real wiki sidebar)
WIKI_SECTIONS: list[dict] = [
    {
        "title": "Getting Started",
        "pages": [
            "Home",
            "Onboarding-Guide-for-Newcomers",
            "The-Program",
            "Model-Support-Overview",
            "Diffusion-Models-Overview",
        ],
    },
    {
        "title": "Configuration",
        "pages": [
            "General",
            "Model",
            "Data",
            "Concepts",
            "Aspect-Ratio-Bucketing",
            "How-to-setup-and-evaluate-validation-datasets",
            "Prior-Prediction",
            "How-Validation-works",
        ],
    },
    {
        "title": "Training",
        "pages": [
            "Training",
            "Optimizers",
            "Advanced-Optimizers",
            "Orthogonal-Optimizers",
            "Custom-Scheduler",
            "Quantization",
        ],
    },
    {
        "title": "Output & Tools",
        "pages": [
            "Sampling",
            "Backup-and-Save",
            "Tools",
        ],
    },
    {
        "title": "Methods",
        "pages": [
            "LoRA",
            "Embedding",
            "Additional-Embeddings",
        ],
    },
    {
        "title": "Model Guides",
        "pages": [
            "Flux",
            "Chroma",
            "Qwen-Image",
        ],
    },
    {
        "title": "Cloud & Remote",
        "pages": [
            "Cloud-Training",
            "Manually-setup-OneTrainer-in-Runpod",
            "Training-on-a-remote-Linux-Server",
        ],
    },
    {
        "title": "Guides & FAQ",
        "pages": [
            "F.A.Q.",
            "Lessons-Learnt-and-Tutorials",
            "Common-Mistakes-Coming-From-Kohya",
            "OneTrainer-March-2024-Guide",
        ],
    },
]

# Flat set of all valid slugs for lookup
_ALL_SLUGS: set[str] = set()
for _section in WIKI_SECTIONS:
    for _page in _section["pages"]:
        _ALL_SLUGS.add(_page)

# In-memory cache: slug -> (content, timestamp)
_cache: dict[str, tuple[str, float]] = {}
_CACHE_TTL = 3600  # 1 hour in seconds

_RAW_WIKI_BASE = "https://raw.githubusercontent.com/wiki/Nerogar/OneTrainer"


def _fetch_wiki_page(slug: str) -> Optional[str]:
    """Fetch a wiki page from GitHub. Returns markdown content or None on failure."""
    now = time.time()

    # Check cache first
    if slug in _cache:
        content, cached_at = _cache[slug]
        if now - cached_at < _CACHE_TTL:
            return content

    # Fetch from GitHub
    url = f"{_RAW_WIKI_BASE}/{slug}.md"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "OneTrainerWeb/1.0"})
        with urllib.request.urlopen(req, timeout=10) as response:
            content = response.read().decode("utf-8")
            _cache[slug] = (content, now)
            return content
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError):
        # If we have stale cached content, return it rather than nothing
        if slug in _cache:
            return _cache[slug][0]
        return None


def _rewrite_image_urls(content: str) -> str:
    """Rewrite image URLs in markdown/HTML to go through the local image proxy."""
    # Rewrite markdown images: ![alt](url)
    def _rewrite_md_img(m: re.Match) -> str:
        alt, url = m.group(1), m.group(2)
        if url.startswith(("http://", "https://")):
            proxy_url = f"/api/wiki/image?url={urllib.request.quote(url, safe='')}"
            return f"![{alt}]({proxy_url})"
        return m.group(0)

    content = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", _rewrite_md_img, content)

    # Rewrite HTML <img src="url"> tags
    def _rewrite_html_img(m: re.Match) -> str:
        url = m.group(1)
        if url.startswith(("http://", "https://")):
            proxy_url = f"/api/wiki/image?url={urllib.request.quote(url, safe='')}"
            return f'src="{proxy_url}"'
        return m.group(0)

    content = re.sub(r'src="([^"]+)"', _rewrite_html_img, content)

    return content


# In-memory image cache: url -> (content_type, bytes, timestamp)
_image_cache: dict[str, tuple[str, bytes, float]] = {}
_IMAGE_CACHE_TTL = 3600  # 1 hour


@router.get("/image")
def proxy_wiki_image(url: str) -> Response:
    """Proxy an external image to avoid CORS/hotlink issues."""
    now = time.time()

    # Only allow proxying from GitHub domains
    if not url.startswith(("https://github.com/", "https://raw.githubusercontent.com/", "https://user-images.githubusercontent.com/")):
        return Response(status_code=403, content="Forbidden: only GitHub image URLs are allowed")

    # Check cache
    if url in _image_cache:
        content_type, data, cached_at = _image_cache[url]
        if now - cached_at < _IMAGE_CACHE_TTL:
            return Response(content=data, media_type=content_type)

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "OneTrainerWeb/1.0"})
        with urllib.request.urlopen(req, timeout=15) as response:
            data = response.read()
            content_type = response.headers.get("Content-Type", "image/png")
            _image_cache[url] = (content_type, data, now)
            return Response(content=data, media_type=content_type)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError):
        # Return stale cache if available
        if url in _image_cache:
            content_type, data, _ = _image_cache[url]
            return Response(content=data, media_type=content_type)
        return Response(status_code=502, content="Failed to fetch image")


@router.get("/pages")
def list_wiki_pages() -> list[dict]:
    """Return the organized list of wiki pages grouped by section."""
    return WIKI_SECTIONS


@router.get("/pages/{slug:path}")
def get_wiki_page(slug: str) -> dict[str, str]:
    """Fetch and return the markdown content for a wiki page."""
    # Allow any slug — try to fetch it even if not in our list
    content = _fetch_wiki_page(slug)
    if content is None:
        content = (
            f"# {slug.replace('-', ' ')}\n\n"
            "This page could not be loaded from the OneTrainer wiki at this time. "
            "Please check your internet connection and try again, or visit the wiki directly at "
            f"[GitHub Wiki](https://github.com/Nerogar/OneTrainer/wiki/{slug})."
        )

    # Rewrite image URLs to go through the local proxy
    content = _rewrite_image_urls(content)

    return {"slug": slug, "content": content}
