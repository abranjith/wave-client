import { useEffect, useId, useState } from "react"
import { CheckIcon, ChevronDownIcon, PlusIcon } from "lucide-react"

import { cn } from "../../utils/styling"
import { Button } from "./button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from "./command"
import { Label } from "./label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover"

interface SearchableSelectProps {
  id?: string,
  name?: string
  label?: string
  placeholder?: string
  options: { label: string; value: string }[]
  setSelectedValue: (value: string) => void
  selectedValue?: string,
  disabled?: boolean,
  includeOptionToCreateNew?: boolean,
  onCreateNewOption?: (isSelected: boolean) => void
}

export default function SearchableSelect({id, name, label, placeholder, options, selectedValue, setSelectedValue, disabled = false, includeOptionToCreateNew, onCreateNewOption}: SearchableSelectProps) {
  const idValue = id || useId()
  const [open, setOpen] = useState<boolean>(false)
  const [value, setValue] = useState<string>(selectedValue || "")
  const placeholderText = placeholder || `Select ${name || 'value'}...`
  const selectedOption = options.find((option) => option.value === value)

  useEffect(() => {
    setValue(selectedValue || "")
  }, [selectedValue])

  return (
    <div className="*:not-first:mt-2">
      {label && <Label htmlFor={idValue}>{label}</Label>}
      {/* modal: registers its own scroll-lock shard so wheel scrolling works
          when the popover is portaled outside a modal Dialog's scroll lock. */}
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <Button
            id={idValue}
            variant="outline"
            role="combobox"
            disabled={disabled}
            aria-expanded={open}
            className="w-full justify-between border-input bg-background px-3 font-normal outline-offset-0 outline-none hover:bg-background focus-visible:outline-[3px] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className={cn("truncate", !selectedOption && "text-muted-foreground")}>
              {selectedOption ? selectedOption.label : placeholderText}
            </span>
            <ChevronDownIcon
              size={16}
              className="shrink-0 text-muted-foreground/80"
              aria-hidden="true"
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-full min-w-[var(--radix-popper-anchor-width)] border-input p-0"
          align="start"
        >
          <Command
            onKeyDown={(e) => {
              // Tab accepts the highlighted option (combobox convention);
              // cmdk itself only selects on Enter.
              if (e.key === "Tab" && !e.shiftKey) {
                const activeItem = e.currentTarget.querySelector<HTMLElement>(
                  '[cmdk-item][aria-selected="true"]'
                )
                if (activeItem) {
                  e.preventDefault()
                  activeItem.click()
                }
              }
            }}
          >
            <CommandInput placeholder={placeholderText} />
            <CommandList>
              <CommandEmpty>{`No ${name || 'value'} found.`}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    // cmdk filters on `value`; keywords keep search working
                    // when values are opaque keys (e.g. indexes).
                    keywords={[option.label]}
                    onSelect={(currentValue) => {
                      if (disabled) {
                        return;
                      }
                      setValue(currentValue)
                      setSelectedValue(currentValue)
                      setOpen(false)
                      onCreateNewOption && onCreateNewOption(false)
                    }}
                  >
                    {option.label}
                    {value === option.value && (
                      <CheckIcon size={16} className="ml-auto" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
              {includeOptionToCreateNew && onCreateNewOption && (
              <>
              <CommandSeparator />
              <CommandGroup>
                <Button
                  variant="ghost"
                  disabled={disabled}
                  className="w-full justify-start font-normal"
                  onClick={() => { setOpen(false); onCreateNewOption(true); }}
                >
                  <PlusIcon
                    size={16}
                    className="-ms-2 opacity-60"
                    aria-hidden="true"
                  />
                  {name ? `Create New ${name}` : "Create New"}
                </Button>
              </CommandGroup>
              </>
            )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
