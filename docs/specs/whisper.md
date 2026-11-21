# Speech → text for "Add invoice" (Whisper on OpenShift AI)

Owner of the code: Pair 3 (`server/src/ksef/transcribe.ts`, route `POST /api/ksef/transcribe`).
Needed from Pair 1: serve an open-weight Whisper model on Red Hat OpenShift AI and give the app its address.

## What to deploy
- vLLM (or any OpenAI-compatible server) with a Whisper model, e.g. `openai/whisper-large-v3-turbo`
  (vLLM serves it at `/v1/audio/transcriptions`).

## Env for the app container
| Variable | Example | Notes |
|---|---|---|
| `WHISPER_BASE_URL` | `http://whisper-predictor.cfo.svc.cluster.local:8080/v1` | Empty = speech is "not configured"; nothing is sent anywhere. |
| `WHISPER_MODEL` | `openai/whisper-large-v3-turbo` | Must match the served model name. |
| `WHISPER_API_KEY` | (optional) | Sent as `Authorization: Bearer …`. |
| `WHISPER_TIMEOUT_MS` | `20000` | |

## How it flows
Browser records (MediaRecorder, `audio/webm`) → `POST /api/ksef/transcribe?lang=pl` (raw audio body, max 10 MB)
→ server forwards to `WHISPER_BASE_URL/audio/transcriptions` (language `pl`) → text → same parser as "Type"
(`POST /api/ksef/parse`) → owner checks → "Send to KSeF".
`GET /api/ksef/transcribe/status` → `{ ready: boolean }` tells the UI whether to show the real microphone.
