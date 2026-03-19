#!/usr/bin/env python3
"""
Extract all 14,489 entries from the MoE Taiwanese Hokkien dictionary
into slim split JSON files for use in the Hokkien Learning Center.

Source:  https://github.com/g0v/moedict-data-twblg
License: CC BY-ND 3.0 Taiwan (Ministry of Education, Taiwan)

Output: data/dialects/taiwanese_moe/{a-e,f-j,k-o,p-t,u-z}.json
        Each file has entries where tl starts with that letter range.

Usage:
    # Download the source data once:
    curl -o /tmp/dict-twblg.json \
        https://raw.githubusercontent.com/g0v/moedict-data-twblg/master/dict-twblg.json

    python3 scripts/extract_moedict.py
"""

import json
import os
import re
import unicodedata
from pathlib import Path

# ── MoE interlinear annotation characters ─────────────────────────────────────
SEP_A = '\ufff9'
SEP_B = '\ufffa'
SEP_C = '\ufffb'


def parse_moe_example(raw: str):
    if SEP_A in raw:
        parts = re.split('[' + SEP_A + SEP_B + SEP_C + ']', raw)
        hokkien = parts[1].strip() if len(parts) > 1 else ''
        tl      = parts[2].strip() if len(parts) > 2 else ''
        return hokkien, tl
    return raw.strip(), ''


def format_example(hokkien: str, tl: str) -> str:
    if hokkien and tl:
        return f"{hokkien} ({tl})"
    return hokkien or tl


def _is_full_sentence(hokkien: str) -> bool:
    return len(hokkien) >= 4 and hokkien[-1] in '。！？.,!?'


def best_example(hetero: dict) -> str:
    sentences = []
    short = []
    for defn in hetero.get('definitions', []):
        for raw in defn.get('example', []):
            hokkien, tl = parse_moe_example(raw)
            if not (hokkien and tl):
                continue
            ex = format_example(hokkien, tl)
            if _is_full_sentence(hokkien):
                sentences.append(ex)
            else:
                short.append(ex)
    return (sentences or short or [''])[0]


def strip_diacritics(s: str) -> str:
    nfd = unicodedata.normalize('NFD', s)
    return ''.join(c for c in nfd if unicodedata.category(c) != 'Mn')


def tl_to_audio_hint(tl: str) -> str:
    """Strip diacritics and punctuation for a bare pronunciation hint."""
    return re.sub(r'[^a-z0-9\-]', '', strip_diacritics(tl).lower())


def extract_tone(tl: str) -> str:
    """Extract Tâi-lô tone number (1–8) from the first syllable of a TL string.

    Tone marks confirmed in MoE data (via unicodedata analysis):
      U+0301 COMBINING ACUTE ACCENT       → tone 2
      U+0300 COMBINING GRAVE ACCENT       → tone 3
      U+0302 COMBINING CIRCUMFLEX ACCENT  → tone 5
      U+0304 COMBINING MACRON             → tone 7
      U+030D COMBINING VERTICAL LINE ABOVE → tone 8 (stop final + mark)
    Final stops (p/t/k/h) without vertical mark → tone 4
    No mark, no stop                            → tone 1
    """
    if not tl:
        return ""
    # Use only the first syllable (split on hyphen or space)
    first = re.split(r'[-\s]', tl.strip())[0]
    nfd = unicodedata.normalize('NFD', first)
    has_acute      = '\u0301' in nfd
    has_grave      = '\u0300' in nfd
    has_circumflex = '\u0302' in nfd
    has_macron     = '\u0304' in nfd
    has_vertical   = '\u030d' in nfd
    # Strip to bare ASCII letters to check final consonant
    clean = re.sub(r'[^a-zA-Z]', '', strip_diacritics(first).lower())
    ends_stop = bool(clean) and clean[-1] in {'p', 't', 'k', 'h'}
    if has_vertical and ends_stop:
        return "8"
    if ends_stop:
        return "4"
    if has_acute:
        return "2"
    if has_grave:
        return "3"
    if has_circumflex:
        return "5"
    if has_macron:
        return "7"
    return "1"


# ── alphabet buckets (by first letter of tl) ──────────────────────────────────
# Hokkien TL has many t-/ts-/tsh- words, so 't' gets its own bucket.
BUCKETS = [
    ('a-e', set('abcde')),
    ('f-j', set('fghij')),
    ('k-o', set('klmno')),
    ('p-s', set('pqrs')),
    ('t',   set('t')),
    ('u-z', set('uvwxyz')),
]


