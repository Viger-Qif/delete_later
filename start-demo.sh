#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

choose_python() {
  for candidate in python3.13 python3.12 python3; do
    if command -v "$candidate" >/dev/null 2>&1 \
      && "$candidate" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3,12) else 1)' >/dev/null 2>&1; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  return 1
}

PYTHON="$(choose_python || true)"
if [ -z "$PYTHON" ]; then
  echo "Python 3.12 or 3.13 is required." >&2
  exit 1
fi

create_venv() {
  rm -rf .venv
  "$PYTHON" -m venv .venv
}

if [ ! -x .venv/bin/python ] \
  || ! .venv/bin/python -c 'import sys; raise SystemExit(0 if sys.version_info >= (3,12) else 1)' >/dev/null 2>&1; then
  create_venv
fi

if ! .venv/bin/python -m pip --version >/dev/null 2>&1; then
  .venv/bin/python -m ensurepip --upgrade >/dev/null 2>&1 || true
fi
if ! .venv/bin/python -m pip --version >/dev/null 2>&1; then
  echo "The existing .venv has no pip; recreating it." >&2
  create_venv
  .venv/bin/python -m ensurepip --upgrade >/dev/null 2>&1 || true
fi
if ! .venv/bin/python -m pip --version >/dev/null 2>&1; then
  echo "pip could not be restored. Install the full Python distribution with venv/ensurepip support." >&2
  exit 1
fi

.venv/bin/python -m pip install --upgrade pip setuptools wheel
.venv/bin/python -m pip install --upgrade -r requirements.txt
exec .venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
