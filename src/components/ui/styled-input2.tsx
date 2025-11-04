// StyledInput.tsx
import React, { useRef, useEffect } from 'react';
import { cn } from "../../utils/common";

interface StyledInputProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value: string;
  onChange: (plainText: string) => void;
}

/**
 * A contenteditable div that renders HTML but reports
 * plain text changes via the `onChange` prop.
 *
 * @param value - The HTML string to render inside the editor.
 * @param onChange - Callback with the plain text.
 */
function StyledInput({ value, onChange, className, ...props }: StyledInputProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  // 1. Handle user input
  // This function is called every time the user types, pastes, or deletes.
  const handleInput = () => {
    if (editorRef.current) {
      // Get the plain text content from the editor
      const plainText = editorRef.current.innerText;
      
      // Call the parent's onChange with the new plain text
      onChange(plainText);
    }
  };

  // 2. Synchronize the 'value' prop (HTML) with the editor
  // This runs when the `value` prop from the parent component changes.
  useEffect(() => {
    // We check if the parent's HTML value is different from the
    // editor's current HTML.
    // This check is the key to preventing cursor jumps.
    if (editorRef.current && value !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = value;
    }
  }, [value]); // Only re-run this effect if the `value` prop changes

  return (
    <div
      {...props} // Pass down props like `className`, `style`, etc.
      contentEditable={true}
      ref={editorRef}
      onInput={handleInput}
      role="textbox"
      className={cn(
        "border-input placeholder:text-muted-foreground/70 flex min-h-[40px] w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        className
      )}
    />
  );
}

export default StyledInput;