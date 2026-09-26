import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const BUNDLE_PATH = require.resolve("@xterm/xterm");
const PACKAGE_PATH = path.resolve(path.dirname(BUNDLE_PATH), "../package.json");
const VERSION = "5.5.0";

const ORIGINAL_INPUT_EVENT =
  '_inputEvent(e){if(e.data&&"insertText"===e.inputType&&(!e.composed||!this._keyDownSeen)&&!this.optionsService.rawOptions.screenReaderMode){if(this._keyPressHandled)return!1;this._unprocessedDeadKey=!1;const t=e.data;return this.coreService.triggerDataEvent(t,!0),this.cancel(e),!0}return!1}';
const PATCHED_INPUT_EVENT =
  '_inputEvent(e){if(e.data&&"insertText"===e.inputType&&!this._compositionHelper.isComposing&&!this.optionsService.rawOptions.screenReaderMode){if(this._keyPressHandled)return!1;this._unprocessedDeadKey=!1;const t=e.data;return this._compositionHelper.inputHandled(t),this.coreService.triggerDataEvent(t,!0),this.cancel(e),!0}return!1}';
const PREVIOUS_PATCHED_INPUT_EVENT =
  '_inputEvent(e){if(e.data&&"insertText"===e.inputType&&!this._compositionHelper.isComposing&&!this.optionsService.rawOptions.screenReaderMode){if(this._keyPressHandled)return!1;this._unprocessedDeadKey=!1;const t=e.data;return this.coreService.triggerDataEvent(t,!0),this._compositionHelper.inputHandled(),this.cancel(e),!0}return!1}';
const LEGACY_PATCHED_INPUT_EVENT =
  '_inputEvent(e){if(e.data&&"insertText"===e.inputType&&(!e.composed||!this._keyDownSeen||!this._compositionHelper.isComposing&&!this._compositionHelper.isSendingComposition)&&!this.optionsService.rawOptions.screenReaderMode){if(this._keyPressHandled)return!1;this._unprocessedDeadKey=!1;const t=e.data;return this.coreService.triggerDataEvent(t,!0),this._compositionHelper.inputHandled(t),this.cancel(e),!0}return!1}';
const ORIGINAL_COMPOSITION =
  'compositionstart(){this._isComposing=!0,this._compositionPosition.start=this._textarea.value.length,this._compositionView.textContent="",this._dataAlreadySent="",this._compositionView.classList.add("active")}compositionupdate(e){this._compositionView.textContent=e.data,this.updateCompositionElements(),setTimeout((()=>{this._compositionPosition.end=this._textarea.value.length}),0)}compositionend(){this._finalizeComposition(!0)}keydown(e){if(this._isComposing||this._isSendingComposition){if(229===e.keyCode)return!1;if(16===e.keyCode||17===e.keyCode||18===e.keyCode)return!1;this._finalizeComposition(!1)}return 229!==e.keyCode||(this._handleAnyTextareaChanges(),!1)}';
const PREVIOUS_CANCELLED_COMPOSITION =
  'compositionstart(){this._isComposing=!0,this._isSendingComposition=!1,this._pendingCompositionData="",this._lastCompositionUpdateData="",this._isCompositionCancelled=!1,this._compositionPosition.start=this._textarea.value.length,this._compositionView.textContent="",this._compositionView.classList.add("active")}compositionupdate(e){this._lastCompositionUpdateData=e.data,this._compositionView.textContent=e.data,this.updateCompositionElements(),setTimeout((()=>{this._compositionPosition.end=this._textarea.value.length}),0)}compositionend(e){if(this._isCompositionCancelled)return this._isCompositionCancelled=!1,void this._clearComposition();this._finalizeComposition(!0,e.data)}inputHandled(e){if(!this._isSendingComposition)return;const t=this._pendingCompositionData,s=t===this._lastCompositionUpdateData;this._isSendingComposition=!1,this._pendingCompositionData="",t&&t!==e&&!s&&this._coreService.triggerDataEvent(t,!0)}keydown(e){if(this._isComposing){if(229===e.keyCode)return!1;if(16===e.keyCode||17===e.keyCode||18===e.keyCode)return!1;if(20===e.keyCode||"CapsLock"===e.key||"CapsLock"===e.code)return this._isCompositionCancelled=!0,this._clearComposition(),!1;this._finalizeComposition(!1)}else if(this._isSendingComposition){if(229===e.keyCode||16===e.keyCode||17===e.keyCode||18===e.keyCode)return!1;this._finalizeComposition(!1)}return 229!==e.keyCode}_clearComposition(){this._compositionView.classList.remove("active"),this._isComposing=!1,this._isSendingComposition=!1,this._pendingCompositionData="",this._lastCompositionUpdateData="",this._compositionPosition.end=this._compositionPosition.start,this._textarea.value=this._textarea.value.substring(0,this._compositionPosition.start)}';
