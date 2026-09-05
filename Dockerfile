# ============================================================================
# IBVAP Multi-Stage Production Container
# ============================================================================

FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first for layer caching
COPY package.json package-lock.json* ./
RUN npm install

# Copy source code and build artifacts
COPY . .
RUN npm run build

# Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install production essentials
RUN apk add --no-cache curl ca-certificates

# Copy package descriptors
COPY package.json ./

# Copy built frontend & server bundle
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Non-root user for security compliance
USER node

EXPOSE 3000

# Healthcheck probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health/live || exit 1

CMD ["node", "dist/server.cjs"]
