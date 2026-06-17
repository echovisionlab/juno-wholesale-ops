FROM mcr.microsoft.com/playwright:v1.61.0-noble AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.34.1 --activate

FROM base AS deps

COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public && pnpm build

FROM base AS runner

WORKDIR /app

ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3000

RUN install -d -o pwuser -g pwuser /app /var/lib/juno-wholesale-ops/mail-attachments /var/lib/juno-wholesale-ops/juno-browser-profile

COPY --from=deps --chown=pwuser:pwuser /app/node_modules ./node_modules
COPY --from=builder --chown=pwuser:pwuser /app/public ./public
COPY --from=builder --chown=pwuser:pwuser /app/.next/standalone ./
COPY --from=builder --chown=pwuser:pwuser /app/.next/static ./.next/static
COPY --from=builder --chown=pwuser:pwuser /app/package.json /app/tsconfig.json ./
COPY --from=builder --chown=pwuser:pwuser /app/scripts ./scripts
COPY --from=builder --chown=pwuser:pwuser /app/src ./src

USER pwuser

EXPOSE 3000

CMD ["node", "server.js"]
