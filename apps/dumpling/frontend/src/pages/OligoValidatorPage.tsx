import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { SuiteSwitcher, HelpMenu } from '@dumplingkit/ui'
import { OligoValidator } from '@/components/OligoValidator/OligoValidator'

export default function OligoValidatorPage() {
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-3 flex items-center justify-between gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to wizard
        </Link>
        <div className="flex items-center gap-2">
          <SuiteSwitcher
            current="oligo-validator"
            align="right"
            className="w-44"
            renderLink={(to, className, children) => (
              <Link to={to} className={className}>
                {children}
              </Link>
            )}
          />
          <HelpMenu />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="mx-auto h-full max-w-4xl">
          <OligoValidator />
        </div>
      </div>
    </div>
  )
}
