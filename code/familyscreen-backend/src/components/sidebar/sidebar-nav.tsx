'use client';

import {
  Inbox,
  LayoutTemplate,
  MessageSquareQuote,
  PenLine,
  Send,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useSelectedLayoutSegments } from 'next/navigation';

type NavItem = {
  href: `/${string}`;
  label: string;
  icon: LucideIcon;
  badge?: boolean;
};

const items: readonly NavItem[] = [
  {
    href: '/inbox',
    label: 'Inbox',
    icon: Inbox,
    badge: true,
  },
  {
    href: '/sent',
    label: 'Sent',
    icon: Send,
  },
  {
    href: '/new-message',
    label: 'New message',
    icon: PenLine,
  },
  {
    href: '/create-homescreen',
    label: 'Create homescreen',
    icon: LayoutTemplate,
  },
  {
    href: '/daily-messages',
    label: 'Daily messages',
    icon: MessageSquareQuote,
  },
];

type SidebarNavProps = {
  unread: boolean;
};

export default function SidebarNav({ unread }: SidebarNavProps) {
  const segments = useSelectedLayoutSegments();

  const activeSegment = segments.find((segment) => !segment.startsWith('('));

  return (
    <nav aria-label="Message navigation">
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          // Read off the href rather than spelled out a second time, so an item
          // cannot drift out of sync with the route it points at. Nested pages
          // such as /inbox/history keep their top-level item highlighted.
          const active = activeSegment === item.href.slice(1);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex items-center gap-3',
                  'rounded-lg border-l-2 px-3 py-2',
                  'text-sm transition-colors',
                  'focus-visible:outline-none',
                  'focus-visible:ring-2',
                  'focus-visible:ring-neutral-400',
                  'focus-visible:ring-offset-2',
                  active
                    ? 'border-neutral-900 bg-white font-medium text-neutral-900'
                    : 'border-transparent text-neutral-600 hover:bg-neutral-100',
                ].join(' ')}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />

                <span className="flex-1">{item.label}</span>

                {item.badge && unread && (
                  <span
                    role="status"
                    aria-label="Unread message"
                    className="size-2 shrink-0 rounded-full bg-red-600"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
