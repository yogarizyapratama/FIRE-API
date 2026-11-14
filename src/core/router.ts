import { Handler, HttpMethod, Middleware, RouteMatch, RouteOptions } from '../types';

interface RadixNode {
  part: string;
  isParam: boolean;
  paramName?: string;
  isWildcard: boolean;
  children: Map<string, RadixNode>;
  paramChild?: RadixNode;
  wildcardChild?: RadixNode;
  handlers: Map<HttpMethod, { options: RouteOptions; middlewares: Middleware[] }>;
}

function createNode(part = ''): RadixNode {
  const isParam = part.startsWith(':');
  const isWildcard = part === '*' || part.startsWith('*');
  return {
    part,
    isParam,
    paramName: isParam ? part.slice(1) : undefined,
    isWildcard,
    children: new Map(),
    handlers: new Map(),
  };
}

export function normalizePath(path: string): string {
  if (!path || path === '/' || path === '') return '/';
  let clean = path.replace(/\/+/g, '/');
  if (clean.length > 1 && clean.endsWith('/')) {
    clean = clean.slice(0, -1);
  }
  if (!clean.startsWith('/')) {
    clean = '/' + clean;
  }
  return clean;
}

export class Router {
  private root: RadixNode = createNode();
  public middlewares: Middleware[] = [];
  public prefix: string;
  public routesList: { method: HttpMethod; path: string; options: RouteOptions }[] = [];
  private fastPathCache: Map<string, RouteMatch> = new Map();
  private maxFastPathEntries = 2000;

  constructor(prefix = '') {
    this.prefix = prefix ? normalizePath(prefix) : '';
  }

  public use(middleware: Middleware): this;
  public use(subRouter: Router): this;
  public use(prefix: string, subRouter: Router): this;
  public use(arg1: string | Middleware | Router, arg2?: Router): this {
    if (typeof arg1 === 'function') {
      this.middlewares.push(arg1);
      return this;
    }

    if (arg1 instanceof Router) {
      for (const route of arg1.routesList) {
        const fullPath = this.prefix && !route.path.startsWith(this.prefix)
          ? normalizePath(`${this.prefix}/${route.path}`)
          : route.path;
        const combinedMiddlewares = [...arg1.middlewares, ...(route.options.middlewares || [])];
        this.addRawRoute(route.method, fullPath, {
          ...route.options,
          middlewares: combinedMiddlewares,
        });
      }
      return this;
    }

    if (typeof arg1 === 'string' && arg2 instanceof Router) {
      const subPrefix = normalizePath(arg1);
      for (const route of arg2.routesList) {
        const fullPath = route.path.startsWith(subPrefix)
          ? route.path
          : normalizePath(`${subPrefix}/${route.path}`);
        const combinedMiddlewares = [...arg2.middlewares, ...(route.options.middlewares || [])];
        this.addRawRoute(route.method, fullPath, {
          ...route.options,
          middlewares: combinedMiddlewares,
        });
      }
      return this;
    }

    return this;
  }

  public addRoute(method: HttpMethod, path: string, options: RouteOptions): this {
    let cleanPath = normalizePath(path);
    if (this.prefix && !cleanPath.startsWith(this.prefix)) {
      cleanPath = normalizePath(`${this.prefix}/${cleanPath}`);
    }
    return this.addRawRoute(method, cleanPath, options);
  }

  private addRawRoute(method: HttpMethod, fullPath: string, options: RouteOptions): this {
    this.routesList.push({ method, path: fullPath, options });

    const parts = fullPath.split('/').filter(Boolean);
    let current = this.root;

    for (const part of parts) {
      if (part === '*' || part.startsWith('*')) {
        if (!current.wildcardChild) {
          current.wildcardChild = createNode(part);
        }
        current = current.wildcardChild;
        break; // Wildcard absorbs remainder
      } else if (part.startsWith(':')) {
        if (!current.paramChild) {
          current.paramChild = createNode(part);
        }
        current = current.paramChild;
      } else {
        if (!current.children.has(part)) {
          current.children.set(part, createNode(part));
        }
        current = current.children.get(part)!;
      }
    }

    const routeMiddlewares = options.middlewares || [];
    current.handlers.set(method, {
      options,
      middlewares: [...this.middlewares, ...routeMiddlewares],
    });

    return this;
  }

