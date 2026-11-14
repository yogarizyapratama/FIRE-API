export interface CorsOptions {
  origin?: string | string[] | ((origin: string) => boolean);
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

export function handleCORS(request: Request, options: CorsOptions = {}): Response | null {
  const origin = request.headers.get('origin');
  if (!origin) return null; // Not a CORS request

  const isPreflight = request.method === 'OPTIONS';
  const allowedOrigin = resolveAllowedOrigin(origin, options.origin);

  if (!allowedOrigin) {
    if (isPreflight) {
      return new Response(null, { status: 403 });
    }
    return null;
  }

  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', allowedOrigin);

  if (options.credentials) {
    headers.set('Access-Control-Allow-Credentials', 'true');
  }

  if (options.exposedHeaders && options.exposedHeaders.length > 0) {
    headers.set('Access-Control-Expose-Headers', options.exposedHeaders.join(', '));
  }

  if (isPreflight) {
    const methods = options.methods || ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
    headers.set('Access-Control-Allow-Methods', methods.join(', '));

    const reqHeaders = request.headers.get('access-control-request-headers');
    const allowedHeaders = options.allowedHeaders
      ? options.allowedHeaders.join(', ')
      : reqHeaders || 'Content-Type, Authorization';
    headers.set('Access-Control-Allow-Headers', allowedHeaders);

    const maxAge = options.maxAge ?? 86400; // 24 hours
    headers.set('Access-Control-Max-Age', maxAge.toString());

    return new Response(null, { status: 204, headers });
  }

  return null;
}

export function appendCorsHeaders(response: Response, request: Request, options: CorsOptions = {}): Response {
  const origin = request.headers.get('origin');
  if (!origin) return response;

  const allowedOrigin = resolveAllowedOrigin(origin, options.origin);
  if (!allowedOrigin) return response;

  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', allowedOrigin);
  if (options.credentials) {
    headers.set('Access-Control-Allow-Credentials', 'true');
  }
  if (options.exposedHeaders && options.exposedHeaders.length > 0) {
    headers.set('Access-Control-Expose-Headers', options.exposedHeaders.join(', '));
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function resolveAllowedOrigin(
  reqOrigin: string,
  configuredOrigin?: string | string[] | ((origin: string) => boolean)
): string | null {
  if (!configuredOrigin || configuredOrigin === '*') {
    return '*';
  }
  if (typeof configuredOrigin === 'string') {
    return configuredOrigin === reqOrigin ? reqOrigin : null;
  }
  if (Array.isArray(configuredOrigin)) {
    return configuredOrigin.includes(reqOrigin) ? reqOrigin : null;
  }
  if (typeof configuredOrigin === 'function') {
    return configuredOrigin(reqOrigin) ? reqOrigin : null;
  }
  return null;
}
