import * as React from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input, type InputProps } from './Input'

export type SearchInputProps = Omit<InputProps, 'type'>

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, ...props }, ref) => (
    <div className={cn('fp-search', className)}>
      <Search className="fp-search__icon h-4 w-4" aria-hidden />
      <Input ref={ref} type="search" {...props} />
    </div>
  ),
)
SearchInput.displayName = 'SearchInput'
