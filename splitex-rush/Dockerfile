FROM node:24-alpine
WORKDIR /app

COPY . .

RUN corepack enable \
 && apk add --no-cache bash \
 && npx @microsoft/rush@5.167.0 update --bypass-policy \
 && npx @microsoft/rush@5.167.0 build --to @splitex/api

WORKDIR /app/apps/api
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/index.js"]
