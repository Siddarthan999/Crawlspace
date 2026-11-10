import { ExternalLink } from "lucide-react";

export default function ExternalLinkButton({ url, size = 13 }: { url: string; size?: number }) {
  return (
    <button
      className="icon-btn"
      title="Open in new tab"
      onClick={(e) => { e.stopPropagation(); window.open(url, "_blank", "noopener,noreferrer"); }}
    >
      <ExternalLink size={size} />
    </button>
  );
}
