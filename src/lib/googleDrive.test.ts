import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDriveTextFile, findDriveChildByName, getDriveImage, moveDriveFile, updateDriveTextFile, uploadDriveImage } from './googleDrive';

afterEach(() => vi.unstubAllGlobals());

describe('Drive images', () => {
  it('downloads image bytes with authentication', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('image bytes'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await (await getDriveImage('token', 'image')).text()).toBe('image bytes');
    expect(fetchMock.mock.calls[0][0]).toContain('alt=media');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token');
  });
  it('uploads binary multipart data and returns metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'image', name: 'photo.png' })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await uploadDriveImage('token', 'parent', new File(['bytes'], 'photo.png', { type: 'image/png' }))).toEqual({ id: 'image', name: 'photo.png' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('uploadType=multipart');
    expect(init.body).toBeInstanceOf(Blob);
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token');
  });
  it('rejects non-images before issuing a request and propagates auth errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(uploadDriveImage('token', 'parent', new File(['x'], 'note.txt', { type: 'text/plain' }))).rejects.toThrow('Choose an image');
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(getDriveImage('token', 'id')).rejects.toMatchObject({ status: 401 });
  });
});

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

describe('vault settings Drive operations', () => {
  it('finds an exact hidden child without relying on the visible file listing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      files: [{ id: 'settings', mimeType: 'application/json', name: '.web-notes.json' }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(findDriveChildByName({
      accessToken: 'token',
      folderId: "vault'id",
      name: '.web-notes.json',
    })).resolves.toEqual(expect.objectContaining({ id: 'settings' }));

    const requestUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestUrl.searchParams.get('q')).toBe(
      "'vault\\'id' in parents and name = '.web-notes.json' and trashed = false",
    );
    expect(requestUrl.searchParams.get('pageSize')).toBe('1');
  });

  it('creates a JSON file and its content in one multipart request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'settings',
      mimeType: 'application/json',
      name: '.web-notes.json',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await createDriveTextFile('token', 'vault', '.web-notes.json', '{"version":1}', 'application/json');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).searchParams.get('uploadType')).toBe('multipart');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Content-Type')).toContain('multipart/related; boundary=web-notes-');
    expect(init.body).toContain('"name":".web-notes.json"');
    expect(init.body).toContain('{"version":1}');
  });

  it('updates arbitrary text content with the requested MIME type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'settings',
      mimeType: 'application/json',
      name: '.web-notes.json',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await updateDriveTextFile('token', 'settings', '{}', 'application/json');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('PATCH');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(init.body).toBe('{}');
  });
});
