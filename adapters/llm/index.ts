// Genesis-1 · LLM 能力 barrel（值级扩展的统一入口）
export { buildMessages, buildSystemPrompt, chatOnce, createOpenAiCompatibleCognition, parseReply } from "./openai-compatible-cognition";
export type { OpenAiCompatibleCognitionOptions, LlmReply } from "./openai-compatible-cognition";
export { createSummarizer, parseFeelings, parseMemoryLines } from "./summarizer";
export type { SummarizeResult, Summarizer } from "./summarizer";
export { buildFewShotBlock, loadReactionSamples, matchesExpected } from "./reaction-samples";
export type { ReactionSample } from "./reaction-samples";
export { createImageDescriber, DEFAULT_VISION_MODELS, resolveVisionConfig } from "./image-vision";
export type { VisionImageInput } from "./image-vision";
export { postprocessSpeech, postprocessSpeechPayload, DEFAULT_SPEECH_FILTER } from "./speech-postprocess";
export { segmentSpeech, DEFAULT_SENTENCE_MAX_LEN } from "./speech-segmenter";
export * from "./memory";
