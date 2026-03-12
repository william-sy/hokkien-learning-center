#!/usr/bin/env python3
"""
POJ Correction Tool
Fixes common Tesseract OCR misreads in Hokkien romanization (POJ).

Usage:
  python3 correct_poj.py                  # fix all entries in dictionary.json
  python3 correct_poj.py --dry-run        # preview changes without saving
  python3 correct_poj.py --word "sthu"    # look up a single word
"""

import json
import re
import sys
from pathlib import Path

CORRECTIONS_FILE = Path(__file__).parent / "poj_corrections.json"
DICTIONARY_FILE  = Path(__file__).parent.parent / "data" / "dictionary.json"

# ---------------------------------------------------------------------------
# Layer 1: Reliable character-level regex patterns
# Applied first, before the word lookup table.
# Order matters — more specific patterns first.
# ---------------------------------------------------------------------------
PATTERN_SUBS = [
    # Nasalisation marker: " or ® → ⁿ  (very reliable)
    (r'["\u201c\u201d\u00ae]',      'ⁿ'),

    # Digit 6 after a letter → ó  (e.g. pak-t6 → pak-tó, 16h → lóh)
    (r'(?<=[a-zA-ZāáàâēéèêīíìîōóòôūúùûÂÊÎÔÛ])6', 'ó'),

    # Digit 0 inside romanization → o  (e.g. p0e → poe)
    (r'(?<=[a-zA-Z])0(?=[a-zA-Z])', 'o'),

    # Capital O in middle of romanization → ô  (e.g. pOa → pôa)
    (r'(?<=[a-z])O(?=[a-z])',       'ô'),

    # Trailing "ht" on a syllable → hù  (hong-ht → hong-hù)
    (r'\bht\b',  'hù'),
    (r'-ht\b',   '-hù'),

    # "htt" → "hù"
    (r'htt\b',   'hù'),

    # "thi" at end of word where it should be "tùi"
    # (conservative — only when preceded by hyphen or word boundary)
    (r'\bchiiat\b', 'chùat'),

    # Stray pipe / backslash characters
    (r'[|\\]',   ''),

    # Multiple spaces → single
    (r'  +',     ' '),
]

def load_word_corrections() -> dict:
    """Load word-level corrections from poj_corrections.json"""
    if not CORRECTIONS_FILE.exists():
        print(f"⚠️  {CORRECTIONS_FILE} not found — using pattern corrections only")
        return {}
    with open(CORRECTIONS_FILE, encoding='utf-8') as f:
        data = json.load(f)
    # Remove comment keys
    return {k: v for k, v in data.items() if not k.startswith('_')}


def apply_patterns(text: str) -> str:
    """Apply regex pattern substitutions"""
    for pattern, replacement in PATTERN_SUBS:
        text = re.sub(pattern, replacement, text)
    return text


def apply_word_corrections(text: str, corrections: dict) -> tuple[str, list]:
    """
    Apply word-level corrections.
    Returns (corrected_text, list_of_changes).
    Matches whole hyphenated tokens case-insensitively.
    """
    changes = []
    # Sort longest keys first to avoid partial matches
    for wrong, right in sorted(corrections.items(), key=lambda x: -len(x[0])):
        pattern = r'(?<![a-zA-Zāáàâēéèêīíìîōóòôūúùûⁿ])' + re.escape(wrong) + r'(?![a-zA-Zāáàâēéèêīíìîōóòôūúùûⁿ])'
        new_text = re.sub(pattern, right, text, flags=re.IGNORECASE)
        if new_text != text:
            changes.append(f"  {wrong!r} → {right!r}")
            text = new_text
    return text, changes


def correct_poj(poj: str, corrections: dict) -> tuple[str, list]:
    """Full correction pipeline for a single POJ string"""
    poj = apply_patterns(poj)
    poj, changes = apply_word_corrections(poj, corrections)
    # Clean up spaces around hyphens: "siàu- pho" → "siàu-phō"
    poj = re.sub(r'\s*-\s*', '-', poj)
    # Strip LEADING tokens that are plain English bleed-in from the left column
    # e.g. "count stiⁿ siàu" → "stiⁿ siàu"
    # Never strip the last token — short Hokkien like 'siau' has no diacritics.
    tokens = poj.split()
    while len(tokens) > 1:
        tok = re.sub(r'[^a-zA-Z]', '', tokens[0]).lower()
        has_hokkien = any(c in tokens[0] for c in 'āáàâēéèêīíìîōóòôūúùûⁿ-')
        if tok and len(tok) > 1 and not has_hokkien and re.match(r'^[a-z]+$', tok):
            tokens.pop(0)
        else:
            break
    poj = ' '.join(tokens).strip()
    return poj, changes


def fix_dictionary(dry_run: bool = False):
    """Apply corrections to all entries in dictionary.json"""
    if not DICTIONARY_FILE.exists():
        print(f"❌ {DICTIONARY_FILE} not found")
        return

    with open(DICTIONARY_FILE, encoding='utf-8') as f:
        entries = json.load(f)

    corrections = load_word_corrections()
    total_fixes = 0

    for entry in entries:
        for field in ('poj', 'tl'):
            if field not in entry or not entry[field]:
                continue
            original = entry[field]
            fixed, changes = correct_poj(original, corrections)
            if fixed != original:
                total_fixes += 1
                print(f"\n🔧 [{entry.get('english', '?')}] {field}:")
                print(f"   before: {original}")
                print(f"   after:  {fixed}")
                for c in changes:
                    print(c)
                if not dry_run:
                    entry[field] = fixed

    if total_fixes == 0:
        print("✅ No corrections needed")
        return

    print(f"\n{'👁  DRY RUN — ' if dry_run else ''}Total fixes: {total_fixes}")

    if not dry_run:
        with open(DICTIONARY_FILE, 'w', encoding='utf-8') as f:
            json.dump(entries, f, ensure_ascii=False, indent=2)
        print(f"✅ Saved {DICTIONARY_FILE}")


def lookup_word(word: str):
    """Look up a single word in the correction table"""
    corrections = load_word_corrections()
    fixed, changes = correct_poj(word, corrections)
    if fixed != word:
        print(f"  {word!r} → {fixed!r}")
        for c in changes:
            print(c)
    else:
        print(f"  No correction found for {word!r}")


if __name__ == '__main__':
    args = sys.argv[1:]

    if '--word' in args:
        idx = args.index('--word')
        if idx + 1 < len(args):
            lookup_word(args[idx + 1])
        else:
            print("Usage: --word <poj_text>")
    elif '--dry-run' in args:
        fix_dictionary(dry_run=True)
    else:
        fix_dictionary(dry_run=False)
