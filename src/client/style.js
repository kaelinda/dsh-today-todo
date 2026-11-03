    /** Theme-aware panel styles, scoped to the plugin and its available width. */
    const STYLE = `
.dsh-todos-page {
  --todo-bg: var(--dsw-alias-bg-base);
  --todo-surface: var(--dsw-alias-bg-layer-1, var(--todo-bg));
  --todo-hover: var(--dsw-alias-interactive-bg-hover);
  --todo-text: var(--dsw-alias-label-primary);
  --todo-muted: var(--dsw-alias-label-secondary);
  --todo-border: var(--dsw-alias-border-l3);
  --todo-accent: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary));
  --todo-tint: color-mix(in srgb, var(--todo-accent) 7%, var(--todo-bg));
  --todo-accent-text: color-mix(in srgb, var(--todo-accent) 65%, var(--todo-text));
  width:100%; min-width:0; height:100%; min-height:0; display:flex; overflow:hidden;
  color:var(--todo-text); background:var(--todo-bg);
  font-family:inherit; font-size:14px; line-height:1.6; container:todos / inline-size;
  -webkit-font-smoothing:antialiased;
}
.dsh-todos-page *, .dsh-todos-page *::before, .dsh-todos-page *::after { box-sizing:border-box; }
.dsh-todos-page button, .dsh-todos-page input { font-family:inherit; }
.dsh-todos-page button { touch-action:manipulation; transition:background .18s, color .18s, border-color .18s, opacity .18s; }
.dsh-todos-page button:disabled { cursor:default; opacity:.45; }
.dsh-todos-page button:active:not(:disabled) { opacity:.72; }
.dsh-todos-page svg { flex-shrink:0; }
.dsh-todos-pane { flex:1; min-width:0; min-height:0; display:flex; flex-direction:column; }
.dsh-todos-scroll { flex:1; min-height:0; overflow:auto; scrollbar-gutter:stable; --dsh-scrollbar-width:9px; --dsh-scrollbar-thumb-border:2px; }
.dsh-todos-content { width:100%; max-width:940px; margin:0 auto; padding:48px 40px 32px; }
.dsh-todos-matrixPage .dsh-todos-content { max-width:1160px; }
[data-platform=darwin] .dsh-todos-content { padding-top:calc(48px + var(--dsh-frame-top-clearance,0px)); }
.dsh-todos-heading { display:flex; align-items:center; justify-content:space-between; gap:24px; margin-bottom:28px; }
.dsh-todos-headingCopy { min-width:0; }
.dsh-todos-eyebrow { display:flex; align-items:center; gap:8px; margin:0 0 12px; color:var(--todo-muted); font-size:12px; font-weight:500; letter-spacing:.12em; }
.dsh-todos-heading h1 { margin:0; font-size:30px; font-weight:650; line-height:1.3; letter-spacing:-.035em; }
.dsh-todos-subtitle { margin:10px 0 0; color:var(--todo-muted); font-size:13px; }
.dsh-todos-viewSwitch { flex:none; display:inline-flex; align-items:center; gap:4px; padding:4px; border:1px solid var(--todo-border); border-radius:12px; background:var(--todo-surface); }
.dsh-todos-viewButton { display:inline-flex; align-items:center; justify-content:center; gap:6px; min-height:34px; padding:0 12px; border:1px solid transparent; border-radius:8px; background:transparent; color:var(--todo-muted); font-size:12px; cursor:pointer; white-space:nowrap; }
.dsh-todos-viewButton:hover { color:var(--todo-text); background:var(--todo-hover); }
.dsh-todos-viewButton[aria-pressed=true] { color:var(--todo-text); background:var(--todo-bg); border-color:var(--todo-border); font-weight:600; }
.dsh-todos-focusCard { display:flex; align-items:center; gap:16px; width:100%; padding:18px 20px; margin:0 0 28px; border:1px solid color-mix(in srgb,var(--todo-accent) 18%,var(--todo-border)); border-radius:16px; background:var(--todo-tint); color:var(--todo-accent-text); text-align:left; cursor:pointer; }
.dsh-todos-focusCard:hover { background:color-mix(in srgb,var(--todo-accent) 11%,var(--todo-bg)); border-color:color-mix(in srgb,var(--todo-accent) 40%,var(--todo-border)); }
.dsh-todos-focusIcon { display:grid; place-items:center; flex:none; width:44px; height:44px; border:1px solid color-mix(in srgb,var(--todo-accent) 18%,transparent); border-radius:13px; background:var(--todo-bg); }
.dsh-todos-focusIcon svg { width:22px; height:22px; }
.dsh-todos-focusCopy { display:flex; flex:1; min-width:0; flex-direction:column; gap:3px; }
.dsh-todos-focusCopy strong { font-size:14px; font-weight:600; color:var(--todo-text); }
.dsh-todos-focusCopy > span { font-size:12px; color:var(--todo-muted); }
.dsh-todos-focusTime { display:flex; align-items:center; gap:6px; padding:5px 10px; font-size:12px; font-variant-numeric:tabular-nums; border:1px solid color-mix(in srgb,var(--todo-accent) 20%,transparent); border-radius:8px; }
.dsh-todos-addRow { margin:0 0 26px; }
.dsh-todos-addLabel { display:block; margin:0 0 9px; color:var(--todo-muted); font-size:12px; font-weight:500; }
.dsh-todos-addField { display:flex; align-items:center; gap:12px; min-height:56px; padding:7px 8px 7px 16px; border:1px solid var(--dsw-alias-border-l2); border-radius:12px; background:var(--todo-bg); transition:border-color .18s, box-shadow .18s; }
.dsh-todos-addField:hover { border-color:color-mix(in srgb,var(--todo-accent) 40%,var(--todo-border)); }
.dsh-todos-addField:focus-within { border-color:var(--todo-accent); box-shadow:0 0 0 3px color-mix(in srgb,var(--todo-accent) 12%,transparent); }
.dsh-todos-addInput { flex:1; min-width:0; padding:6px 0; border:none; background:transparent; color:var(--todo-text); font-size:14px; line-height:24px; outline:none; }
.dsh-todos-addInput::placeholder, .dsh-todos-input::placeholder, .dsh-todos-tagInput::placeholder { color:var(--todo-muted); opacity:.85; }
.dsh-todos-addButton { flex:none; display:flex; align-items:center; justify-content:center; gap:6px; min-height:40px; padding:0 14px; border:none; border-radius:8px; background:var(--todo-accent); color:var(--dsw-alias-label-primary-inverted,#fff); font-size:13px; font-weight:600; cursor:pointer; }
.dsh-todos-addButton:hover:not(:disabled) { background:color-mix(in srgb,var(--todo-accent) 88%,var(--todo-text)); }
.dsh-todos-page .dsh-todos-addButton:disabled { opacity:1; background:var(--todo-hover); color:var(--todo-muted); }
.dsh-todos-toolbar { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; padding-bottom:12px; border-bottom:1px solid var(--todo-border); }
.dsh-todos-scopeTabs { display:flex; flex-wrap:wrap; align-items:center; gap:4px; }
.dsh-todos-scopeTab { display:inline-flex; align-items:center; gap:7px; min-height:36px; padding:0 12px; border:1px solid transparent; border-radius:8px; background:transparent; color:var(--todo-muted); font-size:13px; cursor:pointer; white-space:nowrap; }
.dsh-todos-scopeTab:hover { background:var(--todo-hover); color:var(--todo-text); }
.dsh-todos-scopeTab[aria-pressed=true] { background:var(--todo-tint); color:var(--todo-accent-text); border-color:color-mix(in srgb,var(--todo-accent) 20%,transparent); font-weight:600; }
.dsh-todos-scopeCount { display:inline-grid; place-items:center; min-width:19px; height:20px; padding:0 4px; border-radius:5px; background:var(--todo-surface); font-size:12px; font-variant-numeric:tabular-nums; }
.dsh-todos-scopeTab[aria-pressed=true] .dsh-todos-scopeCount { background:color-mix(in srgb,var(--todo-accent) 12%,var(--todo-bg)); }
.dsh-todos-filterButton { display:inline-flex; align-items:center; justify-content:center; gap:6px; min-height:34px; padding:0 10px; border:1px solid var(--todo-border); border-radius:8px; background:transparent; color:var(--todo-muted); font-size:12px; cursor:pointer; }
.dsh-todos-filterButton:hover, .dsh-todos-filterButtonOn { background:var(--todo-tint); color:var(--todo-accent-text); border-color:color-mix(in srgb,var(--todo-accent) 30%,var(--todo-border)); }
.dsh-todos-filterBadge { min-width:18px; height:18px; padding:0 4px; border-radius:5px; background:var(--todo-accent); color:var(--dsw-alias-label-primary-inverted,#fff); font-size:12px; text-align:center; }
.dsh-todos-filterPanel { display:flex; flex-direction:column; gap:14px; margin-top:12px; padding:16px; border:1px solid var(--todo-border); border-radius:12px; background:var(--todo-surface); animation:dsh-todos-panel-in .18s ease; }
.dsh-todos-filterRow, .dsh-todos-detailRow { display:flex; align-items:flex-start; gap:16px; }
.dsh-todos-filterLabel, .dsh-todos-detailLabel { flex:0 0 56px; font-size:12px; line-height:32px; color:var(--todo-muted); }
.dsh-todos-filterChips { flex:1; min-width:0; display:flex; flex-wrap:wrap; gap:6px; }
.dsh-todos-filterChip { display:inline-flex; align-items:center; gap:6px; min-height:30px; padding:0 10px; border:1px solid transparent; border-radius:7px; background:transparent; color:var(--todo-muted); font-size:12px; cursor:pointer; }
.dsh-todos-filterChip:hover { background:var(--todo-hover); }
.dsh-todos-filterChip[aria-pressed=true] { background:var(--todo-bg); border-color:var(--todo-accent); color:var(--todo-accent-text); }
.dsh-todos-filterChipCount { font-size:12px; font-variant-numeric:tabular-nums; }
.dsh-todos-filterFoot { display:flex; justify-content:flex-end; }
.dsh-todos-groups { padding-top:20px; }
.dsh-todos-groupHeading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; padding:0 2px; }
.dsh-todos-groupHeading h2, .dsh-todos-groupLabel { display:flex; align-items:center; gap:8px; margin:0; font-size:12px; font-weight:600; color:var(--todo-muted); }
.dsh-todos-groupHeading h2 span { font-size:12px; font-weight:400; }
.dsh-todos-sortHint { font-size:12px; color:var(--todo-muted); }
.dsh-todos-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px; }
.dsh-todos-item { min-width:0; border:1px solid var(--todo-border); border-radius:12px; background:var(--todo-bg); transition:border-color .18s, background .18s; }
.dsh-todos-item:hover { border-color:var(--dsw-alias-border-l2); background:var(--todo-surface); }
.dsh-todos-itemExpanded { background:var(--todo-surface); border-color:color-mix(in srgb,var(--todo-accent) 38%,var(--todo-border)); }
.dsh-todos-row { display:flex; align-items:flex-start; gap:12px; min-height:66px; padding:12px; }
.dsh-todos-row .dsh-todos-check { margin-top:2px; }
.dsh-todos-check, .dsh-todos-zenCheck { position:relative; flex:none; width:22px; height:22px; padding:0; display:inline-flex; align-items:center; justify-content:center; border:1.5px solid var(--dsw-alias-border-l2); border-radius:7px; background:var(--todo-bg); color:transparent; cursor:pointer; }
.dsh-todos-check::before, .dsh-todos-zenCheck::before { content:''; position:absolute; inset:-11px; }
.dsh-todos-check:hover { border-color:var(--todo-accent); }
.dsh-todos-check[aria-checked=true] { color:var(--dsw-alias-label-primary-inverted,#fff); background:var(--todo-accent); border-color:var(--todo-accent); }
.dsh-todos-rowContent { flex:1; min-width:0; }
.dsh-todos-rowTitle { display:block; max-width:100%; padding:0; border:0; border-radius:3px; background:transparent; color:var(--todo-text); font:inherit; font-size:14px; line-height:1.65; text-align:left; overflow-wrap:anywhere; cursor:pointer; }
.dsh-todos-rowTitle:hover { color:var(--todo-accent-text); }
.dsh-todos-rowDone .dsh-todos-rowTitle { color:var(--todo-muted); text-decoration:line-through; text-decoration-color:var(--dsw-alias-border-l2); }
.dsh-todos-rowDone .dsh-todos-rowMeta { opacity:.75; }
.dsh-todos-rowMeta { display:flex; flex-wrap:wrap; align-items:center; gap:4px 8px; margin-top:5px; color:var(--todo-muted); font-size:12px; }
.dsh-todos-priorityLabel { display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:500; }
.dsh-todos-dot { flex:none; width:6px; height:6px; border-radius:50%; }
.dsh-todos-dotP0 { background:var(--dsw-alias-state-error-primary); }
.dsh-todos-dotP1 { background:var(--dsw-alias-state-warn-primary); }
.dsh-todos-dotP2 { background:var(--todo-accent); }
.dsh-todos-dotP3 { background:var(--dsw-alias-state-success-primary); }
.dsh-todos-todayMark { display:inline-flex; align-items:center; gap:4px; color:var(--todo-accent-text); font-size:12px; }
.dsh-todos-todayMark svg { width:12px; height:12px; }
.dsh-todos-staleDay { font-size:12px; }
.dsh-todos-tagChip { max-width:100%; padding:1px 5px; border:0; border-radius:4px; background:var(--todo-surface); color:var(--todo-muted); font-size:12px; line-height:20px; overflow-wrap:anywhere; cursor:pointer; }
.dsh-todos-tagChip:hover, .dsh-todos-tagChip[aria-pressed=true] { background:var(--todo-tint); color:var(--todo-accent-text); }
.dsh-todos-sessionLink { display:inline-flex; align-items:center; gap:3px; max-width:200px; min-width:0; padding:0; border:0; border-radius:4px; color:var(--todo-muted); background:transparent; font-size:12px; cursor:pointer; }
.dsh-todos-sessionLink span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dsh-todos-sessionLink:hover { color:var(--todo-accent-text); }
.dsh-todos-rowActions, .dsh-todos-rowActionsMore { flex:none; display:flex; align-items:center; gap:4px; }
.dsh-todos-rowActions { margin-top:-3px; }
.dsh-todos-rowActionsMore { opacity:0; transition:opacity .18s; }
.dsh-todos-row:hover .dsh-todos-rowActionsMore, .dsh-todos-row:focus-within .dsh-todos-rowActionsMore { opacity:1; }
.dsh-todos-rowIcon, .dsh-todos-rowToggle, .dsh-todos-iconButton { flex:none; display:inline-flex; align-items:center; justify-content:center; width:30px; height:32px; padding:0; border:0; border-radius:7px; background:transparent; color:var(--todo-muted); cursor:pointer; }
.dsh-todos-rowIcon:hover, .dsh-todos-rowToggle:hover, .dsh-todos-iconButton:hover { background:var(--todo-hover); color:var(--todo-text); }
.dsh-todos-rowIcon[aria-pressed=true], .dsh-todos-rowToggle[aria-expanded=true] { color:var(--todo-accent-text); background:var(--todo-tint); }
.dsh-todos-doneGroup { margin-top:24px; }
.dsh-todos-groupLabel { margin:0 0 10px 2px; }
.dsh-todos-details, .dsh-todos-picker { display:flex; flex-direction:column; gap:16px; margin:0 12px 12px 46px; padding:18px; border:1px solid var(--todo-border); border-radius:10px; background:var(--todo-surface); animation:dsh-todos-panel-in .18s ease; }
.dsh-todos-detailBody { flex:1; min-width:0; display:flex; flex-direction:column; gap:8px; }
.dsh-todos-optionRow, .dsh-todos-tagEditRow { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
.dsh-todos-option, .dsh-todos-chip, .dsh-todos-linkButton { display:inline-flex; align-items:center; justify-content:center; gap:6px; min-height:32px; max-width:100%; padding:4px 10px; border:1px solid var(--todo-border); border-radius:7px; background:var(--todo-bg); color:var(--todo-muted); font-size:12px; cursor:pointer; }
.dsh-todos-option:hover, .dsh-todos-chip:hover, .dsh-todos-linkButton:hover { border-color:var(--dsw-alias-border-l2); background:var(--todo-hover); }
.dsh-todos-option[aria-pressed=true] { background:var(--todo-tint); border-color:var(--todo-accent); color:var(--todo-accent-text); font-weight:600; }
.dsh-todos-chipName { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dsh-todos-quadrantGrid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; max-width:440px; }
.dsh-todos-quadrantOption { display:flex; flex-direction:column; align-items:flex-start; gap:3px; padding:8px 12px; border:1px solid var(--todo-border); border-radius:8px; background:var(--todo-bg); color:var(--todo-muted); font:inherit; text-align:left; cursor:pointer; }
.dsh-todos-quadrantOption:hover { border-color:var(--dsw-alias-border-l2); }
.dsh-todos-quadrantOption[aria-pressed=true] { background:var(--todo-tint); color:var(--todo-accent-text); border-color:var(--todo-accent); }
.dsh-todos-quadrantKey { font-size:12px; font-weight:600; }
.dsh-todos-quadrantText { font-size:12px; }
.dsh-todos-tagEdit { display:inline-flex; align-items:center; gap:6px; max-width:100%; padding:2px 4px 2px 8px; border-radius:6px; background:var(--todo-bg); border:1px solid var(--todo-border); color:var(--todo-muted); font-size:12px; overflow-wrap:anywhere; }
.dsh-todos-tagRemove { flex:none; display:grid; place-items:center; width:26px; height:26px; padding:0; border:0; border-radius:4px; background:transparent; color:var(--todo-muted); font-size:16px; cursor:pointer; }
.dsh-todos-tagRemove:hover { background:var(--todo-hover); }
.dsh-todos-input, .dsh-todos-tagInput { min-width:0; width:100%; min-height:36px; padding:6px 10px; border:1px solid var(--dsw-alias-border-l2); border-radius:7px; background:var(--todo-bg); color:var(--todo-text); font-size:13px; outline:none; }
.dsh-todos-input:focus, .dsh-todos-tagInput:focus { border-color:var(--todo-accent); }
.dsh-todos-tagInput { flex:1 1 180px; }
.dsh-todos-detailHint { margin:0; font-size:12px; line-height:1.7; color:var(--todo-muted); }
.dsh-todos-detailActions { display:flex; justify-content:flex-end; gap:8px; padding-top:10px; border-top:1px solid var(--todo-border); }
.dsh-todos-textButton { display:inline-flex; align-items:center; justify-content:center; gap:6px; min-height:32px; padding:4px 8px; border:0; border-radius:6px; background:transparent; color:var(--todo-muted); font-size:12px; cursor:pointer; }
.dsh-todos-textButton:hover:not(:disabled) { background:var(--todo-hover); color:var(--todo-text); }
.dsh-todos-textButton.dsh-todos-danger { color:var(--dsw-alias-state-error-primary); }
.dsh-todos-pickerHead { display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:13px; font-weight:600; }
.dsh-todos-pickerList { display:flex; flex-direction:column; gap:4px; max-height:240px; overflow:auto; }
.dsh-todos-pickerItem { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:4px 12px; min-height:40px; padding:8px; border:0; border-radius:6px; background:transparent; color:var(--todo-text); font-size:13px; text-align:left; cursor:pointer; }
.dsh-todos-pickerItem:hover { background:var(--todo-hover); }
.dsh-todos-pickerName { overflow-wrap:anywhere; }
.dsh-todos-pickerId { font-size:12px; color:var(--todo-muted); }
.dsh-todos-pickerEmpty { margin:0; color:var(--todo-muted); font-size:13px; }
.dsh-todos-matrix { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; align-items:start; margin-top:20px; }
.dsh-todos-matrixCell { --quadrant-accent:var(--todo-accent); min-width:0; padding:16px; border:1px solid var(--todo-border); border-top:3px solid var(--quadrant-accent); border-radius:12px; background:var(--todo-surface); }
.dsh-todos-matrixCell[data-quadrant=q1] { --quadrant-accent:var(--dsw-alias-state-error-primary); }
.dsh-todos-matrixCell[data-quadrant=q2] { --quadrant-accent:var(--todo-accent); }
.dsh-todos-matrixCell[data-quadrant=q3] { --quadrant-accent:var(--dsw-alias-state-warn-primary); }
.dsh-todos-matrixCell[data-quadrant=q4] { --quadrant-accent:var(--dsw-alias-state-success-primary); }
.dsh-todos-matrixCellWide { grid-column:1 / -1; border-top:1px solid var(--todo-border); }
.dsh-todos-matrixHead { display:flex; align-items:center; gap:8px; }
.dsh-todos-matrixHead h2 { margin:0; font-size:13px; font-weight:600; }
.dsh-todos-matrixKey { display:grid; place-items:center; width:28px; height:26px; border-radius:6px; color:var(--todo-text); background:color-mix(in srgb,var(--quadrant-accent) 12%,var(--todo-bg)); font-size:12px; font-weight:600; }
.dsh-todos-matrixCount { margin-left:auto; color:var(--todo-muted); font-size:12px; font-variant-numeric:tabular-nums; }
.dsh-todos-matrixHint { margin:6px 0 16px; color:var(--todo-muted); font-size:12px; }
.dsh-todos-matrixCellWide .dsh-todos-matrixHead { margin-bottom:12px; }
.dsh-todos-matrix .dsh-todos-rowActionsMore { display:none; }
.dsh-todos-matrix .dsh-todos-row { gap:10px; padding:10px; }
.dsh-todos-matrix .dsh-todos-details, .dsh-todos-matrix .dsh-todos-picker { margin:0 8px 8px; padding:12px; }
.dsh-todos-matrix .dsh-todos-detailRow { flex-direction:column; gap:6px; }
.dsh-todos-matrix .dsh-todos-detailLabel { flex-basis:auto; line-height:1.6; }
.dsh-todos-matrix .dsh-todos-detailBody { width:100%; }
.dsh-todos-quadrantEmpty { margin:0; padding:24px 8px; border:1px dashed var(--todo-border); border-radius:8px; color:var(--todo-muted); text-align:center; font-size:12px; }
.dsh-todos-empty { display:flex; flex-direction:column; align-items:center; padding:56px 24px; text-align:center; }
.dsh-todos-emptyIcon { display:grid; place-items:center; width:64px; height:64px; margin-bottom:20px; border:1px solid var(--todo-border); border-radius:20px; background:var(--todo-surface); color:var(--todo-accent-text); }
.dsh-todos-empty h2 { margin:0 0 8px; font-size:17px; font-weight:600; }
.dsh-todos-empty p { max-width:40ch; margin:0 0 16px; color:var(--todo-muted); font-size:13px; }
.dsh-todos-notice { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; margin:0 0 16px; padding:12px; border:1px solid var(--todo-border); border-radius:10px; background:var(--todo-surface); color:var(--todo-muted); font-size:13px; overflow-wrap:anywhere; }
.dsh-todos-noticeError { color:var(--dsw-alias-state-error-primary); }
.dsh-todos-loading { padding-top:16px; color:var(--todo-muted); font-size:13px; }
.dsh-todos-skeleton { height:66px; margin:8px 0; border:1px solid var(--todo-border); border-radius:12px; background:var(--todo-surface); animation:dsh-todos-loading 1.4s ease-in-out infinite alternate; }
.dsh-todos-foot { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; margin-top:28px; padding-top:16px; border-top:1px solid var(--todo-border); color:var(--todo-muted); font-size:12px; }
.dsh-todos-footHint { display:flex; align-items:center; gap:6px; }
.dsh-todos-focusable:focus-visible { outline:2px solid var(--dsw-focus-ring-color,var(--todo-accent)); outline-offset:3px; }
@keyframes dsh-todos-panel-in { from { opacity:0; transform:translateY(-3px); } to { opacity:1; transform:none; } }
@keyframes dsh-todos-loading { from { opacity:.45; } to { opacity:1; } }

/* Today and the persistent focus timer. */
.dsh-todos-zenPage{animation:dsh-todos-zen-in .38s ease;background:radial-gradient(120% 88% at 50% -12%,color-mix(in srgb,var(--dsw-alias-brand-primary) 7%,transparent),transparent 62%),var(--dsw-alias-bg-base)}
@keyframes dsh-todos-zen-in{from{opacity:0}
to{opacity:1}
}
.dsh-todos-zenScroll{flex:1;min-height:0;overflow:auto;scrollbar-gutter:stable;--dsh-scrollbar-width:9px;--dsh-scrollbar-thumb-border:2px}
.dsh-todos-zen{box-sizing:border-box;min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 24px 64px}
.dsh-todos-zenExit{align-self:flex-end;display:inline-flex;align-items:center;gap:2px;height:26px;padding:0 9px;border:none;border-radius:13px;background:0 0;color:var(--dsw-alias-label-caption);font:inherit;font-size:12px;line-height:20px;cursor:pointer;opacity:.75}
.dsh-todos-zenExit:hover{opacity:1;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}
.dsh-todos-zenEnso{color:color-mix(in srgb,var(--dsw-alias-brand-primary) 45%,transparent);margin:6px 0 14px;animation:dsh-todos-breathe 7.5s ease-in-out infinite}
@keyframes dsh-todos-breathe{0%,100%{opacity:.5;transform:scale(.985)}
50%{opacity:.95;transform:scale(1.015)}
}
.dsh-todos-zenHeading{margin:0;font-size:13px;font-weight:500;letter-spacing:.42em;text-indent:.42em;color:var(--dsw-alias-label-secondary)}
.dsh-todos-zenDate{margin:7px 0 0;color:var(--dsw-alias-label-caption);font-size:12px;letter-spacing:.06em}
.dsh-todos-zenSummary{margin:16px 0 22px;color:var(--dsw-alias-label-tertiary);font-size:12px;letter-spacing:.12em}
.dsh-todos-zenAdd{display:flex;align-items:center;gap:6px;width:min(520px,100%);margin-bottom:26px}
.dsh-todos-zenInput{box-sizing:border-box;flex:1;min-width:0;height:38px;padding:0 6px;border:none;border-bottom:.5px solid var(--dsw-alias-border-l2);background:0 0;color:var(--dsw-alias-label-primary);font:inherit;font-size:15px;text-align:center;outline:none;transition:border-color .2s}
.dsh-todos-zenInput::placeholder{color:var(--dsw-alias-label-caption)}
.dsh-todos-zenInput:focus{border-bottom-color:var(--dsw-alias-brand-primary)}
.dsh-todos-zenAddButton{flex:none;height:30px;padding:0 12px;border:none;border-radius:15px;background:0 0;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;cursor:pointer}
.dsh-todos-zenAddButton:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.dsh-todos-zenAddButton:disabled{opacity:.35;cursor:default}
.dsh-todos-zenList{list-style:none;margin:0;padding:0;width:min(560px,100%);display:flex;flex-direction:column;gap:1px}
.dsh-todos-zenItem{display:flex;align-items:center;gap:12px;padding:11px 10px;border-radius:12px;animation:dsh-todos-rise .5s cubic-bezier(.2,.7,.2,1) backwards;transition:background .15s}
.dsh-todos-zenItem:hover{background:var(--dsw-alias-interactive-bg-hover)}
@keyframes dsh-todos-rise{from{opacity:0;transform:translateY(7px)}
to{opacity:1;transform:none}
}
.dsh-todos-zenCheck{flex:none;width:19px;height:19px;padding:0;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;border:1.5px solid var(--dsw-alias-border-l2);background:0 0;color:transparent;cursor:pointer;transition:background .18s,border-color .18s}
.dsh-todos-zenCheck:hover{border-color:var(--dsw-alias-state-business-primary)}
.dsh-todos-zenCheck[aria-checked="true"]{background:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary-inverted,#fff)}
.dsh-todos-zenBody{flex:1;min-width:0;display:flex;align-items:center;gap:9px}
.dsh-todos-zenDot{flex:none;width:5px;height:5px;border-radius:50%}
.dsh-todos-zenTitle{min-width:0;padding:0;border:none;background:0 0;color:var(--dsw-alias-label-primary);font:inherit;font-size:15px;line-height:24px;text-align:left;overflow-wrap:anywhere;cursor:pointer}
.dsh-todos-zenTitle:hover{color:var(--dsw-alias-brand-primary)}
.dsh-todos-zenItemDone .dsh-todos-zenTitle{color:var(--dsw-alias-label-caption);text-decoration:line-through}
.dsh-todos-zenInlineInput{flex:1;text-align:left;font-size:15px}
.dsh-todos-zenActions{flex:none;display:flex;align-items:center;gap:2px;opacity:0;transition:opacity .15s}
.dsh-todos-zenItem:hover .dsh-todos-zenActions,.dsh-todos-zenItem:focus-within .dsh-todos-zenActions{opacity:1}
.dsh-todos-zenDoneBlock{width:min(560px,100%);margin-top:24px;display:flex;flex-direction:column;align-items:center;gap:4px}
.dsh-todos-zenDoneToggle{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 9px;border:none;border-radius:13px;background:0 0;color:var(--dsw-alias-label-caption);font:inherit;font-size:12px;cursor:pointer}
.dsh-todos-zenDoneToggle:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.dsh-todos-zenDoneList{width:100%}
.dsh-todos-zenEmpty{width:min(520px,100%);margin:2px 0 0;text-align:center;color:var(--dsw-alias-label-caption);font-size:13px;letter-spacing:.06em}
.dsh-todos-zenNotice{width:min(520px,100%);margin:18px 0 0;padding:8px 12px;border-radius:10px;background:var(--dsw-alias-bg-layer-1,transparent);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:20px;text-align:center}
.dsh-todos-zenNoticeError{color:var(--dsw-alias-state-error-primary)}
.dsh-todos-zenList .dsh-todos-details,.dsh-todos-zenList .dsh-todos-picker{margin-left:0;width:100%}
.dsh-todos-pomo{display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:26px;animation:dsh-todos-zen-in .4s ease}
.dsh-todos-pomoRing{position:relative;width:148px;height:148px;display:flex;align-items:center;justify-content:center}
.dsh-todos-pomoRing svg{position:absolute;inset:0;transform-origin:50% 50%;animation:dsh-todos-pomo-breathe 6s ease-in-out infinite}
.dsh-todos-pomoTrack{fill:none;stroke:color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);stroke-width:3}
.dsh-todos-pomoProgress{fill:none;stroke:var(--dsw-alias-brand-primary);stroke-width:3;stroke-linecap:round;transition:stroke-dashoffset .5s linear}
.dsh-todos-pomoBreak .dsh-todos-pomoProgress{stroke:var(--dsw-alias-state-success-primary)}
.dsh-todos-pomoClock{display:flex;flex-direction:column;align-items:center;gap:2px}
.dsh-todos-pomoTime{font-size:30px;font-weight:300;letter-spacing:.04em;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}
.dsh-todos-pomoPhase{font-size:12px;letter-spacing:.24em;text-indent:.24em;color:var(--dsw-alias-label-tertiary)}
.dsh-todos-pomoLabel{margin:2px 0 0;max-width:min(520px,100%);color:var(--dsw-alias-label-secondary);font-size:13px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-todos-pomoMeta{margin:0;color:var(--dsw-alias-label-caption);font-size:12px;letter-spacing:.1em}
.dsh-todos-pomoActions{display:flex;align-items:center;gap:2px;margin-top:4px}
.dsh-todos-pomoStart{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;margin:0 0 24px;border:.5px solid var(--dsw-alias-border-l3);border-radius:15px;background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;transition:border-color .18s,color .18s}
.dsh-todos-pomoStart:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}
@keyframes dsh-todos-pomo-breathe{0%,100%{transform:scale(.985);opacity:.9}
50%{transform:scale(1.015);opacity:1}
}
.dsh-todos-pomoFlash{display:flex;flex-direction:column;align-items:center;gap:8px;margin:2px 0 18px}
.dsh-todos-pomoPing{width:10px;height:10px;border-radius:50%;background:var(--dsw-alias-state-success-primary);animation:dsh-todos-pomo-ping 1.9s ease-out infinite}
@keyframes dsh-todos-pomo-ping{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--dsw-alias-state-success-primary) 45%,transparent);opacity:1}
70%{box-shadow:0 0 0 26px transparent;opacity:.85}
100%{box-shadow:0 0 0 26px transparent;opacity:0}
}
.dsh-todos-pomoFlashText{color:var(--dsw-alias-label-secondary);font-size:12px;letter-spacing:.1em}
@media (prefers-reduced-motion:reduce){.dsh-todos-pomoRing svg{animation:none}
.dsh-todos-pomoPing{animation:none}
.dsh-todos-pomo{animation:none}
}
@media (prefers-reduced-motion:reduce){.dsh-todos-zenEnso{animation:none}
.dsh-todos-zenItem{animation:none}
.dsh-todos-zenPage{animation:none}
}

/* Focus mode keeps the same quiet rhythm, with readable text and larger controls. */
.dsh-todos-zen { max-width:860px; margin:auto; padding:32px 32px 64px; justify-content:flex-start; }
[data-platform=darwin] .dsh-todos-zen { padding-top:calc(32px + var(--dsh-frame-top-clearance,0px)); }
.dsh-todos-zenExit { height:36px; padding:0 12px; opacity:1; color:var(--todo-muted); }
.dsh-todos-zenEnso { margin:36px 0 22px; color:var(--todo-accent); animation:none; }
.dsh-todos-zenHeading { font-size:24px; font-weight:500; letter-spacing:.2em; color:var(--todo-text); }
.dsh-todos-zenDate { color:var(--todo-muted); font-size:13px; margin-top:10px; }
.dsh-todos-zenSummary { color:var(--todo-muted); font-size:13px; margin:20px 0; }
.dsh-todos-pomoStart { height:40px; padding:0 18px; margin:24px 0 32px; border:1px solid var(--todo-border); border-radius:10px; background:var(--todo-bg); color:var(--todo-accent-text); font-size:13px; }
.dsh-todos-zenAdd { margin-bottom:24px; gap:10px; }
.dsh-todos-zenInput { height:44px; color:var(--todo-text); text-align:left; padding:0 10px; border-bottom:1px solid var(--dsw-alias-border-l2); }
.dsh-todos-zenInput::placeholder { color:var(--todo-muted); }
.dsh-todos-zenAddButton, .dsh-todos-zenDoneToggle { min-height:36px; color:var(--todo-muted); font-size:13px; border-radius:8px; }
.dsh-todos-zenList { gap:8px; }
.dsh-todos-zenItem { min-height:60px; padding:12px; gap:16px; border-bottom:1px solid var(--todo-border); border-radius:8px; animation-duration:.24s; }
.dsh-todos-zenCheck { width:22px; height:22px; }
.dsh-todos-zenActions { opacity:1; }
.dsh-todos-zenDoneToggle, .dsh-todos-zenEmpty, .dsh-todos-pomoMeta, .dsh-todos-pomoPhase { color:var(--todo-muted); }
.dsh-todos-zenList .dsh-todos-details, .dsh-todos-zenList .dsh-todos-picker { margin:8px 0; }
.dsh-todos-pomo { margin:36px 0 24px; width:100%; }
.dsh-todos-pomoRing { width:180px; height:180px; }
.dsh-todos-pomoRing svg { width:180px; height:180px; animation:none; }
.dsh-todos-pomoTime { font-size:36px; font-weight:400; }
.dsh-todos-pomoActions { gap:8px; }
.dsh-todos-pomoLabel { max-width:100%; white-space:normal; overflow-wrap:anywhere; }
@container todos (max-width:760px) {
  .dsh-todos-content { padding:28px 24px; }
  [data-platform=darwin] .dsh-todos-content { padding-top:calc(28px + var(--dsh-frame-top-clearance,0px)); }
  .dsh-todos-rowActionsMore { display:none; }
  .dsh-todos-matrix { grid-template-columns:1fr; }
  .dsh-todos-heading { gap:16px; }
  .dsh-todos-details, .dsh-todos-picker { margin-left:12px; }
}
@container todos (max-width:480px) {
  .dsh-todos-content { padding:24px 16px; }
  .dsh-todos-heading { align-items:flex-start; flex-direction:column; margin-bottom:20px; }
  .dsh-todos-heading h1 { font-size:27px; }
  .dsh-todos-eyebrow { margin-bottom:8px; }
  .dsh-todos-viewSwitch { align-self:flex-start; }
  .dsh-todos-focusCard { gap:12px; padding:14px; margin-bottom:22px; }
  .dsh-todos-focusTime { display:none; }
  .dsh-todos-toolbar { gap:8px 4px; }
  .dsh-todos-scopeTabs { width:100%; justify-content:space-between; gap:0; }
  .dsh-todos-scopeTab { padding:0 8px; gap:5px; }
  .dsh-todos-filterButton { margin-left:auto; }
  .dsh-todos-addField { padding-left:12px; gap:8px; }
  .dsh-todos-addInput, .dsh-todos-input, .dsh-todos-tagInput, .dsh-todos-zenInput { font-size:16px; }
  .dsh-todos-row { gap:12px; padding:12px 10px; }
  .dsh-todos-rowTitle { font-size:15px; }
  .dsh-todos-detailRow, .dsh-todos-filterRow { flex-direction:column; gap:6px; }
  .dsh-todos-detailLabel, .dsh-todos-filterLabel { flex-basis:auto; line-height:1.6; }
  .dsh-todos-detailBody { width:100%; }
  .dsh-todos-details, .dsh-todos-picker { padding:12px; margin:0 8px 8px; }
  .dsh-todos-matrixCell { padding:12px; }
  .dsh-todos-zen { padding:20px 16px 40px; }
  .dsh-todos-zenItem { gap:12px; padding:12px 8px; }
  .dsh-todos-zenBody { gap:6px; }
}
@media (hover:none), (pointer:coarse) {
  .dsh-todos-row .dsh-todos-check { margin-top:11px; }
  .dsh-todos-rowActions { margin-top:0; }
  .dsh-todos-rowActionsMore { display:none; }
  .dsh-todos-page button:not(.dsh-todos-check):not(.dsh-todos-zenCheck) { min-height:44px; }
  .dsh-todos-rowToggle, .dsh-todos-rowIcon, .dsh-todos-iconButton, .dsh-todos-tagRemove { min-width:44px; }
  .dsh-todos-rowMeta, .dsh-todos-optionRow, .dsh-todos-filterChips, .dsh-todos-tagEditRow { gap:8px; }
  .dsh-todos-tagChip { padding:4px 8px; }
  .dsh-todos-zenActions { flex-direction:column; }
}
@media (prefers-reduced-motion:reduce) {
  .dsh-todos-page *, .dsh-todos-page *::before, .dsh-todos-page *::after {
    animation:none !important; transition:none !important; scroll-behavior:auto !important;
  }
}
`;
