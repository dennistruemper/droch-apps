# syntax=docker/dockerfile:1
FROM node:24.21.0-bookworm-slim AS development
WORKDIR /workspace
RUN npm install --global pnpm@11.25.0
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY . .
RUN --mount=type=cache,target=/pnpm/store pnpm install --frozen-lockfile --store-dir /pnpm/store

RUN mkdir -p /data /pnpm/store && chown -R node:node /workspace /data /pnpm
USER node

FROM development AS build
# Quality checks run before image builds in CI. Keep the runtime build independent
# of Oxlint's JS-plugin allocator (upstream issue oxc-project/oxc#20331).
RUN pnpm typecheck && pnpm build

FROM node:24.21.0-bookworm-slim AS production
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=build --chown=node:node /workspace/dist ./dist
COPY --from=build --chown=node:node /workspace/migrations ./migrations
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "dist/server/main.mjs"]
