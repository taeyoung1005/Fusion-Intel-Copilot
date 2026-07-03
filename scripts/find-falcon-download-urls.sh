#!/usr/bin/env bash
set -euo pipefail

for profile in "$HOME/.config/BraveSoftware/Brave-Browser/Default" "$HOME/.config/google-chrome/Default"; do
  if [ -f "$profile/History" ]; then
    name=$(echo "$profile" | sed 's#[/. ]#_#g')
    db="/tmp/${name}_History.sqlite"
    cp "$profile/History" "$db"
    echo "--- PROFILE $profile"
    sqlite3 "$db" "select datetime((last_visit_time/1000000)-11644473600,'unixepoch'), url, title from urls where lower(url) like '%duality%' or lower(url) like '%falcon%' order by last_visit_time desc limit 50;" 2>/dev/null || true
    sqlite3 "$db" "select target_path, tab_url, tab_referrer_url, datetime((start_time/1000000)-11644473600,'unixepoch') from downloads where lower(target_path) like '%falcon%' or lower(tab_url) like '%falcon%' or lower(tab_url) like '%duality%' order by start_time desc limit 50;" 2>/dev/null || true
  fi
done

for f in "$HOME/.config/BraveSoftware/Brave-Browser/Default/DownloadMetadata" "$HOME/.config/google-chrome/Default/DownloadMetadata"; do
  [ -f "$f" ] || continue
  echo "--- METADATA $f"
  strings "$f" | grep -Ei 'duality|falcon|storage.googleapis.com|FalconSim|DuSim' | head -120 || true
done
