export interface ClientRequestOptions {
  params?: Record<string, string | number>;
  query?: Record<string, any>;
  body?: any;
  headers?: HeadersInit;
}

export interface ClientResponse<T = any> {
  ok: boolean;
  status: number;
  data: T;
  error?: any;
  headers: Headers;
}

export interface ClientOptions {
  fetch?: typeof fetch;
  headers?: HeadersInit;
}

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);

function buildUrl(baseUrl: string, segments: string[], options?: ClientRequestOptions): string {
  let path = segments.join('/');

  // Substitute path params if any segment is :param or contains :param
  if (options?.params) {
    for (const [key, val] of Object.entries(options.params)) {
      path = path.replace(new RegExp(`:${key}\\b`, 'g'), encodeURIComponent(String(val)));
    }
  }

  // Remove any remaining raw :param if not replaced
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : '/' + path;
  let fullUrl = `${cleanBase}${cleanPath}`;

  if (options?.query) {
    const searchParams = new URLSearchParams();
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined && v !== null) {
        if (Array.isArray(v)) {
          v.forEach((item) => searchParams.append(k, String(item)));
        } else {
          searchParams.append(k, String(v));
        }
      }
    }
    const queryStr = searchParams.toString();
    if (queryStr) {
      fullUrl += (fullUrl.includes('?') ? '&' : '?') + queryStr;
    }
  }

  return fullUrl;
}

export function createClient<TApp = any>(baseUrl = '', clientOptions: ClientOptions = {}): any {
  const fetchFn = clientOptions.fetch || globalThis.fetch;

  function createProxy(pathSegments: string[]): any {
    return new Proxy(() => {}, {
      get(_target, prop: string) {
        const lowerProp = prop.toLowerCase();
        if (HTTP_METHODS.has(lowerProp)) {
          // This is the terminal HTTP method call, e.g. .get({ params, query, body })
          return async (reqOptions?: ClientRequestOptions): Promise<ClientResponse> => {
            const url = buildUrl(baseUrl, pathSegments, reqOptions);
            const headers = new Headers(clientOptions.headers);
            if (reqOptions?.headers) {
              const extraHeaders = new Headers(reqOptions.headers);
              extraHeaders.forEach((v, k) => headers.set(k, v));
            }

            let bodyContent: BodyInit | undefined;
            if (reqOptions?.body !== undefined && lowerProp !== 'get' && lowerProp !== 'head') {
              if (!headers.has('Content-Type')) {
                headers.set('Content-Type', 'application/json');
              }
              bodyContent = typeof reqOptions.body === 'string'
                ? reqOptions.body
                : JSON.stringify(reqOptions.body);
            }

            const response = await fetchFn(url, {
              method: lowerProp.toUpperCase(),
              headers,
              body: bodyContent,
            });

            let responseData: any = null;
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
              try {
                responseData = await response.json();
              } catch {
                responseData = null;
              }
            } else {
              responseData = await response.text();
            }

            return {
              ok: response.ok,
              status: response.status,
              data: responseData,
              error: response.ok ? undefined : responseData,
              headers: response.headers,
            };
          };
        }

        // Sub-path traversal
        return createProxy([...pathSegments, prop]);
      },
    });
  }

  return createProxy([]);
}