const PREVIOUS_RECOVERY_COMPOSITION = PREVIOUS_CANCELLED_COMPOSITION.replace(
  'keydown(e){if(this._isComposing){',
  'keydown(e){if(this._isCompositionCancelled&&229!==e.keyCode)return this._isCompositionCancelled=!1,!0;if(this._isComposing){',
);
const PATCHED_COMPOSITION = PREVIOUS_CANCELLED_COMPOSITION.replace(
  'if(this._isComposing){if(229===e.keyCode)return!1;if(16===e.keyCode||17===e.keyCode||18===e.keyCode)return!1;if(20===e.keyCode||"CapsLock"===e.key||"CapsLock"===e.code)return this._isCompositionCancelled=!0,this._clearComposition(),!1;',
  'if(this._isComposing){if(20===e.keyCode||"CapsLock"===e.key||"CapsLock"===e.code)return this._isCompositionCancelled=!0,this._clearComposition(),!1;if(229===e.keyCode)return!1;if(16===e.keyCode||17===e.keyCode||18===e.keyCode)return!1;',
);
const PREVIOUS_CAPS_LOCK_COMPOSITION =
  'compositionstart(){this._isComposing=!0,this._isSendingComposition=!1,this._compositionCancelled=!1,this._pendingCompositionData="",this._compositionPosition.start=this._textarea.value.length,this._compositionView.textContent="",this._compositionView.classList.add("active")}compositionupdate(e){this._compositionView.textContent=e.data,this.updateCompositionElements(),setTimeout((()=>{this._compositionPosition.end=this._textarea.value.length}),0)}compositionend(e){this._compositionCancelled?(this._compositionCancelled=!1,this._isComposing=!1,this._isSendingComposition=!1,this._pendingCompositionData="",this._compositionPosition.end=this._compositionPosition.start,this._textarea.value=this._textarea.value.substring(0,this._compositionPosition.start),this._compositionView.classList.remove("active")):this._finalizeComposition(!0,e.data)}inputHandled(){if(!this._isSendingComposition)return;this._isSendingComposition=!1,this._pendingCompositionData=""}_cancelComposition(){this._isComposing=!1,this._isSendingComposition=!1,this._compositionCancelled=!0,this._pendingCompositionData="",this._compositionPosition.end=this._compositionPosition.start,this._textarea.value=this._textarea.value.substring(0,this._compositionPosition.start),this._compositionView.classList.remove("active")}keydown(e){if(this._isComposing||this._isSendingComposition){if(229===e.keyCode)return!1;if(16===e.keyCode||17===e.keyCode||18===e.keyCode)return!1;if(20===e.keyCode||"CapsLock"===e.key||"CapsLock"===e.code)return this._cancelComposition(),!1;this._finalizeComposition(!1)}return 229!==e.keyCode}';
const PREVIOUS_CAPS_LOCK_IGNORE_COMPOSITION =
  'compositionstart(){this._isComposing=!0,this._isSendingComposition=!1,this._pendingCompositionData="",this._compositionPosition.start=this._textarea.value.length,this._compositionView.textContent="",this._compositionView.classList.add("active")}compositionupdate(e){this._compositionView.textContent=e.data,this.updateCompositionElements(),setTimeout((()=>{this._compositionPosition.end=this._textarea.value.length}),0)}compositionend(e){this._finalizeComposition(!0,e.data)}inputHandled(){if(!this._isSendingComposition)return;this._isSendingComposition=!1,this._pendingCompositionData=""}keydown(e){if(this._isComposing||this._isSendingComposition){if(229===e.keyCode)return!1;if(16===e.keyCode||17===e.keyCode||18===e.keyCode||20===e.keyCode||"CapsLock"===e.key)return!1;this._finalizeComposition(!1)}return 229!==e.keyCode}';
const PREVIOUS_PERSISTED_COMPOSITION =
  'compositionstart(){this._isComposing=!0,this._isSendingComposition=!1,this._pendingCompositionData="",this._compositionPosition.start=this._textarea.value.length,this._compositionView.textContent="",this._compositionView.classList.add("active")}compositionupdate(e){this._compositionView.textContent=e.data,this.updateCompositionElements(),setTimeout((()=>{this._compositionPosition.end=this._textarea.value.length}),0)}compositionend(e){this._finalizeComposition(!0,e.data)}inputHandled(){if(!this._isSendingComposition)return;this._isSendingComposition=!1,this._pendingCompositionData=""}keydown(e){if(this._isComposing||this._isSendingComposition){if(229===e.keyCode)return!1;if(16===e.keyCode||17===e.keyCode||18===e.keyCode)return!1;this._finalizeComposition(!1)}return 229!==e.keyCode}';
