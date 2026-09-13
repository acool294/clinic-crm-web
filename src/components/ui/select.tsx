"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { ChevronDown, Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface SelectContextType {
  value?: string
  onValueChange?: (value: string) => void
  open: boolean
  setOpen: (open: boolean) => void
  disabled?: boolean
  labels: Map<string, React.ReactNode>
  registerLabel: (value: string, label: React.ReactNode) => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
  contentRef: React.RefObject<HTMLDivElement | null>
}

const SelectContext = React.createContext<SelectContextType | null>(null)

function useSelectContext() {
  const context = React.useContext(SelectContext)
  if (!context) {
    throw new Error("Select compound components must be used within a Select provider")
  }
  return context
}

export interface SelectProps {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
  children?: React.ReactNode
}

export function Select({
  value: controlledValue,
  defaultValue,
  onValueChange,
  open: controlledOpen,
  onOpenChange,
  disabled = false,
  children,
}: SelectProps) {
  const [internalValue, setInternalValue] = React.useState<string | undefined>(defaultValue)
  const [internalOpen, setInternalOpen] = React.useState(false)
  const [labels, setLabels] = React.useState<Map<string, React.ReactNode>>(() => new Map())

  const triggerRef = React.useRef<HTMLButtonElement | null>(null)
  const contentRef = React.useRef<HTMLDivElement | null>(null)

  const isValueControlled = controlledValue !== undefined
  const currentValue = isValueControlled ? controlledValue : internalValue

  const isOpenControlled = controlledOpen !== undefined
  const isOpen = isOpenControlled ? controlledOpen : internalOpen

  const setOpen = React.useCallback(
    (newOpen: boolean) => {
      if (disabled) return
      if (!isOpenControlled) {
        setInternalOpen(newOpen)
      }
      onOpenChange?.(newOpen)
    },
    [disabled, isOpenControlled, onOpenChange]
  )

  const handleValueChange = React.useCallback(
    (val: string) => {
      if (!isValueControlled) {
        setInternalValue(val)
      }
      onValueChange?.(val)
      setOpen(false)
    },
    [isValueControlled, onValueChange, setOpen]
  )

  const registerLabel = React.useCallback((val: string, label: React.ReactNode) => {
    setLabels((prev) => {
      if (prev.get(val) === label) return prev
      const next = new Map(prev)
      next.set(val, label)
      return next
    })
  }, [])

  return (
    <SelectContext.Provider
      value={{
        value: currentValue,
        onValueChange: handleValueChange,
        open: isOpen,
        setOpen,
        disabled,
        labels,
        registerLabel,
        triggerRef,
        contentRef,
      }}
    >
      <div className="relative inline-block w-full" data-slot="select">
        {children}
      </div>
    </SelectContext.Provider>
  )
}

export interface SelectTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string
  children?: React.ReactNode
}

export const SelectTrigger = React.forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ className, children, ...props }, forwardedRef) => {
    const { open, setOpen, triggerRef, disabled } = useSelectContext()

    const combinedRef = (node: HTMLButtonElement | null) => {
      (triggerRef as React.MutableRefObject<HTMLButtonElement | null>).current = node
      if (typeof forwardedRef === "function") {
        forwardedRef(node)
      } else if (forwardedRef) {
        forwardedRef.current = node
      }
    }

    return (
      <button
        ref={combinedRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        disabled={disabled || props.disabled}
        data-slot="select-trigger"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 dark:bg-input/30",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDown className={cn("size-4 shrink-0 opacity-50 transition-transform duration-200", open && "rotate-180")} />
      </button>
    )
  }
)
SelectTrigger.displayName = "SelectTrigger"

export interface SelectValueProps {
  placeholder?: string
  className?: string
}

export function SelectValue({ placeholder, className }: SelectValueProps) {
  const { value, labels } = useSelectContext()
  const displayLabel = value !== undefined ? labels.get(value) ?? value : null

  return (
    <span
      data-slot="select-value"
      className={cn(
        "block truncate text-left",
        !displayLabel && "text-muted-foreground",
        className
      )}
    >
      {displayLabel || placeholder || ""}
    </span>
  )
}

