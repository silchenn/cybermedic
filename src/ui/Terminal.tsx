import { useEffect, useRef, useState } from 'react';
import { banner, prompt } from '../sim/cli';
import { newSession } from '../sim/state';
import { useStore } from '../store';
import type { Device } from '../types';

export function Terminal({ dev }: { dev: Device }) {
  const lang = useStore((s) => s.lang);
  const ses = useStore((s) => s.sessions[dev.id]) ?? newSession();
  const exec = useStore((s) => s.exec);
  const [input, setInput] = useState('');
  const [hIdx, setHIdx] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [ses.lines.length]);
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    setHIdx(null);
  }, [dev.id]);

  const p = prompt(dev, ses);
  const submit = () => {
    exec(dev.id, input);
    setInput('');
    setHIdx(null);
  };

  return (
    <div className="term" onClick={() => inputRef.current?.focus({ preventScroll: true })}>
      <div className="term-out" ref={scroller}>
        {banner(dev, lang).map((b, i) => (
          <div key={'b' + i} className="t-sys">
            {b}
          </div>
        ))}
        {ses.lines.map((ln, i) => (
          <div key={i} className={`t-${ln.kind}`}>
            {ln.text || '\u00a0'}
          </div>
        ))}
      </div>
      <div className="term-in">
        <span className="t-prompt">{p}</span>
        <input
          ref={inputRef}
          value={input}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-label="command"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            else if (e.key === 'ArrowUp') {
              e.preventDefault();
              const h = ses.history;
              if (!h.length) return;
              const n = hIdx === null ? h.length - 1 : Math.max(0, hIdx - 1);
              setHIdx(n);
              setInput(h[n]);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              const h = ses.history;
              if (hIdx === null) return;
              const n = hIdx + 1;
              if (n >= h.length) {
                setHIdx(null);
                setInput('');
              } else {
                setHIdx(n);
                setInput(h[n]);
              }
            }
          }}
        />
      </div>
    </div>
  );
}

