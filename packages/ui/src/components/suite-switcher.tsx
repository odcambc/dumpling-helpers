import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../utils'
import { SUITE_GROUPS, SUITE_TOOLS } from '../suite'

interface SuiteSwitcherProps {
  /** Active tool id — highlighted and non-navigating in the list. */
  current: string
  /**
   * Optional same-app link renderer (e.g. a react-router <Link>). When given,
   * tools served by the same app as `current` are rendered through it (using
   * their in-app `path`) to avoid a full page reload. Cross-app tools always use
   * a plain <a href> since they live on another origin.
   */
  renderLink?: (to: string, className: string, children: ReactNode) => ReactNode
  /** Which edge the dropdown aligns to. Use 'right' in a right-aligned top bar. */
  align?: 'left' | 'right'
  className?: string
}

/**
 * The "Switch tool ▾" control + dropdown listing every tool in the suite,
 * grouped. Router-agnostic: plain anchors by default (cross-subdomain nav is a
 * full load anyway), with an opt-in renderLink for same-app SPA navigation.
 */
export function SuiteSwitcher({ current, renderLink, align = 'left', className }: SuiteSwitcherProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const activeApp = SUITE_TOOLS.find((t) => t.id === current)?.app

  // Close on Escape (returning focus to the trigger) or a click outside.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex w-full items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        Switch tool
        <ChevronDown
          size={14}
          className={cn('text-gray-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-20 mt-1 w-full min-w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg',
            align === 'right' ? 'right-0' : 'left-0',
          )}
          style={{ animation: 'suite-pop 120ms ease-out' }}
        >
          {SUITE_GROUPS.map((group) => (
            <div key={group} className="py-1">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {group}
              </p>
              {SUITE_TOOLS.filter((t) => t.group === group).map((tool) => {
                const isCurrent = tool.id === current
                const rowClass = cn(
                  'flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors',
                  isCurrent
                    ? 'bg-brand-light text-brand-dark font-medium'
                    : 'text-gray-700 hover:bg-gray-50',
                )
                const inner = (
                  <>
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-brand text-[10px] font-bold text-white">
                      {tool.letter}
                    </span>
                    <span className="flex-1">{tool.label}</span>
                    {isCurrent && <span className="text-[10px] text-brand-dark">current</span>}
                  </>
                )

                if (isCurrent) {
                  return (
                    <div key={tool.id} role="menuitem" aria-current="true" className={rowClass}>
                      {inner}
                    </div>
                  )
                }
                if (renderLink && tool.app === activeApp) {
                  return (
                    <div key={tool.id} role="menuitem" onClick={() => setOpen(false)}>
                      {renderLink(tool.path, rowClass, inner)}
                    </div>
                  )
                }
                return (
                  <a key={tool.id} role="menuitem" href={tool.href} className={rowClass}>
                    {inner}
                  </a>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