const PREVIOUS_SNAPSHOT_COMPOSITION =
  'compositionstart(){this._isComposing=!0,this._isSendingComposition=!1,this._pendingCompositionData="",this._compositionPosition.start=this._textarea.value.length,this._compositionView.textContent="",this._compositionView.classList.add("active")}compositionupdate(e){this._compositionView.textContent=e.data,this.updateCompositionElements(),setTimeout((()=>{this._compositionPosition.end=this._textarea.value.length}),0)}compositionend(e){this._finalizeComposition(!0,e.data)}inputHandled(e){if(!this._isSendingComposition)return;const t=this._pendingCompositionData;this._isSendingComposition=!1,this._pendingCompositionData="",t&&t!==e&&this._coreService.triggerDataEvent(t,!0)}keydown(e){if(this._isComposing||this._isSendingComposition){if(229===e.keyCode)return!1;if(16===e.keyCode||17===e.keyCode||18===e.keyCode)return!1;this._finalizeComposition(!1)}return 229!==e.keyCode}';
const PREVIOUS_PATCHED_COMPOSITION =
  'compositionstart(){this._isComposing=!0,this._isSendingComposition=!1,this._compositionPosition.start=this._textarea.value.length,this._compositionView.textContent="",this._compositionView.classList.add("active")}compositionupdate(e){this._compositionView.textContent=e.data,this.updateCompositionElements(),setTimeout((()=>{this._compositionPosition.end=this._textarea.value.length}),0)}compositionend(){this._finalizeComposition(!0)}inputHandled(){this._isSendingComposition=!1}keydown(e){if(this._isComposing||this._isSendingComposition){if(229===e.keyCode)return!1;if(16===e.keyCode||17===e.keyCode||18===e.keyCode)return!1;this._finalizeComposition(!1)}return 229!==e.keyCode}';
const LEGACY_PATCHED_COMPOSITION =
  'compositionstart(){this._isComposing=!0,this._compositionPosition.start=this._textarea.value.length,this._compositionView.textContent="",this._dataAlreadySent="",this._compositionView.classList.add("active")}compositionupdate(e){this._compositionView.textContent=e.data,this.updateCompositionElements(),setTimeout((()=>{this._compositionPosition.end=this._textarea.value.length}),0)}compositionend(){this._finalizeComposition(!0)}get isSendingComposition(){return this._isSendingComposition}inputHandled(e){this._isComposing||this._isSendingComposition||(this._dataAlreadySent=e)}keydown(e){if(this._isComposing||this._isSendingComposition){if(229===e.keyCode)return!1;if(16===e.keyCode||17===e.keyCode||18===e.keyCode)return!1;this._finalizeComposition(!1)}return 229!==e.keyCode||(this._dataAlreadySent?(this._dataAlreadySent="",!1):(this._handleAnyTextareaChanges(),!1))}';
const ORIGINAL_FINALIZE_AND_DIFF =
  '_finalizeComposition(e){if(this._compositionView.classList.remove("active"),this._isComposing=!1,e){const e={start:this._compositionPosition.start,end:this._compositionPosition.end};this._isSendingComposition=!0,setTimeout((()=>{if(this._isSendingComposition){let t;this._isSendingComposition=!1,e.start+=this._dataAlreadySent.length,t=this._isComposing?this._textarea.value.substring(e.start,e.end):this._textarea.value.substring(e.start),t.length>0&&this._coreService.triggerDataEvent(t,!0)}}),0)}else{this._isSendingComposition=!1;const e=this._textarea.value.substring(this._compositionPosition.start,this._compositionPosition.end);this._coreService.triggerDataEvent(e,!0)}}_handleAnyTextareaChanges(){const e=this._textarea.value;setTimeout((()=>{if(!this._isComposing){const t=this._textarea.value,i=t.replace(e,"");this._dataAlreadySent=i,t.length>e.length?this._coreService.triggerDataEvent(i,!0):t.length<e.length?this._coreService.triggerDataEvent(`${a.C0.DEL}`,!0):t.length===e.length&&t!==e&&this._coreService.triggerDataEvent(t,!0)}}),0)}';
const PATCHED_FINALIZE =
  '_finalizeComposition(e,t=""){if(this._compositionView.classList.remove("active"),this._isComposing=!1,e){this._pendingCompositionData=t||this._textarea.value.substring(this._compositionPosition.start),this._isSendingComposition=!0,setTimeout((()=>{if(!this._isSendingComposition)return;const e=this._pendingCompositionData;this._isSendingComposition=!1,this._pendingCompositionData="",e&&this._coreService.triggerDataEvent(e,!0)}),50)}else{this._isSendingComposition=!1;const e=this._pendingCompositionData||this._textarea.value.substring(this._compositionPosition.start,this._compositionPosition.end);this._pendingCompositionData="",this._coreService.triggerDataEvent(e,!0)}}';
