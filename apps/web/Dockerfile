# syntax=docker/dockerfile:1
#
# Build from the REPO ROOT, where the lockfile is:
#
#   docker build -f apps/web/Dockerfile .

FROM node:24-alpine AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @traffic-insights/web --include-workspace-root --ignore-scripts

FROM deps AS build
COPY apps/web apps/web
# npm run build type-checks first, so a type error fails the image build
# instead of shipping a broken bundle.
RUN npm run build --workspace @traffic-insights/web

# --------------------------------------------------------------------------
# runtime — static files behind nginx
#
# The built app is just HTML, CSS and JS. Serving it from Node would mean a
# ~200 MB image and a JS runtime to hand over files that nginx serves from a
# ~50 MB image, with gzip and cache headers already sorted.
# --------------------------------------------------------------------------
FROM nginx:1.29-alpine AS runtime

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

# 8080 instead of 80 so it can run unprivileged. Ports under 1024 need
# CAP_NET_BIND_SERVICE, and it's better not to need that at all.
EXPOSE 8080

# The nginx image's entrypoint already handles signals and templating.
CMD ["nginx", "-g", "daemon off;"]
