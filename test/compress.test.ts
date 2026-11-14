import { describe, expect, it } from 'bun:test';
import { compressResponse } from '../src/shield/compress';

describe('FireAPI Native HTTP Stream Compression (Gzip / Web Standard)', () => {
  it('compresses JSON response when client accepts gzip and payload exceeds threshold', async () => {
    // Generate JSON payload larger than 1KB
    const largeData = { items: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `Item ${i}` })) };
    const rawResponse = new Response(JSON.stringify(largeData), {
      headers: { 'Content-Type': 'application/json' },
    });

    const reqWithGzip = new Request('http://localhost:3000/items', {
      headers: { 'Accept-Encoding': 'gzip, deflate' },
    });

    const compressed = await compressResponse(rawResponse, reqWithGzip, { threshold: 100 });

    expect(compressed.headers.get('Content-Encoding')).toBe('gzip');
    expect(compressed.headers.get('Vary')).toContain('Accept-Encoding');

    // Decompress with DecompressionStream to verify integrity
    const decompressedStream = compressed.body!.pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(decompressedStream).text();
    expect(JSON.parse(text)).toEqual(largeData);
  });

  it('skips compression if payload is smaller than threshold', async () => {
    const tinyResponse = new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
    const reqWithGzip = new Request('http://localhost:3000/tiny', {
      headers: { 'Accept-Encoding': 'gzip' },
    });

    const result = await compressResponse(tinyResponse, reqWithGzip, { threshold: 1000 });
    expect(result.headers.get('Content-Encoding')).toBeNull();
  });

  it('skips compression if client does not accept gzip', async () => {
    const rawResponse = new Response(JSON.stringify({ text: 'a'.repeat(2000) }), {
      headers: { 'Content-Type': 'application/json' },
    });
    const reqWithoutGzip = new Request('http://localhost:3000/no-gzip');

    const result = await compressResponse(rawResponse, reqWithoutGzip, { threshold: 100 });
    expect(result.headers.get('Content-Encoding')).toBeNull();
  });
});
