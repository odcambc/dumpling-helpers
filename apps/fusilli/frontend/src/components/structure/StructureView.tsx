import type { ConfigFormValues } from '@/schemas/config'
import { configToStructure } from '@/lib/structure'
import { RegionTrack } from '@dumplingkit/ui'

interface Props {
  config: ConfigFormValues
}

export function StructureView({ config }: Props) {
  const model = configToStructure(config)
  const hasRetained = config.fusion_library.retained.name.trim().length > 0

  return (
    <div className="flex h-full flex-col gap-5 overflow-auto">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Fusion construct
        </h3>
        {hasRetained ? (
          <>
            <RegionTrack segments={model.segments} />
            <p className="mt-3 text-xs text-gray-500">
              The <span className="font-medium text-gray-700">{model.truncatedComponent}</span>{' '}
              domain is variably truncated — breakpoints are scanned along it. Partners are drawn
              from <span className="font-mono text-gray-700">{model.partnersSource}</span>.
              {model.linker && (
                <>
                  {' '}
                  Linker: <span className="font-mono text-gray-700">{model.linker}</span>.
                </>
              )}
            </p>
          </>
        ) : (
          <p className="text-xs italic text-gray-400">
            Set the retained domain name (Library step) to see the construct.
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Variant retained fusions
        </h3>
        {model.variantFusions.length === 0 ? (
          <p className="text-xs italic text-gray-400">
            None configured. Add variant retained domains in the Library step to model control
            fusions.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {model.variantFusions.map((v, i) => (
              <li key={i} className="rounded-md border border-gray-200 px-3 py-2 text-xs">
                <span className="font-semibold text-brand-dark">{v.retained}</span>
                <span className="text-gray-400"> × </span>
                <span className="text-gray-700">{v.partners}</span>
                {v.description && <p className="mt-0.5 text-gray-400">{v.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-auto border-t border-gray-100 pt-3 text-[11px] text-gray-400">
        Derived from the current settings. The full partner set and reference length need the
        referenced files — coming with the QC tool.
      </p>
    </div>
  )
}
