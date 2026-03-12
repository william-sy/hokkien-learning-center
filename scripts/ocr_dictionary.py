#!/usr/bin/env python3
"""
OCR Dictionary Scanner for Hokkien Learning Center
Capture images of dictionary pages and extract entries automatically
"""

import json
import re
from pathlib import Path
from typing import List, Dict, Optional
try:
    from correct_poj import correct_poj, load_word_corrections
except ImportError:
    from scripts.correct_poj import correct_poj, load_word_corrections

def check_dependencies():
    """Check if required packages are installed"""
    missing = []
    
    try:
        import cv2
    except ImportError:
        missing.append("opencv-python")
    
    try:
        import pytesseract
    except ImportError:
        missing.append("pytesseract")
    
    try:
        from PIL import Image
    except ImportError:
        missing.append("Pillow")
    
    if missing:
        print("❌ Missing dependencies. Install with:")
        print(f"   pip install {' '.join(missing)}")
        print("\n📦 Also install Tesseract OCR:")
        print("   macOS: brew install tesseract")
        print("   Linux: sudo apt install tesseract-ocr")
        return False
    
    return True

def capture_from_camera():
    """Capture image from webcam with live brightness/contrast preview"""
    import cv2

    print("\n📷 Opening camera...")
    print("   SPACE = capture | ESC = cancel")
    print("   b/B   = brightness −/+  (current shown in title)")
    print("   c/C   = contrast  −/+")
    print("   r     = reset adjustments")

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("❌ Cannot access camera")
        return None

    brightness = 0   # offset added to every pixel
    contrast   = 1.0 # multiplier

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # Apply brightness/contrast so user can tune for the page
        adjusted = cv2.convertScaleAbs(frame, alpha=contrast, beta=brightness)

        label = f"SPACE:capture ESC:cancel  brightness:{brightness:+d}  contrast:{contrast:.1f}"
        cv2.putText(adjusted, label, (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 0), 2)

        # Also show a thresholded preview in a smaller window
        gray   = cv2.cvtColor(adjusted, cv2.COLOR_BGR2GRAY)
        _, thr = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        preview = cv2.resize(thr, (frame.shape[1] // 2, frame.shape[0] // 2))
        cv2.imshow('OCR Preview (what Tesseract sees)', preview)
        cv2.imshow('Dictionary Scanner', adjusted)

        key = cv2.waitKey(1) & 0xFF
        if key == 27:      # ESC
            cap.release(); cv2.destroyAllWindows(); return None
        elif key == 32:    # SPACE – capture
            cap.release(); cv2.destroyAllWindows()
            # Save the adjusted image so user can inspect it
            cv2.imwrite('ocr_capture.png', adjusted)
            print("📸 Captured! Saved as ocr_capture.png")
            return adjusted
        elif key == ord('b'):  brightness = max(-100, brightness - 10)
        elif key == ord('B'):  brightness = min(100,  brightness + 10)
        elif key == ord('c'):  contrast   = max(0.5,  round(contrast - 0.1, 1))
        elif key == ord('C'):  contrast   = min(3.0,  round(contrast + 0.1, 1))
        elif key == ord('r'):  brightness = 0; contrast = 1.0

    cap.release(); cv2.destroyAllWindows(); return None

def load_from_file(filepath: str):
    """Load image from file"""
    import cv2
    
    img = cv2.imread(filepath)
    if img is None:
        print(f"❌ Cannot read image: {filepath}")
        return None
    
    print(f"✅ Loaded image: {filepath}")
    return img

def preprocess_image(image):
    """Preprocess image for better OCR results"""
    import cv2
    
    # Convert to grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # Apply thresholding
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    # Denoise
    denoised = cv2.fastNlMeansDenoising(thresh)
    
    return denoised

def extract_text_from_image(image) -> str:
    """
    Two-column OCR:
    1. Auto-detect the column split from word bounding boxes
    2. Crop image into left / right halves
    3. OCR each half independently with --psm 6 (single-column mode)
       → Tesseract gives clean, correctly ordered lines per column
    4. Sequential line merge: left[i] + right[i]
       Handles right-column continuation lines (e.g. long Hokkien entries
       that wrap) by checking whether the right line looks like a start of
       a new entry or a continuation.
    """
    import pytesseract
    from PIL import Image as PILImage

    processed  = preprocess_image(image)
    img_height = processed.shape[0]
    img_width  = processed.shape[1]
    pil_full   = PILImage.fromarray(processed)

    # --- Detect split from word bounding boxes ---
    try:
        data = pytesseract.image_to_data(
            pil_full, lang='eng', config='--psm 6',
            output_type=pytesseract.Output.DICT
        )
    except Exception as e:
        print(f"⚠️  Falling back to plain OCR: {e}")
        return pytesseract.image_to_string(pil_full, lang='eng', config='--psm 6')

    cxs = []
    for i, t in enumerate(data['text']):
        if t.strip():
            cxs.append(data['left'][i] + data['width'][i] // 2)

    split_x = img_width // 2
    if len(cxs) >= 2:
        mid_lo, mid_hi = img_width // 4, 3 * img_width // 4
        mid_xs = sorted(x for x in cxs if mid_lo < x < mid_hi)
        if len(mid_xs) >= 2:
            gaps = [(mid_xs[i+1] - mid_xs[i], (mid_xs[i] + mid_xs[i+1]) // 2)
                    for i in range(len(mid_xs) - 1)]
            gap_sz, gap_pos = max(gaps, key=lambda g: g[0])
            if gap_sz > 15:
                split_x = gap_pos

    print(f"📐 Column split at x={split_x}/{img_width}")

    # --- Crop & OCR each column separately ---
    left_img  = processed[:, :split_x]
    right_img = processed[:, split_x:]

    cfg = '--psm 6'
    left_text  = pytesseract.image_to_string(PILImage.fromarray(left_img),  lang='eng', config=cfg)
    right_text = pytesseract.image_to_string(PILImage.fromarray(right_img), lang='eng', config=cfg)

    left_lines  = [l.rstrip() for l in left_text.split('\n')]
    right_lines = [l.rstrip() for l in right_text.split('\n')]

    print(f"📝 Left lines: {len(left_lines)}, Right lines: {len(right_lines)}")

    # Drop leading/trailing blank lines from right column
    # (right column sometimes starts with a blank if the first entry
    #  is a continuation from the previous page)
    while right_lines and not right_lines[0].strip():
        right_lines.pop(0)
    while right_lines and not right_lines[-1].strip():
        right_lines.pop()

    # --- Sequential merge ---
    # Walk left lines; for each non-blank left line consume one right line.
    # If right has more lines than left (wrapped Hokkien), the extra lines
    # are appended to the previous merged line.
    merged = []
    ri = 0
    for lline in left_lines:
        if not lline.strip():
            # Preserve blank lines as separators
            merged.append('')
            continue

        if ri < len(right_lines):
            rline = right_lines[ri].strip()
            ri += 1

            # Consume continuation right-lines:
            # A right-column line is a continuation of the previous entry when
            # the preceding right-column text ended with a comma (more items follow).
            while ri < len(right_lines):
                peek = right_lines[ri].strip()
                if not peek:
                    ri += 1
                    continue
                if rline.rstrip().endswith(','):
                    rline += ' ' + peek
                    ri += 1
                else:
                    break

            # Strip stray parenthesis/digit fragments that bleed from English column
            # e.g. "1) khiauⁿ" → "khiauⁿ",  ") — pau-iéng" → "pau-iéng"
            rline = re.sub(r'^[\d\s)]+[)\-–—\s]+', '', rline).strip()
            rline = re.sub(r'^[)\-–—\s]+', '', rline).strip()

            merged.append(f"{lline}    {rline}" if rline else lline)
        else:
            merged.append(lline)

    # Any remaining right lines (shouldn't happen often)
    while ri < len(right_lines):
        if right_lines[ri].strip():
            merged.append(f"    {right_lines[ri]}")
        ri += 1

    return '\n'.join(merged)

def parse_dictionary_entries(text: str, default_dialect: str = "malaysia_north") -> List[Dict]:
    """
    Parse OCR text into structured dictionary entries.
    Penang dictionary format: two columns, English left, Hokkien right.
    Split heuristic: scan tokens left-to-right; the first token that looks
    like Hokkien (diacritic, hyphenated syllables, or short non-English word)
    marks the start of the Hokkien column.
    """
    entries = []

    # Common short English words that must NOT be mistaken for Hokkien
    ENGLISH_STOP = {
        'to', 'the', 'a', 'an', 'of', 'in', 'on', 'at', 'for', 'by', 'or',
        'and', 'be', 'is', 'are', 'was', 'not', 'no', 'do', 'go', 'get',
        'keep', 'with', 'as', 'up', 'out', 'so', 'if', 'but', 'has', 'had',
        'its', 'it', 'he', 'she', 'we', 'they', 'my', 'his', 'her', 'our',
        'acc', 'adj', 'adv', 'esp', 'fig', 'lit', 'sl', 'vs'
    }

    def is_hokkien_token(tok: str) -> bool:
        # Strip trailing punctuation for analysis
        clean = re.sub(r'[.,;:"\'\)\(]+$', '', tok).lower()
        if not clean:
            return False
        # Has diacritics or superscript-n tone markers
        if re.search(r'[áàâäéèêëíìîïóòôöúùûüāēīōūⁿ"]', tok, re.I):
            return True
        # Hyphenated short syllables: pak-tó, téng-bin, chiap-siu
        if re.match(r'^[a-z]{1,6}-[a-z]{1,6}', clean):
            return True
        # Ends with tone digit
        if re.search(r'[a-z]\d$', clean):
            return True
        # Short (2–5 chars), purely alphabetic, not a common English word
        if 2 <= len(clean) <= 5 and clean.isalpha() and clean not in ENGLISH_STOP:
            return True
        return False

    def split_line(raw: str):
        is_sub = bool(re.match(r'\s*[•\*\.\d]', raw))

        # Strip leading OCR noise: bullets, numbers, stray symbols
        cleaned = re.sub(r'^[\s\d•\.\:\}\{\|\*\'\"\\\u2019\u2018]+', '', raw).strip()
        # Fix merged "to" prefix: "tocalculate" → "to calculate"
        cleaned = re.sub(r'\bto([a-z])', r'to \1', cleaned)

        if not cleaned or len(cleaned) < 4:
            return None, None, is_sub

        # Prefer splitting on 2+ spaces or tab (most reliable)
        m = re.search(r'\s{2,}|\t', cleaned)
        if m:
            return cleaned[:m.start()].strip(), cleaned[m.end():].strip(), is_sub

        # Token-by-token scan: find first Hokkien-looking token
        tokens = cleaned.split()
        if len(tokens) < 2:
            return None, None, is_sub

        for i in range(1, len(tokens)):
            if is_hokkien_token(tokens[i]):
                english = ' '.join(tokens[:i])
                hokkien = ' '.join(tokens[i:])
                return english, hokkien, is_sub

        return None, None, is_sub

    for raw_line in text.split('\n'):
        stripped = raw_line.strip()
        if not stripped or len(stripped) < 4:
            continue
        # Skip camera UI bleed and page artefacts
        if re.search(r'SPACE|ESC|Capture|contrast:|brightness:', stripped, re.I):
            continue
        if re.match(r'^[\W\d]+$', stripped):
            continue

        english, hokkien, is_sub = split_line(raw_line)

        if not english or not hokkien:
            continue

        english = re.sub(r'\s+', ' ', english).strip(' .,;:')
        hokkien = re.sub(r'\s+', ' ', hokkien).strip(' .,;:—–-')

        # Reject if hokkien part looks like plain multi-word English prose
        if re.match(r'^[A-Z][a-z]', hokkien) and len(hokkien.split()) > 2:
            continue
        if len(english) < 2 or len(hokkien) < 2:
            continue

        # Pre-strip leading English bleed before comma-split.
        # A token is bleed only if it has NO hyphen (Hokkien compounds are
        # always hyphenated) and ends in a consonant that's not a valid
        # Hokkien syllable-final (p/t/k/h/m/n are valid; c/r/s/l/f/w etc. are not).
        def _is_bleed_token(tok: str) -> bool:
            s = tok.strip()
            if '-' in s:          # hyphenated → definitely Hokkien, never bleed
                return False
            t = re.sub(r'[^a-zA-Z]', '', s).lower()
            return bool(t) and len(t) >= 2 and re.match(r'^[a-z]+$', t) and t[-1] not in 'aeiounmptkh'

        raw_variants = re.split(r'[,;]', hokkien)
        while len(raw_variants) > 1 and _is_bleed_token(raw_variants[0]):
            raw_variants.pop(0)
        hokkien = ','.join(raw_variants).strip()

        # Use only the first comma/semicolon variant as primary POJ
        primary_poj = re.split(r'[,;]', hokkien)[0].strip()

        entry = {
            "dialectId": default_dialect,
            "english": english,
            "poj": primary_poj,
            "audioUrl": ""
        }
        if is_sub:
            entry["tags"] = ["sub-entry"]
        if english.startswith("to ") or " " in english:
            entry["category"] = "phrase"

        entries.append(entry)

    # Apply POJ corrections
    corrections = load_word_corrections()
    for entry in entries:
        fixed, _ = correct_poj(entry["poj"], corrections)
        entry["poj"] = fixed

    return entries

def display_parsed_entries(entries: List[Dict]):
    """Display parsed entries for review"""
    print("\n" + "="*60)
    print(f"📝 PARSED {len(entries)} ENTRIES")
    print("="*60)
    
    for i, entry in enumerate(entries, 1):
        print(f"\n{i}. English: {entry.get('english', '???')}")
        if 'hanzi' in entry:
            print(f"   Hanzi: {entry['hanzi']}")
        if 'poj' in entry:
            print(f"   POJ: {entry['poj']}")
        print(f"   Dialect: {entry['dialectId']}")
    
    print("="*60)

def _is_suspicious(entry: Dict) -> bool:
    """Flag entries that likely have OCR errors needing manual correction."""
    english = entry.get('english', '')
    poj = entry.get('poj', '')
    # Truncated English (OCR line-wrap artefacts)
    if '!' in english:
        return True
    # English ends mid-word (no vowel/space at end, looks cut off)
    if english and english[-1].isalpha() and english[-1] not in 'aeiouys' and ' ' not in english[-4:]:
        return True
    # POJ still has raw digits that weren't corrected
    if re.search(r'(?<=[a-zA-Z])[0-9]', poj):
        return True
    return False


def _edit_entry(entry: Dict) -> Dict:
    """Prompt user to correct fields of an entry. Blank input keeps original."""
    print("  (Press Enter to keep current value)")
    english = input(f"  English [{entry.get('english', '')}]: ").strip()
    if english:
        entry['english'] = english

    poj = input(f"  POJ     [{entry.get('poj', '')}]: ").strip()
    if poj:
        entry['poj'] = poj

    hanzi = input(f"  Hanzi   [{entry.get('hanzi', '')}]: ").strip()
    if hanzi:
        entry['hanzi'] = hanzi

    return entry


def review_and_edit_entries(entries: List[Dict]) -> List[Dict]:
    """Allow user to review and edit parsed entries."""
    if not entries:
        return []

    display_parsed_entries(entries)

    suspicious = [e for e in entries if _is_suspicious(e)]
    if suspicious:
        print(f"\n⚠️  {len(suspicious)} entr{'y' if len(suspicious)==1 else 'ies'} flagged as possibly incorrect (truncated English, digit artefacts, etc.)")

    print("\n📋 Review Options:")
    print("  [a] Accept all  (flagged entries will still pause for correction)")
    print("  [r] Review each entry individually")
    print("  [d] Discard all")

    choice = input("\nChoice: ").strip().lower()

    if choice == 'd':
        return []

    if choice == 'a':
        # Accept everything, but pause on suspicious entries
        approved = []
        for entry in entries:
            if _is_suspicious(entry):
                print(f"\n⚠️  Flagged entry — please correct before saving:")
                print(f"  English: {entry.get('english', '???')}")
                print(f"  POJ:     {entry.get('poj', '???')}")
                action = input("  [c] Correct  [k] Keep as-is  [d] Discard: ").strip().lower()
                if action == 'c':
                    entry = _edit_entry(entry)
                    approved.append(entry)
                elif action == 'k':
                    approved.append(entry)
                # 'd' → skip (discard this entry)
            else:
                approved.append(entry)
        return approved

    # Individual review
    approved = []
    for i, entry in enumerate(entries, 1):
        flag = " ⚠️" if _is_suspicious(entry) else ""
        print(f"\n--- Entry {i}/{len(entries)}{flag} ---")
        print(f"  English: {entry.get('english', '???')}")
        print(f"  POJ:     {entry.get('poj', '???')}")
        if 'hanzi' in entry:
            print(f"  Hanzi:   {entry.get('hanzi')}")

        action = input("  [y] Keep  [c] Correct  [d] Discard: ").strip().lower()

        if action == 'y':
            approved.append(entry)
        elif action == 'c':
            entry = _edit_entry(entry)
            approved.append(entry)
        # 'd' → skip

    return approved

def save_entries(entries: List[Dict]) -> bool:
    """Append entries to dictionary.json"""
    dict_path = Path(__file__).parent.parent / "data" / "dictionary.json"
    
    if not dict_path.exists():
        print(f"❌ Dictionary not found: {dict_path}")
        return False
    
    try:
        with open(dict_path, 'r', encoding='utf-8') as f:
            dictionary = json.load(f)
        
        dictionary.extend(entries)
        
        with open(dict_path, 'w', encoding='utf-8') as f:
            json.dump(dictionary, f, ensure_ascii=False, indent=2)
        
        print(f"\n✅ Added {len(entries)} entries to dictionary!")
        print(f"📖 Total entries: {len(dictionary)}")
        return True
    
    except Exception as e:
        print(f"❌ Error saving: {e}")
        return False

def main():
    """Main entry point"""
    print("\n" + "📸"*30)
    print("     HOKKIEN DICTIONARY OCR SCANNER")
    print("📸"*30)
    
    if not check_dependencies():
        return
    
    print("\n📚 Image Source:")
    print("  [1] Capture from camera")
    print("  [2] Load from file")
    
    choice = input("\nChoice: ").strip()
    
    image = None
    
    if choice == '1':
        image = capture_from_camera()
    elif choice == '2':
        filepath = input("Image file path: ").strip()
        image = load_from_file(filepath)
    else:
        print("❌ Invalid choice")
        return
    
    if image is None:
        print("❌ No image captured")
        return
    
    # OCR
    print("\n🔍 Running OCR... (this may take a moment)")
    text = extract_text_from_image(image)
    
    print("\n📄 Raw OCR Output:")
    print("-" * 60)
    print(text)
    print("-" * 60)
    
    # Save raw output
    with open('ocr_output.txt', 'w', encoding='utf-8') as f:
        f.write(text)
    print("\n💾 Raw text saved to ocr_output.txt")
    
    # Parse entries
    print("\n🧩 Parsing entries...")
    
    # Ask for dialect
    dialect = input("\nDialect code [malaysia_north]: ").strip() or "malaysia_north"
    entries = parse_dictionary_entries(text, dialect)
    
    if not entries:
        print("⚠️  No entries parsed automatically")
        print("💡 Tip: Check ocr_output.txt and manually format entries")
        return
    
    # Review and edit
    approved_entries = review_and_edit_entries(entries)
    
    if not approved_entries:
        print("❌ No entries approved")
        return
    
    # Save
    if save_entries(approved_entries):
        print("\n🎉 Success! Entries added to dictionary")
    
    # Ask to continue
    if input("\n📸 Scan another image? (y/n): ").strip().lower() == 'y':
        main()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n👋 Interrupted by user")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        raise
