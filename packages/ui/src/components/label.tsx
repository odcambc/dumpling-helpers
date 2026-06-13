import { type LabelHTMLAttributes } from 'react'
import { cn } from '../utils'

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean
  hint?: string
}

export function Label({ className, children, required, hint, ...props }: LabelProps) {
  return (
    <label className={cn('block text-sm font-medium text-gray-700 mb-1', className)} {...props}>
      {children}
      {required && <span className="ml-1 text-red-500">*</span>}
      {hint && <span className="ml-2 text-xs font-normal text-gray-400">{hint}</span>}
    </label>
  )
}
