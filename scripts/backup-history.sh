#!/usr/bin/env bash
# Consistent ClearSpeak history backup using SQLite VACUUM INTO (includes WAL content).
# Usage: DATA_DIR=/home/ubuntu/data/clearspeak ./scripts/backup-history.sh [backup-dir]
set -euo pipefail
DATA_DIR="${CLEARSPEAK_DATA_DIR:-${1:-.data/clearspeak}}"
OUT_DIR="${2:-${BACKUP_DIR:-./backups}}"
mkdir -p "$OUT_DIR"
SRC="$DATA_DIR/clearspeak.sqlite"
if [ ! -f "$SRC" ]; then
  echo "No database at $SRC; nothing to back up." >&2
  exit 0
fi
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$OUT_DIR/clearspeak-$STAMP.sqlite"
mise exec -- node -e "const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync(process.argv[1]); db.exec(\"VACUUM INTO '\"+process.argv[2].replace(/'/g,\"''\")+\"';\"); db.close();" "$SRC" "$OUT"
echo "Backup written to $OUT"
echo "Copy it off this host (scp/rsync) — a backup kept only on this disk does not cover disk loss."
echo "Restore rehearsal: sqlite3/restore into a temp dir, then set CLEARSPEAK_DATA_DIR to it and verify one attempt plays."
