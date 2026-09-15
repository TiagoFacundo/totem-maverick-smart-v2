FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN corepack enable
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm check && pnpm test && pnpm build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN corepack enable
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/dist ./dist

RUN useradd --system --create-home --home-dir /home/maverick --shell /usr/sbin/nologin maverick \
    && chown -R maverick:maverick /app
USER maverick
EXPOSE 3000

CMD ["node", "dist/index.js"]
