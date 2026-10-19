FROM node:24-alpine

WORKDIR /app

RUN corepack enable

COPY package.json ./
RUN pnpm install --no-frozen-lockfile

COPY prisma ./prisma
RUN pnpm prisma:generate

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

ENV NODE_ENV=production

EXPOSE 3070

CMD ["node", "dist/server.js"]
