# To-Do-list

## Voice input

Bangla uses sha1779/Faster_BengaliRegionalASR; English uses Systran/faster-whisper-small. Select Bangla for Bengali-script transcription. Language choice is remembered in browser storage. Bangla uses beam search; repeated word, phrase and character loops are rejected instead of being inserted into the draft. Accuracy remains imperfect. Model card: https://huggingface.co/sha1779/Faster_BengaliRegionalASR

Voice input records audio with `MediaRecorder` and transcribes it locally using local Whisper models on CPU. Click the mic to record, click again to finish, then review the text and send. Maximum recording length is 30 seconds. During conversion, clicking the mic cancels the request and stops its worker. No Windows dictation shortcut or browser speech-recognition service is used. Microphone permission is still required by the browser.

The server preloads a persistent voice worker so the model is reused between messages. CPU decoding uses two threads, beam search for Bangla and greedy decoding for English. A transcription request stops after 45 seconds of processing, with up to 20 seconds for a cold worker startup. A cancelled or failed worker is restarted for the next recording.

Audio is processed in memory on this computer and is not saved or uploaded to an external transcription service. Initial setup downloads the runtime and model; later transcription uses the local model. Chat answers still require the ChatGPT connection. CPU speed and audio quality affect transcription time and accuracy; Bangla and English are selectable.

Setup on another Windows machine:

```powershell
py -m venv .voice-venv
.\.voice-venv\Scripts\python.exe -m pip install -r voice-requirements.txt
.\.voice-venv\Scripts\python.exe voice-transcribe.py --setup
.\runtime-bin\node.exe server.mjs
```

Set `VOICE_PYTHON` if your runtime lives elsewhere. The previous browser voice implementation described below has been replaced.

Click **Ask Orbit** in the top bar to open the unified chat. Its message field, send button, microphone, language setting and responses all stay in one panel. Microphone permission is requested by the browser when starting speech; there is no separate permission button. Enter sends a typed message, Escape cancels listening or closes the panel. Connection controls appear inside the panel.

Choose Bangla or English beside Ask, click the microphone, and allow microphone access. Speech fills the question field; review it and click Ask to send. Click the stop button to finish, or press Escape to discard the recording. Orbit does not store audio or call a paid transcription API.

## ChatGPT plan connection

Orbit now defaults to ChatGPT plan usage, without falling back to paid API billing. Start `server.mjs`, open `http://127.0.0.1:3000`, click **Continue with ChatGPT**, and approve the plan usage permission on OpenAI's page. Availability depends on your account and this local client's eligibility. Models come from your account's catalog; optionally set `CHATGPT_MODEL` to an available slug.

OAuth tokens stay in server memory and are never returned to the browser. Restarting requires signing in again. `.orbit-host.json` retains only the non-secret stable host identifier. Disconnect clears the local session. This local-client flow is not a hosted commercial sign-in registration.

Official contract: https://developers.openai.com/siwc/token-sharing-open-source/sign-in

The API-key instructions below describe the previous integration; a key is no longer used by `server.mjs`.

Ask Orbit now uses OpenAI's Responses API with your saved task snapshot and recent conversation. Tasks and notes are sent to OpenAI when you ask a question; attached file contents are not sent. The assistant can answer and suggest plans; it cannot edit tasks.

Windows setup:

1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY` privately in that file. Never put it in browser JavaScript or chat.
2. Run `.\runtime-bin\node.exe server.mjs` from this folder.
3. Open `http://127.0.0.1:3000`. A static file preview cannot run the AI endpoint.

`OPENAI_MODEL` is configurable; the default is `gpt-6-astra`. API billing and model access belong to the API account. Restart the server after changing `.env`. The server listens only on your machine; public hosting needs authentication and per-user usage limits.

Browser storage belongs to each origin. If your tasks were saved under another preview address, export/copy them before switching addresses; that browser storage will remain at the original address.

Run AI integration checks with `.\runtime-bin\node.exe --test orbit-ai.test.mjs`.
