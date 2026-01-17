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

export interface SecondaryButtonProps
  extends Omit<React.ComponentProps<typeof Button>, "color">,
    VariantProps<typeof buttonVariants> {
  icon?: React.ReactNode;
  text?: string;
  colorTheme?: ColorTheme;
  tooltip?: string;
}

// ==================== Color Theme Mappings ====================

/**
 * Secondary Button uses a transparent/white background with colored text/icon.
 * Border is gray by default and changes to the theme color on hover.
 * On hover, background gets a subtle tint of the theme color.
 */
const colorThemeClasses: Record<ColorTheme, string> = {
  main: cn(
    // Light mode: white bg, blue text
    "bg-white text-blue-600",
    "hover:bg-blue-50 hover:text-blue-700 hover:border-blue-400",
    // Dark mode: dark bg, blue text
    "dark:bg-slate-800 dark:text-blue-400",
    "dark:hover:bg-blue-900/20 dark:hover:text-blue-300 dark:hover:border-blue-500"
  ),
  success: cn(
    // Light mode: white bg, green text
    "bg-white text-green-600",
    "hover:bg-green-50 hover:text-green-700 hover:border-green-400",
    // Dark mode
    "dark:bg-slate-800 dark:text-green-400",
    "dark:hover:bg-green-900/20 dark:hover:text-green-300 dark:hover:border-green-500"
  ),
  error: cn(
    // Light mode: white bg, red text
    "bg-white text-red-600",
    "hover:bg-red-50 hover:text-red-700 hover:border-red-400",
    // Dark mode
    "dark:bg-slate-800 dark:text-red-400",
    "dark:hover:bg-red-900/20 dark:hover:text-red-300 dark:hover:border-red-500"
  ),
  warning: cn(
    // Light mode: white bg, orange text
    "bg-white text-orange-600",
    "hover:bg-orange-50 hover:text-orange-700 hover:border-orange-400",
    // Dark mode
    "dark:bg-slate-800 dark:text-orange-400",
    "dark:hover:bg-orange-900/20 dark:hover:text-orange-300 dark:hover:border-orange-500"
  ),
  purple: cn(
    // Light mode: white bg, purple text
    "bg-white text-purple-600",
    "hover:bg-purple-50 hover:text-purple-700 hover:border-purple-400",
    // Dark mode
    "dark:bg-slate-800 dark:text-purple-400",
    "dark:hover:bg-purple-900/20 dark:hover:text-purple-300 dark:hover:border-purple-500"
  ),
};

// ==================== Component ====================

const SecondaryButton = React.forwardRef<HTMLButtonElement, SecondaryButtonProps>(
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

SecondaryButton.displayName = "SecondaryButton";

export { SecondaryButton };
