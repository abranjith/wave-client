import * as React from "react";
import { cn } from "../../utils/common";
import { Input } from "./input";
import { JSX } from "react";

interface StyledAutocompleteInputProps extends Omit<React.ComponentProps<"input">, "onChange"> {
  /**
   * Controlled value for the input
   */
  value: string;
  /**
   * Styled value for the input (JSX with styling)
   */
  styledValue: JSX.Element;
  /**
   * Autocomplete suggestions
   */
  suggestions?: string[];
  /**
   * Callback when value changes (replaces onChange for clarity)
   */
  onValueChange?: (value: string) => void;
  /**
   * Additional className for the container
   */
  containerClassName?: string;
}

const StyledAutocompleteInput = React.forwardRef<
  HTMLInputElement,
  StyledAutocompleteInputProps
>(
  (
    {
      styledValue,
      value,
      className,
      containerClassName,
      placeholder,
      suggestions = [],
      onValueChange,
      ...props
    },
    ref
  ) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const overlayRef = React.useRef<HTMLDivElement>(null);
    const wrapperRef = React.useRef<HTMLDivElement>(null);

    const [filteredSuggestions, setFilteredSuggestions] = React.useState<
      string[]
    >([]);
    const [showSuggestions, setShowSuggestions] = React.useState(false);
    const [activeSuggestionIndex, setActiveSuggestionIndex] =
      React.useState(-1);
    
    // Track previous value to detect external changes
    const prevValueRef = React.useRef<string>(value);

    // Combine refs
    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    // Sync scroll between input and overlay div
    const handleScroll = React.useCallback(() => {
      if (inputRef.current && overlayRef.current) {
        overlayRef.current.scrollLeft = inputRef.current.scrollLeft;
      }
    }, []);

    // Update filtered suggestions when value or suggestions change externally
    React.useEffect(() => {
      // Only update if value changed from outside (not from user typing)
      if (value !== prevValueRef.current) {
        prevValueRef.current = value;
        
        // Filter suggestions based on new value
        if (value && suggestions.length > 0) {
          const filtered = suggestions.filter((suggestion) =>
            suggestion.toLowerCase().includes(value.toLowerCase())
          );
          setFilteredSuggestions(filtered);
          // Don't auto-show suggestions on external value changes
          setShowSuggestions(false);
        } else {
          setFilteredSuggestions([]);
          setShowSuggestions(false);
        }
      }
    }, [value, suggestions]);

    // Close dropdown when clicking outside
    React.useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          wrapperRef.current &&
          !wrapperRef.current.contains(event.target as Node)
        ) {
          setShowSuggestions(false);
        }
      };

      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const userInput = e.target.value;
      
      // Update ref to track this change came from user input
      prevValueRef.current = userInput;

      // Filter suggestions based on user input (match anywhere in the string)
      const filtered = suggestions.filter((suggestion) =>
        suggestion.toLowerCase().includes(userInput.toLowerCase())
      );

      setFilteredSuggestions(filtered);
      setShowSuggestions(userInput.length > 0 && filtered.length > 0);
      setActiveSuggestionIndex(-1);

      // Notify parent of value change
      if (onValueChange) {
        onValueChange(userInput);
      }
    };

    const handleSuggestionClick = (suggestion: string) => {
      setFilteredSuggestions([]);
      setShowSuggestions(false);
      setActiveSuggestionIndex(-1);

      // Call onValueChange if provided
      if (onValueChange) {
        onValueChange(suggestion);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveSuggestionIndex((prev) =>
          prev < filteredSuggestions.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggestionIndex((prev) => (prev > 0 ? prev - 1 : -1));
      } else if (e.key === "Enter") {
        if (activeSuggestionIndex >= 0) {
          e.preventDefault();
          handleSuggestionClick(filteredSuggestions[activeSuggestionIndex]);
        }
      } else if (e.key === "Escape") {
        setShowSuggestions(false);
        setActiveSuggestionIndex(-1);
      }

      // Call original onKeyDown if provided
      if (props.onKeyDown) {
        props.onKeyDown(e);
      }
    };

    return (
      <div ref={wrapperRef} className={cn("relative flex-1", containerClassName)}>
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
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          placeholder={placeholder}
          autoComplete="off"
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
            // Handle overflow and text wrapping - PRESERVE whitespace!
            "overflow-x-auto overflow-y-hidden whitespace-pre",
            // Hide scrollbar
            "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
            // Text color
            "text-slate-900 dark:text-slate-100",
            // Use flexbox for vertical centering to match input
            "flex items-center"
          )}
        >
          {styledValue ? (
            styledValue
          ) : (
            <span className="text-muted-foreground/70">{placeholder}</span>
          )}
        </div>

        {/* Autocomplete Suggestions Dropdown */}
        {showSuggestions && filteredSuggestions.length > 0 && (
          <ul
            className={cn(
              "absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-input bg-popover text-popover-foreground shadow-md",
              "animate-in fade-in-0 zoom-in-95"
            )}
          >
            {filteredSuggestions.map((suggestion, index) => (
              <li
                key={index}
                className={cn(
                  "relative flex cursor-pointer select-none items-center px-3 py-2 text-sm outline-none transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  index === activeSuggestionIndex &&
                    "bg-accent text-accent-foreground"
                )}
                onClick={() => handleSuggestionClick(suggestion)}
                onMouseEnter={() => setActiveSuggestionIndex(index)}
              >
                {suggestion}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
);

StyledAutocompleteInput.displayName = "StyledAutocompleteInput";

export default StyledAutocompleteInput;
