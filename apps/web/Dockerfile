# Build from the repository root: docker build -f apps/web/Dockerfile .
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# core must be built first: the web app imports its compiled dist/.
RUN pnpm build:packages && pnpm --filter web run build
# --prod keeps runtime dependencies only; the Next.js build output is copied in afterwards.
RUN pnpm --filter web deploy --prod /out && cp -r apps/web/.next /out/.next

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out /app
USER node
EXPOSE 3020
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3020/').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node_modules/.bin/next", "start", "-p", "3020"]
