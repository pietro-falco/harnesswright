#!/usr/bin/env python3
"""Schema validator for demo/osint/indicators.csv.

Stdlib only. Exit 0 if the dataset is clean, exit 1 with numbered
errors otherwise. All indicators are synthetic by construction
(RFC 5737 documentation IP ranges, .example/.test domains, dummy
hashes): nothing here is actionable.
"""
import csv
import re
import sys
from datetime import date
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parent / "indicators.csv"
EXPECTED_HEADER = ["indicator", "type", "source", "first_seen", "confidence"]

PATTERNS = {
    "ip": re.compile(r"^(?:\d{1,3}\.){3}\d{1,3}$"),
    "domain": re.compile(r"^(?!-)[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:example|test)$"),
    "url": re.compile(r"^https://[a-z0-9.-]+\.(?:example|test)(?:/[\w./-]*)?$"),
    "sha256": re.compile(r"^[a-f0-9]{64}$"),
}


def valid_ip_octets(indicator: str) -> bool:
    return all(0 <= int(part) <= 255 for part in indicator.split("."))


def main() -> int:
    errors = []
    try:
        with CSV_PATH.open(newline="", encoding="utf-8") as fh:
            reader = csv.reader(fh)
            header = next(reader, None)
            if header != EXPECTED_HEADER:
                print(f"FAIL: header {header!r} != {EXPECTED_HEADER!r}")
                return 1
            seen = {}
            for lineno, row in enumerate(reader, start=2):
                if len(row) != len(EXPECTED_HEADER):
                    errors.append(
                        f"line {lineno}: expected {len(EXPECTED_HEADER)} fields, got {len(row)}"
                    )
                    continue
                indicator, itype, source, first_seen, confidence = row
                if itype not in PATTERNS:
                    errors.append(f"line {lineno}: unknown type {itype!r}")
                elif not PATTERNS[itype].match(indicator):
                    errors.append(
                        f"line {lineno}: indicator {indicator!r} does not match {itype} pattern"
                    )
                elif itype == "ip" and not valid_ip_octets(indicator):
                    errors.append(f"line {lineno}: ip {indicator!r} has an octet > 255")
                if not source.strip():
                    errors.append(f"line {lineno}: empty source")
                try:
                    date.fromisoformat(first_seen)
                except ValueError:
                    errors.append(
                        f"line {lineno}: first_seen {first_seen!r} is not an ISO date"
                    )
                if not confidence.isdigit() or not 0 <= int(confidence) <= 100:
                    errors.append(
                        f"line {lineno}: confidence {confidence!r} not an integer in 0-100"
                    )
                if indicator in seen:
                    errors.append(
                        f"line {lineno}: duplicate indicator {indicator!r} "
                        f"(first seen line {seen[indicator]})"
                    )
                else:
                    seen[indicator] = lineno
    except FileNotFoundError:
        print(f"FAIL: {CSV_PATH} not found")
        return 1

    if errors:
        print(f"FAIL: {len(errors)} error(s)")
        for i, err in enumerate(errors, 1):
            print(f"  {i}. {err}")
        return 1

    print(f"PASS: {len(seen)} indicators, schema valid, no duplicates")
    return 0


if __name__ == "__main__":
    sys.exit(main())
