# Hokkien Learning Center

Free online platform for learning Hokkien dialects including Taiwanese, Malaysian, Singaporean, Philippine, Indonesian, Burmese, and Thai Hokkien.

🔗 **Live site:** [https://william-sy.github.io/hokkien-learning-center/](https://william-sy.github.io/hokkien-learning-center/)

## Features

- 📚 Comprehensive dictionary with Hanzi, POJ, and Tâi-lô romanization
- 🎮 Interactive games: flashcards, tone quiz, character matching, typing practice, phrase builder
- 🗣️ Multiple dialect support (14 varieties)
- 📝 Phrases library with hawker, greetings, directions, time, and proverbs
- ✅ Mark-as-learned tracking for words and phrases
- 💾 Progress export / import / reset (great for shared computers or schools)
- 🖨️ Print flashcards
- 📊 Tone charts and pronunciation guides
- 🌐 Community-driven content

## Dialects Supported

- Quanzhou (泉州) & Zhangzhou (漳州) — Historical roots
- Xiamen/Amoy (廈門) — Prestige variety
- Taiwanese Hokkien — Modern standard
- Malaysian Hokkien (North, Central, South)
- Singaporean Hokkien
- Philippine Hokkien
- Indonesian Hokkien
- Burmese Hokkien
- Thai Hokkien

## Edit Content

Update data in:
- `data/dialects/shared.json` — Shared dictionary entries (368 words, multi-dialect with variants)
- `data/dialects/malaysia_north/` — Malaysia North dialect entries (split across a-e, f-j, k-o, p-t, u-z)
- `data/phrases.json` — Phrases (40+ entries, categorised)
- `data/content.json` — Metadata, dialects, resources, tone charts

## Python Contributor Tools

Helper scripts live in `scripts/`. Run them from the **repo root**:

```bash
# Add a new dictionary entry interactively
python scripts/add_entry.py

# OCR a scanned dictionary page image
python scripts/ocr_dictionary.py

# Correct POJ romanisation in bulk
python scripts/correct_poj.py

# Test the OCR parser on ocr_output.txt
python scripts/test_parser.py
```

Dependencies: `pip install pytesseract pillow`

## Technology

Static HTML/CSS/JavaScript — no build step, no backend.

- Cookie-based UI state persistence
- localStorage-based learning progress (exported to JSON for portability)
- JSON-driven content
- Responsive mobile-first design
- SEO optimised

## License

Open source educational project for Hokkien language preservation.
