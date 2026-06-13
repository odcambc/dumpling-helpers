/**
 * Design tokens — single authoritative source for visual constants.
 *
 * These values mirror the Tailwind v4 `@theme` block in `./theme.css`. The
 * Tailwind theme remains the source for utility classes; this module exists so
 * that code which needs the raw values (inline styles, chart colours) can
 * import them directly without reaching into CSS variables.
 *
 * If you change a value here, change the matching `--color-*` / `--font-*`
 * entry in `./theme.css` as well (and vice versa).
 */

/**
 * Brand palette.
 *
 * The canonical values are OKLCH strings — identical to what `theme.css`
 * declares — so visual output is bit-for-bit the same whether a consumer reads
 * the Tailwind class (`bg-brand`) or an inline style (`style={{ background:
 * colors.brand }}`). Modern browsers (the Tailwind v4 baseline) accept OKLCH
 * directly in any CSS color context.
 */
export const colors = {
  brand: 'oklch(55% 0.22 265)',
  brandLight: 'oklch(95% 0.05 265)',
  brandDark: 'oklch(40% 0.22 265)',
} as const

/**
 * Typography stacks. Mirror `--font-sans` / `--font-mono` in `theme.css`.
 */
export const typography = {
  fontSans: 'Inter, system-ui, sans-serif',
  fontMono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
} as const

export type Colors = typeof colors
export type Typography = typeof typography
