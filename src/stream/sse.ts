export interface SSEEventOptions {
  event?: string;
  id?: string;
  retry?: number;
}

export interface SSEStreamWriter {
  send(data: any, options?: SSEEventOptions): Promise<void>;
  close(): void;
}

export function formatSSEMessage(data: any, options: SSEEventOptions = {}): string {
  let message = '';

  if (options.id !== undefined) {
    message += `id: ${options.id}\n`;
  }

  if (options.event !== undefined) {
    message += `event: ${options.event}\n`;
  }

  if (options.retry !== undefined) {
    message += `retry: ${options.retry}\n`;
  }

  const serialized = typeof data === 'string' ? data : JSON.stringify(data);
  const lines = serialized.split('\n');
  for (const line of lines) {
    message += `data: ${line}\n`;
  }
  message += '\n';

  return message;
}

export function createSSEResponse(
  handler: (stream: SSEStreamWriter) => Promise<void> | void
): Response {
  const encoder = new TextEncoder();
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  let isClosed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;

      const writer: SSEStreamWriter = {
        async send(data: any, options?: SSEEventOptions) {
          if (isClosed || !controllerRef) return;
          const formatted = formatSSEMessage(data, options);
          controllerRef.enqueue(encoder.encode(formatted));
        },
        close() {
          if (isClosed || !controllerRef) return;
          isClosed = true;
          try {
            controllerRef.close();
          } catch {}
        },
      };

      Promise.resolve(handler(writer)).catch((err) => {
        if (!isClosed && controllerRef) {
          const errMessage = formatSSEMessage({ error: err?.message || 'Stream error' }, { event: 'error' });
          controllerRef.enqueue(encoder.encode(errMessage));
          try {
            controllerRef.close();
          } catch {}
          isClosed = true;
        }
      });
    },
    cancel() {
      isClosed = true;
    },
  });

  const headers = new Headers();
  headers.set('Content-Type', 'text/event-stream; charset=utf-8');
  headers.set('Cache-Control', 'no-cache, no-transform');
  headers.set('Connection', 'keep-alive');
  headers.set('X-Accel-Buffering', 'no'); // Disable Nginx buffering

  return new Response(stream, {
    status: 200,
    headers,
  });
}
