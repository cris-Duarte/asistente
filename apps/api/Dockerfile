FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db-schema/package.json packages/db-schema/package.json
COPY packages/electric-client/package.json packages/electric-client/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api apps/api
COPY packages/shared packages/shared
COPY packages/db-schema packages/db-schema

FROM base AS development
ENV NODE_ENV=development
EXPOSE 8787
CMD ["pnpm", "--filter", "@productivity-assistant/api", "dev:local"]

FROM base AS build
RUN pnpm --filter @productivity-assistant/api build

FROM base AS production
ENV NODE_ENV=production
ENV CI=true
RUN pnpm --filter @productivity-assistant/api build \
    && pnpm prune --prod \
    && chmod +x apps/api/bin/owner-init \
    && ln -s /workspace/apps/api/bin/owner-init /usr/local/bin/owner:init
USER node
EXPOSE 8787
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/server.mjs"]
