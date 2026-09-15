import { AppShell } from './components/AppShell';
import { ImageProvider } from './contexts/ImageContext';
import { CalendarProvider } from './contexts/CalendarContext';

export function App() {
  return <CalendarProvider><ImageProvider><AppShell /></ImageProvider></CalendarProvider>;
}
