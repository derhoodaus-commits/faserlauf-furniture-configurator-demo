// Full-viewport viewer without UI, used by scripts/render_previews.py to render the preview images
// of the website (product cards, hero, gallery, Open Graph) with the real configurator.
import { useMemo, useState } from 'react';
import Viewer, { type ViewPreset } from './viewer/Viewer.tsx';
import { paramsToState } from '../lib/url-state.ts';

export default function RenderStage() {
  const q = useMemo(() => new URLSearchParams(location.search), []);
  const { state } = useMemo(() => paramsToState(q), [q]);
  const [ready, setReady] = useState(false);
  const variants = useMemo(
    () => (state.compare && state.b ? [{ config: state.a, label: 'A' as const }, { config: state.b, label: 'B' as const }] : [{ config: state.a, label: null }]),
    [state],
  );
  const preset = (q.get('preset') as ViewPreset | null) ?? 'three-quarter';
  const bg = q.get('bg') ?? '#efe8dc';
  if (ready) document.documentElement.dataset['ready'] = '1';
  return (
    <div className="render-stage">
      <Viewer
        variants={variants}
        view={state.view}
        quality="high"
        mode="render"
        background={bg.startsWith('#') ? bg : `#${bg}`}
        initialPreset={preset}
        fixedDpr={Number(q.get('dpr')) || 2}
        onReadyChange={setReady}
      />
    </div>
  );
}
