import * as FileSystem from 'expo-file-system/legacy';

export type ThemePreference = 'system' | 'light' | 'dark';
const themeUri = `${FileSystem.documentDirectory}theme-preference.txt`;

export async function readThemePreference(): Promise<ThemePreference> {
  try {
    if (!(await FileSystem.getInfoAsync(themeUri)).exists) return 'system';
    const preference = (await FileSystem.readAsStringAsync(themeUri)).trim();
    return preference === 'light' || preference === 'dark' ? preference : 'system';
  } catch (cause) { console.warn('Could not read appearance preference:', cause); return 'system'; }
}
export async function writeThemePreference(preference: ThemePreference): Promise<void> {
  try { await FileSystem.writeAsStringAsync(themeUri, preference); }
  catch (cause) { console.warn('Could not write appearance preference:', cause); }
}
