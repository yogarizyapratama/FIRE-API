import { Router } from '../core/router';
import { generateMock } from '../schema/mock';

export interface PostmanCollectionOptions {
  name?: string;
  baseUrl?: string;
}

export function generatePostmanCollection(router: Router, options: PostmanCollectionOptions = {}): Record<string, any> {
  const collectionName = options.name || 'FireAPI Collection';
  const baseUrl = options.baseUrl || 'http://localhost:3000';
  const routes = router.getRoutes();

  const items = routes.map((r) => {
    const cleanPath = r.path.startsWith('/') ? r.path.slice(1) : r.path;
    const pathSegments = cleanPath ? cleanPath.split('/') : [];

    const requestItem: Record<string, any> = {
      name: `${r.method} ${r.path}`,
      request: {
        method: r.method,
        header: [
          { key: 'Accept', value: 'application/json' },
        ],
        url: {
          raw: `${baseUrl}${r.path}`,
          host: [baseUrl],
          path: pathSegments,
        },
        description: r.options.ai?.description || `Endpoint: ${r.method} ${r.path}`,
      },
    };

    // Include mock body if schema.body is provided
    if (r.method !== 'GET' && r.method !== 'HEAD' && r.options.schema?.body) {
      try {
        const mockBody = generateMock(r.options.schema.body);
        requestItem.request.header.push({ key: 'Content-Type', value: 'application/json' });
        requestItem.request.body = {
          mode: 'raw',
          raw: JSON.stringify(mockBody, null, 2),
          options: { raw: { language: 'json' } },
        };
      } catch {}
    }

    return requestItem;
  });

  return {
    info: {
      name: collectionName,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: items,
  };
}
