import * as fs from 'node:fs';
import * as path from 'node:path';

export function generateDockerFiles(baseDir = process.cwd()): { dockerfilePath: string; dockerignorePath: string } {
  const dockerfilePath = path.join(baseDir, 'Dockerfile');
  const dockerignorePath = path.join(baseDir, '.dockerignore');

  const dockerfileContent = `# ==============================================
# 🔥 FireAPI Ultra-Lightweight Production Container (< 25MB)
# ==============================================

# Stage 1: Build & Dependencies
FROM oven/bun:alpine AS base
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package.json bun.lock* ./
RUN bun install --production

COPY . .
RUN chown -R appuser:appgroup /app

# Stage 2: Distroless Production Runner
FROM oven/bun:alpine AS runner
WORKDIR /app

COPY --from=base /app /app

USER appuser
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["bun", "run", "src/index.ts"]
`;

  const dockerignoreContent = `node_modules
dist
.git
.env*
*.log
uploads
`;

  fs.writeFileSync(dockerfilePath, dockerfileContent, 'utf-8');
  fs.writeFileSync(dockerignorePath, dockerignoreContent, 'utf-8');

  return { dockerfilePath, dockerignorePath };
}
