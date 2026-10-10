/** Keep provider diagnostics available without using their JSON envelope as UI copy. */
export function chatErrorPresentation(raw: string, fallback = "Run failed") {
  if (!raw.includes("model stream failed before completion:")) return { summary: raw, details: "" };
  const chinese = /[\u3400-\u9fff]/.test(fallback);
  try {
    const event = JSON.parse(raw.slice(raw.indexOf("{")));
    const error = event.response?.error ?? event.error;
    const tool = typeof error?.message === "string" ? error.message.match(/schema definition for tool:\s*([\w.-]+)/i)?.[1]?.replace(/\.$/, "") : undefined;
    if (tool) return {
      summary: chinese ? `模型服务拒绝了工具 ${tool} 的参数定义，请检查工具 Schema。` : `The model service rejected the parameter schema for tool ${tool}.`,
      details: raw,
    };
  } catch { /* Partial provider frames still retain their diagnostics. */ }
  return { summary: chinese ? "模型服务返回错误，本次回复未完成。" : "The model service failed before the reply completed.", details: raw };
}
