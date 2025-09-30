import React from 'react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import useAppStateStore from '../../hooks/store/useAppStateStore';

const RequestBody: React.FC = () => {
  const body = useAppStateStore((state) => state?.body || '');
  const setBody = useAppStateStore((state) => state.updateBody);
  const isValidJSON = useAppStateStore((state) => state.isBodyValidJson);

  const handleBodyChange = (newValue: string) => {
    setBody(newValue);
  };

  const formatJSON = () => {
    if (body.trim()) {
      try {
        const parsed = JSON.parse(body);
        const formatted = JSON.stringify(parsed, null, 2);
        setBody(formatted);
      } catch (e) {
        // If it's not valid JSON, don't format
        console.warn('Invalid JSON, cannot format');
      }
    }
  };

  const minifyJSON = () => {
    if (body.trim()) {
      try {
        const parsed = JSON.parse(body);
        const minified = JSON.stringify(parsed);
        setBody(minified);
      } catch (e) {
        // If it's not valid JSON, don't minify
        console.warn('Invalid JSON, cannot minify');
      }
    }
  };

  const clearBody = () => {
    setBody('');
  };

  return (
    <div className="space-y-4">
      {/* Body Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Request Body</span>
          {body.trim() && (
            <span className={`text-xs px-2 py-1 rounded ${
              isValidJSON() 
                ? 'bg-green-100 text-green-800 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' 
                : 'bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800'
            }`}>
              {isValidJSON() ? 'Valid JSON' : 'Text'}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {isValidJSON() && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={formatJSON}
              >
                Format JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={minifyJSON}
              >
                Minify JSON
              </Button>
            </>
          )}
          {body.trim() && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearBody}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Body Textarea */}
      <div className="space-y-2">
        <Textarea
          placeholder="Enter request body (JSON, XML, plain text, etc.)"
          value={body}
          onChange={e => handleBodyChange(e.target.value)}
          className="min-h-[300px] font-mono text-sm resize-y text-gray-800 dark:text-gray-200"
          spellCheck={false}
        />
        
        {/* Character count */}
        <div className="flex justify-end">
          <span className="text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded border dark:text-slate-400 dark:bg-slate-800 dark:border-slate-700">
            {body.length} characters
          </span>
        </div>
      </div>

      {/* JSON Validation Message */}
      {body.trim() && !isValidJSON && body.trim().startsWith('{') && (
        <div className="text-sm bg-orange-50 border border-orange-200 rounded p-3 dark:bg-orange-900/10 dark:border-orange-800">
          <span className="font-medium text-orange-800 dark:text-orange-400">Note:</span> 
          <span className="text-orange-700 dark:text-orange-300"> Content appears to be JSON but contains syntax errors. 
          Use the formatter once the JSON is valid.</span>
        </div>
      )}

      {/* Common Body Examples */}
      <div className="space-y-2">
        <div className="text-sm text-muted-foreground font-medium">Quick Examples:</div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBody('{\n  "key": "value"\n}')}
          >
            JSON Object
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBody('[\n  "item1",\n  "item2"\n]')}
          >
            JSON Array
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBody('key1=value1&key2=value2')}
          >
            Form Data
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBody('<root>\n  <item>value</item>\n</root>')}
          >
            XML
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RequestBody;
