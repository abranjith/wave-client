import * as React from "react";
import { type VariantProps } from "class-variance-authority";
import { cn } from "../../utils/styling";
import { Button, buttonVariants } from "./button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";

// ==================== Types ====================

export type ColorTheme = "main" | "success" | "error" | "warning" | "purple";

export interface PrimaryButtonProps
  extends Omit<React.ComponentProps<typeof Button>, "color">,
    VariantProps<typeof buttonVariants> {
  icon?: React.ReactNode;
  text?: string;
  colorTheme?: ColorTheme;
  tooltip?: string;
}

// ==================== Color Theme Mappings ====================

/**
 * Primary Button uses a lighter background with darker text/icon colors.
 * Border is gray by default and changes to the theme color on hover.
 */
const colorThemeClasses: Record<ColorTheme, string> = {
  main: cn(
    // Light mode: light blue bg, dark blue text
    "bg-blue-100 text-blue-700",
    "hover:bg-blue-200 hover:text-blue-800 hover:border-blue-400",
    // Dark mode: darker blue bg, lighter blue text
    "dark:bg-blue-900/40 dark:text-blue-300",
    "dark:hover:bg-blue-900/60 dark:hover:text-blue-200 dark:hover:border-blue-500"
  ),
  success: cn(
    // Light mode: light green bg, dark green text
    "bg-green-100 text-green-700",
    "hover:bg-green-200 hover:text-green-800 hover:border-green-400",
    // Dark mode
    "dark:bg-green-900/40 dark:text-green-300",
    "dark:hover:bg-green-900/60 dark:hover:text-green-200 dark:hover:border-green-500"
  ),
  error: cn(
    // Light mode: light red bg, dark red text
    "bg-red-100 text-red-700",
    "hover:bg-red-200 hover:text-red-800 hover:border-red-400",
    // Dark mode
    "dark:bg-red-900/40 dark:text-red-300",
    "dark:hover:bg-red-900/60 dark:hover:text-red-200 dark:hover:border-red-500"
  ),
  warning: cn(
    // Light mode: light orange bg, dark orange text
    "bg-orange-100 text-orange-700",
    "hover:bg-orange-200 hover:text-orange-800 hover:border-orange-400",
    // Dark mode
    "dark:bg-orange-900/40 dark:text-orange-300",
    "dark:hover:bg-orange-900/60 dark:hover:text-orange-200 dark:hover:border-orange-500"
  ),
  purple: cn(
    // Light mode: light purple bg, dark purple text
    "bg-purple-100 text-purple-700",
    "hover:bg-purple-200 hover:text-purple-800 hover:border-purple-400",
    // Dark mode
    "dark:bg-purple-900/40 dark:text-purple-300",
    "dark:hover:bg-purple-900/60 dark:hover:text-purple-200 dark:hover:border-purple-500"
  ),
};

// ==================== Component ====================

const PrimaryButton = React.forwardRef<HTMLButtonElement, PrimaryButtonProps>(
  (
    {
      className,
      size,
      variant = "outline",
      icon,
      text,
      colorTheme = "main",
      tooltip,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const hasIcon = Boolean(icon);
    const hasText = Boolean(text);
    const iconOnly = hasIcon && !hasText;

    // Determine effective size for icon-only buttons
    const effectiveSize = iconOnly && size !== "icon" ? "icon" : size;

    // Build icon sizing classes
    const iconClasses = cn(
      iconOnly ? "h-5 w-5" : "h-4 w-4"
    );

    const buttonContent = (
      <Button
        ref={ref}
        variant={variant}
        size={effectiveSize}
        disabled={disabled}
        className={cn(
          colorThemeClasses[colorTheme],
          hasIcon && hasText && "gap-1",
          className
        )}
        {...props}
      >
        {hasIcon && (
          <span className={iconClasses}>
            {React.isValidElement(icon)
              ? React.cloneElement(icon as React.ReactElement<{ className?: string }>, {
                  className: cn("h-full w-full", (icon as React.ReactElement<{ className?: string }>).props.className),
                })
              : icon}
          </span>
        )}
        {hasText && <span>{text}</span>}
        {!hasIcon && !hasText && children}
      </Button>
    );

    // Wrap with tooltip if provided
    if (tooltip) {
      return (
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>{buttonContent}</TooltipTrigger>
            <TooltipContent className="px-2 py-1 text-xs">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return buttonContent;
  }
);

PrimaryButton.displayName = "PrimaryButton";

export { PrimaryButton };
