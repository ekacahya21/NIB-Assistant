FROM node:22-bookworm

WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install all dependencies
RUN npm ci

# Copy Prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Install Playwright Chromium and its system dependencies
RUN npx playwright install --with-deps chromium

# Copy application source code
COPY . .

# Build application
RUN npm run build

# Expose backend port
EXPOSE 3001

# Start production server
CMD ["sh", "-c", "if [ -f dist/src/main.js ]; then node dist/src/main.js; else node dist/main.js; fi"]
