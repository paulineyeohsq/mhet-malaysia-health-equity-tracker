"""
watch_backlog.py - notice when a dataset on the backlog (docs/DATA_BACKLOG.md) may have become available.

It changes nothing on the site and writes no data. It prints a JSON report; the weekly workflow turns every triggered
item into a GitHub issue (once) so a person can look. A trigger means "go and check", never "ingest".

Signals, per item:
  - catalogue: a dataset whose id or title matches the item's words appears in the data.gov.my or OpenDOSM catalogue;
  - edition: DOSM's page for a release newer than the one already reviewed now carries a real document (the not-yet-
    published stub is a ~15 KB placeholder PDF; a released report is much larger).
A check that cannot be completed (network error, page layout changed) reports "unknown" and never triggers.

Run: python3 scripts/watch_backlog.py
"""
from __future__ import annotations

import json
import re
import sys
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

UA = "malaysia-health-equity-tracker-watch/1.0 (+https://my-heo.netlify.app)"
CATALOGUES = ("https://data.gov.my/data-catalogue", "https://open.dosm.gov.my/data-catalogue")
DOSM_RELEASE = "https://www.dosm.gov.my/portal-main/release-content/{slug}"
DOSM_DOWNLOAD = "https://www.dosm.gov.my/site/downloadrelease?id={slug}&lang=English&admin_view="
PUBLISHED_MIN_BYTES = 50_000  # the "Article not yet published" placeholder is ~15 KB

BACKLOG = [
    {
        "id": "causes_of_death",
        "title": "Causes of death by state and district",
        "catalogue_words": [r"cause.*death", r"death.*cause", r"\bicd\b", r"sebab.*kematian"],
        "edition_slug": "statistics-on-causes-of-death-malaysia-{year}",
        "reviewed_editions": [2025],
    },
    {
        "id": "divorce_state",
        "title": "Divorces by state",
        "catalogue_words": [r"divorc", r"perceraian"],
        "edition_slug": "marriage-divorce-and-rujuk-statistics-malaysia-{year}",
        "reviewed_editions": [2025],
    },
    {
        "id": "disability_statistics",
        "title": "Persons with disabilities (OKU) by state",
        "catalogue_words": [r"disab", r"\boku\b", r"kurang upaya"],
        "edition_slug": "person-with-disability-statistics-malaysia-{year}",
        "reviewed_editions": [2024],
    },
]


def _get(url: str, timeout: int = 60) -> bytes:
    last: Exception | None = None
    for attempt in range(3):
        try:
            with urlopen(Request(url, headers={"User-Agent": UA}), timeout=timeout) as r:
                return r.read()
        except (HTTPError, URLError, TimeoutError, ConnectionError) as e:
            last = e
            if isinstance(e, HTTPError) and e.code == 404:
                raise
            time.sleep(2 * 3**attempt)
    assert last is not None
    raise last


def catalogue_entries() -> list[str]:
    """'id title' strings of every dataset in both catalogues, or raises if neither could be read."""
    out: list[str] = []
    ok = 0
    for url in CATALOGUES:
        try:
            html = _get(url).decode("utf-8", "replace")
            data = json.loads(re.search(r'__NEXT_DATA__[^>]*>(.*?)</script>', html, re.S).group(1))
        except Exception as e:  # noqa: BLE001
            print(f"warning: could not read {url}: {e}", file=sys.stderr)
            continue
        ok += 1

        def walk(o):
            if isinstance(o, dict):
                if isinstance(o.get("id"), str) and ("title" in o or "title_en" in o):
                    out.append(f"{o['id']} {o.get('title') or o.get('title_en') or ''}")
                for v in o.values():
                    walk(v)
            elif isinstance(o, list):
                for v in o:
                    walk(v)

        walk(data)
    if not ok:
        raise RuntimeError("neither catalogue could be read")
    return out


def edition_state(slug: str) -> dict:
    try:
        _get(DOSM_RELEASE.format(slug=slug))
    except HTTPError as e:
        if e.code == 404:
            return {"slug": slug, "exists": False, "published": False, "bytes": 0}
        raise
    size = len(_get(DOSM_DOWNLOAD.format(slug=slug), timeout=120))
    return {"slug": slug, "exists": True, "published": size >= PUBLISHED_MIN_BYTES, "bytes": size}


def main() -> int:
    this_year = datetime.now(timezone.utc).year
    try:
        entries = catalogue_entries()
    except Exception as e:  # noqa: BLE001
        entries = None
        print(f"warning: catalogue check skipped: {e}", file=sys.stderr)

    items = []
    for item in BACKLOG:
        signals = []
        status = "quiet"
        if entries is not None:
            hits = sorted({e for e in entries for w in item["catalogue_words"] if re.search(w, e, re.I)})
            if hits:
                signals.append({"kind": "catalogue", "detail": hits[:5]})
        else:
            status = "unknown"
        for year in range(max(item["reviewed_editions"]) + 0, this_year + 2):
            if year in item["reviewed_editions"]:
                continue
            slug = item["edition_slug"].format(year=year)
            try:
                st = edition_state(slug)
            except Exception as e:  # noqa: BLE001
                print(f"warning: could not check {slug}: {e}", file=sys.stderr)
                status = "unknown" if status == "quiet" else status
                continue
            if st["published"]:
                signals.append({"kind": "edition", "detail": st})
        if signals:
            status = "triggered"
        items.append({"id": item["id"], "title": item["title"], "status": status, "signals": signals})
    report = {"checked_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "items": items}
    print(json.dumps(report, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
