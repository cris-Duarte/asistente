import { forwardRef, SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, Check } from 'lucide-react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-10 w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);

Select.displayName = 'Select';

export interface SelectTriggerProps {
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const SelectTrigger = forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ className, children, onClick, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-10 w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100',
        className
      )}
      {...props}
    >
      <span>{children}</span>
      <ChevronDown className="h-4 w-4 text-gray-400" />
    </button>
  )
);

SelectTrigger.displayName = 'SelectTrigger';

export interface SelectContentProps {
  children: React.ReactNode;
  className?: string;
}

export const SelectContent = forwardRef<HTMLDivElement, SelectContentProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-lg border border-gray-200 bg-white text-gray-900 shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100', className)}
      {...props}
    >
      <div className="max-h-96 overflow-y-auto">{children}</div>
    </div>
  )
);

SelectContent.displayName = 'SelectContent';

export interface SelectItemProps {
  value: string;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export const SelectItem = forwardRef<HTMLButtonElement, SelectItemProps>(
  ({ className, children, value, disabled, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="option"
      value={value}
      disabled={disabled}
      className={cn(
        'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors',
        'focus:bg-primary-100 focus:text-primary-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 dark:focus:bg-primary-900 dark:focus:text-primary-100',
        className
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <Check className="h-4 w-4" />
      </span>
      <span>{children}</span>
    </button>
  )
);

SelectItem.displayName = 'SelectItem';

export interface SelectValueProps {
  placeholder?: string;
  className?: string;
}

export const SelectValue = forwardRef<HTMLSpanElement, SelectValueProps>(
  ({ className, placeholder, ...props }, ref) => (
    <span
      ref={ref}
      className={cn('text-sm', placeholder && 'text-gray-500 dark:text-gray-400', className)}
      {...props}
    >
      {placeholder}
    </span>
  )
);

SelectValue.displayName = 'SelectValue';