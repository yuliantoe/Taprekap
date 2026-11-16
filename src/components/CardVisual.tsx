import { Wifi } from 'lucide-react';
import type { EMoneyCard } from '../types';
import { formatDateTimeId, formatRupiah, ISSUER_META } from '../lib/formatters';

interface CardVisualProps {
  card: EMoneyCard;
  selected?: boolean;
  onSelect?: (card: EMoneyCard) => void;
  compact?: boolean;
}

export function CardVisual({ card, selected, onSelect, compact = false }: CardVisualProps) {
  const meta = ISSUER_META[card.issuer] || ISSUER_META.mandiri;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(card)}
      className={`group relative w-full text-left rounded-2xl bg-gradient-to-br ${meta.gradient} ${meta.textColor} transition-transform duration-150 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
        compact ? 'p-4' : 'p-5'
      } ${selected ? 'ring-2 ring-blue-600 ring-offset-2 ring-offset-slate-50' : 'hover:-translate-y-0.5'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-white/75 tracking-wide">
            {meta.bank}
          </div>
          <div className="mt-0.5 text-base font-bold font-display tracking-tight truncate">
            {meta.name}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-white/80 shrink-0" aria-hidden="true">
          <Wifi className="w-5 h-5 rotate-90" />
        </div>
      </div>

      <div className={compact ? 'mt-4' : 'mt-6'}>
        <div className="text-[11px] text-white/70">Saldo Tersedia</div>
        <div className="mt-0.5 text-2xl font-bold font-mono tabular-nums tracking-tight">
          {formatRupiah(card.balance)}
        </div>
      </div>

      <div className={`${compact ? 'mt-4' : 'mt-5'} pt-3 border-t border-white/15 flex items-center justify-between gap-3 text-xs`}>
        <div className="min-w-0">
          <div className="font-medium text-white truncate">{card.label}</div>
          <div className="mt-0.5 font-mono text-[11px] text-white/75 tabular-nums truncate">
            {card.cardNumberMasked} · UID {card.uid}
          </div>
        </div>
        <div className="text-right shrink-0 text-[11px] text-white/75 tabular-nums">
          {formatDateTimeId(card.lastTappedAt)}
        </div>
      </div>
    </button>
  );
}
