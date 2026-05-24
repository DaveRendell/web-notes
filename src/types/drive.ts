export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  modifiedTime?: string;
  size?: string;
};

export type DriveFolder = DriveFile & {
  mimeType: typeof GOOGLE_FOLDER_MIME_TYPE;
};

export const GOOGLE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
