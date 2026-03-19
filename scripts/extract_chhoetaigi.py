#!/usr/bin/env python3
"""
Extract entries from ChhoeTaigi Embree (1973) + Maryknoll (1976) dictionaries.

Sources (CC BY-SA 4.0 — ChhoeTaigi / 台文雞絲麵 Tâibûn Kesimī):
  https://github.com/ChhoeTaigi/ChhoeTaigiDatabase

These two dictionaries are the only ones in the ChhoeTaigi corpus that include
English definitions, making them ideal for learning games where the prompt is
shown in English.

Output: data/dialects/taiwanese_en/{a-e,f-j,k-o,p-s,t,u-z}.json
        dialectId = "taiwanese_en"

Usage:
    python3 scripts/extract_chhoetaigi.py
    (internet connection required — CSVs are fetched from GitHub)
"""

import csv
import io
import json
import re
import unicodedata
import urllib.request
from pathlib import Path

BASE = (
    "https://raw.githubusercontent.com/ChhoeTaigi/ChhoeTaigiDatabase"
    "/master/ChhoeTaigiDatabase"
)

SOURCES = [
    # (filename, short_name, source_tag)
    ("ChhoeTaigi_MaryknollTaiengSutian.csv",  "Maryknoll 1976", "maryknoll"),
    ("ChhoeTaigi_EmbreeTaiengSutian.csv",     "Embree 1973",    "embree"),
]

# Same buckets as taiwanese_moe — keeps the lazy-load pattern consistent
BUCKETS = [
    ("a-e", set("abcde")),
    ("f-j", set("fghij")),
    ("k-o", set("klmno")),
    ("p-s", set("pqrs")),
    ("t",   set("t")),
    ("u-z", set("uvwxyz")),
]

DIALECT_ID = "taiwanese_en"


# ── tone extraction ────────────────────────────────────────────────────────────

def extract_tone_from_input(poj_input: str) -> str:
    """
    The *Input columns use numeric tone markers, e.g. "a-bi2-pa".
    Take the first syllable of the first alternative and read its trailing digit.
    """
    if not poj_input:
        return ""
    # Take first alternative (slash-separated)
    first_alt = poj_input.split("/")[0].strip()
    # Take first syllable (hyphen/space separated)
    first_syl = re.split(r"[-\s]", first_alt)[0]
    # Trailing digit = tone number
    m = re.search(r"(\d)$", first_syl)
    if m:
        t = m.group(1)
        return t if t in {"1", "2", "3", "4", "5", "7", "8"} else t
    # No digit: check for stop final → tone 4; else tone 1
    clean = re.sub(r"[^a-zA-Z]", "", first_syl).lower()
    if clean and clean[-1] in {"p", "t", "k", "h"}:
        return "4"
    return "1"


# ── romanization helpers ───────────────────────────────────────────────────────

def first_alt(s: str) -> str:
    """Take the first slash-separated alternative."""
    return s.split("/")[0].strip() if s else ""


def strip_diacritics(s: str) -> str:
    nfd = unicodedata.normalize("NFD", s)
    return "".join(c for c in nfd if unicodedata.category(c) != "Mn")


def audio_hint(poj: str) -> str:
    return re.sub(r"[^a-z0-9\-]", "", strip_diacritics(poj).lower())


# ── bucketing ──────────────────────────────────────────────────────────────────

def bucket_for(poj: str) -> str:
    first = poj[0].lower() if poj else "_"
    for name, letters in BUCKETS:
        if first in letters:
            return name
    return "u-z"


# ── CSV fetch + parse ──────────────────────────────────────────────────────────

def fetch_csv(filename: str) -> list[dict]:
    url = f"{BASE}/{filename}"
    print(f"  Fetching {url} …")
    raw = urllib.request.urlopen(url).read().decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(raw))
    return list(reader)


# ── main ───────────────────────────────────────────────────────────────────────

def main():
    out_dir = Path(__file__).parent.parent / "data" / "dialects" / "taiwanese_en"
    out_dir.mkdir(exist_ok=True)

    buckets: dict[str, list] = {name: [] for name, _ in BUCKETS}
    # Seen set: (poj_normalised, hanzi) to de-dup across sources
    seen: set[tuple] = set()
    stats = {s: {"total": 0, "added": 0, "skipped_dup": 0, "skipped_no_data": 0}
             for _, _, s in SOURCES}

    for filename, label, source_tag in SOURCES:
        print(f"\nProcessing {label} …")
        rows = fetch_csv(filename)
        s = stats[source_tag]
        for row in rows:
            s["total"] += 1

            poj_raw  = row.get("PojUnicode", "").strip()
            kip_raw  = row.get("KipUnicode", "").strip()
            poj_inp  = row.get("PojInput",   "").strip()
            hanzi    = row.get("HoaBun",     "").strip()
            english  = row.get("EngBun",     "").strip()

            poj = first_alt(poj_raw)
            tl  = first_alt(kip_raw)

            if not poj or not english:
                s["skipped_no_data"] += 1
                continue

            # De-duplicate by (normalised-poj, hanzi)
            key = (strip_diacritics(poj).lower(), hanzi)
            if key in seen:
                s["skipped_dup"] += 1
                continue
            seen.add(key)

            tone = extract_tone_from_input(poj_inp)

            entry = {
                "dialectId": DIALECT_ID,
                "english":   english,
                "hanzi":     hanzi,
                "poj":       poj,
                "tl":        tl,
                "tone":      tone,
                "audioHint": audio_hint(poj),
                "audioUrl":  "",
                "tags":      [source_tag],
            }
            bucket = bucket_for(poj)
            buckets[bucket].append(entry)
            s["added"] += 1

    # ── write ──────────────────────────────────────────────────────────────────
    print()
    total_added = 0
    for name, entries in buckets.items():
        path = out_dir / f"{name}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(entries, f, ensure_ascii=False, separators=(",", ":"))
        size_kb = path.stat().st_size / 1024
        print(f"  {path.name}: {len(entries):6d} entries  ({size_kb:.0f} KB)")
        total_added += len(entries)

    total_kb = sum((out_dir / f"{n}.json").stat().st_size for n, _ in BUCKETS) / 1024
    print()
    print("─" * 55)
    for _, label, stag in SOURCES:
        s = stats[stag]
        print(f"  {label}:")
        print(f"    Total rows:      {s['total']:6d}")
        print(f"    Added:           {s['added']:6d}")
        print(f"    Skipped (dup):   {s['skipped_dup']:6d}")
        print(f"    Skipped (empty): {s['skipped_no_data']:6d}")
    print(f"\n  Total unique entries:   {total_added:6d}")
    print(f"  Total output size:      {total_kb:.0f} KB ({total_kb/1024:.1f} MB)")
    print("─" * 55)
    print(f"\nFiles written to {out_dir}")
    print("\nAttribution required (CC BY-SA 4.0):")
    print("  Maryknoll English-Taiwanese Dictionary (1976)")
    print("  Embree: A Dictionary of Southern Min (1973)")
    print("  Digitised by ChhoeTaigi / 台文雞絲麵 — https://github.com/ChhoeTaigi")


if __name__ == "__main__":
    main()
