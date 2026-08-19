'use client';
/**
 * The wallet provider picker — the app's single list of connectable wallets.
 *
 * This is the existing connect flow, lifted out of `ConnectButton` so the Swap
 * cards can open the same list instead of growing a second one. It owns no
 * connection logic of its own: `WalletProvider.connect(uuid)` does the work, as
 * it did before, and nothing in this file touches it.
 *
 * Every entry comes from EIP-6963 announcements, which is why there is no
 * mention of MetaMask, Rabby, OKX or any other brand anywhere in this file. The
 * name and icon are whatever the installed extension published about itself, so
 * the list is exactly the set of wallets present in this browser — not a
 * hardcoded menu that offers wallets the user does not have and omits the one
 * they do.
 *
 * ## Why this is an anchored popover rather than a centered modal
 *
 * It used to render `fixed inset-0` with `justify-center`, which put the list in
 * the middle of the viewport over whatever page was open — so on Swap and Bridge
 * it read as an unrelated interruption rather than as the button's own menu.
 * Choosing a wallet is a small, reversible pick from a control you just clicked,
 * which is a dropdown's job; a modal is for work that deserves the whole screen.
 *
 * Two implementation notes, both load-bearing:
 *
 *  - It is positioned with `fixed` coordinates measured from the trigger and
 *    rendered through a portal, not with `absolute` inside the trigger's
 *    `relative` parent. The Swap chip sits inside a rounded card that clips its
 *    overflow, and the header lives in a `sticky` bar with its own stacking
 *    context — an absolutely positioned panel gets cut off by the first and
 *    trapped under the second. A portal answers to neither.
 *  - Because it is `fixed`, it takes no space in the layout, so opening it
 *    cannot reflow or resize the page underneath. That is the property the old
 *    modal had and the reason not to solve this by making the trigger's parent
 *    taller.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useWallet } from '@/lib/WalletProvider';

/**
 * Panel width. Wide enough for a wallet name beside its icon without the name
 * truncating, narrow enough to stay a menu rather than a panel.
 */
const WIDTH = 320;

/** Breathing room kept between the panel and the edge of the viewport. */
const MARGIN = 8;

/** Gap between the trigger and the panel, so the two read as separate objects. */
const GAP = 8;

/**
 * Below this much free space, opening downward would leave the list unusably
 * short and it flips above the trigger instead.
 */
const MIN_SPACE = 220;

/** Never taller than this, however much room there is; the list scrolls. */
const MAX_HEIGHT = 440;

type Box = {
  left: number;
  width: number;
  /** Set when opening downward. */
  top?: number;
  /** Set when opening upward, measured from the viewport bottom. */
  bottom?: number;
  maxHeight: number;
  above: boolean;
};

export function WalletPicker({
  isOpen,
  onClose,
  anchorRef,
}: {
  isOpen: boolean;
  onClose: () => void;
  /**
   * The control that opened this. Required rather than optional: without it
   * there is no position to anchor to, and the only fallback would be to float
   * the list in the middle of the page — the exact behaviour this replaced.
   */
  anchorRef: RefObject<HTMLElement>;
}) {
  // Mounted only while open; nothing here should listen for keys, observe
  // resizes, or track scrolling behind a popover nobody can see.
  if (!isOpen) return null;
  return <WalletPickerBody onClose={onClose} anchorRef={anchorRef} />;
}

