"""Reject transcription loops instead of inserting invented words into a draft."""
import re


def has_repetition_loop(text):
    compact = ''.join(text.split())
    # Some failures repeat characters without separating them into words.
    if re.search(r'(.{1,4})\1{7,}', compact):
        return True
    # Split on whitespace so Bengali vowel marks stay attached to each word.
    words = [re.sub(r"[.,!?।،;:\"()]+", "", word) for word in text.casefold().split()]
    words = [word for word in words if word]
    for width in range(1, 5):
        for start in range(len(words) - width * 4 + 1):
            phrase = words[start:start + width]
            if all(words[start + width * repeat:start + width * (repeat + 1)] == phrase for repeat in range(1, 4)):
                return True
    return False
