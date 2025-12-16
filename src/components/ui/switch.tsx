import * as React from "react";
import { cn } from "../../utils/common";

export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onCheckedChange?: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, onCheckedChange, checked, disabled, id, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onCheckedChange?.(e.target.checked);
    };

    return (
      <label 
        htmlFor={id}
        className={cn(
          "relative inline-flex items-center cursor-pointer",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <input
          type="checkbox"
          id={id}
          className="sr-only peer"
          ref={ref}
          checked={checked}
          disabled={disabled}
          onChange={handleChange}
          {...props}
        />
        <div
          className={cn(
            "w-9 h-5 rounded-full transition-colors duration-200",
            "bg-slate-300 dark:bg-slate-600",
            "peer-checked:bg-blue-600 dark:peer-checked:bg-blue-500",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2",
            "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
            "after:content-[''] after:absolute after:top-0.5 after:left-0.5",
            "after:bg-white after:rounded-full after:h-4 after:w-4",
            "after:transition-transform after:duration-200",
            "peer-checked:after:translate-x-4",
            className
          )}
        />
      </label>
    );
  }
);
Switch.displayName = "Switch";

export { Switch };
