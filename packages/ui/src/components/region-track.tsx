import { cn } from '../utils'

// Generic labeled linear-region track: weighted, colored, named segments with
// optional 5′/3′ end caps. Tool-agnostic — each tool computes its own segments
// (fusilli fusion construct, dumpling reference/ORF, …) and shares this renderer.

export type SegmentTone = 'primary' | 'accent' | 'muted'

export interface TrackSegment {
  key: string
  label: string
  sublabel?: string
  tone: SegmentTone
  weight: number
  /** Draw a dashed warning edge (e.g. a truncated / out-of-frame region). */
  truncated?: boolean
  /** Small caption rendered under the segment (e.g. "✂ breakpoints scanned"). */
  caption?: string
}

const TONE: Record<SegmentTone, string> = {
  primary: 'bg-brand text-white',
  accent: 'bg-indigo-100 text-indigo-800 border border-indigo-200',
  muted: 'bg-gray-100 text-gray-500 border border-gray-200',
}

interface Props {
  segments: TrackSegment[]
  leftCap?: string
  rightCap?: string
}

export function RegionTrack({ segments, leftCap = '5′', rightCap = '3′' }: Props) {
  return (
    <div className="flex items-start gap-1.5">
      {leftCap ? <EndCap label={leftCap} /> : null}
      <div className="flex flex-1 items-start gap-1">
        {segments.map((s) => (
          <div key={s.key} style={{ flexGrow: s.weight }} className="min-w-0">
            <div
              className={cn(
                'flex h-14 flex-col items-center justify-center rounded-md px-2 text-center',
                TONE[s.tone],
                s.truncated && 'border-2 border-dashed border-amber-400',
              )}
            >
              <span className="w-full truncate text-xs font-semibold leading-tight">{s.label}</span>
              {s.sublabel && (
                <span className="w-full truncate font-mono text-[10px] font-normal leading-tight opacity-80">
                  {s.sublabel}
                </span>
              )}
            </div>
            {s.caption && <p className="mt-1 text-center text-[10px] text-amber-600">{s.caption}</p>}
          </div>
        ))}
      </div>
      {rightCap ? <EndCap label={rightCap} /> : null}
    </div>
  )
}

function EndCap({ label }: { label: string }) {
  return <div className="flex h-14 items-center px-0.5 text-xs font-semibold text-gray-400">{label}</div>
}
