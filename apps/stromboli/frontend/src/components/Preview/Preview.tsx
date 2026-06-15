import { useMemo } from 'react'
import type { ConfigFormValues } from '@/schemas/config'
import type { SampleRowValues } from '@/schemas/samples'
import { buildConfigYaml, buildSamplesCsv } from '@/lib/emit'

interface Props {
  config: ConfigFormValues
  rows: SampleRowValues[]
}

export function Preview({ config, rows }: Props) {
  const yamlText = useMemo(() => buildConfigYaml(config), [config])
  const csvText = useMemo(() => buildSamplesCsv(rows), [rows])

  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden">
      <PreviewPane title="config.yaml" content={yamlText} />
      <PreviewPane title="experiments.csv" content={csvText} />
    </div>
  )
}

function PreviewPane({ title, content }: { title: string; content: string }) {
  return (
    <div className="flex flex-col rounded-lg border border-gray-200 overflow-hidden min-h-0 flex-1">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200 shrink-0">
        <span className="text-xs font-semibold text-gray-600 font-mono">{title}</span>
      </div>
      <pre className="overflow-auto flex-1 p-3 text-xs font-mono text-gray-700 leading-relaxed whitespace-pre">
        {content || <span className="text-gray-300 italic">Fill in the form to see a preview…</span>}
      </pre>
    </div>
  )
}
