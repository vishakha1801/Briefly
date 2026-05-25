import type { ComponentProps, HTMLAttributes } from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: "user" | "assistant"
}

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group flex w-full items-end justify-end gap-2 py-0.5",
      from === "user" ? "is-user" : "is-assistant flex-row-reverse justify-end",
      className
    )}
    {...props}
  />
)

const messageContentVariants = cva(
  "flex flex-col gap-2 overflow-hidden rounded-xl text-[13px] w-full",
  {
    variants: {
      variant: {
        contained: "w-full px-3 py-1.5 rounded-xl",
        flat: "",
      },
      from: {
        user: "",
        assistant: "",
      },
    },
    compoundVariants: [
      {
        variant: "contained",
        from: "user",
        className:
          "rounded-xl border-0 bg-[#4F5BF0] text-white/95",
      },
      {
        variant: "contained",
        from: "assistant",
        className: "bg-zinc-900/82 text-white/90 backdrop-blur-md border border-white/8",
      },
      {
        variant: "flat",
        from: "user",
        className: "w-full bg-secondary px-3.5 py-1.5 text-foreground",
      },
      {
        variant: "flat",
        from: "assistant",
        className: "text-foreground",
      },
    ],
    defaultVariants: {
      variant: "contained",
      from: "assistant",
    },
  }
)

export type MessageContentProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof messageContentVariants> & {
    from?: "user" | "assistant"
  }

export const MessageContent = ({
  children,
  className,
  variant,
  from,
  ...props
}: MessageContentProps) => (
  <div
    className={cn(messageContentVariants({ variant, from, className }))}
    {...props}
  >
    {children}
  </div>
)

export type MessageAvatarProps = ComponentProps<typeof Avatar> & {
  src?: string
  name?: string
}

export const MessageAvatar = ({
  src,
  name,
  className,
  ...props
}: MessageAvatarProps) => (
  <Avatar className={cn("ring-border size-8 ring-1", className)} {...props}>
    {src ? <AvatarImage alt="" className="mt-0 mb-0" src={src} /> : null}
    <AvatarFallback>{name?.slice(0, 2) || "ME"}</AvatarFallback>
  </Avatar>
)
