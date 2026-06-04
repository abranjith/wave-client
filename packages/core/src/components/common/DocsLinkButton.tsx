import React from 'react';
import { BookOpenIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui';
import { WAVE_DOCS_URL } from '../../constants/docs';

export interface DocsLinkButtonProps {
  /** Override the documentation URL (defaults to {@link WAVE_DOCS_URL}). */
  href?: string;
  /** Additional classes merged onto the anchor. */
  className?: string;
}

/**
 * Icon-only "Documentation" link rendered in the sidebar footer of both apps.
 *
 * It is a plain external anchor (opens in a new tab / the system browser),
 * so it works identically in the web app and the VS Code webview without any
 * adapter / postMessage plumbing. Styling mirrors the sibling footer buttons
 * (Settings / theme toggle).
 */
const DocsLinkButton: React.FC<DocsLinkButtonProps> = ({ href = WAVE_DOCS_URL, className }) => {
  return (
    <TooltipProvider delayDuration={500}>
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Documentation"
            className={
              className ??
              'flex items-center justify-center w-full h-12 text-slate-600 hover:bg-slate-100 hover:text-blue-600 rounded-md transition-colors dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-400'
            }
          >
            <BookOpenIcon size={20} />
          </a>
        </TooltipTrigger>
        <TooltipContent className="px-2 py-1 text-xs">Documentation</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default DocsLinkButton;
