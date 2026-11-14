import * as fs from 'node:fs';
import * as path from 'node:path';

export interface StoragePutOptions {
  contentType?: string;
  access?: 'public' | 'private';
}

export interface StoragePutResult {
  path: string;
  url: string;
  size: number;
}

export interface FireStorage {
  put(filePath: string, content: string | Uint8Array | ArrayBuffer, options?: StoragePutOptions): Promise<StoragePutResult>;
  get(filePath: string): Promise<Uint8Array | null>;
  getText(filePath: string): Promise<string | null>;
  delete(filePath: string): Promise<boolean>;
  exists(filePath: string): Promise<boolean>;
  url(filePath: string): string;
}

export interface StorageOptions {
  driver?: 'memory' | 'local';
  rootDir?: string;
  baseUrl?: string;
}

export class MemoryStorageAdapter implements FireStorage {
  private files: Map<string, { data: Uint8Array; contentType?: string }> = new Map();
  private baseUrl: string;

  constructor(options: { baseUrl?: string } = {}) {
    this.baseUrl = (options.baseUrl || '/uploads').replace(/\/+$/, '');
  }

  public async put(
    filePath: string,
    content: string | Uint8Array | ArrayBuffer,
    options?: StoragePutOptions
  ): Promise<StoragePutResult> {
    const cleanPath = filePath.replace(/^\/+/, '');
    let bytes: Uint8Array;

    if (typeof content === 'string') {
      bytes = new TextEncoder().encode(content);
    } else if (content instanceof ArrayBuffer) {
      bytes = new Uint8Array(content);
    } else {
      bytes = content;
    }

    this.files.set(cleanPath, { data: bytes, contentType: options?.contentType });

    return {
      path: cleanPath,
      url: this.url(cleanPath),
      size: bytes.byteLength,
    };
  }

  public async get(filePath: string): Promise<Uint8Array | null> {
    const cleanPath = filePath.replace(/^\/+/, '');
    const file = this.files.get(cleanPath);
    return file ? file.data : null;
  }

  public async getText(filePath: string): Promise<string | null> {
    const bytes = await this.get(filePath);
    return bytes ? new TextDecoder().decode(bytes) : null;
  }

  public async delete(filePath: string): Promise<boolean> {
    const cleanPath = filePath.replace(/^\/+/, '');
    return this.files.delete(cleanPath);
  }

  public async exists(filePath: string): Promise<boolean> {
    const cleanPath = filePath.replace(/^\/+/, '');
    return this.files.has(cleanPath);
  }

  public url(filePath: string): string {
    const cleanPath = filePath.replace(/^\/+/, '');
    return `${this.baseUrl}/${cleanPath}`;
  }
}

export class LocalDiskStorageAdapter implements FireStorage {
  private rootDir: string;
  private baseUrl: string;

  constructor(options: { rootDir?: string; baseUrl?: string } = {}) {
    this.rootDir = options.rootDir || path.join(process.cwd(), 'uploads');
    this.baseUrl = (options.baseUrl || '/uploads').replace(/\/+$/, '');

    if (!fs.existsSync(this.rootDir)) {
      fs.mkdirSync(this.rootDir, { recursive: true });
    }
  }

  private resolvePath(filePath: string): string {
    const cleanPath = filePath.replace(/^\/+/, '');
    return path.join(this.rootDir, cleanPath);
  }

  public async put(
    filePath: string,
    content: string | Uint8Array | ArrayBuffer,
    _options?: StoragePutOptions
  ): Promise<StoragePutResult> {
    const cleanPath = filePath.replace(/^\/+/, '');
    const fullPath = this.resolvePath(cleanPath);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let bytes: Uint8Array;
    if (typeof content === 'string') {
      bytes = new TextEncoder().encode(content);
    } else if (content instanceof ArrayBuffer) {
      bytes = new Uint8Array(content);
    } else {
      bytes = content;
    }

    fs.writeFileSync(fullPath, bytes);

    return {
      path: cleanPath,
      url: this.url(cleanPath),
      size: bytes.byteLength,
    };
  }

  public async get(filePath: string): Promise<Uint8Array | null> {
    const fullPath = this.resolvePath(filePath);
    if (!fs.existsSync(fullPath)) return null;
    const buffer = fs.readFileSync(fullPath);
    return new Uint8Array(buffer);
  }

  public async getText(filePath: string): Promise<string | null> {
    const fullPath = this.resolvePath(filePath);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath, 'utf-8');
  }

  public async delete(filePath: string): Promise<boolean> {
    const fullPath = this.resolvePath(filePath);
    if (!fs.existsSync(fullPath)) return false;
    fs.unlinkSync(fullPath);
    return true;
  }

  public async exists(filePath: string): Promise<boolean> {
    const fullPath = this.resolvePath(filePath);
    return fs.existsSync(fullPath);
  }

  public url(filePath: string): string {
    const cleanPath = filePath.replace(/^\/+/, '');
    return `${this.baseUrl}/${cleanPath}`;
  }
}

export function createStorage(options: StorageOptions = {}): FireStorage {
  const driver = options.driver || 'memory';
  if (driver === 'local') {
    return new LocalDiskStorageAdapter(options);
  }
  return new MemoryStorageAdapter(options);
}
