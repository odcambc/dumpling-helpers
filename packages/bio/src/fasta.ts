// Minimal FASTA parser — pure, no deps.

export interface FastaRecord {
  header: string
  seq: string
}

export function parseFasta(text: string): FastaRecord[] {
  const records: FastaRecord[] = []
  let header: string | null = null
  let chunks: string[] = []

  const flush = () => {
    if (header !== null) records.push({ header, seq: chunks.join('') })
  }

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('>')) {
      flush()
      header = line.slice(1).trim()
      chunks = []
    } else {
      chunks.push(line.replace(/\s/g, ''))
    }
  }
  flush()
  return records
}

/** The leading whitespace-delimited token of a FASTA header — the sequence name. */
export function fastaName(header: string): string {
  return header.split(/\s/)[0]
}
