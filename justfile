set dotenv-load := true

default:
    just --list

doctor:
    just --version
    atuin --version
    delta --version
    jq --version
    sd --version

receipts file="receipts.jsonl":
    jless {{file}}

# NOTE: the ".hash" field name is a placeholder — adapt it to the real receipt_chain schema
chain file="receipts.jsonl":
    jq -r '.hash' {{file}}

[confirm("Launch autonomous worker? (y/N)")]
launch:
    ./launch_worker.sh
