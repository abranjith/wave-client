import React, { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { CopyIcon, ClipboardPasteIcon, InfoIcon, FileTextIcon } from 'lucide-react';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import {RequestBodyTextType, RequestBodyType} from '../../types/collection';
import { renderParameterizedText } from '../../utils/styling'; 

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

const getTypeInfo = (bodyType : string): { label: string; color: string; description: string } => {
  switch (bodyType) {
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

const TextBody: React.FC<TextBodyProps> = ({ dropdownElement }) => {
  const activeTab = useAppStateStore((state) => state.getActiveTab());
  const updateBody = useAppStateStore((state) => state.updateTextBody);
  const body = activeTab?.body;
  const [showExamples, setShowExamples] = useState(false);
  const [bodyContent, setBodyContent] = useState(body?.textData?.data || '');
  const [bodyTypeInfo, setBodyTypeInfo] = useState<{ label: string; color: string; description: string }>({ label: '', color: '', description: '' });

  // Only sync from global state when it changes from external sources (not from this component)
  useEffect(() => {
    const globalContent = body?.textData?.data || '';
    // Only update local state if content is different (prevents interference while typing)
    if (globalContent !== bodyContent) {
      setBodyContent(globalContent);
    }
    
    let bodyType = body?.textData?.textType || 'unknown';
    if(bodyType === 'none' || bodyType === 'unknown') {
      bodyType = getBodyType(globalContent);
    }
    setBodyTypeInfo(getTypeInfo(bodyType));
  }, [body?.textData?.data, body?.textData?.textType]); // More specific dependencies

  // Update local state immediately for responsive typing
  const handleBodyChange = (newValue: string) => {
    setBodyContent(newValue);
    setBodyTypeInfo(getTypeInfo(getBodyType(newValue)));
  };

  // Sync to global state on blur
  const handleBlur = () => {
    updateBody(bodyContent, getBodyType(bodyContent));
  };

  const formatContent = () => {
    const strBody = bodyContent || '';
    if (!strBody.trim()) {
      return;
    }

    try {
      let formattedContent = '';
      const detectedType = getBodyType(strBody);
      
      switch (detectedType) {
        case 'json':
          const parsed = JSON.parse(strBody);
          formattedContent = JSON.stringify(parsed, null, 2);
          break;
        
        case 'xml':
          formattedContent = formatXmlHtml(strBody);
          break;

        case 'html':
          formattedContent = formatXmlHtml(strBody);
          break;
        
        default:
          formattedContent = strBody.trim();
      }
      
      setBodyContent(formattedContent);
      updateBody(formattedContent, detectedType);
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
      await navigator.clipboard.writeText(body?.textData?.data || '');
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const detectedType = getBodyType(text);
      setBodyContent(text);
      setBodyTypeInfo(getTypeInfo(detectedType));
      updateBody(text, detectedType);
    } catch (err) {
      console.error('Failed to paste:', err);
    }
  };

  const loadExample = (type: RequestBodyType | string) => {
    const examples: Record<string, string> = {
      json: '{\n  "name": "John Doe",\n  "email": "john@example.com",\n  "age": 30,\n  "active": true\n}',
      xml: '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  <item id="1">\n    <name>Example Item</name>\n    <value>100</value>\n  </item>\n</root>',
      html: '<!DOCTYPE html>\n<html>\n<head>\n  <title>Example</title>\n</head>\n<body>\n  <h1>Hello World</h1>\n  <p>This is an example.</p>\n</body>\n</html>',
      text: 'This is plain text content.\nIt can span multiple lines.\nSimple and straightforward.',
      unknown: ''
    };
    
    const exampleContent = examples[type];
    const detectedType = getBodyType(exampleContent);
    setBodyContent(exampleContent);
    setBodyTypeInfo(getTypeInfo(detectedType));
    updateBody(exampleContent, detectedType);
    setShowExamples(false);
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header with Dropdown and Actions */}
      <div className="flex-shrink-0 flex items-center justify-between mb-3">
        {/* Left side - Dropdown and Type Badge */}
        <div className="flex items-center gap-2">
          {dropdownElement}
          {bodyContent && (
            <>
              <span className={`text-xs px-2 py-1 rounded border ${bodyTypeInfo.color}`}>
                {bodyTypeInfo.label}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {bodyContent.length} characters
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
                disabled={!bodyContent}
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
                disabled={!bodyContent}
                className="h-9 w-9 p-0 flex items-center justify-center"
              >
                <InfoIcon size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="px-2 py-1 text-xs">{bodyTypeInfo.description}</TooltipContent>
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
          {(bodyContent && body?.currentBodyType as string !== 'unknown') && (
            <div className="h-6 w-px bg-slate-300 dark:bg-slate-600 mx-1" />
          )}

          {/* Format & Clear Buttons */}
          {bodyContent && body?.currentBodyType as string !== 'unknown' && (
            <Button
              variant="outline"
              size="sm"
              onClick={formatContent}
            >
              Format
            </Button>
          )}
          {bodyContent && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setBodyContent('');
                setBodyTypeInfo(getTypeInfo('unknown'));
                updateBody('', 'unknown');
              }}
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
          value={bodyContent}
          onChange={e => handleBodyChange(e.target.value)}
          onBlur={handleBlur}
          className="flex-1 font-mono text-sm resize-none text-slate-800 dark:text-slate-200 min-h-[300px] bg-white dark:bg-slate-900"
          spellCheck={false}
        />
      </div>

      {/* Quick Examples Panel */}
      {showExamples && (
        <div className="flex-shrink-0 mt-3 space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-lg dark:bg-slate-900/50 dark:border-slate-700">
          <div className="text-sm text-slate-600 dark:text-slate-400 font-medium">Quick Examples:</div>
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
