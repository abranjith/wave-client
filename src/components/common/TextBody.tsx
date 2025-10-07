import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { CopyIcon, ClipboardPasteIcon, InfoIcon, FileTextIcon } from 'lucide-react';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import {RequestBodyTextType, RequestBodyType} from '../../types/collection';
import { get } from 'axios';

interface TextBodyProps {
  dropdownElement?: React.ReactNode;
}

const isHTML = (content: string): boolean => {
  const trimmed = content.trim().toLowerCase();
  
  // Strong HTML indicators
  if (trimmed.includes('<!doctype html') || 
      trimmed.includes('<html')) {
    return true;
  }
  
  // Check for HTML-specific tags that XML typically doesn't use
  const htmlTags = ['<body', '<head', '<title', '<div', '<span', '<p>', '<a', '<img'];
  const hasHtmlTags = htmlTags.some(tag => trimmed.includes(tag));
  
  // XML indicators (if it has XML declaration, it's likely XML)
  const hasXmlDeclaration = trimmed.startsWith('<?xml');
  
  return hasHtmlTags && !hasXmlDeclaration;
};

const getBodyType = (content: string): RequestBodyTextType => {
   //if body is not string, set to unknown
    if (typeof content !== 'string') {
      return 'unknown';
    }
    const strContent = content as string;
    if (!strContent.trim()) {
      return 'unknown';
    }

    const trimmed = strContent.trim();
    
    // JSON detection
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        JSON.parse(trimmed);
        return 'json';
      } catch {
        // Not valid JSON, continue checking
      }
    }

    // HTML detection
    if (isHTML(trimmed)) {
      return 'html';
    }

    // XML detection
    if (trimmed.startsWith('<?xml') || 
        (trimmed.startsWith('<') && trimmed.endsWith('>') && trimmed.includes('</'))) {
      return 'xml';
    }

    return 'text';
}

