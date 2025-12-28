/**
 * UI Components
 * 
 * Reusable, styled UI components built with Radix UI primitives and Tailwind CSS.
 */

// Core form controls
export { Button, buttonVariants } from './button';
export { Input } from './input';
export { Textarea } from './textarea';
export { Checkbox } from './checkbox';
export { Switch } from './switch';
export { Label } from './label';

// Selection components
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './select';
export { SelectNative } from './select-native';
export { default as SearchableSelect } from './searchable-select';

// Dialog & Overlay components
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from './dialog';
export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from './popover';
export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';
export { default as Banner } from './banner';

// Navigation & Menu components
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './dropdown-menu';
export {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from './tabs';
export {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from './breadcrumb';

// Command palette
export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from './command';

// Table components
export {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from './table';

// Input variations
export { AutocompleteInput } from './autocomplete-input';
export { default as StyledAutocompleteInput } from './styled-autocomplete-input';
export { default as StyledInput } from './styled-input';
export { default as StyledInput2 } from './styled-input2';
export { FileInput } from './fileinput';

// Buttons
export { PrimaryButton } from './PrimaryButton';
export type { PrimaryButtonProps, ColorTheme } from './PrimaryButton';
export { SecondaryButton } from './SecondaryButton';
export type { SecondaryButtonProps } from './SecondaryButton';

// Other
export { default as SyntaxHighlighter } from './syntax-highlighter';
export { default as SelectDescription } from './select-description';
