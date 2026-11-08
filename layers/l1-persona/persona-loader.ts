// Genesis-1 角色运行时骨架 · L1 人格数据加载（宿主层）
// 人格数据放 config/persona/；换人格只换 config/persona/ 与宿主装配数据（铁律）。
import fs from "node:fs";
import type { PersonaCardV3 } from "../../core/contract/persona";

export function personaFromObject(x: unknown): PersonaCardV3 {
  const raw = x as PersonaCardV3;
  if (
    raw === null ||
    typeof raw !== "object" ||
    raw.spec !== "chara_card_v3" ||
    raw.data === undefined ||
    typeof raw.data.name !== "string"
  ) {
    throw new Error("invalid_persona:expected chara_card_v3 with data.name");
  }
  return raw;
}

export function loadPersona(filePath: string): PersonaCardV3 {
  const text = fs.readFileSync(filePath, "utf8");
  return personaFromObject(JSON.parse(text));
}
