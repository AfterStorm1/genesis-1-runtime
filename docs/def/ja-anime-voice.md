# 日语元气少女人设 + Fish Audio Drama 3 语音（交付说明）

> 2026-11-14 落地。对应需求：短发可爱女孩子、日语声线、元气动漫少女音、有情绪起伏和呼吸气口、
> 听感接近动画配音而不是朗读/语音助手；只日语不混中文。

## 一、先说三个修正（原方案照抄会踩坑）

1. **`dsh-voice-chat` 这个插件在本机不存在**。`app.asar` 是个文件不是目录，`.dsh/` 下也没有该插件，
   所以"Harness → 设置 → 朗读设置 → 自定义 TTS"这条路走不通。**实际落点是本仓库**：
   `adapters/tts/fish-tts.ts` + `TTS_ENGINE=fish`。
2. **Fish 的 `/v1/tts` 不是 OpenAI 兼容的 `/audio/speech`**：模型走**请求头** `model`，音色走 `reference_id`。
   光改 Base URL 接不上，必须一个专用适配器（已写）。
3. **表演标签会毁掉原来那条逐句合成管线**：旧逻辑按 `。！？…` 和空白切句，会把 `[息を吸う]` 切成一段
   独立"句子"送进 TTS（会念出怪音/笑场）。已改成"标签粘在它后面那句台词上"，见
   `adapters/llm/performance-tags.ts`。

## 二、已经落地的文件

| 文件 | 作用 |
|---|---|
| `adapters/tts/fish-tts.ts` | Fish Audio 适配器：`POST {FISH_BASE_URL}{FISH_TTS_PATH}`，头带 `model`，体带 `text`/`reference_id`/`format`；响应支持二进制音频或 `{audio/base64/url}` 两种；<1KB 当坏响应重试 |
| `adapters/tts/edge-tts.ts` | 引擎开关：`TTS_ENGINE=cloud`（SiliconFlow）/ `fish`（Fish）/ `off` |
| `adapters/llm/performance-tags.ts` | `[タグ]` 的正则、剥标签（给人看）、可念字数、**标签感知切句** |
| `hosts/qq-host/qq-bot.ts` | 切句改走标签感知版；文字显示剥掉标签；质检门槛按"可念字数"；日语/带标签时不加「嗯，」打顿 |
| `config/persona/ja-anime.persona.json` | 人设卡：`name=aoi`、日语、一人称「あたし」、开场白带标签示范 |
| `config/world/rules.ja-anime.md` | 规则：标签语法、标签密度、语速交替、每段至少一个非语言声音、禁止中文混入 |
| `scripts/tts-test.ts` | 冒烟测试支持自定义台词：`tts-test.cmd "<日语带标签的台词>"` |
| `tests/unit/performance-tags.test.ts` | 切句/剥标签/可念字数的单测 |

## 三、启用步骤（4 步）

1. 填 `llm-config.cmd` 里这段（全部取消注释）：
   ```
   set "GENESIS_PERSONA=config\persona\ja-anime.persona.json"
   set "CHAT_WORLD_RULES=config\world\rules.ja-anime.md"
   set "QQ_TRIGGER=aoi"                    # 群里喊它才应；想换就改
   set "QQ_OWNER_IDS=<你的QQ号>"            # 语音只对名单里的人发；不填永远只有文字
   set "TTS_ENGINE=fish"
   set "FISH_API_KEY=<fish.audio 的 key>"
   set "FISH_REFERENCE_ID=<Voice Selector 里选的元气少女音色 id>"
   set "FISH_MODEL=drama-3"
   ```
2. 先单句验证，不要一上来就进群：
   ```
   tts-test.cmd "[少し嬉しそうに、声を弾ませて] ねえねえ、聞いて。今日ね、いいことあったんだ。[息を吸う] ちょっとだけ、聞いてくれる？"
   ```
   成功会打印 `engine=fish elapsed=…ms` 和输出路径（`data/tmp/tts-test.mp3`）。
3. 听感不对先换音色（`FISH_REFERENCE_ID`），标签和提示词不用动。
4. 满意后再启动 `qq-chat.cmd`，让她在群里出一句语音。

## 四、标签约定（已写进规则文件）

- 角括号内是**自由日语表演指令**：`[わくわくした早口で]`、`[声を小さくして]`、`[少し真面目な声で、ゆっくり]`
- 呼吸/停顿/笑：`[息を吸う]`、`[息を吐く]`、`[小さく笑う]`、`[短い間]`、`[あくび]`
- 位置必须贴着**它生效的那句台词前面**；一句一句都加 = 喘气过度，1 返事 1~3 个
- 切句时标签跟着下一句走，**不会单独送去合成**；文字显示时标签被剥掉，聊天里看不到方括号

## 五、去"语音助手味"的硬约束（写在规则里，模型侧执行）

1. 句尾不许每句收得一样干净（允许 `……`、`——`）
2. 语速交替：`早口` / `ゆっくり` 不连续三句同档
3. **每段回复至少一个非语言声音**（呼吸/轻笑/叹气/短促「ん？」）——这是"表演"和"朗读"的分界线
4. 兴奋=声音弹起来、照れ=变小变软、眠い=掠れる

## 六、显式未验证项（没 key，无法实测）

- `POST {base}/tts` 的真实字段名（`text` / `reference_id` / `format`）与响应形态（二进制 vs JSON url）
  - 兜底：`FISH_REQUEST_EXTRA='{"latency":"balanced"}'` 可追加任意字段；`FISH_TTS_PATH`、`FISH_MODEL`、`FISH_FORMAT` 都可改
  - 若真实接口是 `references` 而非 `reference_id`，用 `FISH_REQUEST_EXTRA` 顶掉即可（适配器里 body 后合并）
- 模型对日语标签的响应度（"早口/ゆっくり"是否真的变速）——只能试听后调标签措辞

## 七、备选：Qwen-Audio-3.0-TTS

原方案判断正确：它支持日语与结构化标签（`[gasp]`/`[giggles]`），但**不走 OpenAI 兼容接口**，要加一层
DashScope 协议适配。当前架构加第三个引擎只要再写一个 `adapters/tts/qwen-tts.ts` 并在
`adapters/tts/edge-tts.ts` 里加一个分支（`TTS_ENGINE=qwen`），接口形状与 `fish-tts.ts` 相同。
建议先用 Fish 跑通，标签控制不够再上 Qwen。
