import { createOpenAICompatibleProvider } from "./openaiCompatible";

export const deepseekProvider = createOpenAICompatibleProvider({
  id: "deepseek",
  defaultBaseUrl: "https://api.deepseek.com",
  defaultModel: "deepseek-chat",
  errorBrand: "deepseek",
});
