# Stage 1: Build the public website
FROM node:20-alpine AS website-builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Umami tracker id comes in as a build arg (docker-compose.yml args:) and is
# baked into the JS bundle by Vite (src/main.jsx). Declared ARG -> ENV here or
# Vite never sees it inside the build stage.
ARG VITE_UMAMI_WEBSITE_ID
ENV VITE_UMAMI_WEBSITE_ID=$VITE_UMAMI_WEBSITE_ID
RUN npm run build

# Stage 2: Build the admin frontend
FROM node:20-alpine AS admin-builder

WORKDIR /admin
COPY admin/package.json admin/package-lock.json ./
RUN npm ci
COPY admin/ .
RUN npm run build

# Stage 3: Serve both with nginx
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=website-builder /app/dist /usr/share/nginx/html
COPY --from=admin-builder /admin/dist /usr/share/nginx/html/admin

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
