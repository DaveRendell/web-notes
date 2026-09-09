import { AppShell } from './components/AppShell';
import { ImageProvider } from './contexts/ImageContext';

export function App() {
  return <ImageProvider><AppShell /></ImageProvider>;
}
