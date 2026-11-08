"""Two local synthetic-voice previews. No paid API or credentials are used.

Supertonic-3 model: Supertone, OpenRAIL-M. Runtime: supertonic 1.3.1, MIT.
Downloads only the official model assets into the project, with a pinned revision.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import json
import sys
from urllib.request import urlopen
import wave

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / '.demo-tools/local-voice/supertonic'
MODEL = TOOLS / 'model'
REVISION = '724fb5abbf5502583fb520898d45929e62f02c0b'
REPO = 'Supertone/supertonic-3'
sys.path.insert(0, str(TOOLS / 'python'))

files = [
    'onnx/duration_predictor.onnx', 'onnx/text_encoder.onnx',
    'onnx/vector_estimator.onnx', 'onnx/vocoder.onnx',
    'onnx/tts.json', 'onnx/unicode_indexer.json',
    'voice_styles/F2.json', 'voice_styles/F5.json', 'LICENSE',
]
expected = {}
for directory in ['onnx', 'voice_styles']:
    with urlopen(f'https://huggingface.co/api/models/{REPO}/tree/{REVISION}/{directory}', timeout=40) as response:
        entries = json.load(response)
    for item in entries:
        if item.get('lfs', {}).get('oid'):
            expected[item['path']] = item['lfs']['oid']

def download(name):
    destination = MODEL / name
    if not destination.exists():
        destination.parent.mkdir(parents=True, exist_ok=True)
        with urlopen(f'https://huggingface.co/{REPO}/resolve/{REVISION}/{name}', timeout=120) as response:
            with destination.with_suffix(destination.suffix + '.part').open('wb') as output:
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
        destination.with_suffix(destination.suffix + '.part').replace(destination)
    if name in expected and hashlib.sha256(destination.read_bytes()).hexdigest() != expected[name]:
        raise RuntimeError('Model integrity check failed: ' + name)
    print('Prepared ' + name, flush=True)

with ThreadPoolExecutor(max_workers=4) as pool:
    list(pool.map(download, files))

import numpy as np
from supertonic import TTS

speaker = TTS(model='supertonic-3', model_dir=MODEL, auto_download=False,
              intra_op_num_threads=2, inter_op_num_threads=1)
text = 'Hola. Con de eme pe, cada tarea tiene su sitio. Revisa el equipo, registra tu trabajo y sigue el resultado, paso a paso.'
directory = ROOT / 'dist/narration-samples'
directory.mkdir(parents=True, exist_ok=True)
records = []
for voice in ['F2', 'F5']:
    # Fixed random seed makes comparison reproducible. Voice profiles are stock synthetic presets.
    np.random.seed(42)
    wav, duration = speaker.synthesize(text, voice_style=speaker.get_voice_style(voice),
                                      lang='es', total_steps=12, speed=1.02, verbose=False)
    audio = np.asarray(wav, dtype=np.float32).reshape(-1)
    if not len(audio) or not np.all(np.isfinite(audio)) or np.max(np.abs(audio)) < 0.001:
        raise RuntimeError('Invalid audio: ' + voice)
    audio *= min(1.0, 0.92 / float(np.max(np.abs(audio))))
    destination = directory / f'dmp-supertonic-{voice.lower()}-es.wav'
    with wave.open(str(destination), 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(speaker.sample_rate)
        output.writeframes((np.clip(audio, -1, 1) * 32767).astype('<i2').tobytes())
    record = {'file': str(destination), 'voice': voice, 'seconds': round(len(audio) / speaker.sample_rate, 1),
              'model': REPO, 'revision': REVISION, 'aiGenerated': True, 'text': text}
    records.append(record)
    print(json.dumps(record, ensure_ascii=False), flush=True)
(directory / 'dmp-supertonic-samples.json').write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
