import { useEffect, useId, useState } from "react"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "../../utils/common"
import { Button } from "./button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command"
import { Label } from "./label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover"

interface SearchableSelectProps {
  id?: string
  label?: string
  options: { label: string; value: string }[]
  setSelectedValue: (value: string) => void
  selectedValue?: string
}

export default function SearchableSelect({id, label, options, selectedValue, setSelectedValue}: SearchableSelectProps) {
  const idValue = id || useId()
  const [open, setOpen] = useState<boolean>(false)
  const [value, setValue] = useState<string>(selectedValue || "")

  useEffect(() => {
    if(value && value !== selectedValue) {
      setSelectedValue(value)
    }
  }, [value, setSelectedValue])

  return (
    <div className="*:not-first:mt-2">
      {label && <Label htmlFor={idValue}>{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={idValue}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between border-input bg-background px-3 font-normal outline-offset-0 outline-none hover:bg-background focus-visible:outline-[3px]"
          >
            <span className={cn("truncate", !value && "text-muted-foreground")}>
              {value
                ? options.find((option) => option.value === value)?.label
                : "Select value..."}
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
          <Command>
            <CommandInput placeholder="Search value..." />
            <CommandList>
              <CommandEmpty>No value found.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={(currentValue) => {
                      setValue(currentValue === value ? "" : currentValue)
                      setOpen(false)
                    }}
                  >
                    {option.label}
                    {value === option.value && (
                      <CheckIcon size={16} className="ml-auto" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
