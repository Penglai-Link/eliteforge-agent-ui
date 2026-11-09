import { renderInteraction } from "./interaction-components";
import agentCatalogSchema from "./schemas/agent_catalog.json";
import {
  renderCommon,
  componentReferences,
  type ViewState,
} from "./common-components";
import addFormats from "ajv-formats";
import Ajv2020 from "ajv/dist/2020.js";
import envelope from "./schemas/server_to_client.json";
import common from "./schemas/common_types.json";
import catalogSchema from "./schemas/catalog.json";
import { compileResponseSchema, schemaIssues, FormValidationError, validationMessage, type FormValidationIssue } from "./response-validation";
export { FormValidationError, compileResponseSchema, validationMessage } from "./response-validation";
export type { FormValidationIssue } from "./response-validation";
export const catalog: Record<string, any> = catalogSchema;
export const agentCatalog: Record<string, any> = agentCatalogSchema;
export const AGENT_CATALOG_ID = agentCatalog.catalogId as string;
export const VERSION = "v0.9.1" as const;
export const CATALOG_ID: string = catalogSchema.catalogId;
export type Component = { id: string; component: string; [key: string]: any };
export interface Surface {
  surfaceId: string;
  catalogId: string;
  sendDataModel: boolean;
  components: Record<string, Component>;
  dataModel: any;
  viewState?: Record<string, ViewState>;
}
export interface Snapshot {
  version: typeof VERSION;
  surfaces: Record<string, Surface>;
}
export interface ActionMessage {
  version: typeof VERSION;
  action: {
    name: string;
    surfaceId: string;
    sourceComponentId: string;
    timestamp: string;
    context: Record<string, any>;
  };
}
export interface ActionMetadata {
  a2uiClientDataModel?: { surfaces: Record<string, any> };
}
export interface CatalogDefinition {
  catalogId: string;
  schema: Record<string, any>;
}
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const object = (v: any) =>
  v !== null && typeof v === "object" && !Array.isArray(v);
