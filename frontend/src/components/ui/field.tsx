import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Label } from './label'

interface FieldProps {
  label: string
  htmlFor?: string
  required?: boolean
  hint?: string
  description?: string
  error?: string
  children: ReactNode
  className?: string
}

export function Field({
  label,
  htmlFor,
  required,
  hint,
  description,
  error,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={htmlFor} required={required} hint={hint}>
        {label}
      </Label>
      {description && <p className="text-xs text-gray-500 -mt-0.5 mb-1">{description}</p>}
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
