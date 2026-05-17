# ─────────────────────────────────────────────
# Stage 1: Builder (install all deps + generate Prisma client)
# ─────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package manifests and prisma schema first (better layer caching)
COPY package*.json ./
COPY prisma ./prisma/

# Install ALL dependencies (including dev) so prisma generate works
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# ─────────────────────────────────────────────
# Stage 2: Production image
# ─────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Copy package manifests
COPY package*.json ./
COPY prisma ./prisma/

# Install only production dependencies
RUN npm ci --omit=dev

# Copy generated Prisma client from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/src/generated ./src/generated

# Copy application source
COPY src ./src
COPY index.js ./

# Expose API port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Run migrations then start server
CMD ["sh", "-c", "npx prisma migrate deploy && node index.js"]
