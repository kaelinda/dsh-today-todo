    const WORKBENCH_STYLE = `
.dsh-wb-nav { display:flex; flex-wrap:wrap; align-items:center; gap:4px; flex:none; padding:12px 20px; border-bottom:1px solid var(--todo-border); background:var(--todo-bg); }
.dsh-wb-navButton { display:inline-flex; align-items:center; justify-content:center; gap:7px; min-height:38px; padding:7px 14px; border:1px solid transparent; border-radius:9px; background:transparent; color:var(--todo-muted); font:inherit; font-size:13px; cursor:pointer; }
.dsh-wb-navButton:hover { background:var(--todo-hover); color:var(--todo-text); }
.dsh-wb-navButton[aria-current=page] { background:var(--todo-tint); border-color:var(--todo-border); color:var(--todo-accent-text); font-weight:600; }
.dsh-wb-count { padding:0 5px; min-width:19px; border-radius:5px; background:var(--todo-surface); font-size:11px; font-variant-numeric:tabular-nums; }
.dsh-wb-stack { display:flex; flex-direction:column; gap:20px; }
.dsh-wb-stack h2 { margin:0 0 14px; font-size:16px; font-weight:600; line-height:1.5; }
.dsh-wb-stack h3 { margin:0 0 10px; font-size:14px; font-weight:600; }
.dsh-wb-card { min-width:0; padding:22px; border:1px solid var(--todo-border); border-radius:14px; background:var(--todo-surface); }
.dsh-wb-sectionHead { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px; }
.dsh-wb-sectionHead :is(h2,h3) { margin:0; }
.dsh-wb-form { display:flex; flex-direction:column; gap:16px; }
.dsh-wb-formGrid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px 16px; }
.dsh-wb-field { display:flex; flex-direction:column; align-items:stretch; gap:7px; min-width:0; }
.dsh-wb-label { color:var(--todo-text); font-size:12px; font-weight:550; }
.dsh-wb-wide { grid-column:1 / -1; }
.dsh-wb-hint { margin:4px 0; font-size:12px; line-height:1.7; color:var(--todo-muted); overflow-wrap:anywhere; }
.dsh-wb-field .dsh-wb-hint { margin:0; }
.dsh-todos-page :is(select,textarea) { font:inherit; }
.dsh-todos-page select.dsh-todos-input { min-height:38px; padding-right:24px; }
.dsh-todos-page textarea { resize:vertical; }
.dsh-wb-textarea { min-height:72px; line-height:1.7; }
.dsh-wb-actions { display:flex; flex-wrap:wrap; align-items:center; justify-content:flex-end; gap:8px; }
.dsh-wb-button { display:inline-flex; align-items:center; justify-content:center; gap:6px; min-height:36px; padding:7px 13px; border:1px solid var(--todo-border); border-radius:8px; background:var(--todo-bg); color:var(--todo-text); font-size:12px; line-height:1.4; cursor:pointer; }
.dsh-wb-button:hover:not(:disabled) { background:var(--todo-hover); border-color:var(--dsw-alias-border-l2); }
.dsh-wb-primary { background:var(--todo-accent-fill); border-color:var(--todo-accent-fill); color:var(--todo-on-accent); font-weight:550; }
.dsh-wb-primary:hover:not(:disabled) { background:var(--todo-accent-fill-hover); border-color:var(--todo-accent-fill-hover); }
.dsh-wb-empty { margin:0; padding:24px 4px; color:var(--todo-muted); font-size:13px; line-height:1.8; }
.dsh-wb-projectGrid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(210px,100%),1fr)); gap:12px; }
.dsh-wb-projectCard { display:flex; flex-direction:column; align-items:flex-start; gap:8px; min-width:0; min-height:100px; padding:18px; text-align:left; border:1px solid var(--todo-border); border-radius:12px; background:var(--todo-bg); color:var(--todo-text); font:inherit; cursor:pointer; }
.dsh-wb-projectCard strong { font-size:14px; overflow-wrap:anywhere; }
.dsh-wb-projectCard > span { font-size:12px; color:var(--todo-muted); line-height:1.6; white-space:pre-wrap; overflow-wrap:anywhere; }
.dsh-wb-projectCard[aria-pressed=true], .dsh-wb-documentCard[aria-pressed=true] { background:var(--todo-tint); border-color:var(--todo-accent); }
.dsh-wb-projectCard:hover:not(:disabled), .dsh-wb-documentCard:hover:not(:disabled) { border-color:var(--todo-accent); }
.dsh-wb-prose { margin:8px 0 12px; white-space:pre-wrap; overflow-wrap:anywhere; line-height:1.8; }
.dsh-wb-inline { display:flex; align-items:center; flex-wrap:wrap; gap:10px; }
.dsh-wb-inline > select { flex:1 1 190px; }
.dsh-wb-disclosure { margin-top:16px; border-top:1px solid var(--todo-border); padding-top:8px; }
.dsh-wb-disclosure > summary { padding-block:6px; width:fit-content; cursor:pointer; font-size:13px; color:var(--todo-accent-text); border-radius:4px; }
.dsh-wb-disclosure > summary:focus-visible { outline:2px solid var(--todo-focus-color); outline-offset:4px; }
.dsh-wb-disclosure[open] > summary { margin-bottom:10px; }
.dsh-wb-card.dsh-wb-disclosure { margin:0; padding:20px; }
.dsh-wb-timeline { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:0; }
.dsh-wb-timeline > li { min-width:0; padding:14px 0; border-bottom:1px solid var(--todo-border); overflow-wrap:anywhere; }
.dsh-wb-timeline > li:last-child { border-bottom:0; padding-bottom:0; }
.dsh-wb-timeline small, .dsh-wb-plainList small { display:block; color:var(--todo-muted); font-size:12px; line-height:1.7; margin-top:4px; }
.dsh-wb-meta { display:flex; flex-wrap:wrap; align-items:center; gap:6px 12px; color:var(--todo-muted); font-size:12px; }
.dsh-wb-badge { display:inline-flex; align-items:center; flex:none; padding:3px 7px; border:1px solid var(--todo-border); border-radius:6px; background:var(--todo-bg); color:var(--todo-muted); font-size:11px; line-height:1.5; }
.dsh-wb-link { display:block; width:fit-content; color:var(--todo-accent-text); overflow-wrap:anywhere; font-size:12px; }
.dsh-wb-plainList { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; }
.dsh-wb-plainList > li { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px 14px; min-width:0; padding:12px 0; border-bottom:1px solid var(--todo-border); }
.dsh-wb-plainList > li:last-child { border-bottom:0; }
.dsh-wb-plainList > li > span:first-child { flex:1 1 180px; min-width:0; overflow-wrap:anywhere; }
.dsh-wb-taskFields { padding-bottom:16px; border-bottom:1px solid var(--todo-border); }
.dsh-wb-scope { min-width:0; margin:0; padding:14px 16px; border:1px solid var(--todo-border); border-radius:10px; }
.dsh-wb-scope legend { padding:0 6px; color:var(--todo-muted); font-size:12px; }
.dsh-wb-checks { display:flex; flex-wrap:wrap; gap:8px 18px; margin-top:8px; }
.dsh-wb-checkLabel { display:inline-flex; align-items:center; gap:8px; min-height:32px; font-size:13px; cursor:pointer; overflow-wrap:anywhere; }
.dsh-wb-checkLabel input, .dsh-wb-taskChoice input { flex:none; width:16px; height:16px; margin:0; accent-color:var(--todo-accent); }
.dsh-wb-checkLabel input:focus-visible, .dsh-wb-taskChoice input:focus-visible { outline:2px solid var(--todo-focus-color); outline-offset:3px; }
.dsh-wb-capacity { display:flex; flex-wrap:wrap; align-items:baseline; gap:7px 16px; padding:14px 16px; border:1px solid var(--todo-border); border-radius:10px; background:var(--todo-tint); font-size:12px; }
.dsh-wb-capacity strong { color:var(--todo-text); font-size:16px; font-variant-numeric:tabular-nums; }
.dsh-wb-capacity span { color:var(--todo-muted); }
.dsh-wb-capacity p { flex-basis:100%; margin:4px 0 0; }
.dsh-wb-warning { padding:12px 14px; border:1px solid color-mix(in srgb,var(--dsw-alias-state-warn-primary) 45%,var(--todo-border)); border-radius:9px; color:var(--todo-text); background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 9%,var(--todo-bg)); font-size:12px; line-height:1.7; overflow-wrap:anywhere; }
.dsh-wb-taskChoices { display:flex; flex-direction:column; max-height:330px; overflow:auto; padding:3px; gap:2px; }
.dsh-wb-taskChoice { display:flex; align-items:center; gap:12px; min-height:52px; padding:9px 6px; border-radius:7px; cursor:pointer; }
.dsh-wb-taskChoice:hover { background:var(--todo-hover); }
.dsh-wb-taskChoice > span:nth-child(2) { flex:1; min-width:0; font-size:13px; overflow-wrap:anywhere; }
.dsh-wb-taskChoice small { display:block; font-size:11px; color:var(--todo-muted); margin-top:3px; }
.dsh-wb-taskChoice > span:last-child { flex:none; }
.dsh-wb-subnav { align-self:flex-start; }
.dsh-wb-documentList { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr)); gap:10px; }
.dsh-wb-documentCard { display:flex; flex-direction:column; align-items:flex-start; gap:8px; min-width:0; padding:16px; border:1px solid var(--todo-border); border-radius:10px; background:var(--todo-bg); color:var(--todo-text); text-align:left; cursor:pointer; }
.dsh-wb-documentCard strong { max-width:100%; font-size:14px; line-height:1.6; overflow-wrap:anywhere; }
.dsh-wb-documentCard > span { font-size:12px; color:var(--todo-muted); }
.dsh-wb-documentContent { min-height:360px; max-width:100%; font-family:ui-monospace,SFMono-Regular,Consolas,monospace !important; line-height:1.8; font-size:13px; tab-size:2; }
.dsh-wb-editor > .dsh-wb-actions { margin-top:14px; }
.dsh-wb-versionPreview { margin-top:12px; }
.dsh-wb-versionPreview pre { max-height:300px; overflow:auto; padding:14px; border:1px solid var(--todo-border); border-radius:8px; background:var(--todo-bg); white-space:pre-wrap; overflow-wrap:anywhere; font-size:12px; line-height:1.8; }
.dsh-wb-actionSection { margin-top:22px; padding-top:20px; border-top:1px solid var(--todo-border); }
.dsh-wb-actionSection > .dsh-wb-form { margin-top:16px; }
.dsh-wb-runPreview { margin:0; padding-left:22px; font-size:12px; line-height:1.8; }
.dsh-wb-runPreview li { padding:6px 0; }
.dsh-wb-runPreview span { display:block; color:var(--todo-muted); }
.dsh-wb-todaySummary { padding:16px; margin:22px 0; border:1px solid var(--todo-border); border-radius:12px; background:color-mix(in srgb,var(--todo-surface) 70%,transparent); text-align:left; }
.dsh-wb-todaySummary .dsh-wb-capacity { background:transparent; padding:0; border:0; }
.dsh-wb-todaySummary .dsh-wb-actions { margin-top:12px; }
.dsh-wb-archiveList { display:flex; flex-direction:column; gap:8px; margin-top:18px; }
.dsh-wb-archiveItem { padding:16px; border:1px solid var(--todo-border); border-radius:10px; background:var(--todo-surface); }
.dsh-wb-taskFilters { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:14px 0; }
.dsh-wb-taskFilters > label { flex:1 1 180px; max-width:320px; }
/* Nav: one pill that travels to the current view. */
.dsh-wb-nav { position:relative; }
.dsh-wb-navButton { position:relative; z-index:1; }
.dsh-wb-navIndicator { position:absolute; left:0; top:0; z-index:0; width:var(--nav-w,0); height:var(--nav-h,0); transform:translate(var(--nav-x,0),var(--nav-y,0)); border:1px solid var(--todo-border); border-radius:9px; background:var(--todo-tint); opacity:0; pointer-events:none; transition:transform .28s cubic-bezier(.2,.8,.2,1), width .28s cubic-bezier(.2,.8,.2,1), height .28s, opacity .18s; }
.dsh-wb-nav[data-nav-ready] .dsh-wb-navIndicator { opacity:1; }
.dsh-wb-nav[data-nav-instant] .dsh-wb-navIndicator { transition:none; }
.dsh-wb-nav[data-nav-ready] .dsh-wb-navButton[aria-current=page] { background:transparent; border-color:transparent; }

/* Data scenes: the canvas is decoration; HTML beside it carries the meaning. */
.dsh-wb-scene { position:relative; overflow:hidden; }
.dsh-wb-scene > canvas { position:absolute; inset:0; width:100% !important; height:100% !important; display:block; }
.dsh-wb-scene[data-renderer=fallback] { display:none; }
.dsh-wb-sceneLayer { position:absolute; inset:0; pointer-events:none; }
.dsh-wb-card.dsh-wb-orbitCard { padding:0; overflow:hidden; }
.dsh-wb-orbit { height:280px; touch-action:pan-y; cursor:grab; }
.dsh-wb-orbit[data-hovering] { cursor:pointer; }
.dsh-wb-orbit[data-dragging] { cursor:grabbing; }
.dsh-wb-sceneTip { position:absolute; left:0; top:0; display:flex; flex-direction:column; gap:2px; max-width:220px; padding:8px 10px; border:1px solid var(--todo-border); border-radius:8px; background:var(--todo-bg); box-shadow:0 6px 18px rgb(0 0 0 / .10); font-size:12px; color:var(--todo-muted); opacity:0; transition:opacity .15s; will-change:transform; }
.dsh-wb-sceneTip strong { color:var(--todo-text); font-size:13px; overflow-wrap:anywhere; }
.dsh-wb-sceneTip[data-visible] { opacity:1; }
.dsh-wb-sceneLegend { margin:0; padding:10px 18px 14px; border-top:1px solid var(--todo-border); font-size:12px; color:var(--todo-muted); }
.dsh-wb-projectMeta { margin-top:auto; font-size:11px; color:var(--todo-muted); font-variant-numeric:tabular-nums; }
.dsh-wb-projectCard.is-linked { border-color:var(--todo-accent); }
.dsh-wb-capacityRing { flex-wrap:nowrap; align-items:center; gap:16px; }
.dsh-wb-capacityText { display:flex; flex-wrap:wrap; align-items:baseline; gap:7px 16px; min-width:0; }
.dsh-wb-ring { flex:none; width:112px; height:112px; }
.dsh-wb-ringValue { position:absolute; inset:0; display:grid; place-items:center; font-size:15px; font-weight:600; color:var(--todo-text); font-variant-numeric:tabular-nums; }
.dsh-wb-ringReadout { flex-basis:100%; min-width:0; color:var(--todo-text) !important; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dsh-wb-taskChoice.is-linked { background:var(--todo-hover); }
.dsh-wb-activityCard .dsh-wb-hint { margin:-8px 0 12px; font-size:12px; color:var(--todo-muted); }
.dsh-wb-terrain { height:260px; margin:0 -8px; cursor:pointer; touch-action:pan-y; }
.dsh-wb-sceneReadout { min-height:1.6em; margin:8px 0 12px; font-size:12px; color:var(--todo-muted); font-variant-numeric:tabular-nums; }
.dsh-wb-dayRow { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:6px; }
.dsh-wb-dayButton { position:relative; display:flex; flex-direction:column; align-items:center; gap:2px; min-height:56px; padding:8px 2px 10px; border:1px solid var(--todo-border); border-radius:9px; background:var(--todo-bg); color:var(--todo-muted); font:inherit; font-size:11px; cursor:pointer; overflow:hidden; }
.dsh-wb-dayButton strong { color:var(--todo-text); font-size:15px; font-variant-numeric:tabular-nums; }
.dsh-wb-dayButton[data-today] strong { color:var(--todo-accent-text); }
.dsh-wb-dayButton:hover, .dsh-wb-dayButton.is-linked { border-color:var(--todo-accent); background:var(--todo-tint); }
.dsh-wb-dayLevel { position:absolute; left:0; right:0; bottom:0; height:3px; background:var(--todo-accent); transform:scaleX(var(--level,0)); transform-origin:left; opacity:.7; }

/* Motion: short, purposeful, and fully off under reduced motion. */
@keyframes dsh-wb-rise { from { opacity:0; transform:translateY(8px); } }
@keyframes dsh-wb-pop { 0% { opacity:0; transform:scale(.96); } 100% { opacity:1; transform:none; } }
@keyframes dsh-wb-flash { 0% { box-shadow:0 0 0 0 color-mix(in srgb, var(--todo-accent) 35%, transparent); } 100% { box-shadow:0 0 0 10px transparent; } }
.dsh-wb-stack > * { animation:dsh-wb-rise .32s cubic-bezier(.2,.8,.2,1) both; }
.dsh-wb-stack > :nth-child(2) { animation-delay:.04s; }
.dsh-wb-stack > :nth-child(3) { animation-delay:.08s; }
.dsh-wb-stack > :nth-child(n+4) { animation-delay:.12s; }
.dsh-wb-timeline > li, .dsh-wb-plainList > li { animation:dsh-wb-rise .26s cubic-bezier(.2,.8,.2,1) both; }
.dsh-wb-disclosure[open] > :not(summary) { animation:dsh-wb-rise .22s cubic-bezier(.2,.8,.2,1) both; }
.dsh-wb-actions [role=status], .dsh-wb-capacity [role=status] { animation:dsh-wb-pop .2s ease-out both; }
.dsh-wb-flash { animation:dsh-wb-flash .8s ease-out; }
.dsh-wb-projectCard, .dsh-wb-documentCard, .dsh-wb-dayButton { transition:transform .2s cubic-bezier(.2,.8,.2,1), box-shadow .2s, border-color .18s, background .18s; }
@media (hover:hover) {
  .dsh-wb-projectCard:hover:not(:disabled), .dsh-wb-projectCard.is-linked, .dsh-wb-documentCard:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 6px 16px -8px color-mix(in srgb, var(--todo-text) 30%, transparent); }
}
.dsh-todos-page .dsh-wb-projectCard:active:not(:disabled), .dsh-todos-page .dsh-wb-documentCard:active:not(:disabled) { transform:scale(.985); transition-duration:.08s; }
.dsh-todos-page button:active:not(:disabled):not(.dsh-wb-projectCard):not(.dsh-wb-documentCard) { transform:scale(.97); }
@container todos (max-width:600px) {
  .dsh-wb-orbit { height:220px; }
  .dsh-wb-terrain { height:200px; }
  .dsh-wb-ring { width:96px; height:96px; }
  .dsh-wb-dayRow { gap:4px; }
  .dsh-wb-dayButton { min-height:52px; }
  .dsh-wb-nav { padding:8px 10px; gap:3px; justify-content:space-between; }
  .dsh-wb-navButton { flex:1; padding:8px 6px; gap:4px; font-size:12px; }
  .dsh-wb-count { font-size:10px; padding:0 3px; min-width:16px; }
  .dsh-wb-card { padding:16px; }
  .dsh-wb-formGrid { grid-template-columns:1fr; }
  .dsh-wb-wide { grid-column:auto; }
  .dsh-wb-actions { gap:8px; }
  .dsh-wb-scope { padding:12px; }
  .dsh-wb-taskChoice { gap:8px; }
  .dsh-wb-taskChoice > span:last-child { max-width:84px; text-align:right; }
  .dsh-wb-documentContent { font-size:14px; }
  .dsh-wb-todaySummary { padding:12px; }
  .dsh-wb-stack .dsh-todos-input { font-size:16px; }
}
`;
