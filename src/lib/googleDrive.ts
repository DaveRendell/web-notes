import { DriveFile, GOOGLE_FOLDER_MIME_TYPE } from '../types/drive';

const DRIVE_API_ROOT = 'https://www.googleapis.com/drive/v3';

type DriveListResponse = {
  files?: DriveFile[];
  nextPageToken?: string;
};

type DriveAboutResponse = {
  user?: {
    permissionId?: string;
  };
};

type ListChildrenOptions = {
  accessToken: string;
  folderId: string;
  foldersOnly?: boolean;
  signal?: AbortSignal;
};

type FindChildOptions = {
  accessToken: string;
  folderId: string;
  name: string;
};

export class GoogleDriveError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'GoogleDriveError';
  }
}

export function isGoogleDriveAuthError(error: unknown): error is GoogleDriveError {
  return error instanceof GoogleDriveError && error.status === 401;
}

export async function getDriveAccountId(accessToken: string): Promise<string> {
  const params = new URLSearchParams({ fields: 'user(permissionId)' });
  const response = await driveFetch<DriveAboutResponse>(`${DRIVE_API_ROOT}/about?${params.toString()}`, accessToken);
  const accountId = response.user?.permissionId;

  if (!accountId) {
    throw new GoogleDriveError('Google Drive did not return an account identifier.');
  }

  return accountId;
}

export async function listDriveChildren({
  accessToken,
  folderId,
  foldersOnly = false,
  signal,
}: ListChildrenOptions): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  const seenPageTokens = new Set<string>();
  let pageToken: string | undefined;

  do {
    signal?.throwIfAborted();
    const params = new URLSearchParams({
      fields: 'nextPageToken, files(id, name, mimeType, parents, modifiedTime, size)',
      orderBy: 'folder,name_natural',
      pageSize: '1000',
      q: buildChildrenQuery(folderId, foldersOnly),
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });

    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const response = await driveFetch<DriveListResponse>(
      `${DRIVE_API_ROOT}/files?${params.toString()}`,
      accessToken,
      { signal },
    );

    // Never turn a malformed or partial listing into a successful empty tree:
    // callers use complete listings to prune their local caches.
    if (!response || typeof response !== 'object'
      || (response.files !== undefined && (!Array.isArray(response.files)
        || !response.files.every((file) => file && typeof file.id === 'string'
          && typeof file.name === 'string' && typeof file.mimeType === 'string')))
      || (response.nextPageToken !== undefined && typeof response.nextPageToken !== 'string')) {
      throw new GoogleDriveError('Google Drive returned an invalid file listing. Please try again.');
    }
    files.push(...(response.files ?? []));
    pageToken = response.nextPageToken;
    if (pageToken) {
      if (seenPageTokens.has(pageToken)) {
        throw new GoogleDriveError('Google Drive returned a repeated listing page. Please try again.');
      }
      seenPageTokens.add(pageToken);
    }
  } while (pageToken);

  return files.filter((file) => !file.name.startsWith('.'));
}

export async function getDriveFileText(accessToken: string, fileId: string): Promise<string> {
  return driveFetchText(`${DRIVE_API_ROOT}/files/${fileId}?alt=media`, accessToken);
}

export async function getDriveImage(accessToken: string, fileId: string): Promise<Blob> {
  const response = await fetch(`${DRIVE_API_ROOT}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new GoogleDriveError(await getErrorMessage(response), response.status);
  return response.blob();
}

export async function uploadDriveImage(accessToken: string, parentId: string, file: File): Promise<DriveFile> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Images must be smaller than 20 MB.');
  const boundary = `web-notes-${crypto.randomUUID()}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n`,
    JSON.stringify({ name: file.name, mimeType: file.type, parents: [parentId] }),
    `\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`, file,
    `\r\n--${boundary}--\r\n`,
  ]);
  return driveFetch<DriveFile>(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,parents,modifiedTime,size`, accessToken, {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
  });
}

export async function findDriveChildByName({
  accessToken,
  folderId,
  name,
}: FindChildOptions): Promise<DriveFile | null> {
  const params = new URLSearchParams({
    fields: 'files(id, name, mimeType, parents, modifiedTime, size)',
    orderBy: 'modifiedTime desc',
    pageSize: '1',
    q: buildNamedChildQuery(folderId, name),
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });
  const response = await driveFetch<DriveListResponse>(
    `${DRIVE_API_ROOT}/files?${params.toString()}`,
    accessToken,
  );

  return response.files?.[0] ?? null;
}

export async function createDriveTextFile(
  accessToken: string,
  parentFolderId: string,
  name: string,
  content: string,
  mimeType = 'text/plain',
): Promise<DriveFile> {
  const boundary = `web-notes-${crypto.randomUUID()}`;
  const params = new URLSearchParams({
    uploadType: 'multipart',
    fields: 'id, name, mimeType, parents, modifiedTime, size',
    supportsAllDrives: 'true',
  });
  const metadata = JSON.stringify({ mimeType, name, parents: [parentFolderId] });
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=utf-8',
    '',
    metadata,
    `--${boundary}`,
    `Content-Type: ${mimeType}; charset=utf-8`,
    '',
    content,
    `--${boundary}--`,
    '',
  ].join('\r\n');

  return driveFetch<DriveFile>(
    `https://www.googleapis.com/upload/drive/v3/files?${params.toString()}`,
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  );
}

