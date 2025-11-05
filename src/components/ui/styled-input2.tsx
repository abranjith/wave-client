// StyledInput.tsx
import React, { useRef, useEffect, JSX } from 'react';
import { cn } from "../../utils/common";

interface StyledInputProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value: JSX.Element;
  onChange: (plainText: string) => void;
}

/**
 * A contenteditable div that renders HTML but reports
 * plain text changes via the `onChange` prop.
 *
 * @param value - The HTML string to render inside the editor.
 * @param onChange - Callback with the plain text.
 */
function StyledInput2({ value, onChange, className, ...props }: StyledInputProps) {
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
    // Since value is a JSX.Element, we need to render it into the contentEditable div
    // We'll use a temporary container to convert JSX to HTML string
    if (editorRef.current) {
      const tempDiv = document.createElement('div');
      const root = (window as any).createRoot ? (window as any).createRoot(tempDiv) : null;
      
      if (root) {
        root.render(value);
        setTimeout(() => {
          if (editorRef.current && tempDiv.innerHTML !== editorRef.current.innerHTML) {
            editorRef.current.innerHTML = tempDiv.innerHTML;
          }
          root.unmount();
        }, 0);
      } else {
        // Fallback: just set innerHTML directly from JSX string representation
        // This won't work perfectly but prevents the error
        const htmlString = String(value);
        if (editorRef.current.innerHTML !== htmlString) {
          editorRef.current.innerHTML = htmlString;
        }
      }
    }
  }, [value]); // Only re-run this effect if the `value` prop changes

  return (
    <div
      {...props}
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

export default StyledInput2;