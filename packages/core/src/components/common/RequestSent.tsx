import React from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import { ChevronDownIcon } from 'lucide-react';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { getHttpMethodColor } from '../../utils/common';
import type { SentRequestData } from '../../types/collection';

interface RequestSentSectionProps {
  value: string;
  title: string;
  children: React.ReactNode;
}

/**
 * Collapsible section used by RequestSent.
 *
 * The trigger (header) and content use distinct backgrounds so the section
 * boundary reads clearly in both light and dark mode.
 */
const RequestSentSection: React.FC<RequestSentSectionProps> = ({ value, title, children }) => (
  <Accordion.Item
    value={value}
    className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-700"
  >
    <Accordion.Header>
      <Accordion.Trigger className="group flex w-full items-center justify-between bg-slate-100 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 hover:bg-slate-200/70 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/70">
        <span>{title}</span>
        <ChevronDownIcon className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </Accordion.Trigger>
    </Accordion.Header>
    <Accordion.Content className="border-t border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
      {children}
    </Accordion.Content>
  </Accordion.Item>
);

/**
 * HTTP-only Sent tab content showing the exact request snapshot from the last send.
 *
 * Data is read from `TabData.sentRequest`, which is intentionally ephemeral and
 * never persisted. The tab itself is hidden by the editor when no snapshot exists,
 * so the empty state below is only a defensive fallback.
 *
 * @returns Sent request debug view or an empty-state prompt.
 */
const RequestSent: React.FC = () => {
  const sentRequest = useAppStateStore((state) => state.getActiveTab()?.sentRequest);

  if (!sentRequest) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        Send the request to see exactly what was sent.
      </div>
    );
  }

  const snapshot = sentRequest as SentRequestData;

  return (
    <div className="space-y-3 text-xs text-slate-500 dark:text-slate-400">
      <Accordion.Root type="multiple" defaultValue={['url', 'headers', 'body']} className="space-y-2">
        <RequestSentSection value="url" title="URL">
          {/* Method + full URL (incl. query params) on a single line. */}
          <div className="flex items-center gap-2">
            <span className={`flex-shrink-0 rounded px-2 py-0.5 font-mono text-[11px] font-semibold ${getHttpMethodColor(snapshot.method)}`}>
              {snapshot.method}
            </span>
            <span className="min-w-0 break-all font-mono text-[11px] text-slate-700 dark:text-slate-200">
              {snapshot.url}
            </span>
          </div>
        </RequestSentSection>

        <RequestSentSection value="headers" title="Headers">
          {Object.keys(snapshot.headers).length === 0 ? (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">No headers sent.</p>
          ) : (
            <div className="space-y-1">
              {Object.entries(snapshot.headers).map(([key, value]) => (
                <div key={key} className="grid grid-cols-[minmax(120px,220px)_1fr] gap-2 rounded bg-slate-50 p-2 dark:bg-slate-800">
                  <span className="font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-200">{key}</span>
                  <span className="break-words font-mono text-[11px] text-slate-600 dark:text-slate-300">{value}</span>
                </div>
              ))}
            </div>
          )}
        </RequestSentSection>

        <RequestSentSection value="body" title="Body">
          {snapshot.body ? (
            <div className="space-y-1">
              <span className="block text-right text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {snapshot.body.format}
              </span>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-2 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {snapshot.body.text || '(empty)'}
              </pre>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">No request body sent.</p>
          )}
        </RequestSentSection>
      </Accordion.Root>
    </div>
  );
};

export default RequestSent;
