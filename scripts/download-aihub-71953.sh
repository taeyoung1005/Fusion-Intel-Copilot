#!/usr/bin/env bash
set -euo pipefail

DATASET_KEY="71953"
OUT_DIR="${1:-data/raw/aihub-71953}"

RECOMMENDED_VALIDATION_FILE_KEYS="568940,568951,568947,568958,568948,568959"
FILE_KEYS="${AIHUB_FILE_KEYS:-$RECOMMENDED_VALIDATION_FILE_KEYS}"
AIHUB_API_VERSION="0.6"

if [[ -z "${AIHUB_APIKEY:-}" ]]; then
  echo "AIHUB_APIKEY is required. Export your AI Hub API key first." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

download_url="https://api.aihub.or.kr/down/${AIHUB_API_VERSION}/${DATASET_KEY}.do?fileSn=${FILE_KEYS}"
download_tar="download.tar"
log_file="aihub-download.log"

rm -f "$download_tar" "$log_file"

set +e
curl -L -C - -o "$download_tar" -H "apikey:${AIHUB_APIKEY}" -w "\n%{http_code}" "$download_url" 2>&1 | tee "$log_file"
curl_status=${PIPESTATUS[0]}
http_status=$(tail -n 1 "$log_file")
set -e

if [[ "$curl_status" -ne 0 ]] || [[ "$http_status" != "200" ]]; then
  echo "AI Hub download failed. HTTP status: ${http_status}. Check ${log_file}." >&2
  exit 1
fi

if grep -Eq "인증실패|권한이 거부|신청 및 승인 후 이용 가능|로그인" "$download_tar"; then
  cat "$download_tar" | tee -a "$log_file" >&2
  echo "AI Hub download failed. Check approval/API-key status." >&2
  rm -f "$download_tar"
  exit 1
fi

tar -xvf "$download_tar" | tee -a "$log_file"
rm -f "$download_tar"

python3 - <<'PY'
from pathlib import Path
import re

part_pattern = re.compile(r"^(?P<prefix>.+)\.part(?P<index>[0-9]+)$")

groups: dict[Path, list[tuple[int, Path]]] = {}
for path in Path(".").rglob("*.part*"):
    match = part_pattern.match(path.name)
    if not match:
        continue
    output = path.with_name(match.group("prefix"))
    groups.setdefault(output, []).append((int(match.group("index")), path))

for output, parts in groups.items():
    ordered = [path for _, path in sorted(parts)]
    print(f"Merging {output} from {len(ordered)} part(s)")
    with output.open("wb") as target:
        for part in ordered:
            with part.open("rb") as source:
                while True:
                    chunk = source.read(1024 * 1024)
                    if not chunk:
                        break
                    target.write(chunk)
    for part in ordered:
        part.unlink()
PY

echo "Downloaded AI Hub dataset $DATASET_KEY files into $OUT_DIR"
