# Stage 1: Install the workspace dependencies
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY kernel ./kernel
COPY runtime ./runtime
COPY plugins ./plugins
COPY adapters ./adapters
COPY storage ./storage
COPY tests ./tests
RUN pnpm install --frozen-lockfile

# Stage 2: Run the HTTP API by default as a non-root user. The entrypoint
# also routes Celia CLI subcommands (health, run, ...) used by smoke tests.
FROM node:22-alpine AS runner
WORKDIR /app
ENV CELIA_MODE=local

RUN npm install --global pnpm@9.15.0
COPY --chown=node:node --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/apps ./apps
COPY --chown=node:node --from=builder /app/kernel ./kernel
COPY --chown=node:node --from=builder /app/runtime ./runtime
COPY --chown=node:node --from=builder /app/plugins ./plugins
COPY --chown=node:node --from=builder /app/adapters ./adapters
COPY --chown=node:node --from=builder /app/storage ./storage
COPY --chown=node:node --from=builder /app/tests ./tests
COPY --chown=node:node scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
RUN chmod 0755 ./scripts/docker-entrypoint.sh

USER node
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["api"]
