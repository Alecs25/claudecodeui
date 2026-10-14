type HtmlPreviewProps = {
  content: string;
  title: string;
};

// No `allow-same-origin`: the document gets an opaque origin, so its scripts can
// run but can never read the app's auth token or call the API as the user.
// Same permissions as the "open in new tab" preview.
const HTML_PREVIEW_SANDBOX = 'allow-forms allow-modals allow-popups allow-scripts';

/** Rendered by CodeEditorSurface inside the code-editor module to show an HTML file rendered inline, in the sidebar or the editor modal. */
export default function HtmlPreview({ content, title }: HtmlPreviewProps) {
  return (
    <iframe
      title={title}
      sandbox={HTML_PREVIEW_SANDBOX}
      srcDoc={content}
      referrerPolicy="no-referrer"
      className="h-full w-full border-0 bg-white"
    />
  );
}
