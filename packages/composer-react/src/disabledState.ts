import { createContext, useContext } from "react";

export const ComposerDisabledContext = createContext(false);
/** Use inside composer addons to lock host controls with the editor. */
export function useComposerDisabled(): boolean {
  return useContext(ComposerDisabledContext);
}
