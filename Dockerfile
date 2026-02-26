# Stage 1: Build the static assets with webpack
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
# --ignore-scripts prevents office-addin postinstall scripts that fail on Linux
RUN npm ci --ignore-scripts
COPY . .
RUN npx webpack --mode production

# Stage 2: Lightweight production image
FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server.js .
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
