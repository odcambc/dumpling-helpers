import type { ConfigFormValues } from '@/schemas/config'
import { configToStructure } from '@/lib/structure'
import { RegionTrack } from '@dumplingkit/ui'

interface Props {
  config: ConfigFormValues
}

export function StructureView({ config }: Props) {
  const s = configToStructure(config)

  return (
    <div className="flex h-full flex-col gap-5 overflow-auto">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Reference &amp; ORF
        </h3>
        {s.valid ? (
          <>
            <RegionTrack segments={s.segments} leftCap="" rightCap="" />
            <p className="mt-3 text-xs text-gray-500">
              ORF <span className="font-mono text-gray-700">{s.start}–{s.stop}</span> ·{' '}
              <span className="text-gray-700">{s.codons} codons</span> ·{' '}
              {s.inFrame ? (
                <span className="text-green-600">in-frame ✓</span>
              ) : (
                <span className="text-amber-600">length not a multiple of 3 ⚠</span>
              )}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Reference: <span className="font-mono text-gray-700">{s.reference}</span>.
            </p>
          </>
        ) : (
          <p className="text-xs italic text-gray-400">{s.note}</p>
        )}
      </section>

      <p className="mt-auto border-t border-gray-100 pt-3 text-[11px] text-gray-400">
        Derived from the current settings. The 3′ end is open-ended — the reference's total length
        needs the FASTA.
      </p>
    </div>
  )
}
