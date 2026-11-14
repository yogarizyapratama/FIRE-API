export async function computeHMAC(
  payload: string | Uint8Array,
  secret: string,
  algorithm: 'SHA-256' | 'SHA-1' | 'SHA-512' = 'SHA-256'
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign']
  );

  const data = typeof payload === 'string' ? enc.encode(payload) : payload;
  const signatureBuf = await crypto.subtle.sign('HMAC', key, data);

  return Array.from(new Uint8Array(signatureBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export interface VerifyHMACOptions {
  payload: string | Uint8Array;
  signature: string;
  secret: string;
  algorithm?: 'SHA-256' | 'SHA-1' | 'SHA-512';
}

export async function verifyHMAC(options: VerifyHMACOptions): Promise<boolean> {
  const algorithm = options.algorithm || 'SHA-256';
  let sig = options.signature.trim();

  // Strip prefixes like sha256=, sha1=, sha512=
  if (sig.startsWith('sha256=')) {
    sig = sig.slice(7);
  } else if (sig.startsWith('sha1=')) {
    sig = sig.slice(5);
  } else if (sig.startsWith('sha512=')) {
    sig = sig.slice(7);
  } else if (sig.includes('v1=')) {
    // Stripe format: t=...,v1=...
    const match = sig.match(/v1=([a-f0-9]+)/i);
    if (match) {
      sig = match[1];
    }
  }

  const expected = await computeHMAC(options.payload, options.secret, algorithm);
  return constantTimeEqual(sig.toLowerCase(), expected.toLowerCase());
}

export class WebhookVerifier {
  constructor(private req: Request, private rawBody: string) {}

  public async verifyHMAC(options: {
    secret: string;
    header?: string;
    signature?: string;
    algorithm?: 'SHA-256' | 'SHA-1' | 'SHA-512';
  }): Promise<boolean> {
    const algorithm = options.algorithm || 'SHA-256';
    let signature = options.signature;

    if (!signature) {
      if (options.header) {
        signature = this.req.headers.get(options.header) || undefined;
      } else {
        // Auto-detect standard webhook headers (case-insensitive in standard Request headers)
        signature =
          this.req.headers.get('x-hub-signature-256') ||
          this.req.headers.get('x-signature-256') ||
          this.req.headers.get('stripe-signature') ||
          this.req.headers.get('x-signature') ||
          undefined;
      }
    }

    if (!signature) {
      return false;
    }

    return verifyHMAC({
      payload: this.rawBody,
      signature,
      secret: options.secret,
      algorithm,
    });
  }
}
