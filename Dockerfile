FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS dependencies
WORKDIR /app
RUN npm install --global --ignore-scripts npm@11.9.0
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS build
WORKDIR /app
RUN npm install --global --ignore-scripts npm@11.9.0
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG APP_REVISION
RUN APP_REVISION="$APP_REVISION" npm run build:runtime

FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS runtime
WORKDIR /app
ARG APP_REVISION
LABEL org.opencontainers.image.source="https://github.com/hendrik-101/satispire" \
      org.opencontainers.image.revision="$APP_REVISION"
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist/runtime ./dist/runtime
COPY --from=build /app/web-dist ./web-dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=6 \
  CMD ["node", "dist/runtime/healthcheck.js"]
CMD ["node", "dist/runtime/serve.js"]
