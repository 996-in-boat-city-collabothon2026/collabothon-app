# Owner: Pair 1. Built by OpenShift: oc new-app <repo>#main --strategy=docker --name=warsztat-cfo
# ---- build stage ----
FROM registry.access.redhat.com/ubi9/nodejs-22 AS build
USER 0
WORKDIR /opt/app-root/src
COPY package*.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM registry.access.redhat.com/ubi9/nodejs-22-minimal
WORKDIR /opt/app-root/src
COPY --from=build --chown=1001:0 /opt/app-root/src ./
ENV NODE_ENV=production PORT=8080 LLM_MODE=mock
EXPOSE 8080
USER 1001
# tsx runs TypeScript directly (no separate server build step = fewer things to break)
CMD ["node", "--import", "tsx", "server/src/index.ts"]
