# training-compliance-radar
Privacy-first AI app that flags employees at risk of missing the 1-training-per-year rule

## AI provider
The default AI provider is Google Gemini (`AI_PROVIDER=google`, key in `GOOGLE_GENERATIVE_AI_API_KEY`, model `gemini-3.8-flash`). To use Anthropic Claude instead, set `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`. See `spec.md` §7.

> **Data-use note:** On the Gemini API free tier, Google may use prompts and responses to improve its products. That is acceptable for this app because only unit-level aggregates (counts, unit names, course titles) and synthetic data are sent. Employee names and IDs never leave the browser. Use a paid tier, or check your organization's privacy policy, before using real data.