export async function updateDriveTextFile(
  accessToken: string,
  fileId: string,
  content: string,
  mimeType = 'text/plain',
): Promise<DriveFile> {
  const params = new URLSearchParams({
    uploadType: 'media',
    fields: 'id, name, mimeType, parents, modifiedTime, size',
    supportsAllDrives: 'true',
  });

  return driveFetch<DriveFile>(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?${params.toString()}`,
    accessToken,
    {
      method: 'PATCH',
      headers: { 'Content-Type': `${mimeType}; charset=utf-8` },
      body: content,
    },
  );
}

export async function updateDriveFileText(
  accessToken: string,
  fileId: string,
  content: string,
): Promise<DriveFile> {
  return updateDriveTextFile(accessToken, fileId, content, 'text/markdown');
}

export async function createDriveMarkdownFile(
  accessToken: string,
  parentFolderId: string,
  name: string,
): Promise<DriveFile> {
  const params = new URLSearchParams({
    fields: 'id, name, mimeType, parents, modifiedTime, size',
    supportsAllDrives: 'true',
  });

  return driveFetch<DriveFile>(`${DRIVE_API_ROOT}/files?${params.toString()}`, accessToken, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      mimeType: 'text/markdown',
      name: ensureMarkdownExtension(name),
      parents: [parentFolderId],
    }),
  });
}

export async function createDriveFolder(
  accessToken: string,
  parentFolderId: string,
  name: string,
): Promise<DriveFile> {
  const params = new URLSearchParams({
    fields: 'id, name, mimeType, parents, modifiedTime, size',
    supportsAllDrives: 'true',
  });

  return driveFetch<DriveFile>(`${DRIVE_API_ROOT}/files?${params.toString()}`, accessToken, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      mimeType: GOOGLE_FOLDER_MIME_TYPE,
      name: name.trim(),
      parents: [parentFolderId],
    }),
  });
}

export async function renameDriveFile(
  accessToken: string,
  fileId: string,
  name: string,
): Promise<DriveFile> {
  const params = new URLSearchParams({
    fields: 'id, name, mimeType, parents, modifiedTime, size',
    supportsAllDrives: 'true',
  });

  return driveFetch<DriveFile>(`${DRIVE_API_ROOT}/files/${fileId}?${params.toString()}`, accessToken, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ name: ensureMarkdownExtension(name) }),
  });
}

export async function renameDriveFolder(
  accessToken: string,
  folderId: string,
  name: string,
): Promise<DriveFile> {
  return renameDriveItem(accessToken, folderId, name);
}

export async function renameDriveItem(accessToken: string, fileId: string, name: string): Promise<DriveFile> {
  const params = new URLSearchParams({
    fields: 'id, name, mimeType, parents, modifiedTime, size',
    supportsAllDrives: 'true',
  });

  return driveFetch<DriveFile>(`${DRIVE_API_ROOT}/files/${fileId}?${params.toString()}`, accessToken, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ name: name.trim() }),
  });
}

export async function moveDriveFile(
  accessToken: string,
  fileId: string,
  oldParentId: string,
  newParentId: string,
): Promise<DriveFile> {
  const params = new URLSearchParams({
    addParents: newParentId,
    removeParents: oldParentId,
    fields: 'id, name, mimeType, parents, modifiedTime, size',
    supportsAllDrives: 'true',
  });

  return driveFetch<DriveFile>(`${DRIVE_API_ROOT}/files/${fileId}?${params.toString()}`, accessToken, {
    method: 'PATCH',
  });
}

export async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
  await driveFetchEmpty(`${DRIVE_API_ROOT}/files/${fileId}?supportsAllDrives=true`, accessToken, {
    method: 'DELETE',
  });
}

function buildChildrenQuery(folderId: string, foldersOnly: boolean) {
  const parts = [`'${escapeDriveQueryValue(folderId)}' in parents`, 'trashed = false'];

  if (foldersOnly) {
    parts.push(`mimeType = '${GOOGLE_FOLDER_MIME_TYPE}'`);
  }

  return parts.join(' and ');
}

function buildNamedChildQuery(folderId: string, name: string) {
  return [
    `'${escapeDriveQueryValue(folderId)}' in parents`,
    `name = '${escapeDriveQueryValue(name)}'`,
    'trashed = false',
  ].join(' and ');
}

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function driveFetch<T>(url: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new GoogleDriveError(await getErrorMessage(response), response.status);
  }

  return response.json() as Promise<T>;
}

async function driveFetchText(url: string, accessToken: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new GoogleDriveError(await getErrorMessage(response), response.status);
  }

  return response.text();
}

async function driveFetchEmpty(url: string, accessToken: string, init: RequestInit = {}): Promise<void> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new GoogleDriveError(await getErrorMessage(response), response.status);
  }
}

async function getErrorMessage(response: Response) {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    const message = body?.error?.message;
    return typeof message === 'string' && message.trim()
      ? message : `Google Drive request failed with ${response.status}`;
  } catch {
    return `Google Drive request failed with ${response.status}`;
  }
}

function ensureMarkdownExtension(name: string) {
  const trimmedName = name.trim();
  return trimmedName.toLowerCase().endsWith('.md') ? trimmedName : `${trimmedName}.md`;
}
