# Stage 1: Build the public website
FROM node:20-alpine AS website-builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
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
