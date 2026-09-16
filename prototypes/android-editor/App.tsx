import { useCallback, useState } from 'react';
import { Button, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { richMarkdownCorpus } from '../../src/test/richMarkdownCorpus';
import EditorSurface from './EditorSurface';

type EditorEvent = {
  kind: 'ready' | 'normalization' | 'user-change' | 'snapshot' | 'error';
  fixture: string;
  revision: number;
  characters: number;
  elapsedMs: number;
  message?: string;
};

export default function App() {
  const [selected, setSelected] = useState(0);
  const [events, setEvents] = useState<EditorEvent[]>([]);
  const [snapshotRequest, setSnapshotRequest] = useState(0);
  const fixture = richMarkdownCorpus[selected];
  const bodyMarkdown = fixture.markdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
  const record = useCallback(async (event: EditorEvent) => {
    setEvents((previous) => [event, ...previous].slice(0, 20));
  }, []);

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>Editor feasibility gate</Text>
        <Text style={styles.subtitle}>{selected + 1}/{richMarkdownCorpus.length}: {fixture.name}</Text>
        <View style={styles.actions}>
          <Button title="Previous" disabled={selected === 0} onPress={() => setSelected(selected - 1)} />
          <Button title="Next" disabled={selected === richMarkdownCorpus.length - 1} onPress={() => setSelected(selected + 1)} />
          <Button title="Snapshot" onPress={() => setSnapshotRequest((value) => value + 1)} />
        </View>
      </View>
      <View style={styles.editor}>
        <EditorSurface
          key={selected}
          fixtureName={fixture.name}
          markdown={bodyMarkdown}
          onEvent={record}
          snapshotRequest={snapshotRequest}
        />
      </View>
      <View style={styles.log}>
        <Text style={styles.logTitle}>Bridge events (no Drive writes)</Text>
        <ScrollView>
          {events.map((event, index) => (
            <Text key={`${event.fixture}-${event.kind}-${index}`} style={styles.logLine}>
              {event.kind} · r{event.revision} · {event.characters} chars · {event.elapsedMs} ms{event.message ? ` · ${event.message}` : ''}
            </Text>
          ))}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f6f7f5' },
  header: { padding: 12, borderBottomWidth: 1, borderColor: '#d8ddd6' },
  title: { color: '#19291d', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#4b5c50', marginTop: 4 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  editor: { flex: 1 },
  log: { height: 110, borderTopWidth: 1, borderColor: '#d8ddd6', padding: 8 },
  logTitle: { fontWeight: '600', color: '#19291d' },
  logLine: { color: '#4b5c50', fontSize: 12 },
});
