# Cloud features

## Separate from AI notes trial

- **AI meeting notes:** 7-day trial on signup (extendable by admin).
- **Cloud save / embeddings, Cloud Q&A, Auto-translate, Speaker diarization:** require admin approval, paid plan, BYOK, or an explicit admin grant.

## Speaker diarization

Multi-speaker mode uses AssemblyAI streaming to label different voices in real time. You can use the platform AssemblyAI key (when diarization is granted) or add your own **AssemblyAI** key on the Profile page (BYOK).

## Plans

| Plan | Platform AI | Your API key |
|------|-------------|--------------|
| free | Trial / admin grant | — |
| paid | Platform OpenAI + AssemblyAI (when granted) | — |
| byok | Your OpenAI key (required on profile) | OpenAI and/or AssemblyAI |

## BYOK

Add OpenAI and/or AssemblyAI keys on the Profile page. Keys are encrypted at rest. BYOK plan uses your OpenAI key for AI notes; AssemblyAI key enables multi-speaker mode without a platform diarization grant.
