#!/usr/bin/env python3
"""
Harvest examples from the MoE Taiwanese Hokkien dictionary into shared.json.

Source:  https://github.com/g0v/moedict-data-twblg
License: CC BY-ND 3.0 Taiwan (Ministry of Education, Taiwan)

The script matches our shared.json entries against the MoE dictionary by 鸟字 (hanzi
title), picks the best heteronym by TL romanization, extracts the best example
sentence, and writes it back into shared.json.

Usage:
    # Download the source data once:
    curl -o /tmp/dict-twblg.json \
        https://raw.githubusercontent.com/g0v/moedict-data-twblg/master/dict-twblg.json

    # Dry run (print changes, don't write):
    python3 scripts/harvest_moedict.py --dry-run

    # Apply (fill in missing examples only):
    python3 scripts/harvest_moedict.py

    # Apply and overwrite existing examples:
    python3 scripts/harvest_moedict.py --overwrite
"""

import argparse
import json
import re
import unicodedata
from pathlib import Path

# ── MoE interlinear annotation characters ─────────────────────────────────────
SEP_A = '\ufff9'   # ￹  annotation anchor      (start of Hokkien text)
SEP_B = '\ufffa'   # ￺  annotation separator   (start of TL romanization)
SEP_C = '\ufffb'   # ￻  annotation terminator  (start of Chinese gloss)


def parse_moe_example(raw: str):
    """
    Parse an MoE example string into (hokkien_text, tl_romanization, chinese_gloss).
    Returns ('', '', '') if the string is empty or has no markers.
    """
    if SEP_A in raw:
        parts = re.split('[' + SEP_A + SEP_B + SEP_C + ']', raw)
        # parts: ['', hokkien, tl, chinese, '']  (the empty strings are the gaps)
        hokkien = parts[1].strip() if len(parts) > 1 else ''
        tl      = parts[2].strip() if len(parts) > 2 else ''
        zh      = parts[3].strip() if len(parts) > 3 else ''
        return hokkien, tl, zh
    return raw.strip(), '', ''


def format_example(hokkien: str, tl: str) -> str:
    """Build the example string stored in shared.json."""
    if hokkien and tl:
        return f"{hokkien} ({tl})"
    return hokkien or tl


# ── romanization normalisation ─────────────────────────────────────────────────

def _strip_diacritics(s: str) -> str:
    nfd = unicodedata.normalize('NFD', s)
    return ''.join(c for c in nfd if unicodedata.category(c) != 'Mn')


def normalize_rom(s: str) -> str:
    """Lowercase, strip tone diacritics and punctuation, for loose comparison."""
    s = _strip_diacritics(s)
    # Keep only letters and digits (drop hyphens, spaces, tones via diacritics)
    s = re.sub(r'[^a-z0-9]', '', s.lower())
    # Common POJ → TL letter substitutions for matching
    s = s.replace('ts', 'ch')   # keep ch/ts comparable after stripping
    return s


# ── heteronym selection ────────────────────────────────────────────────────────

def best_heteronym(moe_entry: dict, our_tl: str) -> dict:
    """
    Pick the heteronym whose `trs` best matches our `tl` field.
    Falls back to the first heteronym.
    """
    heteros = moe_entry.get('heteronyms', [])
    if not heteros:
        return {}
    if len(heteros) == 1:
        return heteros[0]

    norm_ours = normalize_rom(our_tl)
    # Exact normalized match
    for h in heteros:
        if normalize_rom(h.get('trs', '')) == norm_ours:
            return h
    # Prefix match (handles tone-number vs diacritic variants)
    for h in heteros:
        norm_moe = normalize_rom(h.get('trs', ''))
        if norm_ours and norm_moe and (
            norm_ours.startswith(norm_moe) or norm_moe.startswith(norm_ours)
        ):
            return h
    return heteros[0]


# ── example selection ──────────────────────────────────────────────────────────

def _is_full_sentence(hokkien: str) -> bool:
    """Heuristic: ends with punctuation and has at least 4 characters."""
    return len(hokkien) >= 4 and hokkien[-1] in '。！？.,!?'


