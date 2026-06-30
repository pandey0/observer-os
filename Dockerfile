FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/core/package.json packages/core/
COPY packages/sdk/package.json packages/sdk/
COPY packages/context-engine/package.json packages/context-engine/
COPY packages/plugin-browser/package.json packages/plugin-browser/
COPY packages/plugin-express/package.json packages/plugin-express/
COPY packages/plugin-postgres/package.json packages/plugin-postgres/
COPY packages/plugin-react/package.json packages/plugin-react/
COPY apps/daemon/package.json apps/daemon/
RUN pnpm install --frozen-lockfile --prod

# Build
FROM base AS build
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/ packages/
COPY apps/daemon/ apps/daemon/
COPY apps/explorer/ apps/explorer/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "@observer-os/core" build
RUN pnpm --filter "@observer-os/sdk" build
RUN pnpm --filter "@observer-os/context-engine" build
RUN pnpm --filter "@observer-os/plugin-browser" build
RUN pnpm --filter "@observer-os/plugin-express" build
RUN pnpm --filter "@observer-os/plugin-postgres" build
RUN pnpm --filter "@observer-os/plugin-react" build
RUN pnpm --filter "@observer-os/daemon" build
RUN pnpm --filter "explorer" build

# Runtime image
FROM node:22-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/packages/sdk/node_modules ./packages/sdk/node_modules
COPY --from=deps /app/apps/daemon/node_modules ./apps/daemon/node_modules
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/sdk/dist ./packages/sdk/dist
COPY --from=build /app/packages/context-engine/dist ./packages/context-engine/dist
COPY --from=build /app/packages/plugin-browser/dist ./packages/plugin-browser/dist
COPY --from=build /app/packages/plugin-express/dist ./packages/plugin-express/dist
COPY --from=build /app/packages/plugin-postgres/dist ./packages/plugin-postgres/dist
COPY --from=build /app/packages/plugin-react/dist ./packages/plugin-react/dist
COPY --from=build /app/apps/daemon/dist ./apps/daemon/dist
COPY --from=build /app/apps/explorer/dist ./apps/explorer/dist
COPY --from=build /app/apps/daemon/package.json ./apps/daemon/package.json
COPY pnpm-workspace.yaml package.json ./

ENV NODE_ENV=production
ENV OBSERVER_PORT=4000
ENV OBSERVER_HOST=0.0.0.0
ENV OBSERVER_DATA_DIR=/data

VOLUME ["/data"]
EXPOSE 4000 7891

CMD ["node", "apps/daemon/dist/index.js"]
