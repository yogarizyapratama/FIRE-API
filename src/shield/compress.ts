export interface CompressionOptions {
  enabled?: boolean;
  threshold?: number; // In bytes (default 1024)
}

export async function compressResponse(
  response: Response,
  request: Request,
  options: CompressionOptions = {}
): Promise<Response> {
  if (options.enabled === false) return response;

  const acceptEncoding = request.headers.get('accept-encoding') || '';
  if (!acceptEncoding.includes('gzip')) return response;

  // Don't re-compress if already compressed or SSE stream
  const existingEncoding = response.headers.get('content-encoding');
  if (existingEncoding) return response;

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream')) return response;

  // Only compress compressible text/json types
  const isCompressible =
    contentType.includes('json') ||
    contentType.includes('text') ||
    contentType.includes('javascript') ||
    contentType.includes('xml') ||
    contentType.includes('html');

  if (!isCompressible && contentType !== '') return response;

  const threshold = options.threshold ?? 1024;

  // Read body buffer to check size
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength < threshold) {
    // Return original uncompressed response with restored body
    return new Response(arrayBuffer, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  // Create stream compression using native Web Standard CompressionStream
  const stream = new Response(arrayBuffer).body!.pipeThrough(new CompressionStream('gzip'));

  const newHeaders = new Headers(response.headers);
  newHeaders.set('Content-Encoding', 'gzip');
  newHeaders.delete('Content-Length'); // Content length changes after compression

  const vary = newHeaders.get('Vary');
  newHeaders.set('Vary', vary ? `${vary}, Accept-Encoding` : 'Accept-Encoding');

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
