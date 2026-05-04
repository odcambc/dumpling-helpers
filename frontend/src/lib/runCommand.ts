import yaml from 'js-yaml'
import type { RunConfig } from '@/types'
import type { ConfigFormValues } from '@/schemas/config'

export function buildCommand(runConfig: RunConfig, snakefile = 'workflow/Snakefile'): string {
  const base = `snakemake -s ${snakefile} --software-deployment-method conda`

  if (runConfig.env === 'local') {
    return `${base} --cores ${runConfig.local.cores}`
  }

  if (runConfig.env === 'slurm') {
    const { maxJobs } = runConfig.slurm
    return `${base} --profile config/profiles/slurm --jobs ${maxJobs}`
  }

  if (runConfig.env === 'sge') {
    const { queue, maxJobs } = runConfig.sge
    return [
      base,
      `--cluster "qsub -q ${queue} -pe smp {threads} -l h_vmem={resources.mem_mb}M -V -cwd -j y"`,
      `--jobs ${maxJobs}`,
      '--latency-wait 60',
    ].join(' \\\n  ')
  }

  return base
}

export function buildSlurmProfile(
  slurmConfig: { partition: string; defaultTimeMins: number },
  pipelineConfig: ConfigFormValues,
): string {
  const memPerCpu = Math.ceil((pipelineConfig.mem * 1000) / 16) // BBTools uses 16 threads

  const profile = {
    executor: 'slurm',
    'software-deployment-method': 'conda',
    'default-resources': {
      slurm_partition: slurmConfig.partition || 'compute',
      runtime: slurmConfig.defaultTimeMins,
      mem_mb_per_cpu: memPerCpu,
      cpus_per_task: 1,
    },
    'set-resources': {
      map_to_reference_bbmap: {
        cpus_per_task: 16,
        mem_mb: pipelineConfig.mem * 1000,
      },
      run_fastqc: {
        cpus_per_task: 8,
        mem_mb: pipelineConfig.mem_fastqc,
      },
      rosace: {
        cpus_per_task: 4,
        mem_mb: pipelineConfig.mem_rosace,
      },
      lilace: {
        cpus_per_task: 4,
        mem_mb: pipelineConfig.mem_lilace,
      },
    },
  }

  return (
    '# Snakemake SLURM executor profile\n' +
    '# Place at: config/profiles/slurm/config.yaml\n' +
    '# Requires: pip install snakemake-executor-plugin-slurm\n\n' +
    yaml.dump(profile, { sortKeys: false })
  )
}

export function buildSgeProfile(
  sgeConfig: { queue: string },
  pipelineConfig: ConfigFormValues,
): string {
  const profile = {
    'software-deployment-method': 'conda',
    'cluster-generic-submit-cmd': [
      'qsub',
      `-q ${sgeConfig.queue || 'all.q'}`,
      '-pe smp {threads}',
      '-l h_vmem={resources.mem_mb}M',
      '-V -cwd -j y',
    ].join(' '),
    'cluster-generic-status-cmd': 'qstat -j {jobid}',
    'cluster-generic-cancel-cmd': 'qdel {jobid}',
    'default-resources': {
      mem_mb: pipelineConfig.mem * 1000,
      threads: 1,
    },
    'set-resources': {
      map_to_reference_bbmap: { threads: 16, mem_mb: pipelineConfig.mem * 1000 },
      run_fastqc: { threads: 8, mem_mb: pipelineConfig.mem_fastqc },
      rosace: { threads: 4, mem_mb: pipelineConfig.mem_rosace },
      lilace: { threads: 4, mem_mb: pipelineConfig.mem_lilace },
    },
  }

  return (
    '# Snakemake SGE cluster profile\n' +
    '# Place at: config/profiles/sge/config.yaml\n' +
    '# Requires: pip install snakemake-executor-plugin-cluster-generic\n\n' +
    yaml.dump(profile, { sortKeys: false })
  )
}

export function getProfilePath(env: 'slurm' | 'sge'): string {
  return `config/profiles/${env}/config.yaml`
}
