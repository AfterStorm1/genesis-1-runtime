// Genesis-1 角色运行时骨架 · 契约
// minimal per handbook; confirm —— 手册未给 PersonaCardV3 正文；
// 按 D5（SillyTavern V3 角色卡）取最小结构，字段待确认。
export interface PersonaCardV3 {
  spec: "chara_card_v3";
  data: {
    name: string;
    description?: string;
    personality?: string;
    scenario?: string;
    first_mes?: string;
    mes_example?: string;
    creator_notes?: string;
    system_prompt?: string;
    post_history_instructions?: string;
    alternate_greetings?: string[];
    tags?: string[];
    extensions?: Record<string, unknown>;
  };
}
