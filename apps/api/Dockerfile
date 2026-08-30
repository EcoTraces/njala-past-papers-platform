FROM node:20-slim AS base
WORKDIR /srv
ENV NODE_ENV=production

FROM base AS build
WORKDIR /srv
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci --workspace packages/shared --workspace apps/api --include-workspace-root

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace packages/shared \
    && npm run build --workspace apps/api

FROM base AS runtime
WORKDIR /srv
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci --omit=dev --workspace packages/shared --workspace apps/api --include-workspace-root

COPY --from=build /srv/packages/shared/dist packages/shared/dist
COPY --from=build /srv/apps/api/dist apps/api/dist

RUN useradd --create-home --uid 1000 appuser && chown -R appuser:appuser /srv
USER appuser

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/index.js"]
