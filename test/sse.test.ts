import { describe, expect, it } from 'bun:test';
import { createSSEResponse } from '../src/stream/sse';
import { createContext } from '../src/core/context';

describe('FireAPI AI & Real-Time SSE Streaming Engine', () => {
  it('formats SSE events and streams chunks via ReadableStream', async () => {
    const sseResponse = createSSEResponse(async (stream) => {
      await stream.send('Hello');
      await stream.send({ token: 'world' }, { event: 'token', id: '1' });
      stream.close();
    });

    expect(sseResponse.status).toBe(200);
    expect(sseResponse.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');
    expect(sseResponse.headers.get('Cache-Control')).toContain('no-cache');

    const reader = sseResponse.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }

    expect(text).toContain('data: Hello\n\n');
    expect(text).toContain('event: token\n');
    expect(text).toContain('id: 1\n');
    expect(text).toContain('data: {"token":"world"}\n\n');
  });

  it('is accessible via ctx.stream.sse() helper', async () => {
    const ctx = createContext({ req: new Request('http://localhost:3000/stream') });
    const sseRes = ctx.stream.sse(async (stream) => {
      await stream.send('stream-ready');
      stream.close();
    });

    expect(sseRes.status).toBe(200);
    expect(sseRes.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');
  });
});