function safe(v: any): void {
  if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) {
      if (["__proto__", "prototype", "constructor"].includes(k))
        throw new Error("Unsafe key");
      safe(x);
    }
}
function tokens(path: string, scope = ""): string[] {
  const absolute = path.startsWith("/") ? path : `${scope}/${path}`;
  if (absolute === "/" || absolute === "") return [];
  if (/~(?![01])/.test(absolute)) throw new Error("Invalid JSON Pointer");
  const parts = absolute
    .slice(1)
    .split("/")
    .map((x) => x.replace(/~1/g, "/").replace(/~0/g, "~"));
  if (parts.some((x) => ["__proto__", "constructor", "prototype"].includes(x)))
    throw new Error("Unsafe path");
  return parts;
}
export function readPath(model: any, path: string, scope = ""): any {
  return tokens(path, scope).reduce(
    (v, k) => (v != null && Object.hasOwn(v, k) ? v[k] : undefined),
    model
  );
}
function absolutePath(path: string, scope = ""): string {
  const parts = tokens(path, scope);
  return parts.length ? "/" + parts.map(x => x.replace(/~/g, "~0").replace(/\//g, "~1")).join("/") : "";
}
function writePath(model: any, path: string, value: any, remove = false): any {
  const parts = tokens(path);
  if (!parts.length) return remove ? {} : copy(value);
  if (!object(model) && !Array.isArray(model))
    throw new Error("Cannot write into scalar data model");
  let target = model;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (
      Array.isArray(target) &&
      (!/^(0|[1-9]\d*)$/.test(k) || Number(k) > target.length)
    )
      throw new Error("Invalid array index");
    if (!Object.hasOwn(target, k))
      target[k] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    if (!object(target[k]) && !Array.isArray(target[k]))
      throw new Error("Cannot traverse scalar");
    target = target[k];
  }
  const key = parts.at(-1)!;
  if (Array.isArray(target) && !/^(0|[1-9]\d*)$/.test(key))
    throw new Error("Invalid array index");
  if (Array.isArray(target) && Number(key) > target.length)
    throw new Error("Sparse array");
  if (remove) {
    if (Array.isArray(target)) target.splice(Number(key), 1);
    else delete target[key];
  } else target[key] = copy(value);
  return model;
}
export class A2UIClient {
  private state: Snapshot = { version: VERSION, surfaces: {} };
  private responseSchemas = new Map<string, { validate?: ReturnType<typeof compileResponseSchema>; contextKey: string }>();
  private validationAttempts = new Map<string, { componentId: string; scope: string }>();
  /** Register the authoritative interaction schema, outside the A2UI wire envelope. */
  setResponseSchema(surfaceId: string, schema: unknown, contextKey = "response") {
    this.surface(surfaceId);
    try { this.responseSchemas.set(surfaceId, { validate: compileResponseSchema(schema), contextKey }); }
    catch { this.responseSchemas.set(surfaceId, { contextKey }); }
    this.validationAttempts.delete(surfaceId);
    this.commit({ ...this.state });
  }
  hasResponseSchema(surfaceId: string) { return this.responseSchemas.has(surfaceId); }
  private responseBindings(surfaceId: string) {
    const contract = this.responseSchemas.get(surfaceId);
    if (!contract?.validate) return [];
    const validate = contract.validate;
    return Object.values(this.surface(surfaceId).components).flatMap(component => {
      const binding = component.action?.event?.context?.[contract.contextKey];
      return typeof binding?.path === "string" ? [{ base: absolutePath(binding.path),
        response: this.resolve(surfaceId, binding), validate }] : [];
    });
  }
  requiredDataPaths(surfaceId: string): Set<string> {
    return new Set(this.responseBindings(surfaceId).flatMap(({ base, response, validate }) =>
      [...validate.requiredPaths(response)].map(path => base + path)));
  }
  fieldSchema(surfaceId: string, path: string): Record<string, any> {
    const binding = this.responseBindings(surfaceId).find(({ base }) => path === base || path.startsWith(base + "/"));
    return binding?.validate.fieldSchema(path.slice(binding.base.length), binding.response) ?? {};
  }
  private responseIssues(surfaceId: string, componentId: string, scope: string): FormValidationIssue[] {
    const contract = this.responseSchemas.get(surfaceId);
    if (!contract) return [];
    if (!contract.validate) return [{ path: "", keyword: "schema", params: {} }];
    const surface = this.surface(surfaceId);
    const binding = surface.components[componentId]?.action?.event?.context?.[contract.contextKey];
    const response = this.resolve(surfaceId, binding, scope) ?? null;
    const base = object(binding) && typeof binding.path === "string" ? absolutePath(binding.path, scope) : undefined;
    contract.validate(response);
    const issues = schemaIssues(contract.validate.errors).map(issue => ({ ...issue,
      ...(base !== undefined ? { dataPath: base + issue.path } : {}) }));
    // A nullable schema must not accidentally submit the placeholder for an unfinished number.
    for (const [key, state] of Object.entries(surface.viewState ?? {})) {
      if (!state.numericDraft) continue;
      const [id, fieldScope] = JSON.parse(key);
      const component = surface.components[id];
      if (component?.component !== "NumberField" || typeof component.value?.path !== "string") continue;
      const dataPath = absolutePath(component.value.path, fieldScope);
      if (base !== undefined && dataPath !== base && !dataPath.startsWith(base + "/")) continue;
      issues.push({ path: base === undefined ? "" : dataPath.slice(base.length), dataPath,
        keyword: "numericDraft", params: {} });
    }
    return issues;
  }
  getValidationIssues(surfaceId: string): FormValidationIssue[] {
    const attempt = this.validationAttempts.get(surfaceId);
    return attempt ? this.responseIssues(surfaceId, attempt.componentId, attempt.scope) : [];
  }
  private listeners = new Set<() => void>();
  private expiryTimer?: ReturnType<typeof setTimeout>;
  private scheduleExpiry() {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    if (!this.listeners.size) return;
    const now = Date.now();
    const times = Object.values(this.state.surfaces)
      .flatMap((s) => Object.values(s.components).map((c) => c.expiresAtMs))
      .filter((t): t is number => typeof t === "number" && t > now);
    if (times.length)
      this.expiryTimer = setTimeout(
        () => this.commit({ ...this.state }),
        Math.min(2147483647, Math.min(...times) - now + 1)
      );
  }
  private validators = new Map<
    string,
    ReturnType<InstanceType<typeof Ajv2020>["compile"]>
  >();
  constructor(
    definitions: CatalogDefinition[] = [
      { catalogId: CATALOG_ID, schema: catalog },
      { catalogId: AGENT_CATALOG_ID, schema: agentCatalog },
    ]
  ) {
    for (const definition of definitions) {
      const ajv = new Ajv2020({ strict: false, allErrors: true });
      addFormats(ajv);
      ajv.addSchema(common);
      ajv.addSchema({ ...definition.schema, $id: catalog.$id });
      this.validators.set(definition.catalogId, ajv.compile(envelope));
    }
  }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    this.scheduleExpiry();
    return () => {
      this.listeners.delete(listener);
      this.scheduleExpiry();
    };
  };
  getSnapshot = (): Snapshot => this.state;
  private commit(next: Snapshot) {
    this.state = deepFreeze(next);
    for (const listener of this.listeners) listener();
    this.scheduleExpiry();
  }
  exportSnapshot(): Snapshot {
    return copy(this.state);
  }
  importSnapshot(input: unknown): void {
    const snapshot = copy(input) as Snapshot;
    safe(snapshot);
    if (snapshot.version !== VERSION || !object(snapshot.surfaces))
      throw new Error("Invalid snapshot");
    const temporary = new A2UIClient([]);
    temporary.validators = this.validators;
    for (const [id, s] of Object.entries(snapshot.surfaces)) {
      if (id !== s.surfaceId || !object(s.components))
        throw new Error("Invalid surface snapshot");
      temporary.apply({
        version: VERSION,
        createSurface: {
          surfaceId: id,
          catalogId: s.catalogId,
          sendDataModel: s.sendDataModel,
        },
      });
      const components = Object.values(s.components);
      if (components.some((c) => s.components[c.id] !== c))
        throw new Error("Invalid component key");
      if (components.length)
        temporary.apply({
          version: VERSION,
          updateComponents: { surfaceId: id, components },
        });
      temporary.apply({
        version: VERSION,
        updateDataModel: { surfaceId: id, value: s.dataModel },
      });
    }
    const next = temporary.exportSnapshot();
    for (const id of this.responseSchemas.keys()) if (!next.surfaces[id]) {
      this.responseSchemas.delete(id);
      this.validationAttempts.delete(id);
    }
    for (const [id, s] of Object.entries(snapshot.surfaces))
      if (s.viewState) {
        validateViewState(s.viewState);
        next.surfaces[id].viewState = copy(s.viewState);
      }
    this.commit(next);
  }
  apply(input: unknown): void {
    const message = copy(input) as any;
    safe(message);
    if (object(message) && ("surfaceId" in message || "components" in message))
      throw new Error('Expected a complete A2UI envelope: {"version":"v0.9.1","updateComponents":{"surfaceId":"form","components":[...]}}. Keep surfaceId and operation fields inside the operation.');
    if (!object(message) || message.version !== VERSION)
      throw new Error("Expected A2UI v0.9.1");
    const keys = Object.keys(message).filter((k) => k !== "version");
    if (keys.length !== 1 || !["createSurface", "updateComponents", "updateDataModel", "deleteSurface"].includes(keys[0]))
      throw new Error("Expected exactly one of createSurface, updateComponents, updateDataModel, deleteSurface alongside version; keep mode and responseSchema outside messages");
    const operation = keys[0],
      payload = message[operation];
    if (!object(payload)) throw new Error("Invalid payload");
    if (
      typeof payload.surfaceId !== "string" ||
      ["__proto__", "constructor", "prototype"].includes(payload.surfaceId)
    )
      throw new Error("Unsafe surface ID");
    const existing = this.state.surfaces[payload.surfaceId];
    const validator = this.validators.get(
      operation === "createSurface" ? payload.catalogId : existing?.catalogId
    );
    if (!validator || !validator(message))
      throw new Error(
        "Invalid message or unsupported catalog: " +
          JSON.stringify(validator?.errors)
      );
    const next = this.exportSnapshot();
    const id = payload.surfaceId;
    if (operation === "createSurface") {
      if (existing) throw new Error("Surface already exists");
      next.surfaces[id] = {
        surfaceId: id,
        catalogId: payload.catalogId,
        sendDataModel: payload.sendDataModel ?? false,
        components: {},
        dataModel: {},
      };
    } else {
      if (!existing) throw new Error("Surface does not exist");
      const surface = next.surfaces[id];
      if (operation === "deleteSurface") {
        delete next.surfaces[id];
        this.responseSchemas.delete(id);
        this.validationAttempts.delete(id);
      }
      if (operation === "updateComponents") {
        const seen = new Set();
        for (const c of payload.components) {
          if (["__proto__", "constructor", "prototype"].includes(c.id))
            throw new Error("Unsafe component ID");
          if (seen.has(c.id)) throw new Error("Duplicate component");
          seen.add(c.id);
          if (
            (c.component === "Slider" && (c.min ?? 0) > c.max) ||
            (c.component === "NumberField" &&
              c.min !== undefined &&
              c.max !== undefined &&
              c.min > c.max)
          )
            throw new Error("Invalid slider range");
          surface.components[c.id] = c;
        }
        assertAcyclic(surface.components);
      }
      if (operation === "updateDataModel")
        surface.dataModel = writePath(
          surface.dataModel,
          payload.path ?? "/",
          payload.value,
          !Object.hasOwn(payload, "value")
        );
    }
    this.commit(next);
  }
  getViewState(surfaceId: string, key: string) {
    return this.surface(surfaceId).viewState?.[key] ?? {};
  }
  setViewState(surfaceId: string, key: string, value: ViewState) {
    safe(value);
    validateViewState({ [key]: value });
    const next = this.exportSnapshot();
    const surface = next.surfaces[surfaceId];
    if (!surface) throw new Error("Unknown surface");
    surface.viewState = { ...surface.viewState, [key]: value };
    this.commit(next);
  }
  resolve(surfaceId: string, value: any, scope = ""): any {
    return object(value) &&
      Object.keys(value).length === 1 &&
      typeof value.path === "string"
      ? readPath(this.surface(surfaceId).dataModel, value.path, scope)
      : value;
  }
  surface(id: string): Surface {
    const s = this.state.surfaces[id];
    if (!s) throw new Error("Unknown surface");
    return s;
  }
  setValue(
    surfaceId: string,
    componentId: string,
    value: any,
    scope = ""
  ): void {
    safe(value);
    const s = this.surface(surfaceId),
      c = s.components[componentId];
    if (
      !c ||
      ![
        "Textarea",
        "InputOTP",
        "Combobox",
        "Command",
        "Calendar",
        "DatePicker",
        "Toggle",
        "ToggleGroup",
        "Pagination",
        "DropdownMenu",
        "ContextMenu",
        "Menubar",
        "TextField",
        "CheckBox",
        "ChoicePicker",
        "Slider",
        "DateTimeInput",
        "NumberField",
        "Select",
        "Switch",
        "QuestionCard",
        "ApprovalCard",
      ].includes(c.component) ||
      !object(c.value) ||
      typeof c.value.path !== "string"
    )
      throw new Error("Input is not bound");
    if (
      c.disabled &&
      [
        "Textarea",
        "InputOTP",
        "Combobox",
        "Command",
        "Calendar",
        "DatePicker",
        "Toggle",
        "ToggleGroup",
        "Pagination",
        "DropdownMenu",
        "ContextMenu",
        "Menubar",
      ].includes(c.component)
    )
      throw new Error("Input disabled");
    if (
      [
        "Textarea",
        "InputOTP",
        "Combobox",
        "Command",
        "Calendar",
        "DatePicker",
        "DropdownMenu",
        "ContextMenu",
        "Menubar",
      ].includes(c.component) &&
      typeof value !== "string"
    )
      throw new Error("Invalid input value");
    if (
      c.component === "InputOTP" &&
      (!/^\d*$/.test(value) || value.length > (c.length ?? 6))
    )
      throw new Error("Invalid OTP");
    if (c.component === "Toggle" && typeof value !== "boolean")
      throw new Error("Invalid toggle");
    if (
      c.component === "Pagination" &&
      (!Number.isInteger(value) || value < 1 || value > c.totalPages)
    )
      throw new Error("Invalid page");
    if (["Calendar", "DatePicker"].includes(c.component) && value !== "") {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        Number.isNaN(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value ||
        (c.min && value < c.min) ||
        (c.max && value > c.max)
      )
        throw new Error("Invalid date");
    }
    if (
      [
        "Combobox",
        "Command",
        "DropdownMenu",
        "ContextMenu",
        "Menubar",
      ].includes(c.component) &&
      !c.options.some((o: any) => o.value === value && !o.disabled)
    )
      throw new Error("Invalid option");
    if (
      c.component === "ToggleGroup" &&
      (!Array.isArray(value) ||
        new Set(value).size !== value.length ||
        (!c.multiple && value.length > 1) ||
        value.some(
          (v: any) =>
            typeof v !== "string" ||
            !c.options.some((o: any) => o.value === v && !o.disabled)
        ))
    )
      throw new Error("Invalid selection");
    if (
      (["TextField", "DateTimeInput", "Select"].includes(c.component) &&
        typeof value !== "string") ||
      (c.component === "Slider" &&
        (typeof value !== "number" ||
          !Number.isFinite(value) ||
          value < (c.min ?? 0) ||
          value > c.max)) ||
      (["CheckBox", "Switch"].includes(c.component) &&
        typeof value !== "boolean") ||
      (c.component === "ChoicePicker" &&
        (!Array.isArray(value) || value.some((x) => typeof x !== "string")))
    )
      throw new Error("Invalid input value");
    if (
      c.component === "ChoicePicker" &&
      (value.some((v: string) => !c.options.some((o: any) => o.value === v)) ||
        (c.variant !== "multipleSelection" && value.length > 1))
    )
      throw new Error("Invalid selection");
    if (
      c.component === "NumberField" &&
      value !== null &&
      (typeof value !== "number" ||
        !Number.isFinite(value) ||
        (!this.hasResponseSchema(surfaceId) && c.min !== undefined && value < c.min) ||
        (!this.hasResponseSchema(surfaceId) && c.max !== undefined && value > c.max))
    )
      throw new Error("Invalid number");
    if (
      c.component === "Select" &&
      !c.options.some((o: any) => o.value === value)
    )
      throw new Error("Invalid option");
    if (c.component === "DateTimeInput" && value !== "") {
      const type = dateInputType(c);
      const formatted = dateInputValue(value, type);
      if (!formatted || !validDateInput(formatted, type))
        throw new Error("Invalid date/time");
      const min = dateInputValue(this.resolve(surfaceId, c.min, scope), type),
        max = dateInputValue(this.resolve(surfaceId, c.max, scope), type);
      if ((min && formatted < min) || (max && formatted > max))
        throw new Error("Date/time out of range");
    }
    const path =
      "/" +
      tokens(c.value.path, scope)
        .map((x) => x.replace(/~/g, "~0").replace(/\//g, "~1"))
        .join("/");
    this.apply({
      version: VERSION,
      updateDataModel: { surfaceId, path, value },
    });
  }
  createAction(
    surfaceId: string,
    componentId: string,
    scope = ""
  ): { message: ActionMessage; metadata: ActionMetadata } {
    const s = this.surface(surfaceId),
      c = s.components[componentId],
      event = c?.action?.event;
    if (
      !c ||
      ![
        "Button",
        "QuestionCard",
        "ApprovalCard",
        "AlertDialog",
        "DropdownMenu",
        "ContextMenu",
        "Menubar",
      ].includes(c.component) ||
      !event
    )
      throw new Error("No server action");
    const issues = this.responseIssues(surfaceId, componentId, scope);
    if (issues.length) {
      this.validationAttempts.set(surfaceId, { componentId, scope });
      this.commit({ ...this.state });
      throw new FormValidationError(issues);
    }
    this.validationAttempts.delete(surfaceId);
    const context = Object.fromEntries(
      Object.entries(event.context ?? {}).map(([k, v]) => [
        k,
        this.resolve(surfaceId, v, scope) ?? null,
      ])
    );
    const surfaces = Object.fromEntries(
      Object.values(this.state.surfaces)
        .filter((x) => x.sendDataModel)
        .map((x) => [x.surfaceId, copy(x.dataModel)])
    );
    return {
      message: copy({
        version: VERSION,
        action: {
          name: event.name,
          surfaceId,
          sourceComponentId: componentId,
          timestamp: new Date().toISOString(),
          context,
        },
      }),
      metadata: Object.keys(surfaces).length
        ? { a2uiClientDataModel: { surfaces } }
        : {},
    };
  }
}
function deepFreeze<T>(v: T): T {
  if (v && typeof v === "object") {
    Object.freeze(v);
    for (const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}
function assertAcyclic(components: Record<string, Component>) {
  const active = new Set<string>(),
    done = new Set<string>();
  function visit(id: string) {
    if (active.has(id)) throw new Error("Component cycle");
    if (done.has(id) || !components[id]) return;
    active.add(id);
    const c = components[id];
    for (const child of componentReferences(c)) visit(child);
    active.delete(id);
    done.add(id);
  }
  Object.keys(components).forEach(visit);
}
export interface RenderContext {
  client: A2UIClient;
  surfaceId: string;
  component: Component;
  scope: string;
  /** Local presentation identity; data bindings still use the original scope. */
  viewKey?: string;
  resolve: (value: any) => any;
  setValue: (value: any) => void;
  children: any[];
  dispatch: () => void;
}
export type ActionHandler = (
  message: ActionMessage,
  metadata: ActionMetadata
) => void;

/** Framework-neutral tree traversal; adapters own element creation and lifecycle. */
export function renderSurface<T>(
  client: A2UIClient,
  surfaceId: string,
  makeElement: (tag: string, props: Record<string, any>, children: any[]) => T,
  registry: Record<string, (context: RenderContext) => any> = {},
  onAction?: ActionHandler
): any {
  if (!client.getSnapshot().surfaces[surfaceId]) return null;
  const language = typeof document === "undefined" ? "zh-CN" : document.documentElement.lang;
  const issues = client.getValidationIssues(surfaceId);
  const requiredPaths = client.requiredDataPaths(surfaceId);
  const fieldBindings = Object.values(client.surface(surfaceId).components)
    .filter(c => typeof c.value?.path === "string").map(c => absolutePath(c.value.path));
  const formIssue = issues.find(issue => !fieldBindings.some(path => issue.dataPath === path || issue.dataPath?.startsWith(path + "/"))
    && !(["if", "anyOf", "oneOf"].includes(issue.keyword) && issues.some(other => other !== issue && other.path.startsWith(issue.path))));
  let rootElement: HTMLElement | null = null;
  const occurrences = new Map<string, number>();
  function render(
    id: string,
    scope = "",
    ancestors: string[] = [],
    localTrigger?: () => void
  ): any {
    let c = client.surface(surfaceId).components[id];
    if (!c)
      return makeElement(
        "span",
        { "data-a2ui-missing": id, "aria-busy": true },
        []
      );
    if (ancestors.includes(id)) return null;
    // Historical model-generated forms may repeat an option verbatim. Remove
    // only identical entries: equal labels with different values remain valid,
    // and conflicting labels/disabled flags must not be silently rewritten.
    if (Array.isArray(c.options)) {
      const seen = new Set<string>();
      c = { ...c, options: c.options.filter((option: unknown) => {
        const key = JSON.stringify(option);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }) };
    }
    const bindingKey = JSON.stringify([id, scope]);
    const occurrence = occurrences.get(bindingKey) ?? 0;
    occurrences.set(bindingKey, occurrence + 1);
    // Reused components share data, not popup/focus state. Keep the original
    // key for the first occurrence so existing local state remains compatible.
    const viewKey = occurrence === 0 ? bindingKey
      : JSON.stringify([id, JSON.stringify([scope, occurrence])]);
    const resolve = (v: any) => client.resolve(surfaceId, v, scope);
    const fieldPath = typeof c.value?.path === "string" ? absolutePath(c.value.path, scope) : undefined;
    const fieldIssues = fieldPath === undefined ? [] : issues.filter(issue => issue.dataPath === fieldPath
      || issue.dataPath?.startsWith(fieldPath + "/"));
    const errorId = `a2ui-error-${encodeURIComponent(JSON.stringify([surfaceId, viewKey]))}`;
    const required = fieldPath !== undefined && requiredPaths.has(fieldPath);
    const requiredLabel = required || (c.component === "Field" && componentReferences(c).some(childId => {
      const binding = client.surface(surfaceId).components[childId]?.value;
      return typeof binding?.path === "string" && requiredPaths.has(absolutePath(binding.path, scope));
    }));
    let markedRequired = false;
    const element = (tag: string, attrs: Record<string, any>, childNodes: any[]): any => {
      const control = fieldPath !== undefined && (["input", "textarea", "select", "button"].includes(tag));
      if (requiredLabel && !markedRequired && ["label", "span", "div", "legend"].includes(tag)) {
        const label = String(resolve(c.label) ?? "");
        const labelIndex = label ? childNodes.findIndex(node => node === label) : -1;
        if (labelIndex >= 0) {
          childNodes = [...childNodes];
          childNodes.splice(labelIndex, 1, makeElement("span", { class: "a2ui-field-label" }, [label,
            makeElement("span", { class: "a2ui-required", "aria-hidden": true }, [" *"])]));
          markedRequired = true;
        }
      }
      const node = makeElement(tag, { ...attrs, ...(control ? {
        "aria-label": attrs["aria-label"] || (!["ChoicePicker", "ToggleGroup"].includes(c.component)
          && tag !== "button" ? String(resolve(c.label) || resolve(c.accessibility?.label) || "") || undefined : undefined),
        "aria-required": required || undefined,
        "aria-invalid": fieldIssues.length ? true : attrs["aria-invalid"],
        "aria-describedby": fieldIssues.length ? [attrs["aria-describedby"], errorId].filter(Boolean).join(" ") : attrs["aria-describedby"],
      } : {}) }, childNodes);
      if (c.component === "Button" && formIssue && attrs["data-a2ui-component"] === id && c.action?.event) {
        return makeElement("div", {}, [node, makeElement("div", { class: "a2ui-field-error a2ui-form-error", role: "alert", tabIndex: -1 }, [validationMessage(formIssue, language)])]);
      }
      // Keep the control's DOM position stable when an error appears or clears:
      // replacing its parent would otherwise drop focus in the middle of typing.
      return fieldPath !== undefined && attrs["data-a2ui-component"] === id
        ? makeElement("div", { class: "a2ui-validated-field", "data-a2ui-invalid-field": fieldIssues.length ? true : undefined }, [node,
          ...(fieldIssues.length ? [makeElement("div", { id: errorId, class: "a2ui-field-error", "aria-live": "polite" },
            [...new Set(fieldIssues.map(issue => validationMessage(issue, language)))])] : [])]) : node;
    };
    const children: any[] = [];
    const staticChildren: string[] = [
      ...(c.child ? [c.child] : []),
      ...(Array.isArray(c.children) ? c.children : []),
    ];
    // Older generated forms listed both a Field and its input as siblings.
    // Keep the labelled Field occurrence; do not globally deduplicate bindings
    // or template instances, which can legitimately share component definitions.
    const fieldControls = new Set<string>();
    for (const childId of staticChildren) {
      const field = client.surface(surfaceId).components[childId];
      if (field?.component !== "Field") continue;
      if (field.child) fieldControls.add(field.child);
      if (Array.isArray(field.children))
        field.children.forEach((controlId: string) => fieldControls.add(controlId));
    }
    children.push(...staticChildren
      .filter(childId => !fieldControls.has(childId))
      .map(childId => render(childId, scope, [...ancestors, id])));
    if (c.children && !Array.isArray(c.children)) {
      const list = readPath(
        client.surface(surfaceId).dataModel,
        c.children.path,
        scope
      );
      if (Array.isArray(list))
        list.forEach((_, i) => {
          const base =
            "/" +
            tokens(c.children.path, scope)
              .map((x) => x.replace(/~/g, "~0").replace(/\//g, "~1"))
              .join("/");
          children.push(
            render(c.children.componentId, `${base}/${i}`, [...ancestors, id])
          );
        });
    }
    const setValue = (v: any) => client.setValue(surfaceId, id, v, scope);
    const dispatch = () => {
      if (localTrigger) {
        localTrigger();
        return;
      }
      const root = rootElement;
      try {
        const { message, metadata } = client.createAction(surfaceId, id, scope);
        onAction?.(message, metadata);
      } catch (error) {
        if (!(error instanceof FormValidationError)) throw error;
        // Both renderers commit asynchronously. Focus only after their error UI has rendered.
        if (typeof requestAnimationFrame !== "undefined") requestAnimationFrame(() => {
          if (!root?.isConnected) return;
          const target = root.querySelector<HTMLElement>('[data-a2ui-invalid-field] input:not(:disabled), [data-a2ui-invalid-field] textarea:not(:disabled), [data-a2ui-invalid-field] select:not(:disabled), [data-a2ui-invalid-field] button:not(:disabled)')
            ?? root.querySelector<HTMLElement>(".a2ui-form-error");
          target?.focus();
        });
      }
    };
    const context: RenderContext = {
      client,
      surfaceId,
      component: c,
      scope,
      viewKey,
      resolve,
      setValue,
      children,
      dispatch,
    };
    if (registry[c.component]) return registry[c.component](context);
    const props: Record<string, any> = {
      "data-a2ui-component": id,
      "data-theme-part": "a2ui-" + c.component.toLowerCase(),
      class: `a2ui-${c.component.toLowerCase()}`,
      "data-variant": c.variant,
      "aria-label": c.accessibility?.label
        ? String(resolve(c.accessibility.label) ?? "")
        : undefined,
      "aria-description": c.accessibility?.description
        ? String(resolve(c.accessibility.description) ?? "")
        : undefined,
    };
    const value = resolve(c.value),
      label = String(resolve(c.label) ?? "");
    const bound = object(c.value) && typeof c.value.path === "string";
    const key = viewKey;
    const interaction = renderInteraction(context, element, props);
    if (interaction.handled) return interaction.node;
    const commonResult = renderCommon(
      context,
      element,
      props,
      (child, trigger) => render(child, scope, [...ancestors, id], trigger),
      client.getViewState(surfaceId, key),
      (state) => client.setViewState(surfaceId, key, state)
    );
    if (commonResult.handled) return commonResult.node;
    switch (c.component) {
      case "Text":
        return element(/^h[1-5]$/.test(c.variant) ? c.variant : "span", props, [
          String(resolve(c.text) ?? ""),
        ]);
      case "Row":
      case "Column": {
        const css: Record<string, string> = {
          start: "flex-start",
          end: "flex-end",
          spaceBetween: "space-between",
          spaceAround: "space-around",
          spaceEvenly: "space-evenly",
        };
        props.style = {
          justifyContent: css[c.justify] ?? c.justify ?? "flex-start",
          alignItems: css[c.align] ?? c.align ?? "stretch",
        };
        return element("div", props, children);
      }
      case "Image":
        return element(
          "img",
          {
            ...props,
            src: mediaUrl(resolve(c.url)),
            alt: String(resolve(c.description) ?? ""),
            loading: "lazy",
            style: {
              objectFit: c.fit === "scaleDown" ? "scale-down" : c.fit ?? "fill",
            },
          },
          []
        );
      case "Icon": {
        const name = resolve(c.name),
          path = object(name) ? name.svgPath : iconPaths[name as string];
        return element(
          "svg",
          {
            ...props,
            viewBox: "0 0 24 24",
            width: "var(--agent-ui-a2ui-icon-size, 24px)",
            height: "var(--agent-ui-a2ui-icon-size, 24px)",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "var(--agent-ui-a2ui-icon-stroke-width, 2)",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            role: props["aria-label"] ? "img" : undefined,
            "aria-hidden": props["aria-label"] ? undefined : true,
          },
          path ? [element("path", { d: path }, [])] : []
        );
      }
      case "Divider":
        return element(
          "div",
          {
            ...props,
            role: "separator",
            "aria-orientation": c.axis ?? "horizontal",
          },
          []
        );
      case "Video":
      case "AudioPlayer":
        return element(
          c.component === "Video" ? "video" : "audio",
          {
            ...props,
            src: mediaUrl(resolve(c.url)),
            controls: true,
            preload: "none",
            "aria-label":
              props["aria-label"] ??
              String(
                resolve(c.description) ??
                  (c.component === "Video" ? "视频" : "音频")
              ),
          },
          []
        );
      case "Slider": {
        const schema = fieldPath === undefined ? {} : client.fieldSchema(surfaceId, fieldPath);
        const lower = Math.max(c.min ?? 0, schema.minimum ?? -Infinity);
        const upper = Math.min(c.max, schema.maximum ?? Infinity);
        const step = schema.type === "integer" ? Math.max(1, schema.multipleOf ?? 1)
          : schema.multipleOf ?? c.step ?? 1;
        const base = schema.multipleOf ? 0 : lower;
        const min = Number((base + Math.ceil((lower - base) / step) * step).toPrecision(12));
        const max = Number((base + Math.floor((upper - base) / step) * step).toPrecision(12));
        const snap = (number: number) => {
          const first = Math.ceil((min - base) / step), last = Math.floor((max - base) / step);
          const ticks = Math.min(last, Math.max(first, Math.round((number - base) / step)));
          return Number((base + ticks * step).toPrecision(12));
        };
        return element("label", props, [
          label,
          element(
            "input",
            {
              type: "range",
              min,
              max,
              step,
              value: value ?? c.min ?? 0,
              disabled: !bound || min > max,
              "aria-label": label || props["aria-label"] || "滑块",
              onInput: (e: any) => setValue(snap(Number(e.target.value))),
            },
            []
          ),
          element("output", {}, [String(value ?? c.min ?? 0)]),
        ]);
      }
      case "DateTimeInput": {
        const type = dateInputType(c);
        return element("label", props, [
          label,
          element(
            "input",
            {
              type,
              value: dateInputValue(value, type),
              min: dateInputValue(resolve(c.min), type) || undefined,
              max: dateInputValue(resolve(c.max), type) || undefined,
              step: type === "date" ? undefined : 1,
              disabled: !bound || (!c.enableDate && !c.enableTime),
              "aria-label": label || props["aria-label"] || "日期时间",
              onInput: (e: any) => {
                const v = e.target.value;
                setValue(
                  v && type === "datetime-local" ? new Date(v).toISOString() : v
                );
              },
            },
            []
          ),
        ]);
      }
      case "Card":
        return element("section", props, children);
      case "Button":
        return element(
          "button",
          {
            ...props,
            type: "button",
            "data-a2ui-form-action": client.hasResponseSchema(surfaceId) && c.action?.event ? true : undefined,
            onClick: localTrigger ?? ((event: { currentTarget?: HTMLElement }) => {
              // Keep an invalid numeric draft on screen and focus its inline
              // error instead of sending the null placeholder to the server.
              const invalid = !client.hasResponseSchema(surfaceId) && event.currentTarget?.closest(".a2ui-surface")
                ?.querySelector<HTMLElement>('input[aria-invalid="true"]:not(:disabled)');
              if (invalid) { invalid.focus(); return; }
              dispatch();
            }),
            "data-variant": c.variant ?? "default",
          },
          children
        );
      case "TextField":
        return element("label", props, [
          element("span", { class: "a2ui-control-label" }, [label]),
          element(
            c.variant === "longText" ? "textarea" : "input",
            {
              value: value ?? "",
              placeholder: c.placeholder === undefined ? undefined : String(resolve(c.placeholder) ?? ""),
              type:
                c.variant === "obscured"
                  ? "password"
                  : c.variant === "number"
                  ? "number"
                  : "text",
              readOnly: !bound,
              onInput: (e: any) => setValue(e.target.value),
            },
            []
          ),
        ]);
      case "CheckBox":
        return element("label", props, [
          element(
            "input",
            {
              type: "checkbox",
              checked: value === true,
              disabled: !bound,
              onChange: (e: any) => setValue(e.target.checked),
            },
            []
          ),
          label,
        ]);
      case "ChoicePicker":
        return element("fieldset", props, [
          element("legend", {}, [label]),
          ...c.options.map((o: any) =>
            element("label", {}, [
              element(
                "input",
                {
                  type:
                    c.variant === "multipleSelection" ? "checkbox" : "radio",
                  name: `${surfaceId}:${id}:${scope}`,
                  checked: Array.isArray(value) && value.includes(o.value),
                  disabled: !bound,
                  onChange: (e: any) => {
                    const current = Array.isArray(resolve(c.value))
                      ? resolve(c.value)
                      : [];
                    setValue(
                      c.variant === "multipleSelection"
                        ? e.target.checked
                          ? [...new Set([...current, o.value])]
                          : current.filter((x: string) => x !== o.value)
                        : [o.value]
                    );
                  },
                },
                []
              ),
              String(resolve(o.label) ?? ""),
            ])
          ),
        ]);
      default:
        return element("span", { "data-a2ui-unsupported": c.component }, []);
    }
  }
  return makeElement("div", { class: "a2ui-surface", "data-theme-part": "a2ui",
    "data-a2ui-response-form": client.hasResponseSchema(surfaceId) ? true : undefined,
    ref: (node: HTMLElement | null) => { rootElement = node; } }, [
    render("root"),
  ]);
}

const iconPaths: Record<string, string> = {
  person: "M20 21v-2a7 7 0 0 0-14 0v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M6 18 18 6",
  add: "M12 5v14M5 12h14",
  mail: "M3 5h18v14H3z m0 0 9 7 9-7",
  search: "M21 21l-5-5 M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14",
  info: "M12 11v6M12 7v1 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20",
  warning: "m12 3 10 18H2z M12 9v5M12 17v1",
};
function mediaUrl(value: any): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value, "https://a2ui.invalid");
    return ["http:", "https:", "blob:"].includes(url.protocol)
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}
function dateInputType(c: Component): string {
  return c.enableDate && c.enableTime
    ? "datetime-local"
    : c.enableTime
    ? "time"
    : "date";
}
function dateInputValue(value: any, type: string): string {
  if (typeof value !== "string" || !value) return "";
  if (type === "date") return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  if (type === "time")
    return /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value) ? value : "";
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.test(
      value
    )
  )
    return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 19);
}
function validDateInput(value: string, type: string): boolean {
  if (type === "time")
    return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?$/.test(value);
  if (type === "date")
    return new Date(value).toISOString().slice(0, 10) === value;
  return Number.isFinite(new Date(value).getTime());
}

function validateViewState(state: unknown): void {
  if (!object(state)) throw new Error("Invalid view state");
  for (const [key, value] of Object.entries(state as Record<string, any>)) {
    if (
      !object(value) ||
      Object.keys(value).some(
        (k) =>
          ![
            "tab",
            "open",
            "query",
            "month",
            "size",
            "sort",
            "desc",
            "expanded",
            "numericDraft",
          ].includes(k)
      ) ||
      (value.tab !== undefined &&
        (!Number.isInteger(value.tab) || value.tab < 0)) ||
      (value.open !== undefined && typeof value.open !== "boolean") ||
      (value.query !== undefined && typeof value.query !== "string") ||
      (value.numericDraft !== undefined && typeof value.numericDraft !== "string") ||
      (value.month !== undefined &&
        (typeof value.month !== "string" ||
          !/^\d{4}-\d{2}-01$/.test(value.month) ||
          Number.isNaN(Date.parse(value.month)))) ||
      (value.size !== undefined &&
        (typeof value.size !== "number" ||
          !Number.isFinite(value.size) ||
          value.size < 10 ||
          value.size > 90)) ||
      (value.sort !== undefined && typeof value.sort !== "string") ||
      (value.desc !== undefined && typeof value.desc !== "boolean") ||
      (value.expanded !== undefined &&
        (!Array.isArray(value.expanded) ||
          value.expanded.some((v: any) => typeof v !== "string")))
    )
      throw new Error("Invalid view state");
    const tuple = JSON.parse(key);
    if (
      !Array.isArray(tuple) ||
      tuple.length !== 2 ||
      tuple.some((x) => typeof x !== "string")
    )
      throw new Error("Invalid view state key");
  }
}
