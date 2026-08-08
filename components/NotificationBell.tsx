'use client';
/**
 * Notification bell and dropdown.
 *
 * Every item here corresponds to a real transaction hash and links to a block
 * explorer, so any claim it makes can be checked against the chain.
 */
import { useEffect, useRef, useState } from 'react';
import { explorerTxUrl, getEnvChains } from '@/lib/chains';
import { useNetworkMode } from '@/lib/network';
import { useNotifications, type AppNotification } from '@/lib/notifications';

const KIND_STYLE: Record<
  AppNotification['kind'],
  { icon: string; ring: string; text: string; label: string }
> = {
  pending: {
    icon: '◷',
    ring: 'bg-amber-500/15 text-warning',
    text: 'text-warning',
    label: 'Pending',
  },
  confirmed: {
    icon: '✓',
    ring: 'bg-mint-500/15 text-success',
    text: 'text-success',
    label: 'Confirmed',
  },
  failed: {
    icon: '✕',
    ring: 'bg-red-500/15 text-danger',
    text: 'text-danger',
    label: 'Failed',
  },
  received: {
    icon: '↓',
    ring: 'bg-arc-500/15 text-accent-text',
    text: 'text-accent-text',
    label: 'Received',
  },
};

function timeAgo(ms: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead, dismiss, clearAll } =
    useNotifications();
  const { isTestnet } = useNetworkMode();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape, so the panel never traps focus.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const chains = getEnvChains(isTestnet);
  const linkFor = (n: AppNotification) => {
    const chain = chains.find((c) => c.id === n.chainId);
    return chain ? explorerTxUrl(chain, n.txHash) : null;
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={
          unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'
        }
        aria-expanded={open}
        className="relative w-9 h-9 rounded-xl bg-surface-input hover:bg-surface-hover/[0.06] border border-hairline flex items-center justify-center transition-colors"
      >
        <span aria-hidden className="text-base leading-none">
          🔔
        </span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-arc-500 text-[10px] font-bold flex items-center justify-center tabular-nums">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] glass rounded-2xl border border-hairline shadow-2xl z-50 overflow-hidden">
          <header className="flex items-center justify-between px-4 py-3 border-b border-hairline">
            <h3 className="text-sm font-semibold">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[11px] text-accent-text hover:text-accent-text"
                >
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-[11px] text-ink-muted hover:text-ink-secondary"
                >
                  Clear
                </button>
              )}
            </div>
          </header>

          <div className="max-h-[26rem] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-ink-secondary">No notifications yet.</p>
                <p className="text-xs text-ink-muted mt-1.5">
                  Transfers you send and receive will appear here as they confirm.
                </p>
              </div>
            ) : (
              <ul>
                {notifications.map((n) => {
                  const style = KIND_STYLE[n.kind];
                  const href = linkFor(n);
                  return (
                    <li
                      key={n.id}
                      className={`border-b border-hairline last:border-0 ${
                        n.read ? '' : 'bg-surface-input'
                      }`}
                    >
                      <div className="flex gap-3 px-4 py-3">
                        <span
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 ${style.ring} ${
                            n.kind === 'pending' ? 'animate-pulse' : ''
                          }`}
                          aria-hidden
                        >
                          {style.icon}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium leading-snug">{n.title}</p>
                            {!n.read && (
                              <span className="w-1.5 h-1.5 rounded-full bg-arc-400 shrink-0 mt-1.5" />
                            )}
                          </div>
                          <p className="text-xs text-ink-secondary mt-0.5 leading-snug">{n.body}</p>

                          <div className="flex items-center gap-2 mt-1.5 text-[11px]">
                            <span className={style.text}>{style.label}</span>
                            <span className="text-ink-muted">·</span>
                            <span className="text-ink-muted">{n.chainLabel}</span>
                            <span className="text-ink-muted">·</span>
                            <span className="text-ink-muted">{timeAgo(n.at)}</span>
                          </div>

                          <div className="flex items-center gap-3 mt-2">
                            {href && (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => markRead(n.id)}
                                className="text-[11px] text-accent-text hover:text-accent-text"
                              >
                                View on explorer →
                              </a>
                            )}
                            {!n.read && (
                              <button
                                onClick={() => markRead(n.id)}
                                className="text-[11px] text-ink-muted hover:text-ink-secondary"
                              >
                                Mark read
                              </button>
                            )}
                            <button
                              onClick={() => dismiss(n.id)}
                              className="text-[11px] text-ink-muted hover:text-ink-secondary ml-auto"
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
