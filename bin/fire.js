#!/usr/bin/env node

import * as path from 'path';
import { generateResource } from '../src/cli/generator.ts';
import { runBenchmark, formatBenchmarkReport } from '../src/cli/bench.ts';
import { generateDockerFiles } from '../src/cli/docker.ts';
import { compileBinary } from '../src/cli/compile.ts';
import { createAppProject } from '../src/cli/create-app.ts';
import { formatRoutesTable } from '../src/cli/routes.ts';

const [,, cmd, subcmd, target] = process.argv;

if (!cmd || cmd === '--help' || cmd === '-h') {
  console.log(`
🔥 FireAPI CLI - Next-Gen Modern API Toolkit

Usage:
  npx fire-api <command> [options]

Commands:
  create, new <name>            Scaffold a complete, production-grade FireAPI project
  routes [entry]                Display visual terminal table of all registered routes
  g, generate resource <name>   Generate a new resource module (route + schema)
  bench <url>                   Run ultra-fast load benchmark against an endpoint
  docker                        Generate production-hardened multi-stage Dockerfile
  compile [output]              Compile standalone single-binary application
  info                          Display FireAPI engine version and environment
  help                          Show this help message

Examples:
  npx fire-api create my-store-api
  npx fire-api routes
  npx fire-api g resource product
  npx fire-api bench http://localhost:3000/books
  npx fire-api compile ./dist/api-server
  npx fire-api docker
`);
  process.exit(0);
}

if (cmd === 'create' || cmd === 'new' || cmd === 'init') {
  const appName = subcmd || 'my-fire-api';
  console.log(`\n🔥 Scaffolding brand new FireAPI application in ./${appName}...\n`);
  const result = createAppProject({ name: appName });
  console.log(`✨ Created ${result.filesCreated.length} files successfully:`);
  result.filesCreated.forEach((f) => console.log(`   📄 ${f}`));
  console.log(`
🎉 FireAPI application ready!
To start developing:

  cd ${appName}
  bun install    # (or pnpm install / npm install)
  bun dev        # Launches dev server with live reload at http://localhost:3000

📖 Interactive Docs:   http://localhost:3000/docs
🖥️ FireStudio:         http://localhost:3000/studio
🩺 Health Probes:      http://localhost:3000/healthz
`);
  process.exit(0);
}

if (cmd === 'routes' || cmd === 'route:list') {
  const entryPath = subcmd || './src/index.ts';
  const fullPath = path.resolve(process.cwd(), entryPath);
  try {
    const mod = await import(fullPath);
    const app = mod.default || mod.app;
    if (app && app.router) {
      console.log('\n' + formatRoutesTable(app.router) + '\n');
    } else {
      console.error('❌ Could not find exported FireApp instance in ' + entryPath);
    }
  } catch (err) {
    console.error('❌ Error inspecting routes:', err.message);
  }
  process.exit(0);
}

if (cmd === 'info') {
  console.log(`
🔥 FireAPI Framework v1.0.0
⚡ Engine: Bun / Node.js 20+ Native Web Standards
🛡️ Security Shield: Enabled by default
🗄️ Database Hub: SQLite & In-Memory
🤖 AI/MCP: Native Model Context Protocol Support
⚡ JIT Fast-Path & Gzip Compression: Enabled
🔒 RBAC & Policy Gates: Enabled
  `);
  process.exit(0);
}

if (cmd === 'docker') {
  const result = generateDockerFiles();
  console.log(`\n✨ Successfully generated production Docker container files!`);
  console.log(`  🐳 Dockerfile:     ${result.dockerfilePath}`);
  console.log(`  📄 .dockerignore:  ${result.dockerignorePath}\n`);
  process.exit(0);
} else if (cmd === 'compile') {
  console.log('⚡ Compiling standalone native binary with Bun...');
  const res = compileBinary({ output: subcmd || './dist/server' });
  if (res.success) {
    console.log(`✨ Binary successfully compiled! Output: ${subcmd || './dist/server'}`);
    process.exit(0);
  } else {
    console.error(`❌ Compilation failed: ${res.output}`);
    process.exit(1);
  }
} else if (cmd === 'bench') {
  const url = subcmd;
  if (!url) {
    console.error('❌ Please specify a target URL, e.g.: npx fire-api bench http://localhost:3000/books');
    process.exit(1);
  }
  console.log(`🔥 Launching benchmark against ${url}...`);
  runBenchmark(url, { concurrency: 20, totalRequests: 500 })
    .then((stats) => {
      console.log(formatBenchmarkReport(stats));
      process.exit(0);
    })
    .catch((err) => {
      console.error('Benchmark error:', err);
      process.exit(1);
    });
} else if (cmd === 'g' || cmd === 'generate') {
  if (subcmd === 'resource') {
    if (!target) {
      console.error('❌ Please specify a resource name, e.g.: npx fire-api g resource product');
      process.exit(1);
    }
    const result = generateResource(target);
    console.log(`\n✨ Successfully generated ${target} resource!`);
    console.log(`  📄 Schema: ${result.schemaFile}`);
    console.log(`  🛣️ Route:  ${result.routeFile}\n`);
    process.exit(0);
  }
} else {
  console.error(`Unknown command: ${cmd}. Run "npx fire-api --help" for available commands.`);
  process.exit(1);
}
