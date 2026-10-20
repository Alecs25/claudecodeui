import { HTML_PREVIEW_SANDBOX } from '@/shared/constants';

type HtmlPreviewProps = {
  content: string;
  title: string;
};

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
