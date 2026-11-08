"""Produce F2 narration locally, without paid APIs or reading credentials.

Use the verified Supertonic-3 assets prepared by generate-youthful-voice-samples.py.
No audio is time-stretched: the picture waits for each complete spoken sentence.
"""
from pathlib import Path
import hashlib
import json
import math
import sys
import wave

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / '.demo-tools/local-voice/supertonic'
sys.path.insert(0, str(TOOLS / 'python'))
import numpy as np
from supertonic import TTS

directory = ROOT / '.demo-tools/narration'
directory.mkdir(parents=True, exist_ok=True)
catalog = json.loads((ROOT / 'scripts/demo/studio-scenes.json').read_text(encoding='utf-8'))
speaker = TTS(model='supertonic-3', model_dir=TOOLS / 'model', auto_download=False,
              intra_op_num_threads=2, inter_op_num_threads=1)
style = speaker.get_voice_style('F2')
speed = 0.94
plan = {}
for film_id, film in catalog.items():
    plan[film_id] = {'voice': 'F2', 'synthetic': True, 'speed': speed, 'scenes': []}
    for index, scene in enumerate(film['scenes']):
        sentence = scene['narration']
        signature = hashlib.sha256(f'F2-supertonic3-724fb5a-{speed}-12-{index}-{sentence}'.encode()).hexdigest()
        destination = directory / f'{signature}.wav'
        if not destination.exists():
            np.random.seed(410 + index)
            audio, _ = speaker.synthesize(sentence, voice_style=style, lang='es',
                                          total_steps=12, speed=speed, verbose=False)
            audio = np.asarray(audio, dtype=np.float32).reshape(-1)
            if not len(audio) or not np.all(np.isfinite(audio)) or np.max(np.abs(audio)) < 0.001:
                raise RuntimeError(f'Invalid or silent narration: {film_id}/{index}')
            # Preserve natural dynamics and intonation. Limit peaks without speeding up speech.
            audio *= min(1.0, 0.90 / float(np.max(np.abs(audio))))
            fade = min(int(speaker.sample_rate * 0.008), len(audio) // 2)
            audio[:fade] *= np.linspace(0, 1, fade)
            audio[-fade:] *= np.linspace(1, 0, fade)
            with wave.open(str(destination), 'wb') as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(speaker.sample_rate)
                output.writeframes((np.clip(audio, -1, 1) * 32767).astype('<i2').tobytes())
        with wave.open(str(destination), 'rb') as audio:
            spoken_seconds = audio.getnframes() / audio.getframerate()
        # 0.2 s before speaking and at least 0.4 s after the whole sentence.
        seconds = max(scene['seconds'], math.ceil((spoken_seconds + 0.6) * 30) / 30)
        plan[film_id]['scenes'].append({'index': index, 'text': sentence,
                                      'file': str(destination.relative_to(ROOT)).replace('\\', '/'),
                                      'spokenSeconds': spoken_seconds, 'seconds': seconds,
                                      'leadSeconds': 0.2, 'tailSeconds': seconds - spoken_seconds - 0.2})
        print(f'{film_id} {index + 1}/{len(film["scenes"])}: voice {spoken_seconds:.1f}s / scene {seconds:.1f}s', flush=True)
    plan[film_id]['seconds'] = sum(s['seconds'] for s in plan[film_id]['scenes'])
    # One continuous master avoids AAC encoder delay accumulating at scene joins.
    pieces = []
    for scene in plan[film_id]['scenes']:
        with wave.open(str(ROOT / scene['file']), 'rb') as source:
            samples = np.frombuffer(source.readframes(source.getnframes()), dtype='<i2')
        block = np.zeros(round(scene['seconds'] * speaker.sample_rate), dtype='<i2')
        start = round(scene['leadSeconds'] * speaker.sample_rate)
        if start + len(samples) > len(block):
            raise RuntimeError('Narration would be cut short.')
        block[start:start + len(samples)] = samples
        pieces.append(block)
    master = directory / f'{film_id}-f2.wav'
    with wave.open(str(master), 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(speaker.sample_rate)
        output.writeframes(np.concatenate(pieces).tobytes())
    plan[film_id]['file'] = str(master.relative_to(ROOT)).replace('\\', '/')
(directory / 'plan.json').write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({key: round(value['seconds'], 1) for key, value in plan.items()}), flush=True)
