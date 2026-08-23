import { afterEach, describe, expect, it, vi } from 'vitest';
import { moveDriveFile } from './googleDrive';

afterEach(() => vi.unstubAllGlobals());

describe('moveDriveFile', () => {
  it('moves an item between Drive parents and requests refreshed metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'note',
          mimeType: 'text/markdown',
          modifiedTime: 'moved',
          name: 'Note.md',
          parents: ['destination'],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(moveDriveFile('token', 'note', 'source', 'destination')).resolves.toEqual(
      expect.objectContaining({ id: 'note', parents: ['destination'] }),
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const requestUrl = new URL(url);
    expect(requestUrl.searchParams.get('addParents')).toBe('destination');
    expect(requestUrl.searchParams.get('removeParents')).toBe('source');
    expect(requestUrl.searchParams.get('supportsAllDrives')).toBe('true');
    expect(requestUrl.searchParams.get('fields')).toContain('modifiedTime');
    expect(init.method).toBe('PATCH');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token');
  });
});