def bucket_for(tl: str) -> str:
    first = tl[0].lower() if tl else '_'
    for name, letters in BUCKETS:
        if first in letters:
            return name
    return 'u-z'   # catch-all for numbers / non-alpha


# ── main ───────────────────────────────────────────────────────────────────────

def main():
    moe_path    = Path('/tmp/dict-twblg.json')
    shared_path = Path(__file__).parent.parent / 'data' / 'dialects' / 'shared.json'
    out_dir     = Path(__file__).parent.parent / 'data' / 'dialects' / 'taiwanese_moe'
    out_dir.mkdir(exist_ok=True)

    # ── load ──
    print(f'Loading MoE dict: {moe_path}')
    with open(moe_path, encoding='utf-8') as f:
        moe_data = json.load(f)
    print(f'  {len(moe_data)} entries')

    print(f'Loading shared.json: {shared_path}')
    with open(shared_path, encoding='utf-8') as f:
        shared = json.load(f)

    # Build hanzi set from shared.json (and taiwanese.json) to skip duplicates
    skip_hanzi: set = set()
    for e in shared:
        if e.get('hanzi'):
            skip_hanzi.add(e['hanzi'].strip())

    taiwanese_path = Path(__file__).parent.parent / 'data' / 'dialects' / 'taiwanese.json'
    if taiwanese_path.exists():
        with open(taiwanese_path, encoding='utf-8') as f:
            for e in json.load(f):
                if e.get('hanzi'):
                    skip_hanzi.add(e['hanzi'].strip())

    print(f'  {len(skip_hanzi)} hanzi entries to skip (already in shared/taiwanese)')

    # ── process ──
    buckets: dict = {name: [] for name, _ in BUCKETS}
    stats = {'total': 0, 'skipped': 0, 'no_tl': 0, 'added': 0}

    for moe_entry in moe_data:
        stats['total'] += 1
        hanzi = moe_entry.get('title', '').strip()

        if hanzi in skip_hanzi:
            stats['skipped'] += 1
            continue

        # Pick the primary heteronym (first one)
        heteros = moe_entry.get('heteronyms', [])
        if not heteros:
            stats['no_tl'] += 1
            continue

        hetero = heteros[0]
        tl = hetero.get('trs', '').strip()
        if not tl:
            stats['no_tl'] += 1
            continue

        # Audio URL: the heteronym 'id' field does not reliably map to the
        # sutian.moe.edu.tw audio file numbering, so leave blank for now.
        audio_url = ''

        # Build slim entry
        # Use first non-empty definition text as "english" (it's in Chinese)
        chinese_def = ''
        for defn in hetero.get('definitions', []):
            d = defn.get('def', '').strip()
            if d:
                chinese_def = d
                break

        example = best_example(hetero)
        audio_hint = tl_to_audio_hint(tl)

        entry = {
            'dialectId': 'taiwanese_moe',
            'english': '',
            'chinese': chinese_def,
            'hanzi': hanzi,
            'poj': '',
            'tl': tl,
            'tone': extract_tone(tl),
            'audioHint': audio_hint,
            'audioUrl': audio_url,
            'tags': ['moe'],
        }
        if example:
            entry['example'] = example

        bucket = bucket_for(tl)
        buckets[bucket].append(entry)
        stats['added'] += 1

    # ── write ──
    for name, entries in buckets.items():
        path = out_dir / f'{name}.json'
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(entries, f, ensure_ascii=False, separators=(',', ':'))
        size_kb = path.stat().st_size / 1024
        print(f'  {path.name}: {len(entries):5d} entries  ({size_kb:.0f} KB)')

    total_kb = sum((out_dir / f'{n}.json').stat().st_size for n, _ in BUCKETS) / 1024
    print()
    print('─' * 50)
    print(f"  MoE entries processed:   {stats['total']}")
    print(f"  Skipped (in shared/tw):  {stats['skipped']}")
    print(f"  Skipped (no TL):         {stats['no_tl']}")
    print(f"  Added to taiwanese_moe:  {stats['added']}")
    print(f"  Total output size:       {total_kb:.0f} KB ({total_kb/1024:.1f} MB)")
    print('─' * 50)
    print(f'\nFiles written to {out_dir}')


if __name__ == '__main__':
    main()
