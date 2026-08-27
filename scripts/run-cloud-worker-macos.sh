#!/bin/zsh

set -euo pipefail

script_dir="${0:A:h}"
repo_dir="${USAPON_REEL_REPO_DIR:-${script_dir:h}}"
keychain_service="${USAPON_REEL_KEYCHAIN_SERVICE:-usapon-reel-maker-supabase-service-role}"
keychain_account="${USAPON_REEL_KEYCHAIN_ACCOUNT:-usapon-reel-worker}"
npm_bin="${USAPON_REEL_NPM_BIN:-}"

if [[ -z "${npm_bin}" ]]; then
  npm_bin="$(command -v npm || true)"
fi

if [[ -z "${npm_bin}" || ! -x "${npm_bin}" ]]; then
  print -u2 "npmが見つかりません。USAPON_REEL_NPM_BINへ絶対パスを設定してください。"
  exit 1
fi

export PATH="${npm_bin:h}:${PATH}"

service_role_key="$(/usr/bin/security find-generic-password \
  -s "${keychain_service}" \
  -a "${keychain_account}" \
  -w)"

export SUPABASE_SERVICE_ROLE_KEY="${service_role_key}"
cd "${repo_dir}"
exec "${npm_bin}" run cloud:worker
