FROM node:24-alpine AS build
WORKDIR /srv
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY app/package.json app/package.json
COPY workers/package.json workers/package.json
COPY shared/package.json shared/package.json
RUN npm ci --workspace=app
COPY app app
COPY shared shared
RUN npm run build --workspace=app

FROM nginxinc/nginx-unprivileged:stable-alpine
COPY app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /srv/app/dist /usr/share/nginx/html
COPY LICENSE NOTICE /usr/share/nginx/html/
EXPOSE 8080
