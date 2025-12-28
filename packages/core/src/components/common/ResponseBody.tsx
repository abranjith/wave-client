import React, { useState, useMemo } from 'react';
import { FileIcon, DownloadIcon, CopyIcon, CheckCheckIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { base64ToText, base64ToJson } from '../../utils/encoding';
import {getExtensionFromContentType, getResponseLanguage} from '../../utils/common';
import SyntaxHighlighter from '../ui/syntax-highlighter';
import { ResponseContentType } from '../../types/collection';

interface ResponseBodyProps {
  body: string;
  headers: Record<string, string>;
  statusCode: number;
  onDownloadResponse: (data: any) => void;
}

/**
 * Formats the response body based on content type
 */
function formatBody(body: string, contentType: ResponseContentType): string {
  if (contentType === 'json') {
    try {
      const parsed = base64ToJson(body);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return base64ToText(body);
    }
  }

  if (contentType === 'xml' || contentType === 'html') {
    try {
      // Basic XML/HTML formatting
      const xmlString = base64ToText(body);
      return xmlString
        .replace(/></g, '>\n<')
        .replace(/(<\/?[^>]+>)/g, (match) => {
          const indent = (match.match(/\//g) || []).length > 0 ? '' : '  ';
          return indent + match;
        });
    } catch {
      return base64ToText(body);
    }
  }

  return base64ToText(body);
}

/**
 * Gets appropriate file extension for content type
 */
function getFileExtension(headers: Record<string, string>): string {
  const contentTypeHeader = Object.entries(headers)
    .find(([key]) => key.toLowerCase() === 'content-type')?.[1]
    ?.toLowerCase() || '';
  return getExtensionFromContentType(contentTypeHeader);
}

/**
 * Gets a suggested filename from response headers or generates one
 */
function getFileName(headers: Record<string, string>, contentType: ResponseContentType): string {
  // Check for Content-Disposition header
  const contentDisposition = Object.entries(headers)
    .find(([key]) => key.toLowerCase() === 'content-disposition')?.[1];
  
  if (contentDisposition) {
    const fileNameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (fileNameMatch && fileNameMatch[1]) {
      return fileNameMatch[1].replace(/['"]/g, '');
    }
  }

  // Generate a filename based on timestamp and content type
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const extension = getFileExtension(headers);
  return `response_${timestamp}.${extension}`;
}

const ResponseBody: React.FC<ResponseBodyProps> = ({ body, headers, statusCode, onDownloadResponse }) => {
  const [copySuccess, setCopySuccess] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const contentType = useMemo(() => getResponseLanguage(headers), [headers]);
  const isTextBased = contentType !== 'binary';
  const formattedBody = useMemo(() => 
    isTextBased ? formatBody(body, contentType) : body,
    [body, contentType, isTextBased]
  );
  const fileName = useMemo(() => getFileName(headers, contentType), [headers, contentType]);

  /**
   * Copies the response body to clipboard
   */
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formattedBody as string || '');
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  /**
   * Downloads the response body as a file
   */
  const handleDownload = () => {
    try {
        // Send download request to extension host
        onDownloadResponse({ body, fileName, contentType: headers['content-type'] || 'application/octet-stream' });
        
        // TODO: Show success feedback
        setDownloadSuccess(true);
        setTimeout(() => setDownloadSuccess(false), 2000);
    } catch (error) {
        console.error('Failed to download file:', error);
    }
  };

  if (!isTextBased) {
    // Binary content - show download link
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 bg-white dark:bg-slate-900">
        <div className="text-center space-y-4">
          <div className="text-slate-600 dark:text-slate-400">
            <FileIcon className="mx-auto mb-2 w-8 h-8 text-blue-600 dark:text-blue-400" />
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              This response contains data that cannot be displayed.
            </p>
          </div>
          
          <Button
            onClick={handleDownload}
            variant="default"
            size="sm"
            className="gap-2"
          >
            <DownloadIcon className="w-4 h-4" />
            Download {fileName}
          </Button>
          
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            Content-Type: {headers['content-type'] || 'application/octet-stream'}
          </p>
        </div>
      </div>
    );
  }

  // Text-based content - show formatted body with actions
  const formattedBodyString = formattedBody as string || '';
  return (
    <div className="relative h-full min-h-0 overflow-auto bg-white dark:bg-slate-900">
      {/* Action buttons in top-right corner */}
      <div className="absolute right-2 top-2 z-10 flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={handleCopy}
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 flex items-center justify-center"
            >
              {copySuccess ? (
                <CheckCheckIcon size={16} className="text-green-600" />
              ) : (
                <CopyIcon size={16} />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="px-2 py-1 text-xs">Copy to clipboard</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={handleDownload}
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 flex items-center justify-center"
            >
              {downloadSuccess ? (
                <CheckCheckIcon size={16} className="text-green-600" />
              ) : (
                <DownloadIcon size={16} />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="px-2 py-1 text-xs">Download as file</TooltipContent>
        </Tooltip>
      </div>

      {/* Response body content */}
      <div className="pt-2">
        <SyntaxHighlighter text={formattedBodyString} />
      </div>
    </div>
  );
};

export default ResponseBody;
