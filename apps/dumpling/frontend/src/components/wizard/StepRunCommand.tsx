import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import type { RunConfig, RunEnvironment } from '@/types'
import type { ConfigFormValues } from '@/schemas/config'
import { buildCommand, buildSlurmProfile, buildSgeProfile, getProfilePath } from '@/lib/runCommand'
import { Field, Input, Toggle } from '@dumplingkit/ui'
import { cn } from '@/lib/utils'

interface Props {
  config: ConfigFormValues
  runConfig: RunConfig
  onChange: (rc: RunConfig) => void
}

export function StepRunCommand({ config, runConfig, onChange }: Props) {
  const [copied, setCopied] = useState(false)

  const command = buildCommand(runConfig)
  const profileContent =
    runConfig.env === 'slurm'
      ? buildSlurmProfile(runConfig.slurm, config)
      : runConfig.env === 'sge'
        ? buildSgeProfile(runConfig.sge, config)
        : null
  const profilePath = runConfig.env !== 'local' ? getProfilePath(runConfig.env) : null
  const includeProfile =
    runConfig.env === 'slurm'
      ? runConfig.slurm.includeProfile
      : runConfig.env === 'sge'
        ? runConfig.sge.includeProfile
        : false

  function setEnv(env: RunEnvironment) {
    if (env === 'local') onChange({ env: 'local', local: { cores: 8 } })
    else if (env === 'slurm') onChange({ env: 'slurm', slurm: { partition: 'compute', maxJobs: 50, defaultTimeMins: 120, includeProfile: true } })
    else onChange({ env: 'sge', sge: { queue: 'all.q', maxJobs: 50, includeProfile: true } })
  }

  async function copy() {
    await navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Run command</h2>
        <p className="text-sm text-gray-500 mt-1">
          Generate the exact shell command to invoke the pipeline, optionally with a cluster profile.
        </p>
      </div>

      {/* Environment selector */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Execution environment</p>
        <div className="flex gap-2">
          {(['local', 'slurm', 'sge'] as RunEnvironment[]).map((env) => (
            <button
              key={env}
              type="button"
              onClick={() => setEnv(env)}
              className={cn(
                'flex-1 rounded-lg border-2 p-2.5 text-sm font-medium transition-colors',
                runConfig.env === env
                  ? 'border-brand bg-brand-light text-brand-dark'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300',
              )}
            >
              {env === 'local' ? 'Local' : env.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Environment-specific options */}
      {runConfig.env === 'local' && (
        <Field label="CPU cores" htmlFor="cores" description="Passed to --cores. Use all available cores on the machine.">
          <Input
            id="cores"
            type="number"
            min={1}
            value={runConfig.local.cores}
            onChange={(e) => onChange({ env: 'local', local: { cores: parseInt(e.target.value) || 1 } })}
            className="w-32"
          />
        </Field>
      )}

      {runConfig.env === 'slurm' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Partition" htmlFor="partition" description="SLURM partition to submit jobs to.">
              <Input
                id="partition"
                value={runConfig.slurm.partition}
                onChange={(e) => onChange({ env: 'slurm', slurm: { ...runConfig.slurm, partition: e.target.value } })}
                placeholder="compute"
              />
            </Field>
            <Field label="Max concurrent jobs" htmlFor="maxJobs">
              <Input
                id="maxJobs"
                type="number"
                min={1}
                value={runConfig.slurm.maxJobs}
                onChange={(e) => onChange({ env: 'slurm', slurm: { ...runConfig.slurm, maxJobs: parseInt(e.target.value) || 50 } })}
              />
            </Field>
            <Field label="Default walltime" htmlFor="walltime" hint="minutes">
              <Input
                id="walltime"
                type="number"
                min={1}
                value={runConfig.slurm.defaultTimeMins}
                onChange={(e) => onChange({ env: 'slurm', slurm: { ...runConfig.slurm, defaultTimeMins: parseInt(e.target.value) || 120 } })}
              />
            </Field>
          </div>
          <Toggle
            checked={runConfig.slurm.includeProfile}
            onChange={(v) => onChange({ env: 'slurm', slurm: { ...runConfig.slurm, includeProfile: v } })}
            label="Include SLURM profile in ZIP"
            description="Adds config/profiles/slurm/config.yaml with per-rule resource allocations derived from your pipeline settings."
          />
        </div>
      )}

      {runConfig.env === 'sge' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Queue name" htmlFor="queue">
              <Input
                id="queue"
                value={runConfig.sge.queue}
                onChange={(e) => onChange({ env: 'sge', sge: { ...runConfig.sge, queue: e.target.value } })}
                placeholder="all.q"
              />
            </Field>
            <Field label="Max concurrent jobs" htmlFor="maxJobsSge">
              <Input
                id="maxJobsSge"
                type="number"
                min={1}
                value={runConfig.sge.maxJobs}
                onChange={(e) => onChange({ env: 'sge', sge: { ...runConfig.sge, maxJobs: parseInt(e.target.value) || 50 } })}
              />
            </Field>
          </div>
          <Toggle
            checked={runConfig.sge.includeProfile}
            onChange={(v) => onChange({ env: 'sge', sge: { ...runConfig.sge, includeProfile: v } })}
            label="Include SGE profile in ZIP"
            description="Adds config/profiles/sge/config.yaml using the cluster-generic executor plugin."
          />
        </div>
      )}

      {/* Generated command */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700">Command</p>
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">
          {command}
        </pre>
      </div>

      {/* Profile preview */}
      {profileContent && includeProfile && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-700">
            Profile preview{' '}
            <span className="font-normal text-gray-400 font-mono text-xs">({profilePath})</span>
          </p>
          <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre max-h-64">
            {profileContent}
          </pre>
        </div>
      )}
    </div>
  )
}
