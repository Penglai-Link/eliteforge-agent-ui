import { useEffect, useState } from "react";
import type { ChatMessageAttachment } from "@eliteforge/agent-ui-chat-core";

export function matchesSupportedImageContentType(contentType: string | undefined) {
  return contentType === "image/png"
    || contentType === "image/jpeg"
    || contentType === "image/webp"
    || contentType === "image/gif";
}

export function isImageAttachment(attachment: ChatMessageAttachment) {
  const contentType = attachment.contentType?.toLowerCase();
  return attachment.kind === "image"
    || Boolean(attachment.imageUrl)
    || matchesSupportedImageContentType(contentType);
}

export function useAttachmentImageSource(
  attachment: ChatMessageAttachment,
  downloadAttachment?: (attachment: ChatMessageAttachment) => Promise<Blob>,
) {
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);

  useEffect(() => {
    if (attachment.imageUrl || !downloadAttachment || !isImageAttachment(attachment)) {
      setRemoteUrl(null);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;
    void downloadAttachment(attachment)
      .then((blob) => {
        const nextObjectUrl = URL.createObjectURL(blob);
        if (!active) {
          URL.revokeObjectURL(nextObjectUrl);
          return;
        }
        objectUrl = nextObjectUrl;
        setRemoteUrl(nextObjectUrl);
      })
      .catch(() => {
        if (active) setRemoteUrl(null);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment, downloadAttachment]);

  return attachment.imageUrl ?? remoteUrl;
}
