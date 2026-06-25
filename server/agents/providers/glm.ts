import { createOpenAICompatibleProvider } from "./openaiCompatible";

export const glmProvider = createOpenAICompatibleProvider({
  id: "glm",
  defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
  defaultModel: "glm-4.5",
  errorBrand: "glm",
});
