import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface CompileOptions {
  entry?: string;
  output?: string;
  minify?: boolean;
}

export function compileBinary(options: CompileOptions = {}): { command: string; success: boolean; output: string } {
  const entry = options.entry || (fs.existsSync('./src/index.ts') ? './src/index.ts' : './index.ts');
  const output = options.output || './dist/server';
  const minifyFlag = options.minify !== false ? '--minify' : '';

  const outDir = path.dirname(output);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const command = `bun build ${entry} --compile ${minifyFlag} --outfile ${output}`.trim();

  try {
    const stdout = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
    return { command, success: true, output: stdout };
  } catch (err: any) {
    return { command, success: false, output: err.message };
  }
}
