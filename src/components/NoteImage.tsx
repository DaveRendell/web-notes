import { ImageOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useImages } from '../contexts/ImageContext';

export function NoteImage({ source, alt = '', title }: { source: string; alt?: string; title?: string | null }) {
  const services = useImages();
  const load = services?.load;
  const loadRef = useRef(load);
  loadRef.current = load;
  const scope = services?.scope;
  const external = /^https?:\/\//i.test(source);
  const [resolved, setResolved] = useState<{ key: string; url: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const key = `${scope}:${source}:${services?.version(source)}:${services?.online}`;
  useEffect(() => {
    if (external || !loadRef.current) return;
    let cancelled = false;
    let objectUrl: string | undefined;
    void loadRef.current(source).then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setResolved({ key, url: objectUrl });
    }).catch(() => { if (!cancelled) setFailed(key); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [external, key, source]);
  const url = external ? source : resolved?.key === key ? resolved.url : null;
  if (url && failed !== key) return <img className="note-image" src={url} alt={alt} title={title ?? undefined} referrerPolicy="no-referrer" onError={() => setFailed(key)} />;
  const label = source.split('/').at(-1) || 'No image path';
  return <span className="rich-image-placeholder" role="img" aria-label={`${alt || label}: image unavailable`} title={title ?? source}>
    <ImageOff aria-hidden="true" size={26} /><span><strong>{failed === key || !load ? 'Image unavailable' : 'Loading image…'}</strong><small>{alt || label}</small></span>
  </span>;
}
