// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DemoWelcomePreview } from './DemoWelcomePreview';

it('lets the visitor hear the narration with one explicit action and keeps subtitles available', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  try {
    await act(async () => root.render(<DemoWelcomePreview role="SAT" experience="work" onClose={() => {}} onStart={() => {}} />));
    const video = host.querySelector('video')!;
    expect(video.muted).toBe(true);
    expect(host.textContent).toContain('Narración con voz de IA');
    expect(host.querySelector('track[kind="subtitles"]')?.getAttribute('src')).toContain('.es.vtt');
    const audioButton = () => host.querySelector<HTMLButtonElement>('.demo-preview-audio button')!;
    video.currentTime = 7;
    await act(async () => audioButton().click());
    expect(video.muted).toBe(false);
    expect(video.currentTime).toBe(0);
    expect(play).toHaveBeenCalledOnce();
    expect(audioButton().textContent).toContain('Silenciar narración');
    await act(async () => audioButton().click());
    expect(video.muted).toBe(true);
    expect(audioButton().textContent).toContain('Escuchar narración');
    video.currentTime = 9;
    await act(async () => audioButton().click());
    expect(video.currentTime).toBe(9);
  } finally {
    await act(async () => root.unmount()); host.remove(); play.mockRestore();
  }
});
