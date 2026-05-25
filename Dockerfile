FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/
COPY backend/prisma ./backend/prisma/

RUN npm ci

COPY backend ./backend/
COPY frontend ./frontend/

RUN npm run build

FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY backend/package*.json ./backend/
COPY backend/prisma ./backend/prisma/

RUN cd backend && npm ci --omit=dev --ignore-scripts && npx prisma generate

COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/frontend/dist ./frontend/dist

RUN mkdir -p /app/backend/uploads

EXPOSE 4000

CMD ["sh", "-c", "cd backend && npx prisma migrate deploy && node dist/index.js"]