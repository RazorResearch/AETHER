import {
  Activity,
  Atom,
  BarChart3,
  Boxes,
  Cpu,
  FlaskConical,
  LayoutDashboard,
  Settings2,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  /** Short engine-facing code shown in the collapsed rail tooltip. */
  code: string;
  /** Whether the sidebar may render a live count badge. */
  counter?: 'models' | 'experiments';
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      { label: 'Overview', path: '/overview', icon: LayoutDashboard, code: 'OVW' },
      { label: 'Models', path: '/models', icon: Boxes, code: 'MDL', counter: 'models' },
      { label: 'Hardware', path: '/hardware', icon: Cpu, code: 'HW' },
      { label: 'Optimization', path: '/optimization', icon: SlidersHorizontal, code: 'OPT' },
      {
        label: 'Experiments',
        path: '/experiments',
        icon: FlaskConical,
        code: 'EXP',
        counter: 'experiments',
      },
      { label: 'Benchmarks', path: '/benchmarks', icon: BarChart3, code: 'BNC' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { label: 'Activity', path: '/activity', icon: Activity, code: 'ACT' },
      { label: 'Settings', path: '/settings', icon: Settings2, code: 'SET' },
      { label: 'About RazorResearch', path: '/about', icon: Atom, code: 'ABT' },
    ],
  },
];

export const flatNavItems: NavItem[] = navSections.flatMap((section) => section.items);

export function findNavItem(pathname: string): NavItem | undefined {
  return flatNavItems.find((item) => pathname.startsWith(item.path));
}
