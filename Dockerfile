# Multi-stage Dockerfile for GuardianLink Production Deployment
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root and workspace package files
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install dependencies for building
RUN npm ci

# Copy full source code
COPY . .

# Build both frontend (client/dist) and backend (server/dist)
RUN npm run build

# Prune dev dependencies to keep production image small
RUN npm prune --omit=dev

# Stage 2: Production runtime image
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Copy package descriptors and hoisted production dependencies
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Copy built frontend client assets
COPY --from=builder /app/client/dist ./client/dist

# Copy built backend server code
COPY --from=builder /app/server/package*.json ./server/
COPY --from=builder /app/server/dist ./server/dist

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "server/dist/server.js"]