function WalletPickerBody({
  onClose,
  anchorRef,
}: {
  onClose: () => void;
  anchorRef: RefObject<HTMLElement>;
}) {
  const { wallets, wallet, isConnecting, error, connect } = useWallet();
  const panelRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);

  /**
   * Right edge to the trigger's right edge, pulled left only as far as the
   * viewport demands.
   *
   * Right alignment is the correct default because both triggers sit on the
   * right of their row, where a left-aligned panel would hang off the page. The
   * clamps then take over on narrow screens: first shifting the panel left so
   * it stops short of the edge, then, if it still cannot fit, narrowing it.
   */
  const place = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const width = Math.min(WIDTH, vw - MARGIN * 2);
    const left = Math.max(
      MARGIN,
      Math.min(rect.right - width, vw - width - MARGIN)
    );

    const below = vh - rect.bottom - GAP - MARGIN;
    const above = rect.top - GAP - MARGIN;
    // Downward unless that would be cramped *and* there is genuinely more room
    // the other way; a popover that flips on a whim is disorienting.
    const flip = below < MIN_SPACE && above > below;
    const space = flip ? above : below;

    setBox({
      left,
      width,
      top: flip ? undefined : rect.bottom + GAP,
      bottom: flip ? vh - rect.top + GAP : undefined,
      maxHeight: Math.min(MAX_HEIGHT, Math.max(space, 160)),
      above: flip,
    });
  }, [anchorRef]);

  // Measured before the browser paints, so the panel is never briefly visible
  // at the wrong place. Until `box` exists it renders hidden rather than at 0,0.
  useLayoutEffect(place, [place]);

  /*
   * Keep it on the trigger.
   *
   * Scroll is captured because the Swap chip lives inside a scrollable card as
   * well as the page: a listener on `window` alone never hears that inner
   * scroll, and the panel would drift away from the button that owns it.
   *
   * The wallet list can also grow after mount — EIP-6963 announcements arrive
   * asynchronously — so the panel's own size is observed and the placement
   * recomputed, which is what lets a list that outgrows the space flip or cap
   * its height instead of running off-screen.
   */
  useEffect(() => {
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);

    const observer = new ResizeObserver(place);
    if (panelRef.current) observer.observe(panelRef.current);
    if (anchorRef.current) observer.observe(anchorRef.current);

    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      observer.disconnect();
    };
  }, [place, anchorRef]);

  /*
   * Outside click and Escape both dismiss, matching AccountMenu and
   * WalletSelector.
   *
   * The anchor is excluded from the outside test on purpose: the trigger toggles
   * its own state, so closing here on the way down would let that toggle
   * immediately reopen the panel and leave the button apparently inert.
   */
  useEffect(() => {
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      onClose();
      // Escape should hand focus back to the control, not drop the keyboard
      // user at the top of the document.
      anchorRef.current?.focus();
    };

    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, anchorRef]);

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      aria-label="Connect a wallet"
      style={{
        position: 'fixed',
        left: box?.left,
        top: box?.top,
        bottom: box?.bottom,
        width: box?.width,
        maxHeight: box?.maxHeight,
        // Hidden for the single frame before measurement; `visibility` rather
        // than unmounting so the panel can be measured at its real size.
        visibility: box ? 'visible' : 'hidden',
      }}
      /*
       * z-60 clears the app frame deliberately: the sticky header is z-30, the
       * mobile nav scrim z-40 and the sidebar z-50, so anything lower would open
       * *underneath* the chrome holding its own trigger. Colours are theme
       * tokens, so light and dark both follow the app rather than being pinned
       * to one palette here.
       */
      className={`z-[60] flex flex-col overflow-hidden rounded-2xl border border-hairline
        bg-surface-card/95 backdrop-blur-2xl shadow-float animate-scale-in
        ${box?.above ? 'origin-bottom-right' : 'origin-top-right'}`}
    >
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-hairline shrink-0">
        <h2 className="text-sm font-bold tracking-tight">Connect a wallet</h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="w-7 h-7 -mr-1 rounded-lg flex items-center justify-center text-ink-muted
            hover:text-ink-primary hover:bg-surface-hover/[0.06] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      {/* `min-h-0` is what makes the panel's max-height bite: without it this
          child refuses to shrink and the list overflows instead of scrolling. */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {wallets.length === 0 ? (
          /*
           * No announcements means no wallet extension is installed, or one is
           * installed that does not implement EIP-6963. Saying so is more use
           * than listing wallets that cannot be connected from here.
           */
          <p className="px-3 py-6 text-sm text-ink-muted text-center leading-relaxed">
            No wallet extension announced itself to this page. Install a browser wallet, or
            unlock the one you have, then try again.
          </p>
        ) : (
          wallets.map((w) => {
            const isCurrent = wallet?.uuid === w.uuid;
            return (
              <button
                key={w.uuid}
                role="menuitem"
                onClick={async () => {
                  await connect(w.uuid);
                  onClose();
                }}
                disabled={isConnecting}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left
                  hover:bg-surface-hover/[0.06] disabled:opacity-60 transition-colors"
              >
                <WalletIcon icon={w.icon} name={w.name} size={28} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold truncate">{w.name}</span>
                  {isCurrent && (
                    <span className="block text-[11px] text-ink-muted">Currently connected</span>
                  )}
                </span>
                <svg
                  className="w-4 h-4 text-ink-muted shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            );
          })
        )}
      </div>

      {error && (
        <p className="px-4 py-3 text-xs text-danger border-t border-hairline shrink-0">{error}</p>
      )}
    </div>,
    document.body
  );
}

/**
 * A wallet's own icon, as announced.
 *
 * Icons arrive as data URIs from the extension, so there is nothing for
 * next/image to fetch or optimise. When a wallet published no icon — the
 * `window.ethereum` fallback in `WalletProvider` is one such case — this draws a
 * neutral mark rather than borrowing another wallet's logo, which would name the
 * wrong provider.
 */
export function WalletIcon({
  icon,
  name,
  size = 20,
}: {
  icon?: string;
  name?: string;
  size?: number;
}) {
  if (icon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icon}
        alt={name ? `${name} icon` : ''}
        width={size}
        height={size}
        className="rounded-full shrink-0 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className="shrink-0 rounded-full bg-surface-input border border-hairline
        flex items-center justify-center text-ink-muted"
      style={{ width: size, height: size }}
    >
      <svg
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
        style={{ width: size * 0.58, height: size * 0.58 }}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 8.5A2.5 2.5 0 015.5 6h13A2.5 2.5 0 0121 8.5v7a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 15.5v-7z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12h.75" />
      </svg>
    </span>
  );
}
