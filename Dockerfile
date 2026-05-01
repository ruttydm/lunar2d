# syntax=docker/dockerfile:1

FROM oven/bun:1 AS builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    pkg-config \
  && rm -rf /var/lib/apt/lists/*

ENV RUSTUP_HOME=/usr/local/rustup
ENV CARGO_HOME=/usr/local/cargo
ENV PATH=/usr/local/cargo/bin:$PATH

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
  | sh -s -- -y --profile minimal --default-toolchain stable --target wasm32-unknown-unknown \
  && cargo install wasm-pack --locked

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
RUN bun run wasm:release

COPY tsconfig.json vite.config.ts ./
COPY src ./src
RUN bun run build

FROM oven/bun:1-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/pkg ./pkg
COPY --from=builder /app/src/server ./src/server

EXPOSE 3001

CMD ["bun", "run", "src/server/main.ts"]
