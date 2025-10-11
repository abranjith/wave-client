import React, { useState, useMemo } from 'react';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

interface ResponseBodyProps {
  body: string;
  headers: Record<string, string>;
  statusCode: number;
}

type ContentType = 'json' | 'xml' | 'html' | 'text' | 'csv' | 'binary';

/**
 * Determines the content type from response headers
 */
function getContentType(headers: Record<string, string>): ContentType {
  const contentTypeHeader = Object.entries(headers)
    .find(([key]) => key.toLowerCase() === 'content-type')?.[1]
    ?.toLowerCase() || '';

  if (contentTypeHeader.includes('json')) return 'json';
  if (contentTypeHeader.includes('xml')) return 'xml';
  if (contentTypeHeader.includes('html')) return 'html';
  if (contentTypeHeader.includes('csv')) return 'csv';
  if (contentTypeHeader.includes('text')) return 'text';
  
  // Check for binary content types
  if (
    contentTypeHeader.includes('image/') ||
    contentTypeHeader.includes('video/') ||
    contentTypeHeader.includes('audio/') ||
    contentTypeHeader.includes('application/pdf') ||
    contentTypeHeader.includes('application/zip') ||
    contentTypeHeader.includes('application/octet-stream') ||
    contentTypeHeader.includes('application/x-') ||
    contentTypeHeader.includes('font/')
  ) {
    return 'binary';
  }

  // Default to text for unknown types
  return 'text';
}

/**
 * Formats the response body based on content type
 */
function formatBody(body: string, contentType: ContentType): string {
  if (contentType === 'json') {
    try {
      const parsed = JSON.parse(body);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return body;
    }
  }

  if (contentType === 'xml' || contentType === 'html') {
    try {
      // Basic XML/HTML formatting
      return body
        .replace(/></g, '>\n<')
        .replace(/(<\/?[^>]+>)/g, (match) => {
          const indent = (match.match(/\//g) || []).length > 0 ? '' : '  ';
          return indent + match;
        });
    } catch {
      return body;
    }
  }

  return body;
}

/**
 * Gets appropriate file extension for content type
 */
function getFileExtension(contentType: ContentType): string {
  const extensions: Record<ContentType, string> = {
    json: 'json',
    xml: 'xml',
    html: 'html',
    csv: 'csv',
    text: 'txt',
    binary: 'bin',
  };
  return extensions[contentType];
}

/**
 * Gets a suggested filename from response headers or generates one
 */
function getFileName(headers: Record<string, string>, contentType: ContentType): string {
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
  const extension = getFileExtension(contentType);
  return `response_${timestamp}.${extension}`;
}

const ResponseBody: React.FC<ResponseBodyProps> = ({ body, headers, statusCode }) => {
  const [copySuccess, setCopySuccess] = useState(false);

  const contentType = useMemo(() => getContentType(headers), [headers]);
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
      await navigator.clipboard.writeText(formattedBody);
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
      const blob = new Blob([body], { 
        type: headers['content-type'] || 'application/octet-stream' 
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download file:', error);
    }
  };

  if (!isTextBased) {
    // Binary content - show download link
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="text-center space-y-4">
          <div className="text-gray-600">
            <svg
              className="w-16 h-16 mx-auto mb-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
            <p className="text-sm font-medium mb-2">Binary Content</p>
            <p className="text-xs text-gray-500 mb-4">
              This response contains binary data that cannot be displayed.
            </p>
          </div>
          
          <Button
            onClick={handleDownload}
            variant="default"
            size="sm"
            className="gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Download {fileName}
          </Button>
          
          <p className="text-xs text-gray-400 mt-2">
            Content-Type: {headers['content-type'] || 'application/octet-stream'}
          </p>
        </div>
      </div>
    );
  }

  // Text-based content - show formatted body with actions
  return (
    <div className="flex flex-col h-full">
      {/* Action Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600 uppercase">
            {contentType}
          </span>
          <span className="text-xs text-gray-400">
            {formattedBody.length.toLocaleString()} characters
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={handleCopy}
                variant="ghost"
                size="sm"
                className="h-8 px-3"
              >
                {copySuccess ? (
                  <>
                    <svg
                      className="w-4 h-4 text-green-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="text-green-600 ml-1">Copied!</span>
                  </>
                ) : (
                  <>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    <span className="ml-1">Copy</span>
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Copy to clipboard</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={handleDownload}
                variant="ghost"
                size="sm"
                className="h-8 px-3"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                <span className="ml-1">Download</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Download as file</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Response Body Content */}
      <div className="flex-1 overflow-auto">
        <pre className="p-4 text-xs text-gray-800 font-mono leading-relaxed whitespace-pre-wrap break-words">
          {formattedBody}
        </pre>
      </div>
    </div>
  );
};

export default ResponseBody;
