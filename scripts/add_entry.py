#!/usr/bin/env python3
"""
Interactive dictionary entry tool for Hokkien Learning Center
Quickly add entries to dictionary.json with guided prompts
"""

import json
import os
from pathlib import Path

# Dialect options
DIALECTS = {
    "1": ("shared", "Shared / Common"),
    "2": ("quanzhou", "Quanzhou 泉州"),
    "3": ("zhangzhou", "Zhangzhou 漳州"),
    "4": ("xiamen", "Xiamen/Amoy 廈門"),
    "5": ("taiwanese", "Taiwanese 台灣"),
    "6": ("philippines", "Philippine Hokkien"),
    "7": ("indonesia", "Indonesian Hokkien"),
    "8": ("singapore", "Singaporean Hokkien"),
    "9": ("malaysia_north", "Northern Malaysian (Penang) 檳城"),
    "10": ("malaysia_south", "Southern Malaysian (Johor)"),
    "11": ("thailand", "Thai Hokkien"),
    "12": ("myanmar", "Myanmar Hokkien"),
    "13": ("vietnam", "Vietnamese Hokkien"),
    "14": ("cambodia", "Cambodian Hokkien")
}

def print_dialects():
    """Display dialect options"""
    print("\n📚 Available Dialects:")
    print("-" * 50)
    for num, (code, name) in DIALECTS.items():
        print(f"  {num}. {name}")
    print("-" * 50)

def get_dialect():
    """Prompt for dialect selection"""
    while True:
        choice = input("\nDialect number [9 for Penang]: ").strip() or "9"
        if choice in DIALECTS:
            return DIALECTS[choice][0]
        print(f"❌ Invalid choice. Please enter 1-{len(DIALECTS)}")

def get_input(prompt, required=True, default=""):
    """Get input with optional default"""
    while True:
        if default:
            value = input(f"{prompt} [{default}]: ").strip() or default
        else:
            value = input(f"{prompt}: ").strip()
        
        if value or not required:
            return value
        print("❌ This field is required. Please enter a value.")

def get_tags():
    """Get comma-separated tags"""
    tags_input = input("\nTags (comma-separated, optional): ").strip()
    if not tags_input:
        return []
    return [tag.strip() for tag in tags_input.split(",") if tag.strip()]

def is_phrase(english):
    """Heuristic to detect if entry is likely a phrase"""
    # If it has spaces or ends with punctuation, probably a phrase
    return " " in english or english.endswith("?") or english.endswith("!")

def preview_entry(entry):
    """Display entry preview"""
    print("\n" + "="*60)
    print("📝 ENTRY PREVIEW")
    print("="*60)
    print(f"English:      {entry['english']}")
    print(f"Hanzi:        {entry.get('hanzi', '(none)')}")
    print(f"POJ:          {entry.get('poj', '(none)')}")
    print(f"Tâi-lô:       {entry.get('tl', '(none)')}")
    print(f"Tone:         {entry.get('tone', '(none)')}")
    print(f"Dialect:      {entry['dialectId']}")
    print(f"Category:     {entry.get('category', 'word')}")
    print(f"Example:      {entry.get('example', '(none)')}")
    print(f"Tags:         {', '.join(entry.get('tags', [])) if entry.get('tags') else '(none)'}")
    print("="*60)

def create_entry():
    """Interactive entry creation"""
    print("\n" + "="*60)
    print("✨ NEW DICTIONARY ENTRY")
    print("="*60)
    
    # Get required fields
    english = get_input("English word/phrase", required=True)
    
    # Auto-detect if it's a phrase
    default_category = "phrase" if is_phrase(english) else "word"
    
    # Get romanization (at least one required)
    print("\n(At least POJ or Tâi-lô required)")
    poj = get_input("POJ romanization", required=False)
    tl = get_input("Tâi-lô romanization", required=False)
    
    if not poj and not tl:
        print("❌ At least one romanization (POJ or Tâi-lô) is required!")
        return None
    
    # Get other fields
    hanzi = get_input("Hanzi (Chinese characters)", required=False)
    tone = get_input("Tone pattern (e.g., 2-2 or 1-7-5)", required=False)
    
    # Dialect selection
    print_dialects()
    dialect_id = get_dialect()
    
    # Category
    category = get_input(f"Category", required=False, default=default_category)
    
    # Optional fields
    example = get_input("Example sentence", required=False)
    audio_hint = get_input("Audio hint (for filename)", required=False)
    tags = get_tags()
    
    # Build entry
    entry = {
        "dialectId": dialect_id,
        "english": english,
    }
    
    if hanzi:
        entry["hanzi"] = hanzi
    if poj:
        entry["poj"] = poj
    if tl:
        entry["tl"] = tl
    if tone:
        entry["tone"] = tone
    if audio_hint:
        entry["audioHint"] = audio_hint
    
    entry["audioUrl"] = ""  # Empty by default
    
    if category and category != "word":
        entry["category"] = category
    if example:
        entry["example"] = example
    if tags:
        entry["tags"] = tags
    
    return entry

def load_dictionary():
    """Load existing shared dialect dictionary"""
    dict_path = Path(__file__).parent.parent / "data" / "dialects" / "shared.json"
    
    if not dict_path.exists():
        print(f"⚠️  Dictionary file not found: {dict_path}")
        return None, dict_path
    
    try:
        with open(dict_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data, dict_path
    except Exception as e:
        print(f"❌ Error reading dictionary: {e}")
        return None, dict_path

def save_dictionary(data, dict_path):
    """Save dictionary back to file"""
    try:
        with open(dict_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"\n✅ Dictionary saved! Total entries: {len(data)}")
        return True
    except Exception as e:
        print(f"❌ Error saving dictionary: {e}")
        return False

def main():
    """Main entry point"""
    print("\n" + "🎯"*30)
    print("     HOKKIEN DICTIONARY ENTRY TOOL")
    print("🎯"*30)
    
    # Load existing dictionary
    dictionary, dict_path = load_dictionary()
    if dictionary is None:
        print("\n❌ Cannot proceed without dictionary file")
        return
    
    print(f"\n📖 Loaded dictionary with {len(dictionary)} entries")
    print(f"📁 File: {dict_path}")
    
    entries_added = 0
    
    while True:
        # Create new entry
        entry = create_entry()
        
        if entry is None:
            continue
        
        # Preview
        preview_entry(entry)
        
        # Confirm
        confirm = input("\n💾 Save this entry? (y/n/q to quit): ").strip().lower()
        
        if confirm == 'q':
            break
        
        if confirm == 'y':
            dictionary.append(entry)
            entries_added += 1
            print(f"\n✅ Entry added! ({entries_added} new entries this session)")
        else:
            print("❌ Entry discarded")
        
        # Continue?
        if input("\n➕ Add another entry? (y/n): ").strip().lower() != 'y':
            break
    
    # Save if any entries were added
    if entries_added > 0:
        if save_dictionary(dictionary, dict_path):
            print(f"\n🎉 Successfully added {entries_added} entries!")
        else:
            print("\n⚠️  Changes were not saved")
    else:
        print("\n👋 No entries added. Goodbye!")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n👋 Interrupted by user. Goodbye!")
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        raise
