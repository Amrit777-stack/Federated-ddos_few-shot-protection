import React, { useState, useEffect, useRef } from 'react';

function parseNumericValue(val) {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  const match = str.match(/^([^\d\-+.]*?)([-+]?[\d,]+(?:\.\d+)?)([^\d]*)$/);
  if (!match) return null;
  const prefix = match[1];
  const numStr = match[2].replace(/,/g, '');
  const suffix = match[3];
  const num = parseFloat(numStr);
  if (isNaN(num)) return null;

  const decMatch = match[2].match(/\.(\d+)/);
  const decimals = decMatch ? decMatch[1].length : 0;
  const hasCommas = match[2].includes(',');

  return { prefix, num, suffix, decimals, hasCommas };
}

function useAnimatedValue(value, duration = 300) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isChanging, setIsChanging] = useState(false);
  const prevValueRef = useRef(value);
  const animFrameRef = useRef(null);

  useEffect(() => {
    const prefersReduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced || value === prevValueRef.current) {
      setDisplayValue(value);
      prevValueRef.current = value;
      return;
    }

    const prevParsed = parseNumericValue(prevValueRef.current);
    const nextParsed = parseNumericValue(value);

    if (prevParsed && nextParsed && prevParsed.prefix === nextParsed.prefix && prevParsed.suffix === nextParsed.suffix) {
      const startNum = prevParsed.num;
      const endNum = nextParsed.num;
      const startTime = performance.now();
      setIsChanging(true);

      const updateFrame = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        // Ease-out cubic curve (200-400ms)
        const ease = 1 - Math.pow(1 - progress, 3);
        const currentNum = startNum + (endNum - startNum) * ease;

        let formattedNum = currentNum.toFixed(nextParsed.decimals);
        if (nextParsed.hasCommas) {
          const parts = formattedNum.split('.');
          parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          formattedNum = parts.join('.');
        }

        setDisplayValue(`${nextParsed.prefix}${formattedNum}${nextParsed.suffix}`);

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(updateFrame);
        } else {
          setDisplayValue(value);
          setIsChanging(false);
          prevValueRef.current = value;
        }
      };

      animFrameRef.current = requestAnimationFrame(updateFrame);
    } else {
      setIsChanging(true);
      const timer = setTimeout(() => {
        setDisplayValue(value);
        setIsChanging(false);
        prevValueRef.current = value;
      }, 150);
      return () => clearTimeout(timer);
    }

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [value, duration]);

  return { displayValue, isChanging };
}

export default function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  badgeText,
  badgeType = 'slate',
  isMonospace = true
}) {
  const { displayValue, isChanging } = useAnimatedValue(value, 300);

  const badgeStyles = {
    slate: 'bg-[#181818] border-[#2B2B2B] text-[#A3A3A3]',
    emerald: 'bg-emerald-950/40 border-emerald-700/50 text-emerald-300',
    crimson: 'bg-red-950/40 border-red-700/50 text-red-300',
    amber: 'bg-amber-950/40 border-amber-700/50 text-amber-300',
    blue: 'bg-orange-950/40 border-orange-700/50 text-orange-400',
    cyan: 'bg-orange-950/40 border-orange-700/50 text-orange-400',
    orange: 'bg-orange-950/40 border-orange-700/50 text-orange-400'
  };

  return (
    <div className="p-3.5 rounded-sm bg-[#141414] border border-[#262626] hover:border-[#383838] transition-all duration-200">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <span className="text-xs font-sans font-medium text-[#A3A3A3] block truncate">
            {title}
          </span>
          <div className="mt-1 flex items-baseline space-x-2">
            <span
              className={`text-xl sm:text-2xl font-bold tracking-tight transition-colors duration-200 ${
                isChanging ? 'text-orange-300' : 'text-[#EDEDED]'
              } ${isMonospace ? 'font-mono' : 'font-sans'}`}
            >
              {displayValue}
            </span>
            {badgeText && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded-sm border ${
                  badgeStyles[badgeType] || badgeStyles.slate
                }`}
              >
                {badgeText}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="mt-1 text-[11px] text-[#737373] font-sans line-clamp-1">
              {subtitle}
            </p>
          )}
        </div>

        {Icon && (
          <div className="p-1.5 rounded-sm bg-orange-950/30 border border-orange-700/40 text-orange-400 ml-2.5 flex-shrink-0 transition-transform duration-180 group-hover:scale-105">
            <Icon className="w-4 h-4 text-orange-400" />
          </div>
        )}
      </div>
    </div>
  );
}