def best_example(hetero: dict) -> str:
    """
    Return the formatted best example from a heteronym, or '' if none found.
    Prefers full sentences over short compound-word examples.
    """
    sentences = []
    short = []

    for defn in hetero.get('definitions', []):
        for raw in defn.get('example', []):
            hokkien, tl, _ = parse_moe_example(raw)
            if not (hokkien and tl):
                continue
            ex = format_example(hokkien, tl)
            if _is_full_sentence(hokkien):
                sentences.append(ex)
            else:
                short.append(ex)

    return (sentences or short or [''])[0]


# ── main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='Harvest MoE Hokkien examples into shared.json'
    )
    parser.add_argument(
        '--moe-path', default='/tmp/dict-twblg.json',
        help='Path to dict-twblg.json (default: /tmp/dict-twblg.json)'
    )
    parser.add_argument(
        '--dry-run', action='store_true',
        help='Print changes without writing anything'
    )
    parser.add_argument(
        '--overwrite', action='store_true',
        help='Replace existing examples too (default: only fill empty ones)'
    )
    args = parser.parse_args()

    moe_path    = Path(args.moe_path)
    shared_path = Path(__file__).parent.parent / 'data' / 'dialects' / 'shared.json'

    # ── load data ──
    print(f'Loading MoE dict: {moe_path}')
    with open(moe_path, encoding='utf-8') as f:
        moe_data = json.load(f)

    moe_by_hanzi: dict = {}
    for entry in moe_data:
        title = entry.get('title', '').strip()
        if title:
            # Keep only the first occurrence per hanzi title
            moe_by_hanzi.setdefault(title, entry)

    print(f'  {len(moe_data)} entries, {len(moe_by_hanzi)} unique headwords')

    print(f'Loading shared.json: {shared_path}')
    with open(shared_path, encoding='utf-8') as f:
        shared = json.load(f)
    print(f'  {len(shared)} entries')

    # ── harvest ──
    stats = {
        'matched':         0,
        'filled':          0,
        'skipped_exists':  0,
        'no_moe_match':    0,
        'no_example_found': 0,
    }

    for entry in shared:
        hanzi = entry.get('hanzi', '').strip()
        if not hanzi:
            continue

        already_has = bool(entry.get('example', '').strip())
        if already_has and not args.overwrite:
            stats['skipped_exists'] += 1
            continue

        moe_entry = moe_by_hanzi.get(hanzi)
        if moe_entry is None:
            stats['no_moe_match'] += 1
            continue

        stats['matched'] += 1

        our_tl = entry.get('tl', '') or entry.get('poj', '')
        hetero = best_heteronym(moe_entry, our_tl)
        if not hetero:
            stats['no_example_found'] += 1
            continue

        example = best_example(hetero)
        if not example:
            stats['no_example_found'] += 1
            continue

        if args.dry_run:
            action = 'UPDATE' if already_has else 'FILL  '
            print(f'  {action} [{entry["english"]:30s}] {hanzi} ({our_tl})')
            print(f'         => {example}')
        else:
            entry['example'] = example

        stats['filled'] += 1

    # ── report ──
    print()
    print('─' * 50)
    print(f"  Matched in MoE dict:    {stats['matched']}")
    print(f"  Examples filled/updated:{stats['filled']}")
    print(f"  Skipped (had example):  {stats['skipped_exists']}")
    print(f"  No MoE match:           {stats['no_moe_match']}")
    print(f"  Match, no example:      {stats['no_example_found']}")
    print('─' * 50)

    if not args.dry_run:
        if stats['filled'] > 0:
            with open(shared_path, 'w', encoding='utf-8') as f:
                json.dump(shared, f, ensure_ascii=False, indent=2)
            print(f'\nWrote {shared_path}  ({stats["filled"]} examples added)')
        else:
            print('\nNo changes to write.')
    else:
        print('\n(dry-run: no files written)')


if __name__ == '__main__':
    main()
