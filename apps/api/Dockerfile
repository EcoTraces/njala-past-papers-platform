 # ============================================================
# Build stage
# ============================================================
FROM node:20-slim AS build

WORKDIR /srv

# Development dependencies are required during compilation
ENV NODE_ENV=development

# Copy dependency manifests first for Docker layer caching
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json

# Install dependencies including TypeScript
RUN npm ci \
    --include=dev \
    --workspace packages/shared \
    --workspace apps/api \
    --include-workspace-root

# Copy TypeScript configuration
COPY tsconfig.base.json ./

# Copy source code
COPY packages/shared packages/shared
COPY apps/api apps/api

# Build shared package first, then API
RUN npm run build --workspace packages/shared \
    && npm run build --workspace apps/api


# ============================================================
# Production runtime stage
# ============================================================
FROM node:20-slim AS runtime

WORKDIR /srv

ENV NODE_ENV=production

# Copy dependency manifests
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json

# Install production dependencies only
RUN npm ci \
    --omit=dev \
    --workspace packages/shared \
    --workspace apps/api \
    --include-workspace-root

# Copy compiled applications from build stage
COPY --from=build /srv/packages/shared/dist packages/shared/dist
COPY --from=build /srv/apps/api/dist apps/api/dist

# Create an unprivileged application user.
# Do not force UID 1000 because node:20-slim may already use it.
RUN useradd --create-home appuser \
    && chown -R appuser:appuser /srv

USER appuser

EXPOSE 4000

# Container health check
HEALTHCHECK \
    --interval=30s \
    --timeout=5s \
    --start-period=10s \
    --retries=3 \
    CMD node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Start API
CMD ["node", "apps/api/dist/index.js"]