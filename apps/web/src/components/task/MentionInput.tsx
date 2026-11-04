'use client';

import { MENTION_PATTERN, mentionToken, type UserRef } from '@tasknest/shared';
import clsx from 'clsx';
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { MiniAvatar } from './bits';

/** Stored comment body -> what the textarea shows ("@Name") + the mentioned people. */
export function fromStored(body: string): { text: string; mentions: UserRef[] } {
  const mentions: UserRef[] = [];
  const text = body.replace(MENTION_PATTERN, (_m, fullName: string, id: string) => {
    if (!mentions.some((x) => x.id === id)) mentions.push({ id, fullName });
    return `@${fullName}`;
  });
  return { text, mentions };
}

/** Textarea text -> stored body: each "@Name" still present for a picked person becomes a mention token. */
export function toStored(text: string, mentions: UserRef[]): string {
  let out = text;
  for (const m of [...mentions].sort((a, b) => b.fullName.length - a.fullName.length)) {
    out = out.split(`@${m.fullName}`).join(mentionToken(m));
  }
  return out;
}

/** Renders a stored body with mentions highlighted. */
export function CommentBody({ body, meId }: { body: string; meId?: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION_PATTERN)) {
    if (m.index! > last) parts.push(body.slice(last, m.index));
    parts.push(
      <span key={m.index} className={clsx('rounded px-0.5 font-medium', m[2] === meId ? 'bg-warning/20 text-text' : 'bg-primary-subtle text-primary')}>
        @{m[1]}
      </span>,
    );
    last = m.index! + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return <>{parts}</>;
}

export interface MentionInputHandle {
  focus: () => void;
}

/**
 * Textarea with @-autocomplete: typing "@" followed by letters shows matching workspace members;
 * Enter/Tab or click inserts "@Full Name" and records the person so it is saved as a mention.
 */
export const MentionInput = forwardRef<MentionInputHandle, {
  value: string;
  onChange: (text: string) => void;
  mentions: UserRef[];
  onMentionsChange: (m: UserRef[]) => void;
  people: UserRef[];
  onSubmit?: () => void;
  label: string;
  placeholder?: string;
  rows?: number;
}>(function MentionInput({ value, onChange, mentions, onMentionsChange, people, onSubmit, label, placeholder, rows = 3 }, ref) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<{ start: number; text: string } | null>(null);
  const [active, setActive] = useState(0);
  useImperativeHandle(ref, () => ({ focus: () => area.current?.focus() }));

  const matches = useMemo(() => {
    if (!query) return [];
    const q = query.text.toLowerCase();
    return people.filter((p) => p.fullName.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || p.fullName.toLowerCase().startsWith(q)).slice(0, 6);
  }, [query, people]);

  function detect(text: string, caret: number) {
    const before = text.slice(0, caret);
    const m = /(^|\s)@([A-Za-zÀ-ɏ'-]{0,30})$/.exec(before);
    setQuery(m ? { start: caret - m[2].length - 1, text: m[2] } : null);
    setActive(0);
  }

  function pick(p: UserRef) {
    if (!query || !area.current) return;
    const caret = area.current.selectionStart;
    const insert = `@${p.fullName} `;
    const next = value.slice(0, query.start) + insert + value.slice(caret);
    onChange(next);
    if (!mentions.some((m) => m.id === p.id)) onMentionsChange([...mentions, p]);
    setQuery(null);
    requestAnimationFrame(() => {
      const pos = query.start + insert.length;
      area.current?.setSelectionRange(pos, pos);
      area.current?.focus();
    });
  }

  return (
    <div className="relative">
      <textarea
        ref={area}
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={matches.length > 0}
        aria-controls="mention-list"
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target.value, e.target.selectionStart);
        }}
        onClick={(e) => detect(value, (e.target as HTMLTextAreaElement).selectionStart)}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        onKeyDown={(e) => {
          if (matches.length) {
            if (e.key === 'ArrowDown') return e.preventDefault(), setActive((a) => (a + 1) % matches.length);
            if (e.key === 'ArrowUp') return e.preventDefault(), setActive((a) => (a - 1 + matches.length) % matches.length);
            if (e.key === 'Enter' || e.key === 'Tab') return e.preventDefault(), pick(matches[active]);
            if (e.key === 'Escape') return e.stopPropagation(), setQuery(null);
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit?.();
          }
        }}
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
      />
      {matches.length > 0 && (
        <ul id="mention-list" role="listbox" aria-label="Mention someone" className="absolute bottom-full left-0 z-10 mb-1 w-64 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg">
          {matches.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
                className={clsx('flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px]', i === active && 'bg-primary-subtle')}
              >
                <MiniAvatar name={p.fullName} size={20} /> {p.fullName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
