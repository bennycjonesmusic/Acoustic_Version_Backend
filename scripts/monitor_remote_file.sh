#!/bin/bash
# monitor_remote_file.sh
# Monitors a remote file for changes and prints a diff if it changes.

URL="https://main.vscode-cdn.net/sourcemaps/848b80aeb52026648a8ff9f7c45a9b0a80641e2e/core/vs/workbench/file:/Users/cloudtest/vss/_work/1/s/src/vs/workbench/contrib/chat/browser/chatEditing/chatEditingSessionStorage.ts"
TMPFILE="remote_chatEditingSessionStorage.ts"
HASHFILE="remote_chatEditingSessionStorage.hash"
PREVFILE="remote_chatEditingSessionStorage.prev"

# Initial download
curl -s "$URL" -o "$TMPFILE"
sha256sum "$TMPFILE" > "$HASHFILE"
cp "$TMPFILE" "$PREVFILE"
echo "Monitoring remote file for changes... (Ctrl+C to stop)"

while true; do
  curl -s "$URL" -o "$TMPFILE"
  sha256sum "$TMPFILE" > "$TMPFILE.newhash"
  if ! cmp -s "$HASHFILE" "$TMPFILE.newhash"; then
    echo "\nRemote file has changed at $(date)!"
    diff "$PREVFILE" "$TMPFILE" || true
    cp "$TMPFILE" "$PREVFILE"
    mv "$TMPFILE.newhash" "$HASHFILE"
  fi
  sleep 60  # Check every 60 seconds
done
