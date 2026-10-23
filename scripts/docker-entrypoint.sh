#!/bin/sh
set -eu

# Default: run the HTTP API (the image CMD is `api`).
if [ "$#" -eq 0 ]; then
  set -- api
fi

case "$1" in
  api)
    shift
    exec pnpm exec tsx apps/api/src/start.ts "$@"
    ;;
  mode|health|safe-mode|emergency-lock|models|tools|run|ledger|runner|ownership)
    # Preserve the container smoke/CLI interface: `docker run <image> health`,
    # `docker run <image> run "..."`, etc.
    exec pnpm exec tsx apps/cli/src/cli.ts "$@"
    ;;
  *)
    exec "$@"
    ;;
esac
