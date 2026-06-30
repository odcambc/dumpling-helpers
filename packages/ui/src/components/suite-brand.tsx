import { cn } from '../utils'
import { SUITE_NAME } from '../suite'

interface SuiteBrandProps {
  /** The current tool, shown as a muted subtitle (e.g. "dumpling · config generator"). */
  subtitle: string
  className?: string
}

/**
 * The always-visible suite wordmark for an app's sidebar header: an `[SC]`
 * monogram + the SOUS-CHEF name, a hairline divider, and the per-tool subtitle.
 * Pair it with <SuiteSwitcher> (the "Switch tool" control) and <HelpMenu>.
 */
export function SuiteBrand({ subtitle, className }: SuiteBrandProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-brand">
          <span className="text-[10px] font-bold tracking-tight text-white">SC</span>
        </div>
        <span className="text-sm font-semibold tracking-tight text-gray-900">{SUITE_NAME}</span>
      </div>
      <div className="border-t border-gray-100" />
      <p className="text-xs text-gray-400">{subtitle}</p>
    </div>
  )
}
