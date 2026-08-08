#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

API_DIR="$ROOT/apps/api"
WEB_DIR="$ROOT/apps/web"
VENV="$API_DIR/.venv"
LOG_DIR="$ROOT/.logs"
API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-5173}"
DEFAULT_DB_URL="postgresql+psycopg://techtonic:techtonic@localhost:5432/techtonic"

PIDS=()

cleanup() {
  echo
  echo "Shutting down Techtonic..."
  for pid in "${PIDS[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT INT TERM

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

read_db_url() {
  if [[ -f "$API_DIR/.env" ]] && grep -q '^DATABASE_URL=' "$API_DIR/.env"; then
    # shellcheck disable=SC2002
    sed -n 's/^DATABASE_URL=//p' "$API_DIR/.env" | head -n 1
  else
    echo "$DEFAULT_DB_URL"
  fi
}

# Parse postgresql[+driver]://user:pass@host:port/db
parse_db_url() {
  local url="$1"
  url="${url#postgresql+psycopg://}"
  url="${url#postgresql://}"
  url="${url#postgres://}"

  DB_USER="${url%%:*}"
  local rest="${url#*:}"
  DB_PASS="${rest%%@*}"
  rest="${rest#*@}"
  local hostport="${rest%%/*}"
  DB_NAME="${rest#*/}"
  DB_NAME="${DB_NAME%%\?*}"
  DB_HOST="${hostport%%:*}"
  DB_PORT="${hostport##*:}"
  if [[ "$DB_HOST" == "$DB_PORT" ]]; then
    DB_PORT="5432"
  fi
}

check_postgres() {
  "$VENV/bin/python" - "$1" <<'PY'
import sys

raw = sys.argv[1]
# SQLAlchemy-style URL -> libpq-friendly
url = raw.replace("postgresql+psycopg://", "postgresql://", 1)
try:
    import psycopg
    with psycopg.connect(url, connect_timeout=3) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
    sys.exit(0)
except Exception as exc:
    print(str(exc), file=sys.stderr)
    sys.exit(1)
PY
}

ensure_local_postgres() {
  local url
  url="$(read_db_url)"
  parse_db_url "$url"

  echo "==> Checking local Postgres at ${DB_HOST}:${DB_PORT}/${DB_NAME}"

  if check_postgres "$url" 2>/dev/null; then
    echo "    Postgres connection OK"
    return 0
  fi

  echo "    Could not connect yet; attempting local role/db setup (if psql is available)..."

  if ! command -v psql >/dev/null 2>&1; then
    echo "Postgres is not reachable and psql is not installed." >&2
    echo "Start your local Postgres and ensure apps/api/.env DATABASE_URL is correct:" >&2
    echo "  $url" >&2
    echo "Create role/db if needed, e.g.:" >&2
    echo "  createuser -s ${DB_USER} 2>/dev/null || true" >&2
    echo "  createdb -O ${DB_USER} ${DB_NAME} 2>/dev/null || true" >&2
    echo "  psql -d ${DB_NAME} -c \"ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASS}';\"" >&2
    exit 1
  fi

  # Homebrew / local peer-auth as current OS user is the common case.
  psql -d postgres -v ON_ERROR_STOP=1 <<SQL >/dev/null 2>&1 || true
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
  ELSE
    ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;
SQL

  if ! psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" 2>/dev/null | grep -q 1; then
    createdb -O "$DB_USER" "$DB_NAME" 2>/dev/null \
      || psql -d postgres -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" >/dev/null 2>&1 \
      || true
  fi

  if check_postgres "$url"; then
    echo "    Postgres connection OK"
    return 0
  fi

  echo "Still cannot connect to Postgres with:" >&2
  echo "  $url" >&2
  echo "Make sure Postgres is running locally and DATABASE_URL in apps/api/.env matches it." >&2
  exit 1
}

echo "==> Checking tools"
need_cmd node
need_cmd npm
need_cmd python3

mkdir -p "$LOG_DIR"

echo "==> Ensuring env files"
if [[ ! -f "$API_DIR/.env" ]]; then
  cp "$API_DIR/.env.example" "$API_DIR/.env"
  echo "    created apps/api/.env"
fi
if [[ ! -f "$WEB_DIR/.env" ]]; then
  cp "$WEB_DIR/.env.example" "$WEB_DIR/.env"
  echo "    created apps/web/.env"
fi

if grep -q '^DATABASE_URL=sqlite' "$API_DIR/.env" 2>/dev/null; then
  echo "    apps/api/.env still uses sqlite; switching to local Postgres"
  tmp="$(mktemp)"
  sed "s|^DATABASE_URL=.*|DATABASE_URL=$DEFAULT_DB_URL|" "$API_DIR/.env" >"$tmp"
  mv "$tmp" "$API_DIR/.env"
fi

echo "==> Setting up API virtualenv"
if [[ ! -x "$VENV/bin/python" ]]; then
  python3 -m venv "$VENV"
  echo "    created $VENV"
fi

req_stamp="$API_DIR/.venv/.requirements.stamp"
if [[ ! -f "$req_stamp" ]] || [[ "$API_DIR/requirements.txt" -nt "$req_stamp" ]]; then
  "$VENV/bin/pip" install --upgrade pip >/dev/null
  "$VENV/bin/pip" install -r "$API_DIR/requirements.txt"
  touch "$req_stamp"
  echo "    Python dependencies installed"
else
  echo "    Python dependencies up to date"
fi

ensure_local_postgres

echo "==> Setting up web dependencies"
if [[ ! -d "$WEB_DIR/node_modules" ]] || [[ "$WEB_DIR/package-lock.json" -nt "$WEB_DIR/node_modules" ]]; then
  npm --prefix "$WEB_DIR" install
  echo "    npm packages installed"
else
  echo "    npm packages up to date"
fi

echo "==> Starting API on http://127.0.0.1:$API_PORT"
(
  cd "$API_DIR"
  exec "$VENV/bin/uvicorn" app.main:app --reload --host 127.0.0.1 --port "$API_PORT"
) >"$LOG_DIR/api.log" 2>&1 &
PIDS+=($!)

echo "==> Starting web on http://127.0.0.1:$WEB_PORT"
(
  cd "$WEB_DIR"
  exec npm run dev -- --host 127.0.0.1 --port "$WEB_PORT"
) >"$LOG_DIR/web.log" 2>&1 &
PIDS+=($!)

api_ok=0
web_ok=0
for _ in $(seq 1 60); do
  if [[ "$api_ok" -eq 0 ]] && curl -sf "http://127.0.0.1:$API_PORT/health" >/dev/null 2>&1; then
    api_ok=1
  fi
  if [[ "$web_ok" -eq 0 ]] && curl -sf "http://127.0.0.1:$WEB_PORT" >/dev/null 2>&1; then
    web_ok=1
  fi
  if [[ "$api_ok" -eq 1 && "$web_ok" -eq 1 ]]; then
    break
  fi
  for pid in "${PIDS[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "A service exited unexpectedly. Recent logs:" >&2
      echo "--- api.log ---" >&2
      tail -n 40 "$LOG_DIR/api.log" >&2 || true
      echo "--- web.log ---" >&2
      tail -n 40 "$LOG_DIR/web.log" >&2 || true
      exit 1
    fi
  done
  sleep 0.5
done

echo
echo "Techtonic is running"
echo "  Web:  http://127.0.0.1:$WEB_PORT"
echo "  API:  http://127.0.0.1:$API_PORT"
echo "  Docs: http://127.0.0.1:$API_PORT/docs"
echo "  Logs: $LOG_DIR/api.log , $LOG_DIR/web.log"
echo
echo "Press Ctrl+C to stop the API and web."
echo

tail -n 0 -F "$LOG_DIR/api.log" "$LOG_DIR/web.log" &
PIDS+=($!)

wait
