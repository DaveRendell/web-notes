import { requireOptionalNativeModule } from 'expo';

export type SafChild = { uri: string; name: string; isDirectory: boolean; mimeType?: string; size?: number };

type FastSafNative = {
  listChildren(rootUri: string, folderUri: string): Promise<SafChild[]>;
  writeText(uri: string, text: string): Promise<void>;
  writeBase64(uri: string, value: string): Promise<void>;
};

export default requireOptionalNativeModule<FastSafNative>('FastSaf');
