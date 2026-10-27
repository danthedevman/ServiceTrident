/** Curated text models, verified 2026-10-26; account access is checked by the provider, not this list.
 * https://developers.openai.com/api/docs/models
 * https://platform.claude.com/docs/en/models/overview
 */
export const AI_MODELS = {
  openai: [
    { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' },
    { id: 'gpt-6-astra', label: 'GPT-6 Astra' },
    { id: 'gpt-6.1-terra', label: 'GPT-6.1 Terra' },
    { id: 'gpt-6-luna', label: 'GPT-6 Luna' },
  ],
  claude: [
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
    { id: 'claude-fable-5-1', label: 'Claude Fable 5.1' },
  ],
};
