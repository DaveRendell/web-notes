import { Fragment, useState } from 'react';
import { getTwemojiUrl, splitEmojiText } from '../lib/twemoji';

type TwemojiProps = {
  emoji: string;
  hidden?: boolean;
};

export function Twemoji({ emoji, hidden = false }: TwemojiProps) {
  const [failed, setFailed] = useState(false);
  const url = getTwemojiUrl(emoji);

  if (!url || failed) return <span aria-hidden={hidden || undefined}>{emoji}</span>;

  return (
    <img
      alt={hidden ? '' : emoji}
      aria-hidden={hidden || undefined}
      className="twemoji"
      draggable={false}
      onError={() => setFailed(true)}
      src={url}
    />
  );
}

export function TwemojiText({ text }: { text: string }) {
  return splitEmojiText(text).map((part, index) => (
    <Fragment key={`${index}-${part.text}`}>
      {part.emoji ? <Twemoji emoji={part.text} /> : part.text}
    </Fragment>
  ));
}
