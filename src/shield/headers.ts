export interface SecurityHeaderOptions {
  contentSecurityPolicy?: boolean | string;
  frameOptions?: 'DENY' | 'SAMEORIGIN' | string;
  nosniff?: boolean;
  hsts?: boolean | { maxAge: number; includeSubDomains?: boolean };
}

export function applySecurityHeaders(
  response: Response,
  options?: SecurityHeaderOptions | boolean
): Response {
  if (options === false) return response;

  const headers = new Headers(response.headers);

  // X-Content-Type-Options: nosniff
  if (!headers.has('X-Content-Type-Options')) {
    headers.set('X-Content-Type-Options', 'nosniff');
  }

  // X-Frame-Options: SAMEORIGIN
  if (!headers.has('X-Frame-Options')) {
    const frameOpt = typeof options === 'object' && options.frameOptions ? options.frameOptions : 'SAMEORIGIN';
    headers.set('X-Frame-Options', frameOpt);
  }

  // X-XSS-Protection: 0 (Modern standard according to MDN and OWASP)
  if (!headers.has('X-XSS-Protection')) {
    headers.set('X-XSS-Protection', '0');
  }

  // HSTS (Strict-Transport-Security)
  if (!headers.has('Strict-Transport-Security')) {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Referrer-Policy
  if (!headers.has('Referrer-Policy')) {
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  }

  // Content-Security-Policy default
  if (!headers.has('Content-Security-Policy')) {
    const csp = typeof options === 'object' && typeof options.contentSecurityPolicy === 'string'
      ? options.contentSecurityPolicy
      : "default-src 'self'";
    headers.set('Content-Security-Policy', csp);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
