import * as React from "react";
import { Input } from "./input";
import { cn } from "../../utils/common";

interface StyledInputProps extends Omit<React.ComponentProps<"input">, 'onChange'> {
  /**
   * Function that takes the input text and returns styled JSX elements
   */
  handleTextStyling: (text: string) => React.ReactNode;
  /**
   * Controlled value for the input
   */
  value: string;
  /**
   * Change handler for the input
   */
  onChange: (value: string) => void;
  /**
   * Additional className for the container
   */
  containerClassName?: string;
}

const StyledInput = React.forwardRef<HTMLInputElement, StyledInputProps>(
  ({ handleTextStyling, value, onChange, className, containerClassName, placeholder, ...props }, ref) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const overlayRef = React.useRef<HTMLDivElement>(null);

    // Combine refs
    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    // Sync scroll between input and overlay div
    const handleScroll = React.useCallback(() => {
      if (inputRef.current && overlayRef.current) {
        overlayRef.current.scrollLeft = inputRef.current.scrollLeft;
      }
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    };

    return (
      <div className={cn("relative flex-1", containerClassName)}>
        {/* Actual Input - Transparent text with visible cursor */}
        <Input
          ref={inputRef}
          className={cn(
            "relative z-0",
            // Make text transparent but keep cursor visible
            "text-transparent caret-black dark:caret-white",
            // Selection styling
            "selection:bg-blue-500/30",
            // Remove placeholder styling from input since overlay handles it
            "placeholder:text-transparent",
            // Remove shadow to prevent layout shifts
            "shadow-none",
            // Match the font-medium used by parameterized-text styling
            "font-medium",
            className
          )}
          value={value}
          onChange={handleChange}
          onScroll={handleScroll}
          placeholder={placeholder}
          {...props}
        />

        {/* Visual Display Overlay - Shows styled content */}
        <div
          ref={overlayRef}
          className={cn(
            // Position overlay exactly over input
            "absolute left-0 top-0 right-0 bottom-0 z-10",
            // Prevent interaction
            "pointer-events-none",
            // Match input's padding and height exactly
            "px-3 py-1 h-9",
            // Match text size - let line-height be natural to match browser default
            "text-sm",
            // Use font-medium to match the parameterized-text class styling
            "font-medium tracking-normal",
            // Handle overflow and text wrapping
            "overflow-x-auto overflow-y-hidden whitespace-nowrap",
            // Hide scrollbar
            "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
            // Text color
            "text-slate-900 dark:text-slate-100",
            // Use flexbox for vertical centering to match input
            "flex items-center"
          )}
        >
          {value ? (
            handleTextStyling(value)
          ) : (
            <span className="text-muted-foreground/70">
              {placeholder}
            </span>
          )}
        </div>
      </div>
    );
  }
);

StyledInput.displayName = "StyledInput";

export { StyledInput };