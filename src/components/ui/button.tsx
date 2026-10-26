import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "inline-flex min-h-12 min-w-12 max-w-full shrink-0 items-center justify-center gap-2 rounded-lg px-5 py-2 text-center text-base font-semibold whitespace-normal transition-colors focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:brightness-95",
        destructive: "bg-destructive text-signal-ink hover:brightness-95",
        safe: "bg-safe text-safe-ink hover:brightness-95",
        "call-answer": "call-answer-button",
        "call-hangup": "call-hangup-button",
        outline: "border border-border bg-background text-foreground hover:bg-secondary",
        secondary: "bg-secondary text-secondary-foreground hover:brightness-95",
        ghost: "text-foreground hover:bg-secondary",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "",
        sm: "min-h-12 px-4",
        lg: "min-h-[4.5rem] px-7 text-lg",
        icon: "size-12 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
