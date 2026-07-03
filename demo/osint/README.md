# OSINT demo — the receipt is the proof

An agent that curates this dataset will tell you it is clean. That is
prose. This directory shows the harnesswright answer: a deterministic
receipt.

- `indicators.csv` — 15 synthetic OSINT indicators. Synthetic by
  construction: IPs from RFC 5737 documentation ranges, domains under
  `.example`/`.test`, dummy hashes. Nothing here is actionable.
- `validate.py` — stdlib-only schema validator: exact header,
  type-specific patterns, ISO dates, confidence bounds, no duplicate
  indicators. Exit 0 clean, exit 1 with numbered errors.
- `.verity/claims.json` — this demo's own claims manifest.

Run it:

    cd demo/osint
    python3 validate.py
    npx harnesswright gate   # exit 0: files committed, schema passes

Zero API keys, zero network. The agent's prose says the data is clean;
the receipt proves it.
