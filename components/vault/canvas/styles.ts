/** Canvas editor stylesheet (injected once). Light/dark follow Tailwind's `.dark` class. */
const CSS = `
.cv-root { --cv-bg: #f7f7f8; --cv-dot: rgba(0,0,0,.16); --cv-card: #ffffff; --cv-card-border: #d9dbe1; --cv-text: #1f2328; --cv-muted: #6b7280;
  --cv-accent: #3b82f6; --cv-edge: #9aa1ad; --cv-shadow: 0 1px 2px rgba(15,23,42,.06), 0 2px 8px rgba(15,23,42,.06); --cv-ui: rgba(255,255,255,.96); --cv-ui-border: #e5e7eb; }
.dark .cv-root { --cv-bg: #0d1017; --cv-dot: rgba(255,255,255,.12); --cv-card: #171b25; --cv-card-border: rgba(255,255,255,.12); --cv-text: #e5e7eb; --cv-muted: #9ca3af;
  --cv-accent: #8b5cf6; --cv-edge: #6b7280; --cv-shadow: 0 1px 2px rgba(0,0,0,.35), 0 4px 14px rgba(0,0,0,.3); --cv-ui: rgba(23,27,37,.96); --cv-ui-border: rgba(255,255,255,.1); }
.cv-board { position: relative; overflow: hidden; background-color: var(--cv-bg); touch-action: none; outline: none; user-select: none; -webkit-user-select: none;
  background-image: radial-gradient(circle, var(--cv-dot) 1px, transparent 1.3px); }
.cv-board.cv-panning { cursor: grab; }
.cv-world { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; will-change: transform; }
.cv-node { position: absolute; left: 0; top: 0; box-sizing: border-box; contain: layout style; }
.cv-card { position: absolute; inset: 0; border-radius: 10px; background: var(--cv-card); border: 2px solid var(--cv-card-border); box-shadow: var(--cv-shadow); color: var(--cv-text); display: flex; flex-direction: column; overflow: hidden; }
.cv-node[data-color] .cv-card { border-color: var(--cv-color); background: color-mix(in srgb, var(--cv-color) 9%, var(--cv-card)); }
.cv-node.cv-sel > .cv-card, .cv-node.cv-sel > .cv-group-box { outline: 2px solid var(--cv-accent); outline-offset: 2px; }
.cv-node.cv-drop > .cv-group-box { outline: 2px dashed var(--cv-accent); outline-offset: 2px; }
.cv-scroll { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; }
.cv-node:not(.cv-sel) .cv-scroll { overflow: hidden; }
.cv-text-body { padding: 10px 16px; }
.cv-root .cv-card .mdv.mdv-page { padding: 0; font-size: 15px; line-height: 1.55; }
.cv-root .cv-card .mdv > :first-child { margin-top: 0; }
.cv-root .cv-card .mdv > :last-child { margin-bottom: 0; }
.cv-root .cv-card .cv-file-body .mdv.mdv-page { padding: 4px 18px 16px; }
.cv-edit { flex: 1; width: 100%; height: 100%; resize: none; border: 0; outline: none; background: transparent; color: var(--cv-text); padding: 10px 16px;
  font: 14px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; user-select: text; -webkit-user-select: text; }
.cv-file-head { display: flex; align-items: center; gap: 6px; padding: 8px 12px 6px; font-weight: 600; font-size: 14px; color: var(--cv-text); flex-shrink: 0; }
.cv-file-head button { all: unset; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cv-file-head button:hover { text-decoration: underline; }
.cv-node-label { position: absolute; left: 0; bottom: 100%; margin-bottom: 4px; max-width: 100%; font-size: 13px; color: var(--cv-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
.cv-group-box { position: absolute; inset: 0; border-radius: 12px; border: 2px solid var(--cv-card-border); background: color-mix(in srgb, var(--cv-muted) 5%, transparent); }
.cv-node[data-color] .cv-group-box { border-color: var(--cv-color); background: color-mix(in srgb, var(--cv-color) 8%, transparent); }
.cv-group-label { position: absolute; left: 0; bottom: 100%; margin-bottom: 6px; padding: 3px 10px; border-radius: 8px; font-size: 18px; font-weight: 600; white-space: nowrap; max-width: 100%;
  overflow: hidden; text-overflow: ellipsis; background: color-mix(in srgb, var(--cv-muted) 14%, var(--cv-bg)); color: var(--cv-text); cursor: default; }
.cv-node[data-color] .cv-group-label { background: color-mix(in srgb, var(--cv-color) 22%, var(--cv-bg)); }
.cv-group-label input { all: unset; min-width: 60px; user-select: text; -webkit-user-select: text; }
.cv-media { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--cv-muted) 6%, transparent); }
.cv-media img { max-width: 100%; max-height: 100%; width: 100%; height: 100%; object-fit: contain; pointer-events: none; -webkit-user-drag: none; }
.cv-media iframe, .cv-link iframe { width: 100%; height: 100%; border: 0; background: #fff; }
.cv-node:not(.cv-sel) iframe, .cv-node:not(.cv-sel) video, .cv-node:not(.cv-sel) audio { pointer-events: none; }
.cv-chip { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; height: 100%; padding: 12px; text-align: center; color: var(--cv-muted); font-size: 13px; }
.cv-link-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; flex-shrink: 0; }
.cv-link-head img { width: 18px; height: 18px; border-radius: 4px; flex-shrink: 0; }
.cv-link-btn { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; font-size: 12px; color: var(--cv-muted); border: 1px solid var(--cv-card-border); }
.cv-link-btn:hover { color: var(--cv-text); background: color-mix(in srgb, var(--cv-muted) 12%, transparent); }
/* connection & resize handles */
.cv-conn { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: var(--cv-card); border: 2px solid var(--cv-accent); opacity: 0; cursor: crosshair; transition: opacity .12s; z-index: 2; }
.cv-node:hover > .cv-conn, .cv-node.cv-sel > .cv-conn, .cv-board.cv-connecting .cv-node:hover > .cv-conn { opacity: 1; }
.cv-lod .cv-conn { display: none; }
.cv-conn:hover { transform: scale(1.25); background: var(--cv-accent); }
.cv-conn[data-conn=top] { left: 50%; top: 0; } .cv-conn[data-conn=bottom] { left: 50%; top: 100%; }
.cv-conn[data-conn=left] { left: 0; top: 50%; } .cv-conn[data-conn=right] { left: 100%; top: 50%; }
.cv-rs { position: absolute; z-index: 3; }
.cv-rs[data-resize=n], .cv-rs[data-resize=s] { left: 8px; right: 8px; height: 10px; cursor: ns-resize; }
.cv-rs[data-resize=e], .cv-rs[data-resize=w] { top: 8px; bottom: 8px; width: 10px; cursor: ew-resize; }
.cv-rs[data-resize=n] { top: -6px; } .cv-rs[data-resize=s] { bottom: -6px; } .cv-rs[data-resize=e] { right: -6px; } .cv-rs[data-resize=w] { left: -6px; }
.cv-rs[data-resize=ne], .cv-rs[data-resize=nw], .cv-rs[data-resize=se], .cv-rs[data-resize=sw] { width: 12px; height: 12px; }
.cv-rs[data-resize=nw] { left: -7px; top: -7px; cursor: nwse-resize; } .cv-rs[data-resize=se] { right: -7px; bottom: -7px; cursor: nwse-resize; }
.cv-rs[data-resize=ne] { right: -7px; top: -7px; cursor: nesw-resize; } .cv-rs[data-resize=sw] { left: -7px; bottom: -7px; cursor: nesw-resize; }
.cv-rs[data-resize=se]::after { content: ''; position: absolute; right: 5px; bottom: 5px; width: 7px; height: 7px; border-right: 2px solid var(--cv-accent); border-bottom: 2px solid var(--cv-accent); border-radius: 0 0 3px 0; }
/* edges */
.cv-edges { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none; }
.cv-edge-hit { stroke: transparent; stroke-width: 16; fill: none; pointer-events: stroke; cursor: pointer; }
.cv-edge-line { fill: none; stroke: var(--cv-edge); stroke-width: 2.5; stroke-linecap: round; }
.cv-edge-head { fill: var(--cv-edge); }
.cv-edge[data-color] .cv-edge-line { stroke: var(--cv-color); } .cv-edge[data-color] .cv-edge-head { fill: var(--cv-color); }
.cv-edge:hover .cv-edge-line { stroke-width: 3.5; }
.cv-edge.cv-sel .cv-edge-line { stroke: var(--cv-accent); stroke-width: 3.5; } .cv-edge.cv-sel .cv-edge-head { fill: var(--cv-accent); }
.cv-edge-end { fill: var(--cv-card); stroke: var(--cv-accent); stroke-width: 2.5; pointer-events: all; cursor: move; }
.cv-edge-label { position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); padding: 2px 8px; border-radius: 6px; font-size: 14px; white-space: pre; max-width: 320px;
  overflow: hidden; text-overflow: ellipsis; background: var(--cv-bg); color: var(--cv-text); cursor: pointer; }
.cv-edge-label.cv-sel { box-shadow: 0 0 0 2px var(--cv-accent); }
.cv-edge-label input { all: unset; min-width: 80px; text-align: center; user-select: text; -webkit-user-select: text; }
.cv-marquee { position: absolute; border: 1px solid var(--cv-accent); background: color-mix(in srgb, var(--cv-accent) 10%, transparent); pointer-events: none; }
.cv-lod .cv-detail { visibility: hidden; }
/* floating UI */
.cv-ui { background: var(--cv-ui); border: 1px solid var(--cv-ui-border); box-shadow: 0 4px 16px rgba(15,23,42,.12); border-radius: 10px; backdrop-filter: blur(6px); }
.cv-ui button { color: var(--cv-muted); }
.cv-ui button:hover:not(:disabled) { color: var(--cv-text); background: color-mix(in srgb, var(--cv-muted) 14%, transparent); }
.cv-ui button[aria-pressed=true] { color: var(--cv-accent); background: color-mix(in srgb, var(--cv-accent) 14%, transparent); }
.cv-ui button:disabled { opacity: .35; }
.cv-swatch { width: 20px; height: 20px; border-radius: 50%; border: 2px solid transparent; }
.cv-swatch[aria-pressed=true] { box-shadow: 0 0 0 2px var(--cv-ui), 0 0 0 4px var(--cv-accent); }
`;

let injected = false;
export function ensureCanvasStyles() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const el = document.createElement('style');
  el.dataset.cv = '';
  el.textContent = CSS;
  document.head.appendChild(el);
}
