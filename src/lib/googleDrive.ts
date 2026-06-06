import { DriveFile, GOOGLE_FOLDER_MIME_TYPE } from '../types/drive';

const DRIVE_API_ROOT = 'https://www.googleapis.com/drive/v3';

type DriveListResponse = {
  files?: DriveFile[];
  nextPageToken?: string;
};

type ListChildrenOptions = {
  accessToken: string;
  folderId: string;
  foldersOnly?: boolean;
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

export async function listDriveChildren({
  accessToken,
  folderId,
  foldersOnly = false,
}: ListChildrenOptions): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
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
    );

    files.push(...(response.files ?? []));
    pageToken = response.nextPageToken;
  } while (pageToken);

  return files;
}

export async function getDriveFileText(accessToken: string, fileId: string): Promise<string> {
  return driveFetchText(`${DRIVE_API_ROOT}/files/${fileId}?alt=media`, accessToken);
}

export async function updateDriveFileText(
  accessToken: string,
  fileId: string,
  content: string,
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
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
      },
      body: content,
    },
  );
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

export async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
  await driveFetchEmpty(`${DRIVE_API_ROOT}/files/${fileId}?supportsAllDrives=true`, accessToken, {
    method: 'DELETE',
  });
}

function buildChildrenQuery(folderId: string, foldersOnly: boolean) {
  const parts = [`'${folderId.replace(/'/g, "\\'")}' in parents`, 'trashed = false'];

  if (foldersOnly) {
    parts.push(`mimeType = '${GOOGLE_FOLDER_MIME_TYPE}'`);
  }

  return parts.join(' and ');
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
    return body.error?.message ?? `Google Drive request failed with ${response.status}`;
  } catch {
    return `Google Drive request failed with ${response.status}`;
  }
}

function ensureMarkdownExtension(name: string) {
  const trimmedName = name.trim();
  return trimmedName.toLowerCase().endsWith('.md') ? trimmedName : `${trimmedName}.md`;
}
