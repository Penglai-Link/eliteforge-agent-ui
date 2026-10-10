import { renderInteraction } from "./interaction-components";
import agentCatalogSchema from "./schemas/agent_catalog.json";
import { renderCommon, componentReferences } from "./common-components";
import addFormats from "ajv-formats";
import Ajv2020 from "ajv/dist/2020.js";
import envelope from "./schemas/server_to_client.json";
import common from "./schemas/common_types.json";
import catalogSchema from "./schemas/catalog.json";
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
  viewState?: Record<string, { tab?: number; open?: boolean }>;
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
    if (!object(message) || message.version !== VERSION)
      throw new Error("Expected A2UI v0.9.1");
    const keys = Object.keys(message).filter((k) => k !== "version");
    if (keys.length !== 1) throw new Error("Expected one operation");
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
      if (operation === "deleteSurface") delete next.surfaces[id];
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
  setViewState(
    surfaceId: string,
    key: string,
    value: { tab?: number; open?: boolean }
  ) {
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
      (typeof value !== "number" ||
        !Number.isFinite(value) ||
        (c.min !== undefined && value < c.min) ||
        (c.max !== undefined && value > c.max))
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
      !["Button", "QuestionCard", "ApprovalCard"].includes(c.component) ||
      !event
    )
      throw new Error("No server action");
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
  element: (tag: string, props: Record<string, any>, children: any[]) => T,
  registry: Record<string, (context: RenderContext) => any> = {},
  onAction?: ActionHandler
): any {
  if (!client.getSnapshot().surfaces[surfaceId]) return null;
  function render(
    id: string,
    scope = "",
    ancestors: string[] = [],
    localTrigger?: () => void
  ): any {
    const c = client.surface(surfaceId).components[id];
    if (!c)
      return element(
        "span",
        { "data-a2ui-missing": id, "aria-busy": true },
        []
      );
    if (ancestors.includes(id)) return null;
    const resolve = (v: any) => client.resolve(surfaceId, v, scope);
    const children: any[] = [];
    if (c.child) children.push(render(c.child, scope, [...ancestors, id]));
    if (Array.isArray(c.children))
      children.push(
        ...c.children.map((x: string) => render(x, scope, [...ancestors, id]))
      );
    else if (c.children) {
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
      const { message, metadata } = client.createAction(surfaceId, id, scope);
      onAction?.(message, metadata);
    };
    const context: RenderContext = {
      client,
      surfaceId,
      component: c,
      scope,
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
    const key = JSON.stringify([id, scope]);
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
      case "Slider":
        return element("label", props, [
          label,
          element(
            "input",
            {
              type: "range",
              min: c.min ?? 0,
              max: c.max,
              step: "any",
              value: value ?? c.min ?? 0,
              disabled: !bound,
              "aria-label": label || props["aria-label"] || "滑块",
              onInput: (e: any) => setValue(Number(e.target.value)),
            },
            []
          ),
          element("output", {}, [String(value ?? c.min ?? 0)]),
        ]);
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
            onClick: localTrigger ?? dispatch,
            "data-variant": c.variant ?? "default",
          },
          children
        );
      case "TextField":
        return element("label", props, [
          label,
          element(
            c.variant === "longText" ? "textarea" : "input",
            {
              value: value ?? "",
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
  return element("div", { class: "a2ui-surface", "data-theme-part": "a2ui" }, [
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
      Object.keys(value).some((k) => !["tab", "open"].includes(k)) ||
      (value.tab !== undefined &&
        (!Number.isInteger(value.tab) || value.tab < 0)) ||
      (value.open !== undefined && typeof value.open !== "boolean")
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