export interface SelectContentProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
  children?: React.ReactNode
  align?: "start" | "center" | "end"
}

export const SelectContent = React.forwardRef<HTMLDivElement, SelectContentProps>(
  ({ className, children, align = "start", ...props }, forwardedRef) => {
    const { open, setOpen, triggerRef, contentRef } = useSelectContext()
    const [mounted, setMounted] = React.useState(false)
    const [coords, setCoords] = React.useState<{ top: number; left: number; width: number } | null>(null)

    React.useEffect(() => {
      setMounted(true)
    }, [])

    const combinedRef = (node: HTMLDivElement | null) => {
      (contentRef as React.MutableRefObject<HTMLDivElement | null>).current = node
      if (typeof forwardedRef === "function") {
        forwardedRef(node)
      } else if (forwardedRef) {
        forwardedRef.current = node
      }
    }

    React.useEffect(() => {
      if (!open) return

      const updatePosition = () => {
        if (triggerRef.current) {
          const rect = triggerRef.current.getBoundingClientRect()
          setCoords({
            top: rect.bottom + 4,
            left: align === "end" ? rect.right - Math.max(rect.width, 160) : rect.left,
            width: rect.width,
          })
        }
      }

      updatePosition()
      window.addEventListener("resize", updatePosition)
      window.addEventListener("scroll", updatePosition, true)

      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as Node
        if (
          contentRef.current &&
          !contentRef.current.contains(target) &&
          triggerRef.current &&
          !triggerRef.current.contains(target)
        ) {
          setOpen(false)
        }
      }

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          setOpen(false)
        }
      }

      document.addEventListener("mousedown", handleClickOutside)
      document.addEventListener("keydown", handleKeyDown)
      return () => {
        window.removeEventListener("resize", updatePosition)
        window.removeEventListener("scroll", updatePosition, true)
        document.removeEventListener("mousedown", handleClickOutside)
        document.removeEventListener("keydown", handleKeyDown)
      }
    }, [open, setOpen, contentRef, triggerRef, align])

    if (!mounted || !open || !coords) return null

    return createPortal(
      <div
        ref={combinedRef}
        data-slot="select-content"
        style={{
          position: "fixed",
          top: `${coords.top}px`,
          left: `${coords.left}px`,
          minWidth: `${Math.max(coords.width, 160)}px`,
          zIndex: 9999,
        }}
        className={cn(
          "max-w-[90vw] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl animate-in fade-in-80 zoom-in-95 dark:border-slate-800",
          className
        )}
        {...props}
      >
        <div className="max-h-60 overflow-y-auto p-1">
          {children}
        </div>
      </div>,
      document.body
    )
  }
)
SelectContent.displayName = "SelectContent"

export interface SelectItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
  disabled?: boolean
  className?: string
  children: React.ReactNode
}

export const SelectItem = React.forwardRef<HTMLDivElement, SelectItemProps>(
  ({ value, disabled = false, className, children, ...props }, ref) => {
    const { value: selectedValue, onValueChange, registerLabel } = useSelectContext()
    const isSelected = selectedValue === value

    React.useEffect(() => {
      registerLabel(value, children)
    }, [value, children, registerLabel])

    return (
      <div
        ref={ref}
        role="option"
        aria-selected={isSelected}
        data-disabled={disabled ? "" : undefined}
        onClick={() => {
          if (!disabled && onValueChange) {
            onValueChange(value)
          }
        }}
        className={cn(
          "relative flex w-full cursor-pointer select-none items-center rounded-md py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
          isSelected && "font-medium text-foreground bg-accent/50",
          className
        )}
        {...props}
      >
        <span className="absolute left-2 flex size-3.5 items-center justify-center">
          {isSelected && <Check className="size-4 text-blue-600" />}
        </span>
        <span className="truncate">{children}</span>
      </div>
    )
  }
)
SelectItem.displayName = "SelectItem"

export function SelectGroup({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="select-group"
      className={cn("p-1", className)}
      {...props}
    />
  )
}

export function SelectLabel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-xs font-semibold text-muted-foreground", className)}
      {...props}
    />
  )
}

export function SelectSeparator({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="select-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}
