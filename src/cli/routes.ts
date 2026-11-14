import { Router } from '../core/router';

export interface RouteTableRow {
  method: string;
  path: string;
  auth: string;
  roles: string;
  cache: string;
  idempotent: string;
  description: string;
}

export function formatRoutesTable(router: Router): string {
  const routes = router.getRoutes();

  if (routes.length === 0) {
    return 'No routes registered in application.';
  }

  const rows: RouteTableRow[] = routes.map((r) => {
    const roles = r.options.roles && r.options.roles.length > 0 ? r.options.roles.join(', ') : '-';
    const cache = r.options.cache ? `${r.options.cache.ttl}s` : '-';
    const idempotent = r.options.idempotent ? '✓' : '-';
    const auth = r.options.security ? 'Required' : (r.options.roles ? 'Role-Guarded' : 'Public');
    const description = r.options.ai?.description || '-';

    return {
      method: r.method,
      path: r.path,
      auth,
      roles,
      cache,
      idempotent,
      description,
    };
  });

  // Calculate column widths
  const headers = {
    method: 'METHOD',
    path: 'ROUTE PATH',
    auth: 'AUTH',
    roles: 'ROLES',
    cache: 'CACHE',
    idempotent: 'IDEMPOTENT',
    description: 'DESCRIPTION',
  };

  const colWidths = {
    method: Math.max(headers.method.length, ...rows.map((r) => r.method.length)),
    path: Math.max(headers.path.length, ...rows.map((r) => r.path.length)),
    auth: Math.max(headers.auth.length, ...rows.map((r) => r.auth.length)),
    roles: Math.max(headers.roles.length, ...rows.map((r) => r.roles.length)),
    cache: Math.max(headers.cache.length, ...rows.map((r) => r.cache.length)),
    idempotent: Math.max(headers.idempotent.length, ...rows.map((r) => r.idempotent.length)),
    description: Math.max(headers.description.length, ...rows.map((r) => r.description.length)),
  };

  const pad = (str: string, len: number) => str.padEnd(len, ' ');

  const headerLine = `| ${pad(headers.method, colWidths.method)} | ${pad(headers.path, colWidths.path)} | ${pad(headers.auth, colWidths.auth)} | ${pad(headers.roles, colWidths.roles)} | ${pad(headers.cache, colWidths.cache)} | ${pad(headers.idempotent, colWidths.idempotent)} | ${pad(headers.description, colWidths.description)} |`;
  const sepLine = `|-${'-'.repeat(colWidths.method)}-|-${'-'.repeat(colWidths.path)}-|-${'-'.repeat(colWidths.auth)}-|-${'-'.repeat(colWidths.roles)}-|-${'-'.repeat(colWidths.cache)}-|-${'-'.repeat(colWidths.idempotent)}-|-${'-'.repeat(colWidths.description)}-|`;

  const bodyLines = rows.map((r) =>
    `| ${pad(r.method, colWidths.method)} | ${pad(r.path, colWidths.path)} | ${pad(r.auth, colWidths.auth)} | ${pad(r.roles, colWidths.roles)} | ${pad(r.cache, colWidths.cache)} | ${pad(r.idempotent, colWidths.idempotent)} | ${pad(r.description, colWidths.description)} |`
  );

  return [
    `🔥 FireAPI Route Manifest (${routes.length} total endpoints):`,
    sepLine,
    headerLine,
    sepLine,
    ...bodyLines,
    sepLine,
  ].join('\n');
}
