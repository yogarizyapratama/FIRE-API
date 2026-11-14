import * as fs from 'node:fs';
import * as path from 'node:path';

export function generateResource(resourceName: string, baseDir = process.cwd()): { routeFile: string; schemaFile: string } {
  const cleanName = resourceName.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const capitalized = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
  const targetDir = path.join(baseDir, 'src', 'modules', cleanName);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const schemaPath = path.join(targetDir, `${cleanName}.schema.ts`);
  const routePath = path.join(targetDir, `${cleanName}.route.ts`);

  const schemaContent = `import { s } from 'fire-api';

export const Create${capitalized}Schema = s.object({
  name: s.string().min(2).description('${capitalized} title or name'),
  status: s.enum(['active', 'draft']).default('active'),
});

export const ${capitalized}IdSchema = s.object({
  id: s.string().min(1),
});
`;

  const routeContent = `import { createRouter } from 'fire-api';
import { Create${capitalized}Schema, ${capitalized}IdSchema } from './${cleanName}.schema';

export const ${cleanName}Router = createRouter('/${cleanName}s');

// GET /${cleanName}s
${cleanName}Router.get('/', {
  cache: { ttl: 60, tags: ['${cleanName}s'] },
  ai: { description: 'Fetch list of ${cleanName}s', tags: ['${capitalized}'] },
  handler: async (ctx) => {
    return ctx.db.${cleanName}s.find();
  },
});

// POST /${cleanName}s
${cleanName}Router.post('/', {
  schema: { body: Create${capitalized}Schema },
  ai: { description: 'Create a new ${cleanName}', tags: ['${capitalized}'] },
  handler: async (ctx) => {
    const created = await ctx.db.${cleanName}s.insert(ctx.body);
    await ctx.cache.invalidate('${cleanName}s');
    return ctx.created(created);
  },
});

// GET /${cleanName}s/:id
${cleanName}Router.get('/:id', {
  schema: { params: ${capitalized}IdSchema },
  ai: { description: 'Get a ${cleanName} by unique ID', tags: ['${capitalized}'] },
  handler: async (ctx) => {
    const item = await ctx.db.${cleanName}s.findById(ctx.params.id);
    if (!item) return ctx.notFound('${capitalized} not found');
    return ctx.ok(item);
  },
});

// DELETE /${cleanName}s/:id
${cleanName}Router.delete('/:id', async (ctx) => {
  await ctx.db.${cleanName}s.delete(ctx.params.id);
  return { deleted: true };
});
`;

  fs.writeFileSync(schemaPath, schemaContent, 'utf-8');
  fs.writeFileSync(routePath, routeContent, 'utf-8');

  return { routeFile: routePath, schemaFile: schemaPath };
}
