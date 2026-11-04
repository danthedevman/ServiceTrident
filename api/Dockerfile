FROM node:24-alpine
WORKDIR /srv
COPY LICENSE NOTICE ./
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY app/package.json app/package.json
COPY workers/package.json workers/package.json
COPY shared/package.json shared/package.json
RUN npm ci --omit=dev --workspace=api --workspace=shared && npm cache clean --force
COPY --chown=node:node shared shared
COPY --chown=node:node api api
RUN mkdir -p /srv/secrets && chown node:node /srv/secrets
USER node
EXPOSE 3000
CMD ["node", "api/src/server.js"]
