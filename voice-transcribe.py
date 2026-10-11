"""Local speech transcription. Audio is decoded in memory and never saved."""
import base64
import io
import json
import os
from pathlib import Path
import sys
import gc
import runpy

ROOT = Path(__file__).resolve().parent
os.environ.setdefault('HF_HOME', str(ROOT / '.voice-cache'))
os.environ.setdefault('HF_HUB_DISABLE_SYMLINKS_WARNING', '1')
from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio
from faster_whisper.utils import download_model

MODEL = ROOT / '.voice-model'
BN_MODEL = ROOT / '.voice-model-bn'
has_repetition_loop = runpy.run_path(str(ROOT / 'voice-quality.py'))['has_repetition_loop']
if '--setup' in sys.argv:
    download_model('small', output_dir=str(MODEL))
    download_model('sha1779/Faster_BengaliRegionalASR', output_dir=str(BN_MODEL))
    print('Local multilingual voice model installed.')
    sys.exit(0)

def transcribe(request, model):
    language = request.get('language', 'bn')
    if language not in ('bn', 'en'):
        raise ValueError('Invalid voice language.')
    audio = decode_audio(io.BytesIO(base64.b64decode(request['audio'], validate=True)), sampling_rate=16000)
    if len(audio) > 32 * 16000:
        raise ValueError('Record a message shorter than 30 seconds.')
    if len(audio) < 4000:
        raise ValueError('Recording too short. Please speak and try again.')
    if not (MODEL / 'model.bin').exists():
        raise ValueError('Local voice model not installed. Run the voice setup command.')
    segments, _ = model.transcribe(audio, language=language, task='transcribe', beam_size=3 if language == 'bn' else 1, best_of=1, temperature=0, max_new_tokens=440 if language == 'bn' else 128, chunk_length=15 if language == 'bn' else 30, vad_filter=True, vad_parameters={'threshold': 0.5, 'min_silence_duration_ms': 400}, condition_on_previous_text=False)
    parts = []
    for segment in segments:
        if has_repetition_loop(segment.text):
            raise ValueError('কথা পরিষ্কার বোঝা যায়নি। আবার ছোট করে বলুন—ভুল পুনরাবৃত্তি বাদ দেওয়া হয়েছে।')
        parts.append(segment.text.strip().strip('\ufffd'))
    text = ' '.join(parts).strip()
    if has_repetition_loop(text):
        raise ValueError('কথা পরিষ্কার বোঝা যায়নি। আবার ছোট করে বলুন—ভুল পুনরাবৃত্তি বাদ দেওয়া হয়েছে।')
    if text and language == 'bn' and not any('\u0980' <= char <= '\u09ff' for char in text):
        raise ValueError('Bangla speech was not understood. Please record a clear, short sentence.')
    return {'text': text, 'language': language}

try:
    active_language = 'bn'
    model = WhisperModel(str(BN_MODEL), device='cpu', compute_type='int8', cpu_threads=2)
    print(json.dumps({'ready': True}), flush=True)
    for line in sys.stdin:
        try:
            request = json.loads(line)
            language = request.get('language', 'bn')
            if language not in ('bn', 'en'):
                raise ValueError('Invalid voice language.')
            if language != active_language:
                model = None
                active_language = None
                gc.collect()
                model = WhisperModel(str(BN_MODEL if language == 'bn' else MODEL), device='cpu', compute_type='int8', cpu_threads=2)
                active_language = language
            result = transcribe(request, model)
        except Exception as error:
            result = {'error': str(error)}
        print(json.dumps(result, ensure_ascii=True), flush=True)
except Exception:
    print(json.dumps({'error': 'Voice model could not start. Check local voice installation.'}), flush=True)
    sys.exit(1)
