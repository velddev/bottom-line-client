FROM node:20-alpine
WORKDIR /app

# Copy root package (the "trademmo" local dep referenced by server)
COPY package.json package-lock.json ./
COPY trademmo.proto ./

# Copy server source
COPY server/package.json server/package-lock.json ./server/
COPY server/src/ ./server/src/

# Install root package (provides the "trademmo" file: dep)
RUN npm ci --ignore-scripts

# Install server dependencies
RUN cd server && npm ci

WORKDIR /app/server
EXPOSE 3001

CMD ["node", "src/index.js"]
