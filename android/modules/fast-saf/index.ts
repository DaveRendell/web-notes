import { requireOptionalNativeModule } from 'expo';

export type SafChild = { uri: string; name: string; isDirectory: boolean };

type FastSafNative = {
  listChildren(rootUri: string, folderUri: string): Promise<SafChild[]>;
};

export default requireOptionalNativeModule<FastSafNative>('FastSaf');