  private resolveOptions(optionsOrHandler: RouteOptions | Handler): RouteOptions {
    if (typeof optionsOrHandler === 'function') {
      return { handler: optionsOrHandler };
    }
    return optionsOrHandler;
  }

  public get(path: string, optionsOrHandler: RouteOptions | Handler): this {
    return this.addRoute('GET', path, this.resolveOptions(optionsOrHandler));
  }

  public post(path: string, optionsOrHandler: RouteOptions | Handler): this {
    return this.addRoute('POST', path, this.resolveOptions(optionsOrHandler));
  }

  public put(path: string, optionsOrHandler: RouteOptions | Handler): this {
    return this.addRoute('PUT', path, this.resolveOptions(optionsOrHandler));
  }

  public patch(path: string, optionsOrHandler: RouteOptions | Handler): this {
    return this.addRoute('PATCH', path, this.resolveOptions(optionsOrHandler));
  }

  public delete(path: string, optionsOrHandler: RouteOptions | Handler): this {
    return this.addRoute('DELETE', path, this.resolveOptions(optionsOrHandler));
  }

  public options(path: string, optionsOrHandler: RouteOptions | Handler): this {
    return this.addRoute('OPTIONS', path, this.resolveOptions(optionsOrHandler));
  }

  public head(path: string, optionsOrHandler: RouteOptions | Handler): this {
    return this.addRoute('HEAD', path, this.resolveOptions(optionsOrHandler));
  }

  public match(method: HttpMethod, rawPath: string): RouteMatch | null {
    const cleanPath = normalizePath(rawPath);
    const cacheKey = `${method}:${cleanPath}`;

    const cached = this.fastPathCache.get(cacheKey);
    if (cached) {
      return {
        handler: cached.handler,
        routeOptions: cached.routeOptions,
        params: { ...cached.params },
        middlewares: cached.middlewares,
      };
    }

    const parts = cleanPath.split('/').filter(Boolean);
    const params: Record<string, string> = {};

    const result = this.searchNode(this.root, parts, 0, method, params);
    if (!result) return null;

    const matched: RouteMatch = {
      handler: result.options.handler,
      routeOptions: result.options,
      params,
      middlewares: result.middlewares,
    };

    if (this.fastPathCache.size >= this.maxFastPathEntries) {
      const keys = Array.from(this.fastPathCache.keys()).slice(0, 400);
      for (const k of keys) this.fastPathCache.delete(k);
    }
    this.fastPathCache.set(cacheKey, matched);

    return {
      ...matched,
      params: { ...matched.params },
    };
  }

  private searchNode(
    node: RadixNode,
    parts: string[],
    index: number,
    method: HttpMethod,
    params: Record<string, string>
  ): { options: RouteOptions; middlewares: Middleware[] } | null {
    if (index >= parts.length) {
      const handlerData = node.handlers.get(method);
      if (handlerData) return handlerData;
      if (node.wildcardChild && node.wildcardChild.handlers.has(method)) {
        params['*'] = '';
        return node.wildcardChild.handlers.get(method)!;
      }
      return null;
    }

    const part = parts[index];

    // 1. Static match
    const staticChild = node.children.get(part);
    if (staticChild) {
      const match = this.searchNode(staticChild, parts, index + 1, method, params);
      if (match) return match;
    }

    // 2. Param match
    if (node.paramChild) {
      const match = this.searchNode(node.paramChild, parts, index + 1, method, params);
      if (match) {
        if (node.paramChild.paramName) {
          params[node.paramChild.paramName] = decodeURIComponent(part);
        }
        return match;
      }
    }

    // 3. Wildcard match
    if (node.wildcardChild && node.wildcardChild.handlers.has(method)) {
      params['*'] = parts.slice(index).map(decodeURIComponent).join('/');
      return node.wildcardChild.handlers.get(method)!;
    }

    return null;
  }

  public getRoutes(): Array<{ method: HttpMethod; path: string; options: RouteOptions }> {
    return this.routesList;
  }
}

export function createRouter(prefix = ''): Router {
  return new Router(prefix);
}
