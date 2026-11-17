import { NavLink } from 'react-router-dom';
import type { NavItem } from './navConfig';
import { cn } from '@/utils/cn';
import { useT } from '@/i18n';

interface NavLinkItemProps {
  item: NavItem;
  count?: number;
}

/** One sidebar destination. Collapses to an icon rail under 1024px. */
export function NavLinkItem({ item, count }: NavLinkItemProps) {
  const Icon = item.icon;
  const t = useT();

  return (
    <NavLink
      to={item.path}
      title={t(item.label)}
      className={({ isActive }) =>
        cn(
          'group relative flex h-[30px] items-center gap-2.5 rounded-sm px-2 transition-colors duration-100',
          'lg:justify-start',
          isActive
            ? 'bg-surface2/70 text-ink'
            : 'text-ink-dim hover:bg-surface2/40 hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'absolute left-0 top-1/2 h-3.5 w-[2px] -translate-y-1/2 bg-accent transition-opacity',
              isActive ? 'opacity-100' : 'opacity-0',
            )}
          />
          <Icon
            className={cn(
              'h-[14px] w-[14px] shrink-0',
              isActive ? 'text-ink' : 'text-ink-mute group-hover:text-ink-dim',
            )}
            strokeWidth={1.6}
          />
          <span className="hidden truncate text-[13.5px] lg:inline">{t(item.label)}</span>
          {typeof count === 'number' && (
            <span className="ml-auto hidden font-mono text-[12px] tabular-nums text-ink-mute/70 lg:inline">
              {count}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}
