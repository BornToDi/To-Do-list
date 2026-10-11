import runpy
import unittest
from pathlib import Path

check = runpy.run_path(str(Path(__file__).with_name('voice-quality.py')))['has_repetition_loop']


class VoiceQualityTests(unittest.TestCase):
    def test_rejects_reported_bengali_loop(self):
        self.assertTrue(check('হেয়া ' + 'অইছে ' * 20))

    def test_rejects_phrase_loop(self):
        self.assertTrue(check('কি খবর ' * 4))

    def test_rejects_character_loop(self):
        self.assertTrue(check('বে' + 'ব' * 100))

    def test_accepts_greeting_and_natural_repetition(self):
        self.assertFalse(check('কি অবস্থা কেমন আছো'))
        self.assertFalse(check('না না আমি ভালো আছি'))


if __name__ == '__main__':
    unittest.main()
