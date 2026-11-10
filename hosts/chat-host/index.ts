// Genesis-1 · 聊天宿主 barrel：运行时 / 交互循环 / 环境配置 / 记忆组装
export { createChatRuntime, sendUserMessage } from "./chat-runtime";
export type { ChatRuntime, ChatRuntimeOptions } from "./chat-runtime";
export { runChatLoop } from "./chat-loop";
export { readChatEnv } from "./chat-env";
export type { ChatEnvConfig } from "./chat-env";
export { assembleChatMemory } from "./memory-assembly";
export type { ChatMemoryAssembly, MemoryAssemblyOptions } from "./memory-assembly";