const PREVIOUS_SNAPSHOT_FINALIZE =
  '_finalizeComposition(e,t=""){if(this._compositionView.classList.remove("active"),this._isComposing=!1,e){this._pendingCompositionData=t||this._textarea.value.substring(this._compositionPosition.start),this._isSendingComposition=!0,setTimeout((()=>{if(!this._isSendingComposition)return;const e=this._pendingCompositionData;this._isSendingComposition=!1,this._pendingCompositionData="",e&&this._coreService.triggerDataEvent(e,!0)}),0)}else{this._isSendingComposition=!1;const e=this._pendingCompositionData||this._textarea.value.substring(this._compositionPosition.start,this._compositionPosition.end);this._pendingCompositionData="",this._coreService.triggerDataEvent(e,!0)}}';
const PREVIOUS_PATCHED_FINALIZE =
  '_finalizeComposition(e){if(this._compositionView.classList.remove("active"),this._isComposing=!1,e)this._isSendingComposition=!0;else{this._isSendingComposition=!1;const e=this._textarea.value.substring(this._compositionPosition.start,this._compositionPosition.end);this._coreService.triggerDataEvent(e,!0)}}';
const ORIGINAL_COMPOSITION_END_LISTENER =
  '"compositionend",(()=>this._compositionHelper.compositionend())';
const PATCHED_COMPOSITION_END_LISTENER =
  '"compositionend",(e=>this._compositionHelper.compositionend(e))';
const ORIGINAL_IS_COMPOSING_GETTER =
  'get isComposing(){return this._isComposing}';
const PATCHED_IS_COMPOSING_GETTER =
  'get isComposing(){return this._isComposing||this._isCompositionCancelled}';

function replaceExactly(bundle, original, patched, name, legacy = []) {
  if (bundle.includes(patched)) {
    return bundle;
  }
  const candidate = [original, ...legacy].find((value) => {
    const first = bundle.indexOf(value);
    return first !== -1 && bundle.indexOf(value, first + 1) === -1;
  });
  if (!candidate) {
    throw new Error(`xterm ${VERSION} ${name} signature changed; refusing an unsafe IME patch`);
  }
  const first = bundle.indexOf(candidate);
  return `${bundle.slice(0, first)}${patched}${bundle.slice(first + candidate.length)}`;
}

function patchXtermImeBundle(bundle) {
  let patched = replaceExactly(
    bundle,
    ORIGINAL_INPUT_EVENT,
    PATCHED_INPUT_EVENT,
    "input event",
    [PREVIOUS_PATCHED_INPUT_EVENT, LEGACY_PATCHED_INPUT_EVENT],
  );
  patched = replaceExactly(
    patched,
    ORIGINAL_COMPOSITION,
    PATCHED_COMPOSITION,
    "composition helper",
    [PREVIOUS_CANCELLED_COMPOSITION, PREVIOUS_RECOVERY_COMPOSITION, PREVIOUS_CAPS_LOCK_COMPOSITION, PREVIOUS_CAPS_LOCK_IGNORE_COMPOSITION, PREVIOUS_PERSISTED_COMPOSITION, PREVIOUS_SNAPSHOT_COMPOSITION, PREVIOUS_PATCHED_COMPOSITION, LEGACY_PATCHED_COMPOSITION],
  );
  patched = replaceExactly(
    patched,
    ORIGINAL_FINALIZE_AND_DIFF,
    PATCHED_FINALIZE,
    "composition finalizer",
    [PREVIOUS_SNAPSHOT_FINALIZE, PREVIOUS_PATCHED_FINALIZE],
  );
  patched = replaceExactly(
    patched,
    ORIGINAL_COMPOSITION_END_LISTENER,
    PATCHED_COMPOSITION_END_LISTENER,
    "composition-end listener",
  );
  return replaceExactly(
    patched,
    PATCHED_IS_COMPOSING_GETTER,
    ORIGINAL_IS_COMPOSING_GETTER,
    "composition state getter",
  );
}

function patchInstalledBundle() {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_PATH, "utf8"));
  if (pkg.version !== VERSION) {
    throw new Error(`xterm IME patch requires ${VERSION}, found ${pkg.version}`);
  }
  const original = fs.readFileSync(BUNDLE_PATH, "utf8");
  const patched = patchXtermImeBundle(original);
  if (patched !== original) {
    fs.writeFileSync(BUNDLE_PATH, patched);
  }
}

patchInstalledBundle();

export { patchXtermImeBundle };
