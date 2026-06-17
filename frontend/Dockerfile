FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder

WORKDIR /app

ARG NEXT_INTERNAL_API_BASE_URL=http://backend:8000
ARG NEXT_PUBLIC_API_BASE_URL=
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=
ARG NEXT_PUBLIC_DEV_ADMIN_EMAIL=
ARG NEXT_PUBLIC_DEV_ADMIN_PASSWORD=
ARG NEXT_PUBLIC_DEV_ADMIN_DISPLAY_NAME="Administrador NeuroDatics"

ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_INTERNAL_API_BASE_URL=$NEXT_INTERNAL_API_BASE_URL \
    NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID \
    NEXT_PUBLIC_DEV_ADMIN_EMAIL=$NEXT_PUBLIC_DEV_ADMIN_EMAIL \
    NEXT_PUBLIC_DEV_ADMIN_PASSWORD=$NEXT_PUBLIC_DEV_ADMIN_PASSWORD \
    NEXT_PUBLIC_DEV_ADMIN_DISPLAY_NAME=$NEXT_PUBLIC_DEV_ADMIN_DISPLAY_NAME

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
