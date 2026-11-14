import { Router } from '../core/router';
import { BaseSchema } from './schema';

export interface OpenAPIOptions {
  title?: string;
  version?: string;
  description?: string;
}

export function generateOpenAPISpec(router: Router, options: OpenAPIOptions = {}): Record<string, any> {
  const spec: Record<string, any> = {
    openapi: '3.1.0',
    info: {
      title: options.title || 'FireAPI Documentation',
      version: options.version || '1.0.0',
      description: options.description || 'Auto-generated API documentation powered by FireAPI',
    },
    paths: {},
  };

  for (const route of router.routesList) {
    // Convert :id to {id} for OpenAPI path specification
    const openApiPath = route.path.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');

    if (!spec.paths[openApiPath]) {
      spec.paths[openApiPath] = {};
    }

    const methodLower = route.method.toLowerCase();
    const routeSchema = route.options.schema;
    const ai = route.options.ai;

    const operation: Record<string, any> = {
      summary: ai?.description || `${route.method} ${openApiPath}`,
      description: ai?.description,
      parameters: [],
      responses: {
        '200': {
          description: 'Successful Response',
          content: {
            'application/json': {
              schema: routeSchema?.response && routeSchema.response instanceof BaseSchema
                ? routeSchema.response.toOpenAPI()
                : { type: 'object' },
            },
          },
        },
      },
    };

    if (ai?.tags) {
      operation.tags = ai.tags;
    }

    // Path parameters
    if (routeSchema?.params && routeSchema.params instanceof BaseSchema) {
      const openApiParams = routeSchema.params.toOpenAPI();
      if (openApiParams.properties) {
        for (const [pKey, pSchema] of Object.entries(openApiParams.properties)) {
          operation.parameters.push({
            name: pKey,
            in: 'path',
            required: true,
            schema: pSchema,
          });
        }
      }
    }

    // Query parameters
    if (routeSchema?.query && routeSchema.query instanceof BaseSchema) {
      const openApiQuery = routeSchema.query.toOpenAPI();
      if (openApiQuery.properties) {
        for (const [qKey, qSchema] of Object.entries(openApiQuery.properties)) {
          operation.parameters.push({
            name: qKey,
            in: 'query',
            required: openApiQuery.required?.includes(qKey) ?? false,
            schema: qSchema,
          });
        }
      }
    }

    // Request body
    if (routeSchema?.body && routeSchema.body instanceof BaseSchema) {
      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: routeSchema.body.toOpenAPI(),
          },
        },
      };
    }

    spec.paths[openApiPath][methodLower] = operation;
  }

  return spec;
}
