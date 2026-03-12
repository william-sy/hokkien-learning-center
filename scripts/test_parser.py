"""Quick test: run the parser against the existing ocr_output.txt"""
import sys
from pathlib import Path
# Allow running from repo root (python scripts/test_parser.py)
# or from within the scripts/ folder (python test_parser.py)
sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent))
try:
    from ocr_dictionary import parse_dictionary_entries
except ImportError:
    from scripts.ocr_dictionary import parse_dictionary_entries

ocr_output = Path(__file__).parent.parent / "ocr_output.txt"

with open(ocr_output, encoding='utf-8') as f:
    text = f.read()

print("Raw OCR text:")
print("-" * 60)
print(text)
print("-" * 60)

entries = parse_dictionary_entries(text)
print(f"\nParsed {len(entries)} entries:\n")
for e in entries:
    print(f"  EN: {e['english']!r:40s} POJ: {e['poj']!r}")
