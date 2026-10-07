# Build from the repository root: docker build -f apps/api/Dockerfile .
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# core and db must be built first: the apps import their compiled dist/.
RUN pnpm build:packages && pnpm --filter api run build
# --prod keeps runtime dependencies only. Workspace packages (core, db with its drizzle/ SQL) are copied in.
RUN pnpm --filter api deploy --prod /out && cp -r apps/api/dist /out/dist

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out /app
USER node
EXPOSE 4020
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4020/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js"]
