import { NavLink } from 'react-router-dom';
import type { NavItem } from './navConfig';
import { cn } from '@/utils/cn';

interface NavLinkItemProps {
  item: NavItem;
  count?: number;
}

/** One sidebar destination. Collapses to an icon rail under 1024px. */
export function NavLinkItem({ item, count }: NavLinkItemProps) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.path}
      title={item.label}
      className={({ isActive }) =>
        cn(
          'group relative flex h-8 items-center gap-2.5 rounded px-2.5 transition-colors duration-150',
          'lg:justify-start',
          isActive
            ? 'bg-surface2/80 text-ink'
            : 'text-ink-dim hover:bg-surface2/40 hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent transition-opacity',
              isActive ? 'opacity-100 shadow-[0_0_8px_rgb(var(--c-accent)/0.8)]' : 'opacity-0',
            )}
          />
          <Icon
            className={cn(
              'h-[15px] w-[15px] shrink-0 transition-colors',
              isActive ? 'text-accent' : 'text-ink-mute group-hover:text-ink-dim',
            )}
            strokeWidth={1.75}
          />
          <span className="hidden truncate text-[12.5px] font-medium lg:inline">{item.label}</span>
          {typeof count === 'number' && (
            <span className="ml-auto hidden font-mono text-[10px] tabular-nums text-ink-mute/80 lg:inline">
              {String(count).padStart(2, '0')}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}
