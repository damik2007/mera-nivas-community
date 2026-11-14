#!/usr/bin/env bash
# Sets up MyCommunity for local development: installs deps, provisions the
# database schema, and seeds demo data. Requires a running MySQL/MariaDB
# server — create the database first, e.g.:
#   mysql -u root -e "CREATE DATABASE mycommunity;"
# Then run from the repo root:
#   bash infrastructure/scripts/setup.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "==> Installing dependencies"
npm install

for env_file in apps/api/.env packages/database/.env apps/web/.env; do
  example="${env_file}.example"
  if [ ! -f "$env_file" ] && [ -f "$example" ]; then
    cp "$example" "$env_file"
    echo "==> Created $env_file from $example"
  fi
done

echo "==> Using DATABASE_URL from packages/database/.env — edit it now if your MySQL user/password differ from the default (root, no password, localhost:3306)"

echo "==> Generating database schema"
npm run db:generate

echo "==> Applying migrations"
npm run db:migrate

echo "==> Seeding demo data"
npm run db:seed

cat <<'EOF'

Setup complete.

Start the API:   npm run dev:api
Start the web app: npm run dev:web

Demo accounts (password: Passw0rd!):
  superadmin@mycommunity.test
  admin@mycommunity.test
  resident@mycommunity.test
  resident2@mycommunity.test
  guard@mycommunity.test
EOF
