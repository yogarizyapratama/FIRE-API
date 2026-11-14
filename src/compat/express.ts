import { Middleware } from '../types';

export type ExpressMiddleware = (
  req: any,
  res: any,
  next: (err?: any) => void
) => void | Promise<void>;

export function fromExpress(expressMiddleware: ExpressMiddleware): Middleware {
  return async (ctx, next) => {
    let statusCode = 200;
    const responseHeaders = new Headers();
    let earlyResponse: Response | null = null;
    let nextCalled = false;

    // Use a clean proxy to avoid assigning to readonly properties on native Request
    const customProps: Record<string, any> = {
      url: new URL(ctx.req.url).pathname,
      path: new URL(ctx.req.url).pathname,
      method: ctx.req.method,
      headers: Object.fromEntries(ctx.req.headers.entries()),
      params: ctx.params,
      query: ctx.query,
      body: ctx.body,
    };

    const simulatedReq = new Proxy(ctx.req, {
      get(target, prop: string) {
        if (prop in customProps) {
          return customProps[prop];
        }
        const val = (target as any)[prop];
        return typeof val === 'function' ? val.bind(target) : val;
      },
      set(_target, prop: string, value: any) {
        customProps[prop] = value;
        return true;
      },
      has(_target, prop: string) {
        return prop in customProps || prop in _target;
      },
    });

    // Point ctx.req to proxy so handlers have access to properties attached by Express middleware
    (ctx as any).req = simulatedReq;

    // Simulated Express res
    const simulatedRes: any = {
      statusCode: 200,
      setHeader(name: string, value: string) {
        responseHeaders.set(name, value);
        return this;
      },
      getHeader(name: string) {
        return responseHeaders.get(name);
      },
      removeHeader(name: string) {
        responseHeaders.delete(name);
        return this;
      },
      status(code: number) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        responseHeaders.set('Content-Type', 'application/json');
        earlyResponse = new Response(JSON.stringify(data), {
          status: statusCode,
          headers: responseHeaders,
        });
        return this;
      },
      send(body: any) {
        if (typeof body === 'object' && body !== null) {
          return this.json(body);
        }
        if (!responseHeaders.has('Content-Type')) {
          responseHeaders.set('Content-Type', 'text/html; charset=utf-8');
        }
        earlyResponse = new Response(String(body ?? ''), {
          status: statusCode,
          headers: responseHeaders,
        });
        return this;
      },
      end(chunk?: any) {
        if (chunk) {
          return this.send(chunk);
        }
        earlyResponse = new Response(null, {
          status: statusCode,
          headers: responseHeaders,
        });
        return this;
      },
    };

    return new Promise<Response>((resolve, reject) => {
      try {
        const nextFn = async (err?: any) => {
          nextCalled = true;
          if (err) {
            reject(err);
            return;
          }
          try {
            const downstreamResponse = await next();
            const mergedHeaders = new Headers(downstreamResponse.headers);
            responseHeaders.forEach((v, k) => mergedHeaders.set(k, v));

            resolve(
              new Response(downstreamResponse.body, {
                status: downstreamResponse.status,
                statusText: downstreamResponse.statusText,
                headers: mergedHeaders,
              })
            );
          } catch (e) {
            reject(e);
          }
        };

        const result = expressMiddleware(simulatedReq, simulatedRes, nextFn);

        if (result && typeof (result as any).catch === 'function') {
          (result as any).catch(reject);
        }

        // Check if response was sent synchronously without calling next()
        if (!nextCalled && earlyResponse) {
          resolve(earlyResponse);
        }
      } catch (err) {
        reject(err);
      }
    });
  };
}
