"""Small dependency-free tests for the private preview's single-range parser."""
import unittest
from preview import parse_byte_range


class ByteRangeTests(unittest.TestCase):
    def test_start_and_end(self):
        self.assertEqual(parse_byte_range("bytes=0-99", 1000), (0, 99))

    def test_open_ended(self):
        self.assertEqual(parse_byte_range("bytes=900-", 1000), (900, 999))

    def test_suffix(self):
        self.assertEqual(parse_byte_range("bytes=-100", 1000), (900, 999))

    def test_clamped_ranges(self):
        self.assertEqual(parse_byte_range("bytes=0-5000", 1000), (0, 999))
        self.assertEqual(parse_byte_range("bytes=-5000", 1000), (0, 999))

    def test_bad_ranges(self):
        for value in ("items=0-99", "bytes=-", "bytes=-0", "bytes=1000-", "bytes=200-100", "bytes=0-2,5-7"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_byte_range(value, 1000)

    def test_empty_file(self):
        with self.assertRaises(ValueError):
            parse_byte_range("bytes=0-", 0)


if __name__ == "__main__":
    unittest.main()
