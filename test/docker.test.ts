import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { generateDockerFiles } from '../src/cli/docker';

describe('FireAPI One-Command Distroless Docker Synthesizer', () => {
  it('generates production-hardened multi-stage Dockerfile and .dockerignore', () => {
    const testDir = path.join(process.cwd(), 'temp_test_docker');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    const result = generateDockerFiles(testDir);

    expect(fs.existsSync(result.dockerfilePath)).toBe(true);
    expect(fs.existsSync(result.dockerignorePath)).toBe(true);

    const dockerfileContent = fs.readFileSync(result.dockerfilePath, 'utf-8');
    expect(dockerfileContent).toContain('FROM oven/bun:alpine AS base');
    expect(dockerfileContent).toContain('USER appuser');
    expect(dockerfileContent).toContain('EXPOSE 3000');

    const ignoreContent = fs.readFileSync(result.dockerignorePath, 'utf-8');
    expect(ignoreContent).toContain('node_modules');
    expect(ignoreContent).toContain('.git');

    // Clean up
    fs.rmSync(testDir, { recursive: true, force: true });
  });
});
