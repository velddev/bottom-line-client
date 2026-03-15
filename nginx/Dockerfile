# Stage 1: Build the React SPA
FROM node:20-alpine AS spa-builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package-lock.json ./client/
COPY client/ ./client/

ARG VITE_API_BASE=https://api.ventured.gg/v1
ENV VITE_API_BASE=$VITE_API_BASE

RUN npm ci --ignore-scripts
RUN cd client && npm ci
RUN cd client && npm run build

# Stage 2: nginx
FROM nginx:alpine
COPY --from=spa-builder /app/client/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/nginx.conf

EXPOSE 80 443
