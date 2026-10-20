#!/usr/bin/env bash
# Self-signed HTTPS cert for `npm run dev:https`, so a phone on the LAN gets a
# secure context (Safari only exposes navigator.mediaDevices over HTTPS).
# Usage: bash scripts/gen-dev-cert.sh [LAN_IP]   (default: 192.168.86.144)
set -euo pipefail

IP="${1:-192.168.86.144}"
mkdir -p certificates

# MSYS_NO_PATHCONV stops Git Bash on Windows from rewriting "/CN=..".
MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout certificates/dev-key.pem -out certificates/dev-cert.pem \
  -subj "/CN=AI English Dev ($IP)" \
  -addext "subjectAltName=IP:$IP,DNS:localhost,IP:127.0.0.1" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,digitalSignature,keyEncipherment,keyCertSign" \
  -addext "extendedKeyUsage=serverAuth"

echo "Wrote certificates/dev-cert.pem for $IP"
