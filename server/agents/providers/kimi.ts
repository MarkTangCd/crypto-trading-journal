import { createOpenAICompatibleProvider } from "./openaiCompatible";

export const kimiProvider = createOpenAICompatibleProvider({
  id: "kimi",
  defaultBaseUrl: "https://api.moonshot.cn/v1",
  defaultModel: "moonshot-v1-128k",
  errorBrand: "kimi",
});
