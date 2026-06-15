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
          Barcode cassette
        </h3>
        {s.cassette.valid ? (
          <>
            <RegionTrack segments={s.cassette.segments} leftCap="" rightCap="" />
            <p className="mt-3 text-xs text-gray-500">
              Reads are clustered on the barcode window between the constant flanks. The designed
              barcode is ~20 bp; reads with a detected barcode ≥{' '}
              <span className="font-mono text-gray-700">{config.max_barcode_length}</span> bp are
              discarded as spurious.
            </p>
          </>
        ) : (
          <p className="text-xs italic text-gray-400">{s.cassette.note}</p>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Open reading frame
        </h3>
        {s.orf.valid ? (
          <>
            <RegionTrack segments={s.orf.segments} leftCap="" rightCap="" />
            <p className="mt-3 text-xs text-gray-500">
              ORF <span className="font-mono text-gray-700">{s.orf.start}–{s.orf.stop}</span> ·{' '}
              <span className="text-gray-700">{s.orf.codons} codons</span> ·{' '}
              {s.orf.inFrame ? (
                <span className="text-green-600">in-frame ✓</span>
              ) : (
                <span className="text-amber-600">length not a multiple of 3 ⚠</span>
              )}
            </p>
          </>
        ) : (
          <p className="text-xs italic text-gray-400">{s.orf.note}</p>
        )}
      </section>

      <p className="mt-auto border-t border-gray-100 pt-3 text-[11px] text-gray-400">
        Derived from the current settings. Reference:{' '}
        <span className="font-mono">{s.reference}</span>. Absolute positions in the reference need
        the FASTA.
      </p>
    </div>
  )
}
