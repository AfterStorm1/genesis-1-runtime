// Genesis-1 · 交互式聊天入口（薄壳；实现已按职责拆分到 hosts/chat-host/）
// 直接运行：node node_modules\tsx\dist\cli.mjs demo-chat.ts  或 双击 chat.cmd
// 复用：import { createChatRuntime, sendUserMessage, runChatLoop } from "./demo-chat"
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createChatRuntime, sendUserMessage, runChatLoop } from "./hosts/chat-host";

export { createChatRuntime, sendUserMessage, runChatLoop };
export type { ChatRuntime, ChatRuntimeOptions } from "./hosts/chat-host/chat-runtime";
export type { ChatEnvConfig } from "./hosts/chat-host/chat-env";

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  createChatRuntime()
    .then((chat) => runChatLoop(chat))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      process.exit(1);
    });
}
