import { useEffect, useState } from 'react'
import { Check, Copy, Info, X } from 'lucide-react'
import { cn } from '../utils'
import { HELP_LINKS, SUITE_NAME, SUITE_TAGLINE } from '../suite'

/**
 * An info button that opens a roomy panel describing SOUS-CHEF and linking to
 * repositories, docs, and a citation (with copy-to-clipboard). Docs/citation
 * sections are hidden when empty, so they appear only once real values land in
 * HELP_LINKS.
 */
export function HelpMenu({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  async function copyCitation() {
    try {
      await navigator.clipboard.writeText(HELP_LINKS.citation)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable — no-op.
    }
  }

  const sectionHeading = 'text-[11px] font-semibold uppercase tracking-wider text-gray-400'
  const linkClass = 'text-sm text-brand hover:underline'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="About SOUS-CHEF and help links"
        title="About & help"
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600',
          className,
        )}
      >
        <Info size={16} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`About ${SUITE_NAME}`}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            style={{ animation: 'suite-pop 140ms ease-out' }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{SUITE_NAME}</h2>
                <p className="mt-0.5 text-xs text-gray-500">{SUITE_TAGLINE}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>

            <section className="mt-5">
              <h3 className={sectionHeading}>Repositories</h3>
              <ul className="mt-1.5 space-y-1">
                {HELP_LINKS.repos.map((l) => (
                  <li key={l.href}>
                    <a href={l.href} target="_blank" rel="noreferrer" className={linkClass}>
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>

            {HELP_LINKS.docs.length > 0 && (
              <section className="mt-4">
                <h3 className={sectionHeading}>Documentation</h3>
                <ul className="mt-1.5 space-y-1">
                  {HELP_LINKS.docs.map((l) => (
                    <li key={l.href}>
                      <a href={l.href} target="_blank" rel="noreferrer" className={linkClass}>
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {HELP_LINKS.citation && (
              <section className="mt-4">
                <h3 className={sectionHeading}>Citation</h3>
                <div className="mt-1.5 flex items-start gap-2 rounded-md bg-gray-50 p-2">
                  <p className="flex-1 text-xs leading-relaxed text-gray-600">{HELP_LINKS.citation}</p>
                  <button
                    type="button"
                    onClick={copyCitation}
                    aria-label="Copy citation"
                    title="Copy citation"
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700"
                  >
                    {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </>
  )
}
