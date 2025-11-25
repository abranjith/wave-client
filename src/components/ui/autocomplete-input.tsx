import * as React from "react";
import { cn } from "../../utils/common";
import { Input } from "./input";

interface AutocompleteInputProps extends React.ComponentProps<"input"> {
  suggestions?: string[];
  onValueChange?: (value: string) => void;
}

function AutocompleteInput({
  className,
  suggestions = [],
  onValueChange,
  value,
  onChange,
  ...props
}: AutocompleteInputProps) {
  const [inputValue, setInputValue] = React.useState<string>(
    (value as string) || ""
  );
  const [filteredSuggestions, setFilteredSuggestions] = React.useState<
    string[]
  >([]);
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = React.useState(-1);
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  // Update internal state when value prop changes
  React.useEffect(() => {
    if (value !== undefined) {
      setInputValue(value as string);
    }
  }, [value]);

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
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const userInput = e.target.value;
    setInputValue(userInput);

    // Filter suggestions based on user input (match anywhere in the string)
    const filtered = suggestions.filter((suggestion) =>
      suggestion.toLowerCase().includes(userInput.toLowerCase())
    );

    setFilteredSuggestions(filtered);
    setShowSuggestions(userInput.length > 0 && filtered.length > 0);
    setActiveSuggestionIndex(-1);

    // Call original onChange if provided
    if (onChange) {
      onChange(e);
    }

    // Call onValueChange if provided
    if (onValueChange) {
      onValueChange(userInput);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputValue(suggestion);
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
    <div ref={wrapperRef} className="relative w-full">
      <Input
        {...props}
        className={className}
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />

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

export { AutocompleteInput };
export type { AutocompleteInputProps };
