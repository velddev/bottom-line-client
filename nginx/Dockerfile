# Stage 1: Build the React app
FROM node:20-alpine AS builder
WORKDIR /app

# Copy root package (the "trademmo" file: dep used by client)
COPY package.json package-lock.json ./

# Copy client source
COPY client/package.json client/package-lock.json ./client/
COPY client/ ./client/

# Install root package
RUN npm ci --ignore-scripts

# Install client dependencies
RUN cd client && npm ci

# Build the React app
RUN cd client && npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine
COPY --from=builder /app/client/dist /usr/share/nginx/html
COPY nginx/web.conf /etc/nginx/nginx.conf

EXPOSE 80 443
