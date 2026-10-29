import type React from 'react';
import back from '@/assets/uno-back.jpg.asset.json';
import { describe, type Card } from '@/lib/uno/engine';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function UnoCard({ card, className, faceDown, onClick, disabled, highlight, style }: {
  card?: Card; className?: string; style?: React.CSSProperties; faceDown?: boolean; onClick?: () => void; disabled?: boolean; highlight?: boolean;
}) {
  const label = faceDown || !card ? 'بطاقة مقلوبة' : describe(card);
  const symbol = !card ? '' : card.kind === 'number' ? String(card.value) : ({skip:'⊘', reverse:'⇄', draw2:'+2', wild:'', wild4:'+4'}[card.kind]);
  const content = faceDown || !card ? <img src={back.url} alt="" draggable={false} className="h-full w-full object-cover" /> : (
    <svg viewBox="0 0 100 150" className={cn('uno-face h-full w-full', `uno-face-${card.color}`)} aria-hidden="true">
      <rect x="2" y="2" width="96" height="146" rx="8" className="uno-paper" />
      <rect x="7" y="7" width="86" height="136" rx="6" className="uno-color" />
      <ellipse cx="50" cy="75" rx="32" ry="54" transform="rotate(28 50 75)" className="uno-paper" />
      {card.color === 'wild' && <g transform="translate(22 38)"><path d="M28 0 A28 37 0 0 0 0 37 H28Z" className="uno-swatch-red" /><path d="M28 0 A28 37 0 0 1 56 37 H28Z" className="uno-swatch-blue" /><path d="M0 37 A28 37 0 0 0 28 74 V37Z" className="uno-swatch-yellow" /><path d="M56 37 A28 37 0 0 1 28 74 V37Z" className="uno-swatch-green" /></g>}
      <text x="50" y="91" textAnchor="middle" className={card.color === 'wild' ? 'uno-wild-symbol' : 'uno-symbol'}>{symbol}</text>
      <text x="12" y="29" className="uno-corner">{symbol || '◆'}</text>
      <text x="12" y="29" transform="rotate(180 50 75)" className="uno-corner">{symbol || '◆'}</text>
    </svg>
  );
  const classes = cn('uno-card relative block aspect-[2/3] shrink-0 overflow-hidden bg-card shadow-card transition-transform', highlight && 'ring-2 ring-accent -translate-y-2', className);
  return onClick ? <Button variant="ghost" onClick={onClick} disabled={disabled} aria-label={label} className={classes} style={style}>{content}</Button> : <div aria-label={label} className={classes} style={style}>{content}</div>;
}