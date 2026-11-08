import type { Component } from "vue";
import type {
  ComposerProps,
  ComposerSubmitMode,
} from "@personai/agent-ui-composer-core";
export interface ComposerVueProps extends ComposerProps {
  composerHeader?: Component;
  onDraftChange?: (value: string) => void;
  onSend?: (mode?: ComposerSubmitMode) => void;
  onStop?: () => void;
  onPasteAttachment?: (file: File) => void | Promise<void>;
  onAttachFile?: (file: File) => void | Promise<void>;
  onRemoveAttachment?: (id: string) => void;
  onEditQueuedMessage?: (id: string, content: string) => void;
  onRemoveQueuedMessage?: (id: string) => void;
  onSteerQueuedMessage?: (id: string) => void;
  onReorderQueuedMessage?: (sourceId: string, targetId: string) => void;
}
