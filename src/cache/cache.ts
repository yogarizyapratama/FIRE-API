import { FireCacheManager } from '../types';

interface CacheEntry {
  value: any;
  expiresAt: number;
  tags: Set<string>;
}

export class MemoryCacheManager implements FireCacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map(); // tag -> Set of keys

  public async get<T = any>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.deleteKey(key);
      return null;
    }

    return entry.value as T;
  }

  public async set(key: string, value: any, ttlSeconds = 60, tags: string[] = []): Promise<void> {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    const tagSet = new Set(tags);

    // If key already existed with other tags, clean up old index
    this.deleteKey(key);

    this.cache.set(key, { value, expiresAt, tags: tagSet });

    for (const tag of tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(key);
    }
  }

  public async invalidate(tag: string): Promise<void> {
    const keys = this.tagIndex.get(tag);
    if (!keys) return;

    for (const key of Array.from(keys)) {
      this.deleteKey(key);
    }
    this.tagIndex.delete(tag);
  }

  public async clear(): Promise<void> {
    this.cache.clear();
    this.tagIndex.clear();
  }

  private deleteKey(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      for (const tag of entry.tags) {
        const tagSet = this.tagIndex.get(tag);
        if (tagSet) {
          tagSet.delete(key);
          if (tagSet.size === 0) {
            this.tagIndex.delete(tag);
          }
        }
      }
      this.cache.delete(key);
    }
  }
}
