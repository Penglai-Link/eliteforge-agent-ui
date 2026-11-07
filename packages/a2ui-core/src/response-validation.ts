import Ajv from "ajv";
import Ajv2019 from "ajv/dist/2019.js";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { ErrorObject, ValidateFunction } from "ajv";

export interface FormValidationIssue {
  /** JSON Pointer relative to the submitted response. */
  path: string;
  keyword: string;
  params: Record<string, any>;
  /** Absolute data-model pointer, when the response has a path binding. */
  dataPath?: string;
}
export class FormValidationError extends Error {
  constructor(readonly issues: FormValidationIssue[]) {
    super("Form response does not match schema");
    this.name = "FormValidationError";
  }
}
export type ResponseValidator = ValidateFunction & { requiredPaths(value: unknown): Set<string>; fieldSchema(path: string, value: unknown): Record<string, any> };
export function compileResponseSchema(schema: unknown): ResponseValidator {
  const dialect = (schema as any)?.$schema;
  const Constructor = !dialect || dialect === "https://json-schema.org/draft/2020-12/schema"
    ? Ajv2020 : dialect === "https://json-schema.org/draft/2019-09/schema"
    ? Ajv2019 : /^https?:\/\/json-schema.org\/draft-07\/schema#?$/.test(dialect)
    ? Ajv : undefined;
  if (!Constructor) throw new Error("Unsupported response schema dialect");
  // Match the server: no coercion, defaults, removal of properties or remote refs.
  const ajv = new Constructor({ strict: false, allErrors: true, validateFormats: true,
    multipleOfPrecision: 12 });
  addFormats(ajv);
  const schemaId = (schema as any)?.$id ?? "urn:eliteforge:interaction-response";
  ajv.addSchema(schema as any, schemaId);
  const validate = ajv.getSchema(schemaId)!;
  const predicates = new Map<string, ValidateFunction>();
  const matches = (path: string, value: unknown) => {
    let predicate = predicates.get(path);
    if (!predicate) { predicate = ajv.compile({ $ref: `${schemaId}#${path}` }); predicates.set(path, predicate); }
    return predicate(value);
  };
  const fieldSchemas = new Map<string, Record<string, any>>();
  const requiredPaths = (value: unknown) => {
    fieldSchemas.clear();
    const walk = (node: any, data: any, path: string, schemaPath: string, depth: number): Set<string> => {
      const found = new Set<string>();
      if (!node || typeof node !== "object" || depth > 64) return found;
      fieldSchemas.set(path, { ...fieldSchemas.get(path), ...node });
      const merge = (set: Set<string>) => { for (const key of set) found.add(key); };
      if (typeof node.$ref === "string" && node.$ref.startsWith("#")) {
        const refPath = decodeURIComponent(node.$ref.slice(1));
        const target = refPath.split("/").slice(1).reduce((s: any, key: string) => s?.[key.replace(/~1/g, "/").replace(/~0/g, "~")], schema);
        merge(walk(target, data, path, refPath, depth + 1));
      }
      for (const name of node.required ?? []) found.add(`${path}/${pointerToken(name)}`);
      for (const [name, child] of Object.entries(node.properties ?? {}))
        merge(walk(child, data?.[name], `${path}/${pointerToken(name)}`, `${schemaPath}/properties/${pointerToken(name)}`, depth + 1));
      if (Array.isArray(data)) data.forEach((item, index) => {
        const tuple = node.prefixItems ?? (Array.isArray(node.items) ? node.items : undefined);
        const child = tuple?.[index] ?? (!Array.isArray(node.items) ? node.items : node.additionalItems);
        const childPath = tuple?.[index] ? `${schemaPath}/${node.prefixItems ? "prefixItems" : "items"}/${index}` : `${schemaPath}/${Array.isArray(node.items) ? "additionalItems" : "items"}`;
        merge(walk(child, item, `${path}/${index}`, childPath, depth + 1));
      });
      (node.allOf ?? []).forEach((child: any, index: number) => merge(walk(child, data, path, `${schemaPath}/allOf/${index}`, depth + 1)));
      if (node.if !== undefined) {
        const branch = matches(`${schemaPath}/if`, data) ? "then" : "else";
        merge(walk(node[branch], data, path, `${schemaPath}/${branch}`, depth + 1));
      }
      for (const key of ["anyOf", "oneOf"]) if (Array.isArray(node[key])) {
        const alternatives = node[key].map((child: any, index: number) => ({ child, index }));
        const matching = alternatives.filter(({ index }: any) => matches(`${schemaPath}/${key}/${index}`, data));
        const sets: Set<string>[] = (matching.length ? matching : alternatives).map(({ child, index }: any) => walk(child, data, path, `${schemaPath}/${key}/${index}`, depth + 1));
        if (sets.length) merge(new Set([...sets[0]].filter(field => sets.every(set => set.has(field)))));
      }
      for (const [name, dependency] of Object.entries({ ...node.dependencies, ...node.dependentRequired, ...node.dependentSchemas })) {
        if (data == null || !Object.hasOwn(data, name)) continue;
        if (Array.isArray(dependency)) dependency.forEach(key => found.add(`${path}/${pointerToken(key)}`));
        else merge(walk(dependency, data, path, `${schemaPath}/${node.dependentSchemas?.[name] ? "dependentSchemas" : "dependencies"}/${pointerToken(name)}`, depth + 1));
      }
      return found;
    };
    return walk(schema, value, "", "", 0);
  };
  return Object.assign(validate, { requiredPaths, fieldSchema(path: string, value: unknown) {
    requiredPaths(value);
    return fieldSchemas.get(path) ?? {};
  } });
}
const pointerToken = (value: string) => value.replace(/~/g, "~0").replace(/\//g, "~1");
export function schemaIssues(errors: ErrorObject[] | null | undefined): FormValidationIssue[] {
  return (errors ?? []).map(error => ({
    path: error.instancePath + (error.keyword === "required" ? `/${pointerToken(error.params.missingProperty)}`
      : error.keyword === "additionalProperties" ? `/${pointerToken(error.params.additionalProperty)}` : ""),
    keyword: error.keyword, params: { ...error.params },
  }));
}
/** Stable keys stay independent of either renderer and of validator English text. */
export function validationMessage(issue: FormValidationIssue, language: string): string {
  const zh = !language.toLowerCase().startsWith("en");
  const p = issue.params;
  const messages: Record<string, [string, string]> = {
    required: ["此字段为必填项。", "This field is required."],
    type: [`请输入有效的${({ string: "文本", number: "数字", integer: "整数", boolean: "布尔值", array: "列表", object: "对象", null: "空值" } as any)[p.type] ?? p.type}。`, `Expected ${p.type}.`],
    minLength: [`至少输入 ${p.limit} 个字符。`, `Enter at least ${p.limit} characters.`],
    maxLength: [`最多输入 ${p.limit} 个字符。`, `Enter at most ${p.limit} characters.`],
    minimum: [`数值不能小于 ${p.limit}。`, `Value must be at least ${p.limit}.`],
    maximum: [`数值不能大于 ${p.limit}。`, `Value must be at most ${p.limit}.`],
    exclusiveMinimum: [`数值必须大于 ${p.limit}。`, `Value must be greater than ${p.limit}.`],
    exclusiveMaximum: [`数值必须小于 ${p.limit}。`, `Value must be less than ${p.limit}.`],
    multipleOf: [`数值必须是 ${p.multipleOf} 的整数倍。`, `Value must be a multiple of ${p.multipleOf}.`],
    pattern: ["输入内容不符合要求的格式。", "Value does not match the required pattern."],
    format: [`请输入有效的 ${p.format}。`, `Enter a valid ${p.format}.`],
    enum: ["请选择允许的值。", "Choose an allowed value."],
    const: ["输入值不符合要求。", "Value does not match the required value."],
    minItems: [`至少选择或填写 ${p.limit} 项。`, `Provide at least ${p.limit} items.`],
    maxItems: [`最多选择或填写 ${p.limit} 项。`, `Provide at most ${p.limit} items.`],
    uniqueItems: ["列表中不能有重复项。", "Items must be unique."],
    additionalProperties: ["包含不允许的字段。", "Unexpected field."],
    unevaluatedProperties: ["包含不允许的字段。", "Unexpected field."],
    minProperties: [`至少填写 ${p.limit} 个属性。`, `Provide at least ${p.limit} properties.`],
    maxProperties: [`最多填写 ${p.limit} 个属性。`, `Provide at most ${p.limit} properties.`],
    dependentRequired: [`还需要填写 ${p.missingProperty}。`, `Also provide ${p.missingProperty}.`],
    anyOf: ["填写内容必须符合至少一种允许的组合。", "Value must match at least one allowed alternative."],
    oneOf: ["填写内容必须符合一种且仅一种允许的组合。", "Value must match exactly one allowed alternative."],
    not: ["填写内容使用了不允许的组合。", "This combination is not allowed."],
    schema: ["表单校验规则无效，暂时无法提交。", "The form schema is invalid; submission is unavailable."],
    numericDraft: ["请输入完整的数字。", "Enter a complete number."],
  };
  return (messages[issue.keyword] ?? ["填写内容不符合表单规则。", "Value does not meet the form requirements."])[zh ? 0 : 1];
}
