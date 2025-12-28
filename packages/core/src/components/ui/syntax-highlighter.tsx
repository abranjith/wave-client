import hljs from 'highlight.js';

interface SyntaxHighlighterProps {
  text: string;
  language?: string;
}

const SyntaxHighlighter: React.FC<SyntaxHighlighterProps> = ({ text, language }) => {
  let highlightedCode;
  
  if (language) {
    // Use specific language if provided
    try {
      highlightedCode = hljs.highlight(text, { language });
    } catch (e) {
      // Fallback to auto-detection if language is not recognized
      highlightedCode = hljs.highlightAuto(text);
    }
  } else {
    // Auto-detect language with hints for common formats
    highlightedCode = hljs.highlightAuto(text, ['json', 'xml', 'html', 'javascript', 'css']);
  }
  
  return (
    <pre className="syntax-highlighter-pre">
      <code 
        className={`hljs syntax-highlighter-code language-${highlightedCode.language || 'plaintext'}`}
        dangerouslySetInnerHTML={{ __html: highlightedCode.value }} 
      />
    </pre>
  );
};

export default SyntaxHighlighter;
