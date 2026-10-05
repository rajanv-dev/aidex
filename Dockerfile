FROM node:20-slim

# Install OpenJDK 17, Python 3, and build tools
RUN apt-get update && apt-get install -y \
    openjdk-17-jdk-headless \
    python3 \
    g++ \
    make \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package manifests
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install node dependencies
RUN npm install --prefix client
RUN npm install --prefix server

# Copy source code
COPY . .

# Build frontend static bundle
RUN npm run build

EXPOSE 5000

ENV PORT=5000
ENV NODE_ENV=production

CMD ["node", "server/index.js"]
