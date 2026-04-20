FROM node:24-alpine
WORKDIR /app

COPY . .

RUN corepack enable \
 && apk add --no-cache bash \
 && npx @microsoft/rush@5.167.0 update --bypass-policy \
 && npx @microsoft/rush@5.167.0 build --to @traxettle/api

WORKDIR /app/apps/api
ENV NODE_ENV=production
EXPOSE 8080

# Bootstrap secrets from unified JSON secrets in the same process
CMD ["node", "--require", "./scripts/bootstrap-secrets.js", "dist/index.js"]
