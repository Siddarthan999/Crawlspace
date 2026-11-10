import { FileText, Image as ImageIcon, Video, Music, File, FileCode2, Globe2, FileType } from "lucide-react";

const ICONS: Record<string, any> = {
  page: Globe2, image: ImageIcon, video: Video, audio: Music,
  pdf: FileType, document: FileText, stylesheet: FileCode2, script: FileCode2,
  font: FileCode2, other: File,
};

export default function ResourceIcon({ type, size = 14 }: { type?: string; size?: number }) {
  const Icon = ICONS[type || "page"] || File;
  return <Icon size={size} />;
}
