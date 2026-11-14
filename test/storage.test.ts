import { describe, expect, it } from 'bun:test';
import { MemoryStorageAdapter } from '../src/storage/storage';

describe('FireAPI Universal Object Storage Hub (fire-api/storage)', () => {
  it('stores, retrieves, and checks existence of files in storage', async () => {
    const storage = new MemoryStorageAdapter({ baseUrl: 'http://localhost:3000/uploads' });

    const content = 'User avatar raw binary or string data';
    const result = await storage.put('avatars/usr_1.png', content, { contentType: 'image/png' });

    expect(result.path).toBe('avatars/usr_1.png');
    expect(result.url).toBe('http://localhost:3000/uploads/avatars/usr_1.png');
    expect(result.size).toBe(content.length);

    expect(await storage.exists('avatars/usr_1.png')).toBe(true);
    expect(await storage.exists('avatars/non_existent.png')).toBe(false);

    const retrievedText = await storage.getText('avatars/usr_1.png');
    expect(retrievedText).toBe(content);
  });

  it('deletes files from storage cleanly', async () => {
    const storage = new MemoryStorageAdapter();
    await storage.put('temp.txt', 'Delete me');

    expect(await storage.exists('temp.txt')).toBe(true);
    const deleted = await storage.delete('temp.txt');
    expect(deleted).toBe(true);
    expect(await storage.exists('temp.txt')).toBe(false);
  });
});
