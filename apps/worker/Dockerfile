# Build from the repository root: docker build -f apps/worker/Dockerfile .
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# core and db must be built first: the apps import their compiled dist/.
RUN pnpm build:packages && pnpm --filter worker run build
# --prod keeps runtime dependencies only. Workspace packages (core, db with its drizzle/ SQL) are copied in.
RUN pnpm --filter worker deploy --prod /out && cp -r apps/worker/dist /out/dist

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out /app
USER node
# The worker has no port, so this check only proves the Node runtime still runs in the container.
# If the worker process itself exits, the container stops and compose restarts it.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD ["node", "-e", "process.exit(0)"]
CMD ["node", "dist/main.js"]
