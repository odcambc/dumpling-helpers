import { type InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => (
    <div className="w-full">
      <input
        ref={ref}
        className={cn(
          'w-full rounded-md border px-3 py-1.5 text-sm shadow-xs transition-colors',
          'placeholder:text-gray-400 focus:outline-2 focus:outline-offset-0 focus:outline-brand',
          error ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white',
          className,
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  ),
)
Input.displayName = 'Input'