const TextBody: React.FC<TextBodyProps> = ({ dropdownElement }) => {
  //const [body, setBody] = useState<string>('');
  //const [bodyType, setBodyType] = useState<RequestBodyTextType>('unknown');
  const updateBody = useAppStateStore((state) => state.updateBody);
  const body = useAppStateStore((state) => state.body);
  const [showExamples, setShowExamples] = useState(false);

  const handleBodyChange = (newValue: string) => {
    updateBody(newValue, 'text', getBodyType(newValue));
  };

  const formatContent = () => {
    //if body is not string, set to unknown
    if (typeof body.data !== 'string') {
      return;
    }
    const strBody = body.data as string;
    if (!strBody.trim()) {
      return;
    }

    try {
      switch (body.bodyType as string) {
        case 'json':
          const parsed = JSON.parse(strBody);
          updateBody(JSON.stringify(parsed, null, 2), 'text', 'json');
          break;
        
        case 'xml':
          // Simple XML/HTML formatting
          const formattedXml = formatXmlHtml(strBody);
          updateBody(formattedXml, 'text', 'xml');
          break;

        case 'html':
          // Simple XML/HTML formatting
          const formattedHtml = formatXmlHtml(strBody);
          updateBody(formattedHtml, 'text', 'html');
          break;
        
        default:
          // For plain text, just clean up extra whitespace
          updateBody(strBody.trim(), 'text', 'text');
      }
    } catch (e) {
      console.warn('Failed to format content:', e);
    }
  };

  const formatXmlHtml = (content: string): string => {
    // Simple XML/HTML formatter without changing content or executing any scripts
    let formatted = '';
    let indent = 0;
    const tab = '  ';
    
    // Remove existing whitespace between tags
    const cleaned = content.replace(/>\s+</g, '><');
    
    // Split by tags
    const parts = cleaned.split(/(<[^>]+>)/);
    
    parts.forEach(part => {
      if (!part.trim()) return;
      
      if (part.startsWith('</')) {
        // Closing tag
        indent = Math.max(0, indent - 1);
        formatted += '\n' + tab.repeat(indent) + part;
      } else if (part.startsWith('<')) {
        // Opening tag
        formatted += '\n' + tab.repeat(indent) + part;
        if (!part.endsWith('/>') && !part.startsWith('<!')) {
          indent++;
        }
      } else {
        // Text content
        const text = part.trim();
        if (text) {
          formatted += text;
        }
      }
    });
    
    return formatted.trim();
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(body.data as string || '');
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      updateBody(text, 'text', getBodyType(text));
    } catch (err) {
      console.error('Failed to paste:', err);
    }
  };

  const getTypeInfo = (): { label: string; color: string; description: string } => {
    switch (body.bodyType as string) {
      case 'json':
        return {
          label: 'JSON',
          color: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800',
          description: 'JavaScript Object Notation'
        };
      case 'xml':
        return {
          label: 'XML',
          color: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
          description: 'Extensible Markup Language'
        };
      case 'html':
        return {
          label: 'HTML',
          color: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800',
          description: 'HyperText Markup Language'
        };
      case 'text':
        return {
          label: 'Text',
          color: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-400 dark:border-gray-800',
          description: 'Plain Text'
        };
      default:
        return {
          label: 'Unknown',
          color: 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900/20 dark:text-slate-400 dark:border-slate-800',
          description: 'Type not detected'
        };
    }
  };

  const loadExample = (type: RequestBodyType) => {
    const examples: Record<string, string> = {
      json: '{\n  "name": "John Doe",\n  "email": "john@example.com",\n  "age": 30,\n  "active": true\n}',
      xml: '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  <item id="1">\n    <name>Example Item</name>\n    <value>100</value>\n  </item>\n</root>',
      html: '<!DOCTYPE html>\n<html>\n<head>\n  <title>Example</title>\n</head>\n<body>\n  <h1>Hello World</h1>\n  <p>This is an example.</p>\n</body>\n</html>',
      text: 'This is plain text content.\nIt can span multiple lines.\nSimple and straightforward.',
      unknown: ''
    };
    
    updateBody(examples[type], 'text', getBodyType(examples[type]));
    setShowExamples(false);
  };

  const typeInfo = getTypeInfo();

  return (
    <div className="flex flex-col h-full">
      {/* Header with Dropdown and Actions */}
      <div className="flex-shrink-0 flex items-center justify-between mb-4">
        {/* Left side - Dropdown and Type Badge */}
        <div className="flex items-center gap-2">
          {dropdownElement}
          {body.data.trim() && (
            <>
              <span className={`text-xs px-2 py-1 rounded border ${typeInfo.color}`}>
                {typeInfo.label}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {body.data.length} characters
              </span>
            </>
          )}
        </div>
        
        {/* Right side - Action Icons and Buttons */}
        <div className="flex items-center gap-2">
          {/* Action Icons */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={copyToClipboard}
                disabled={!body.trim()}
                className="h-9 w-9 p-0 flex items-center justify-center"
              >
                <CopyIcon size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="px-2 py-1 text-xs">Copy to clipboard</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={pasteFromClipboard}
                className="h-9 w-9 p-0 flex items-center justify-center"
              >
                <ClipboardPasteIcon size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="px-2 py-1 text-xs">Paste from clipboard</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={!body.trim()}
                className="h-9 w-9 p-0 flex items-center justify-center"
              >
                <InfoIcon size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="px-2 py-1 text-xs">{typeInfo.description}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowExamples(!showExamples)}
                className="h-9 w-9 p-0 flex items-center justify-center"
              >
                <FileTextIcon size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="px-2 py-1 text-xs">Show Quick Example</TooltipContent>
          </Tooltip>

          {/* Divider */}
          {(body.trim() && bodyType !== 'unknown') && (
            <div className="h-6 w-px bg-slate-300 dark:bg-slate-600 mx-1" />
          )}

          {/* Format & Clear Buttons */}
          {body.trim() && bodyType !== 'unknown' && (
            <Button
              variant="outline"
              size="sm"
              onClick={formatContent}
            >
              Format
            </Button>
          )}
          {body.trim() && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBody('')}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0">
        <Textarea
          placeholder="Enter request body (JSON, XML, HTML, plain text, etc.)"
          value={body}
          onChange={e => handleBodyChange(e.target.value)}
          className="flex-1 font-mono text-sm resize-none text-gray-800 dark:text-gray-200 min-h-[400px]"
          spellCheck={false}
        />
      </div>

      {/* Quick Examples Panel */}
      {showExamples && (
        <div className="flex-shrink-0 mt-4 space-y-2 p-4 bg-slate-50 border border-slate-200 rounded-lg dark:bg-slate-900/50 dark:border-slate-700">
          <div className="text-sm text-muted-foreground font-medium">Quick Examples:</div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadExample('json')}
            >
              JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadExample('xml')}
            >
              XML
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadExample('html')}
            >
              HTML
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadExample('text')}
            >
              Plain Text
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TextBody;
