import { useEffect, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Music } from 'lucide-react';
import { mediaStore, useStore, setSetting } from '../state/store';
import { mediaCommand, mediaSupported } from '../media/nowPlaying';
import { COVER_PALETTE } from '../state/palettes';

// Title, artist and cover of the song that plays, top right. "auto" shows it while the
// menus are visible and for a few seconds after every song change; "always" keeps it
// on screen. The buttons only appear together with the menus.

const FLASH_MS = 8000;
const keyOf = (m) => (m.title && m.status !== 'none' ? `${m.title}|${m.artist}` : '');

export default function NowPlaying({ mode, idle, uiHandlers }) {
  const m = useStore(mediaStore);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let last = keyOf(mediaStore.get());
    let timer = 0;
    const unsubscribe = mediaStore.subscribe(() => {
      const k = keyOf(mediaStore.get());
      if (k === last) return;
      last = k;
      clearTimeout(timer);
      setFlash(!!k);
      if (k) timer = setTimeout(() => setFlash(false), FLASH_MS);
    });
    return () => { unsubscribe(); clearTimeout(timer); };
  }, []);

  const hasSong = !!keyOf(m);
  const visible = mode !== 'off' && hasSong && (mode === 'always' || !idle || flash);
  const playing = m.status === 'playing';

  const cols = m.colors || [];
  const style = cols.length ? {
    '--np-glow': cols[0],
    '--np-strip': `linear-gradient(90deg, ${cols.join(', ')})`,
    '--np-fill': `linear-gradient(135deg, ${cols[0]}, ${cols[2] || cols[0]})`,
  } : undefined;

  return (
    <section className={`now-playing${visible ? ' show' : ''}`} style={style} aria-label="Läuft gerade" aria-hidden={!visible} inert={!visible}>
      {m.cover ? <img className="np-cover" src={m.cover} alt="" /> : <span className="np-cover empty"><Music size={26} /></span>}
      <div className="np-body">
        <b className="np-title" title={m.title}>{m.title}</b>
        {m.artist && <span className="np-artist" title={m.artist}>{m.artist}</span>}
        <small className="np-app">{m.app}{m.status === 'paused' ? ' · pausiert' : ''}</small>
        <div className="np-controls ui" {...uiHandlers}>
          <button type="button" className="icon-btn" disabled={!m.canPrev} onClick={() => mediaCommand('previous')} aria-label="Vorheriger Song" title="Vorheriger Song">
            <SkipBack size={15} />
          </button>
          <button type="button" className="icon-btn np-play" disabled={!m.canPlayPause} onClick={() => mediaCommand('play-pause')}
            aria-label={playing ? 'Pause' : 'Abspielen'} title={playing ? 'Pause' : 'Abspielen'}>
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button type="button" className="icon-btn" disabled={!m.canNext} onClick={() => mediaCommand('next')} aria-label="Nächster Song" title="Nächster Song">
            <SkipForward size={15} />
          </button>
        </div>
      </div>
      {cols.length > 0 && <span className="np-strip" aria-hidden="true" />}
    </section>
  );
}

// Palette from the album cover of the song that plays (desktop app only).
export function CoverSwatch({ s }) {
  const { colors } = useStore(mediaStore);
  if (!mediaSupported) return null;
  return (
    <button type="button" className="swatch custom" aria-pressed={s.palette === COVER_PALETTE}
      title="Farben vom Album-Cover des laufenden Songs" aria-label="Palette vom Album-Cover"
      style={{ background: colors ? `linear-gradient(90deg, ${colors.slice(0, 4).join(', ')})` : undefined }}
      onClick={() => setSetting('palette', COVER_PALETTE)}>Cover</button>
  );
}
