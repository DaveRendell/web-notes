import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, View } from 'react-native';
import type { DriveFile } from '../web/src/types/drive';
import { connectVaultAccount, listDriveFolders, selectDriveVault } from './driveVault';

export default function DriveVaultPicker({ onSelect, onCancel, dark }: { onSelect(uri: string): void; onCancel(): void; dark: boolean }) {
  const [account, setAccount] = useState<Awaited<ReturnType<typeof connectVaultAccount>> | null>(null);
  const [path, setPath] = useState([{ id: 'root', name: 'My Drive' }]);
  const [folders, setFolders] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const current = path[path.length - 1];
  const foreground = dark ? '#e7ebf0' : '#202124';
  const background = dark ? '#181e25' : '#ffffff';
  useEffect(() => {
    let cancelled = false;
    void connectVaultAccount().then((value) => { if (!cancelled) setAccount(value); }).catch((cause) => { if (!cancelled) { setError(String(cause)); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    setLoading(true); setError(null);
    void listDriveFolders(current.id).then((value) => { if (!cancelled) setFolders(value); }).catch((cause) => { if (!cancelled) setError(String(cause)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [account, current.id]);
  return <Modal visible animationType="slide" onRequestClose={onCancel}>
    <View style={{ flex: 1, padding: 24, backgroundColor: background, gap: 16 }}>
      <Text style={{ color: foreground, fontSize: 22 }}>Choose Drive vault</Text>
      <Text style={{ color: foreground }}>{path.map((folder) => folder.name).join(' / ')}</Text>
      {path.length > 1 && <Pressable accessibilityRole="button" onPress={() => setPath((previous) => previous.slice(0, -1))}><Text style={{ color: foreground, paddingVertical: 12 }}>‹ Parent folder</Text></Pressable>}
      {error && <Text style={{ color: dark ? '#f0aaa4' : '#a14444' }}>{error}</Text>}
      {loading ? <ActivityIndicator /> : <FlatList data={folders} keyExtractor={(folder) => folder.id} renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => setPath((previous) => [...previous, { id: item.id, name: item.name }])}><Text style={{ color: foreground, paddingVertical: 14 }}>📁 {item.name}</Text></Pressable>} ListEmptyComponent={<Text style={{ color: foreground }}>No subfolders</Text>} />}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 24 }}>
        <Pressable accessibilityRole="button" onPress={onCancel}><Text style={{ color: foreground, padding: 12 }}>Cancel</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={!account || loading || !!error} onPress={() => { if (account) void selectDriveVault(account, current.id).then(onSelect).catch((cause) => setError(String(cause))); }}><Text style={{ color: foreground, padding: 12, opacity: !account || loading || error ? 0.4 : 1 }}>Use this folder</Text></Pressable>
      </View>
    </View>
  </Modal>;
}
