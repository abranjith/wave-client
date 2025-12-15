import React, { useState } from "react"
import { InfoIcon, ThumbsUpIcon, TriangleAlertIcon, ShieldAlertIcon, XIcon } from "lucide-react"

import { Button } from "./button"

type MessageType = "info" | "success" | "warn" | "error"

interface BannerProps {
  message: string
  messageType: MessageType
  link?: {
    text: string
    href: string
  },
  timeoutSeconds?: number
  onClose?: () => void
}

const messageStyles: Record<MessageType, {
  containerClass: string
  textClass: string
  Icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>
}> = {
  info: {
    containerClass: "bg-blue-500/10 border-blue-500/20",
    textClass: "text-blue-700 dark:text-blue-400",
    Icon: InfoIcon,
  },
  success: {
    containerClass: "bg-green-500/10 border-green-500/20",
    textClass: "text-green-700 dark:text-green-400",
    Icon: ThumbsUpIcon,
  },
  warn: {
    containerClass: "bg-orange-500/10 border-orange-500/20",
    textClass: "text-orange-700 dark:text-orange-400",
    Icon: ShieldAlertIcon,
  },
  error: {
    containerClass: "bg-red-500/10 border-red-500/20",
    textClass: "text-red-700 dark:text-red-400",
    Icon: TriangleAlertIcon,
  },
}

export default function Banner({ message, messageType, link, timeoutSeconds = 10, onClose }: BannerProps): React.ReactElement | null {
  const [isVisible, setIsVisible] = useState<boolean>(true)

  const handleClose = (): void => {
    if (onClose) {
      onClose()
    }
    setIsVisible(false)
  }

  React.useEffect(() => {
    // Auto-close for info and success messages
    if (messageType !== 'error' && messageType !== 'warn') {
      const timer = setTimeout(() => {
        handleClose()
      }, timeoutSeconds * 1000)

      return () => clearTimeout(timer)
    }
  }, [messageType, timeoutSeconds])

  if (!isVisible) return null

  const { containerClass, textClass, Icon } = messageStyles[messageType]

  return (
    <div className={`border px-4 py-3 ${containerClass}`}>
      <div className="flex gap-2">
        <div className="flex grow gap-3">
          <Icon
            className={`mt-0.5 shrink-0 ${textClass}`}
            size={16}
            aria-hidden={true}
          />
          <div className="flex grow flex-col justify-between gap-2 md:flex-row md:items-center">
            <p className={`text-sm ${textClass}`}>
              {message}
            </p>
            {link && (
              <a 
                href={link.href} 
                className={`group text-sm font-medium whitespace-nowrap ${textClass}`}
              >
                {link.text}
                <svg
                  className="ms-1 -mt-0.5 inline-flex opacity-60 transition-transform group-hover:translate-x-0.5"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </a>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          className={`group -my-1.5 -me-2 size-8 shrink-0 p-0 hover:bg-transparent ${textClass}`}
          onClick={handleClose}
          aria-label="Close banner"
        >
          <XIcon
            size={16}
            className="opacity-60 transition-opacity group-hover:opacity-100"
            aria-hidden="true"
          />
        </Button>
      </div>
    </div>
  )
}
