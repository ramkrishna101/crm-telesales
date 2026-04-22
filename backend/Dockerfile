# ── Stage 1: Builder ─────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first (better layer caching)
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --ignore-scripts

# Copy source and build
COPY tsconfig.json .
COPY src ./src/
RUN npx prisma generate
RUN npx tsc --outDir dist --rootDir src

# ── Stage 2: Production ───────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Install only production deps
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev --ignore-scripts && \
    npx prisma generate

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Create uploads directory
RUN mkdir -p /app/uploads && chmod 755 /app/uploads

# Health check dependency
RUN apk add --no-cache curl

EXPOSE 4000

# Run migrations then start server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
