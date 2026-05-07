import { Link } from 'react-router-dom'

interface PlannedTool {
  name: string
  description: string
  href?: string
  available?: boolean
}

const TOOLS: PlannedTool[] = [
  {
    name: 'Oligo Validator',
    description:
      'Validate designed oligo pools against the intended variant set, flanks, and adapters before ordering.',
    href: '/oligo-validator',
    available: true,
  },
  {
    name: 'Library Composition',
    description:
      'Inspect amino-acid and nucleotide composition across a synthesised library to spot skew or dropouts.',
    href: '/library-composition',
    available: true,
  },
  {
    name: 'Sequencing Plan',
    description:
      'Plan multiplexed sequencing runs: estimate reads-per-sample, flow cells needed, and budget for a target per-variant coverage.',
    href: '/sequencing-plan',
    available: true,
  },
  {
    name: 'Long-read QC',
    description:
      'Summarise long-read sequencing of an assembled library: per-variant coverage, error spectra, and chimera flags.',
  },
]

function ToolCard({ tool }: { tool: PlannedTool }) {
  const pill = tool.available ? (
    <span className="shrink-0 rounded-full bg-brand px-2.5 py-0.5 text-xs font-medium text-white">
      available
    </span>
  ) : (
    <span className="shrink-0 rounded-full bg-brand-light px-2.5 py-0.5 text-xs font-medium text-brand-dark">
      coming soon
    </span>
  )

  const body = (
    <>
      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-gray-900">{tool.name}</h3>
        {pill}
      </div>
      <p className="text-sm text-gray-600">{tool.description}</p>
    </>
  )

  if (tool.href && tool.available) {
    return (
      <Link
        to={tool.href}
        className="flex flex-col rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:border-brand hover:shadow-md"
      >
        {body}
      </Link>
    )
  }

  return (
    <div className="flex flex-col rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      {body}
    </div>
  )
}

function App() {
  return (
    <div className="min-h-full px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10">
          <h1 className="text-4xl font-bold text-brand-dark">library-qc</h1>
          <p className="mt-2 text-lg text-gray-600">
            A small suite of QC tools for variant libraries: design, composition, and sequencing.
          </p>
        </header>

        <section>
          <h2 className="mb-4 text-xl font-semibold text-gray-800">Planned tools</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TOOLS.map((tool) => (
              <li key={tool.name} className="contents">
                <ToolCard tool={tool} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

export default App
