// ════════════════════════════════════════════════════════
// MetroFlow — Narrative-Driven Simulation with Paced Playback
// Single-run baseline → optimized comparison flow
// ════════════════════════════════════════════════════════

const SIM = { isRunning: false, frame: 0, speed: 1, max: 0, baseDur: 600, finished: false };
const MODE_INFO = {
    baseline:  { title: 'Baseline',        desc: 'People move randomly — no routing preference.' },
    biased:    { title: 'Biased Walk',     desc: 'People prefer shortest paths, avoiding crowds.' },
    selfish:   { title: 'Selfish Routing', desc: 'Each person picks their own fastest route.' },
    optimized: { title: 'Optimized',       desc: 'System balances load for overall efficiency.' },
};

// Story phases
const PHASES = [
    { end: 0.2,  name: 'Entry Phase',         cls: 'p-entry', desc: 'People entering the station.' },
    { end: 0.5,  name: 'Congestion Build-up',  cls: 'p-build', desc: 'Traffic building as paths fill.' },
    { end: 0.8,  name: 'Peak Congestion',       cls: 'p-peak',  desc: 'Maximum crowd density.' },
    { end: 1.01, name: 'Dispersal',             cls: 'p-disp',  desc: 'People dispersing to destinations.' },
];

// Narrative state
let STORY = 'ready';

let DATA = null, mode = 'baseline', layer = 'all';
let canvas, ctx, W, H, dpr = 1;
let pos = null;
let hoverNode = null, lastHover = null;
let occChart = null, lastTime = 0;
let prevOcc = {};

// Recorded observations per run (for summary)
let runObs = { peakNode: '', peakOcc: 0, peakCap: 0, peakFrame: 0 };

// Interpolated radii for smooth size transitions
let prevRadii = {};
let prevFlows = {};
let displayedRatios = {};

// Key moment tracking — each auto-pause fires once per run
let keyMoments = { firstCongestion: false, peakFrame: -1, peakFired: false };

// Optimization Insights tracking
let optInsights = null;
let optStartTime = 0;
let glowPaths = { increased: new Set(), decreased: new Set() };

// Narrative State Engine
let currentNarrative = { anchorId: null, framesLocked: 0, severity: 0 };

// Congestion amplifier
function congestionScale() {
    return mode === 'baseline' ? 1.35 : 0.85;
}

// ── Helpers ────────────────────────────────────────────
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function nodeName(id) {
    if (!DATA) return id;
    const n = DATA.graph.nodes.find(x => x.id === id);
    return n ? n.name : id;
}

function nodeColor(ratio) {
    if (ratio < 0.25) return '#22c55e';
    if (ratio < 0.5)  return '#eab308';
    if (ratio < 0.75) return '#f97316';
    return '#ef4444';
}
function congLabel(ratio) {
    if (ratio < 0.25) return ['Low', '#22c55e', 'pill-g'];
    if (ratio < 0.5)  return ['Medium', '#eab308', 'pill-y'];
    if (ratio < 0.75) return ['High', '#f97316', 'pill-y'];
    return ['Critical', '#ef4444', 'pill-r'];
}
function travelLabel(t) { return t < 3 ? 'Fast' : t < 7 ? 'Moderate' : 'Slow'; }
function waitLabel(w) { return w < 0.5 ? 'None' : w < 2 ? 'Some' : 'Heavy'; }

// ── Boot ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    setupCanvas();
    bindUI();
    await loadData();
});

async function loadData() {
    try {
        const r = await fetch('./data/simulation_compact.json');
        if (!r.ok) throw new Error(r.status);
        DATA = await r.json();
        SIM.max = DATA.meta.steps;
        precomputePeakFrame();
        buildPos();
        refresh();
        drawGraph();
        setPhase('ready');
    } catch (e) { console.warn('Load failed', e); }
}

// Pre-compute peak congestion frame for each mode so we know when to auto-pause
function precomputePeakFrame() {
    if (!DATA) return;
    for (const modeKey of ['baseline', 'optimized']) {
        const md = DATA.modes[modeKey];
        let maxTotal = 0, peakF = 0;
        for (let f = 0; f < SIM.max; f++) {
            let total = 0;
            for (const n of DATA.graph.nodes) {
                const oa = md.node_occupancy[n.id];
                total += oa && f < oa.length ? oa[f] : 0;
            }
            if (total > maxTotal) { maxTotal = total; peakF = f; }
        }
        md._peakFrame = peakF;
    }
}

function buildPos() {
    pos = {};
    const px = 0.06, py = 0.08;
    for (const n of DATA.graph.nodes) {
        pos[n.id] = {
            x: px * W + n.px * W * (1 - 2 * px),
            y: py * H + n.py * H * (1 - 2 * py),
            layer: n.layer, cap: n.capacity,
            name: n.name, type: n.type, id: n.id,
        };
    }
}

function refresh() {
    updateMetrics();
    updateModeCard();
    updateFrameUI();
    updateNarration();
    updateIntelligence();
    updateChart();
    renderTable();
}

// ── Canvas ─────────────────────────────────────────────
function setupCanvas() {
    const box = document.getElementById('graph-container');
    canvas = document.getElementById('canvas-network');
    ctx = canvas.getContext('2d', { alpha: false });

    function resize() {
        dpr = window.devicePixelRatio || 1;
        W = box.clientWidth;
        H = box.clientHeight;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (DATA) { buildPos(); drawGraph(); }
    }
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 200); });
    resize();

    function cssCoords(e) {
        const rect = canvas.getBoundingClientRect();
        return [e.clientX - rect.left, e.clientY - rect.top];
    }

    canvas.addEventListener('mousemove', e => {
        if (!DATA || !pos) return;
        const [mx, my] = cssCoords(e);
        let found = null;
        for (const n of DATA.graph.nodes) {
            if (layer !== 'all' && n.layer !== layer) continue;
            const p = pos[n.id];
            if (!p) continue;
            if ((mx - p.x) ** 2 + (my - p.y) ** 2 < 289) { found = n; break; }
        }
        hoverNode = found;
        found ? showTip(found, e.clientX, e.clientY) : hideTip();
    });
    canvas.addEventListener('mouseleave', () => { hoverNode = null; hideTip(); });

    canvas.addEventListener('click', e => {
        if (!DATA || !pos) return;
        const [mx, my] = cssCoords(e);
        for (const n of DATA.graph.nodes) {
            const p = pos[n.id];
            if (!p) continue;
            if ((mx - p.x) ** 2 + (my - p.y) ** 2 < 289) {
                showPopup(n, e.clientX, e.clientY);
                return;
            }
        }
        hidePopup();
    });
}

// ── Phase Management ───────────────────────────────────
function setPhase(state) {
    const badge = document.getElementById('phase-badge');
    if (state === 'ready') {
        badge.textContent = 'Ready';
        badge.className = 'phase-badge p-ready';
    } else if (state === 'done') {
        badge.textContent = '✓ Complete';
        badge.className = 'phase-badge p-done';
    } else if (state === 'paused') {
        badge.textContent = '⏸ Paused';
        badge.className = 'phase-badge p-build';
    }
}

function updatePhaseBadge() {
    if (!DATA || !SIM.isRunning) return;
    const pct = SIM.max > 0 ? SIM.frame / SIM.max : 0;
    const badge = document.getElementById('phase-badge');
    for (const ph of PHASES) {
        if (pct < ph.end) {
            badge.textContent = ph.name;
            badge.className = 'phase-badge ' + ph.cls;
            return;
        }
    }
}

// ════════════════════════════════════════════════════════
// AUTO-PAUSE AT KEY MOMENTS
// ════════════════════════════════════════════════════════
function checkKeyMoments() {
    if (!DATA) return null;
    const md = DATA.modes[mode];
    const f = SIM.frame;
    const scale = congestionScale();

    // A. First congestion: any node occupancy_ratio > 0.6 (scaled)
    if (!keyMoments.firstCongestion) {
        for (const n of DATA.graph.nodes) {
            if (n.type === 'entry' || n.type === 'exit') continue;
            const oa = md.node_occupancy[n.id];
            const occ = oa && f < oa.length ? oa[f] : 0;
            const ratio = (occ / (n.capacity || 1)) * scale;
            if (ratio > 0.6) {
                keyMoments.firstCongestion = true;
                return `Congestion forming at ${n.name}. Observe how crowd builds here.`;
            }
        }
    }

    // B. Peak congestion frame (pre-computed)
    const peakF = md._peakFrame || -1;
    if (!keyMoments.peakFired && f === peakF && peakF > 0) {
        keyMoments.peakFired = true;
        // Find busiest node at this frame
        let maxOcc = 0, peakName = '';
        for (const n of DATA.graph.nodes) {
            const oa = md.node_occupancy[n.id];
            const occ = oa && f < oa.length ? oa[f] : 0;
            if (occ > maxOcc) { maxOcc = occ; peakName = n.name; }
        }
        return `Peak congestion reached! ${peakName} has the highest crowd density.`;
    }

    return null;
}

function autoPause(message) {
    SIM.isRunning = false;
    const playBtn = document.getElementById('btn-play');
    playBtn.disabled = false;
    playBtn.textContent = '▶ Continue';
    document.getElementById('btn-pause').disabled = true;
    document.getElementById('btn-step').disabled = false;
    setPhase('paused');

    // Show pause message bar
    document.getElementById('pause-text').textContent = message;
    document.getElementById('pause-msg').classList.remove('hidden');
}

function hidePauseMsg() {
    document.getElementById('pause-msg').classList.add('hidden');
}

// ── UI Bindings ────────────────────────────────────────
function bindUI() {
    const playBtn = document.getElementById('btn-play');
    const pauseBtn = document.getElementById('btn-pause');
    const resetBtn = document.getElementById('btn-reset');
    const stepBtn = document.getElementById('btn-step');

    playBtn.addEventListener('click', () => {
        if (SIM.isRunning) return;
        
        if (STORY === 'baseline_done' || (mode === 'baseline' && SIM.finished && !SIM.isRunning)) {
            startOptimizedRun();
            return;
        } else if (STORY === 'comparison') {
            document.getElementById('btn-reset').click();
            return;
        }

        hidePauseMsg();

        // If we're in 'ready' state, start baseline
        if (STORY === 'ready' || STORY === 'reset') {
            mode = 'baseline';
            STORY = 'baseline_run';
            SIM.frame = 0;
            SIM.finished = false;
            prevOcc = {};
            prevRadii = {};
            prevFlows = {};
            displayedRatios = {};
            runObs = { peakNode: '', peakOcc: 0, peakCap: 0, peakFrame: 0 };
            keyMoments = { firstCongestion: false, peakFrame: -1, peakFired: false };
            updateModeCard();
            updateChart();
            playBtn.textContent = '▶ Running…';
        }

        SIM.isRunning = true;
        playBtn.disabled = true;
        pauseBtn.disabled = false;
        stepBtn.disabled = true;
        resetBtn.disabled = true;  // lock during run
        lastTime = performance.now();
        requestAnimationFrame(loop);
    });

    pauseBtn.addEventListener('click', () => {
        if (!SIM.isRunning) return;
        SIM.isRunning = false;
        pauseBtn.disabled = true;
        stepBtn.disabled = false;
        playBtn.disabled = false;
        playBtn.textContent = '▶ Resume';
        setPhase('paused');
    });

    // Step mode: advance exactly ONE frame
    stepBtn.addEventListener('click', () => {
        if (SIM.isRunning || !DATA) return;
        hidePauseMsg();

        SIM.frame++;
        if (SIM.frame >= SIM.max) {
            SIM.frame = SIM.max - 1;
            SIM.finished = true;
            onRunComplete();
            return;
        }

        updateFrameUI();
        updatePhaseBadge();
        updateNarration();
        updateIntelligence();
        drawGraph();
        if (typeof occChart !== 'undefined' && occChart) { occChart.update('none'); }
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
        SIM.frame = 0;
        SIM.isRunning = false;
        SIM.finished = false;
        STORY = 'ready';
        mode = 'baseline';
        prevOcc = {};
        prevRadii = {};
        prevFlows = {};
        displayedRatios = {};
        runObs = { peakNode: '', peakOcc: 0, peakCap: 0, peakFrame: 0 };
        keyMoments = { firstCongestion: false, peakFrame: -1, peakFired: false };
        optStartTime = 0;
        
        hideOverlay();
        const explCard = document.getElementById('opt-expl-card');
        if (explCard) explCard.classList.add('hidden');
        
        const playBtn = document.getElementById('btn-play');
        playBtn.textContent = '▶ Start Baseline';
        playBtn.className = 'btn';
        playBtn.disabled = false;
        
        updateModeCard();
        updateChart();
        updateFrameUI();
        drawGraph();
    });

    // Continue button (in pause message bar)
    document.getElementById('btn-continue').addEventListener('click', () => {
        if (STORY === 'complete') return; // Do not allow resume after finish
        if (SIM.finished) return;
        hidePauseMsg();
        SIM.isRunning = true;
        setPhase('running');
        updateFrameUI();
        document.getElementById('btn-play').disabled = true;
        document.getElementById('btn-pause').disabled = false;
        document.getElementById('btn-step').disabled = true;
        document.getElementById('btn-reset').disabled = true;
        lastTime = performance.now();
        requestAnimationFrame(loop);
    });

    // Speed presets
    document.querySelectorAll('.sbtn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sbtn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            SIM.baseDur = parseInt(btn.dataset.speed, 10);
        });
    });
}

function updateFrameUI() {
    document.getElementById('frame-display').textContent = `${SIM.frame} / ${SIM.max}`;
    document.getElementById('progress-fill').style.width = (SIM.max > 0 ? SIM.frame / SIM.max * 100 : 0) + '%';
}

function updateModeCard() {
    const info = MODE_INFO[mode];
    document.getElementById('mode-title').textContent = info.title;
    document.getElementById('mode-desc').textContent = info.desc;
}

// ── Step Narration (context-aware) ─────────────────────
function updateNarration() {
    if (!DATA) return;
    const md = DATA.modes[mode];
    const f = SIM.frame;
    const pct = SIM.max > 0 ? f / SIM.max : 0;
    const modeLabel = mode === 'baseline' ? 'Baseline' : 'Optimized';

    let bName = '';
    if (f > 0) {
        let mx = 0;
        for (const n of DATA.graph.nodes) {
            const oa = md.node_occupancy[n.id];
            const occ = oa && f < oa.length ? oa[f] : 0;
            if (occ > mx) { mx = occ; bName = n.name; }
        }
    }

    let text;
    if (f === 0) {
        text = `Press Start to watch how crowd moves through the station.`;
    } else if (pct < 0.2) {
        text = `[${modeLabel}] Step ${f}/${SIM.max}: Crowd entering — spreading from entries toward gates.`;
    } else if (pct < 0.45) {
        text = `[${modeLabel}] Step ${f}/${SIM.max}: Traffic building — ${bName} is getting crowded.`;
    } else if (pct < 0.7) {
        text = `[${modeLabel}] Step ${f}/${SIM.max}: Peak traffic near ${bName} — movement slowing.`;
    } else if (pct < 0.88) {
        text = `[${modeLabel}] Step ${f}/${SIM.max}: Traffic easing — people toward exits and platforms.`;
    } else {
        text = `[${modeLabel}] Step ${f}/${SIM.max}: Station clearing — most people reached destinations.`;
    }
    document.getElementById('narration').textContent = text;
}

// ════════════════════════════════════════════════════════
// INTELLIGENCE LAYER
// ════════════════════════════════════════════════════════
function buildNarrativeState(mode, f, md, nodes, ef, curOcc) {
    if (f === 0) {
        return {
            tag: 'Awaiting',
            scene: 'Waiting for simulation to begin.',
            cause: '—', effect: '—', takeaway: '—'
        };
    }

    // 1. Calculate severities based on inflow vs outflow and occupancy
    let highestSeverity = 0;
    let anchorCandidate = null;

    const inFlow = {}, outFlow = {};
    for (const [k, a] of Object.entries(ef)) {
        const fv = a && f < a.length ? a[f] : 0;
        const [src, dst] = k.split('→');
        inFlow[dst] = (inFlow[dst] || 0) + fv;
        outFlow[src] = (outFlow[src] || 0) + fv;
    }

    for (const n of nodes) {
        if (n.type === 'entry' || n.type === 'exit') continue;
        const ratio = (curOcc[n.id] / (n.capacity || 1));
        const congTrig = mode === 'baseline' ? 1.35 : 0.85;
        
        let pressure = 0;
        if (inFlow[n.id] > outFlow[n.id]) {
            pressure = (inFlow[n.id] - outFlow[n.id]) * 0.5;
        }
        
        let severity = ratio * congTrig * 10 + pressure;
        
        if (severity > highestSeverity) {
            highestSeverity = severity;
            anchorCandidate = n.id;
        }
    }

    // Edge check if node severity is extremely low
    if (highestSeverity < 3) {
        for (const [k, a] of Object.entries(ef)) {
            const fv = a && f < a.length ? a[f] : 0;
            if (fv > highestSeverity) {
                highestSeverity = fv;
                anchorCandidate = k;
            }
        }
    }

    // 2. Hysteresis Check
    if (currentNarrative.anchorId) {
        if (currentNarrative.anchorId === anchorCandidate) {
            currentNarrative.framesLocked++;
        } else {
            const margin = currentNarrative.severity * 1.2;
            if (highestSeverity > margin || currentNarrative.framesLocked > 5) {
                currentNarrative.anchorId = anchorCandidate;
                currentNarrative.framesLocked = 0;
            } else {
                anchorCandidate = currentNarrative.anchorId;
                highestSeverity = currentNarrative.severity;
                currentNarrative.framesLocked++;
            }
        }
    } else {
        currentNarrative.anchorId = anchorCandidate;
        currentNarrative.framesLocked = 0;
    }
    
    currentNarrative.severity = highestSeverity;

    // 3. String Generation
    let nState = { tag: 'Smooth flow', scene: '—', cause: '—', effect: '—', takeaway: '—' };
    if (!anchorCandidate) {
         nState.scene = 'People are moving freely with no major concentration.';
         nState.cause = 'Station holds enough capacity for the current crowds.';
         nState.effect = 'Fast transit times and no bottlenecks.';
         nState.takeaway = 'System is operating well within limits.';
         return nState;
    }

    if (anchorCandidate.includes('→')) {
         const [src, dst] = anchorCandidate.split('→').map(nodeName);
         nState.tag = 'High movement';
         nState.scene = `Most movement is centered along the path from ${src} to ${dst}.`;
         nState.cause = 'This is the primary route chosen by current commuters.';
         nState.effect = 'Traffic volume is high but still moving without major incident.';
         nState.takeaway = 'Pathways are heavily utilized but have not bottlenecked.';
         return nState;
    }

    const nCap = nodes.find(n => n.id === anchorCandidate).capacity || 1;
    const aRatio = curOcc[anchorCandidate] / nCap;
    const aName = nodeName(anchorCandidate);
    const iF = inFlow[anchorCandidate] || 0;
    const oF = outFlow[anchorCandidate] || 0;

    if (aRatio > 0.8) {
        nState.tag = 'Peak congestion';
        nState.scene = `A major crowd is packed at ${aName}.`;
        nState.cause = `More people are pouring into this area than can exit it.`;
        nState.effect = `A heavy queue has formed, dragging down overall movement speed.`;
        nState.takeaway = `This bottleneck is the primary cause of delays right now.`;
    } else if (aRatio > 0.5) {
        if (iF > oF * 1.2) {
             nState.tag = 'Queue forming';
             nState.scene = `People are starting to gather around ${aName}.`;
             nState.cause = `Traffic arriving is briefly overwhelming the exit rate here.`;
             nState.effect = `Movement is slowing down locally as people wait.`;
             nState.takeaway = `If buildup continues, this will become a major bottleneck.`;
        } else {
             nState.tag = 'High utilization';
             nState.scene = `A large number of people are stationed near ${aName}.`;
             nState.cause = `This area is effectively absorbing heavy foot traffic.`;
             nState.effect = `The space is busy but maintaining steady flow.`;
             nState.takeaway = `Traffic is heavy but currently managed without choking.`;
        }
    } else {
        if (iF > oF) {
            nState.tag = 'Entry build-up';
            nState.scene = `Movement is flowing toward ${aName}.`;
            nState.cause = `Initial crowds are arriving into this segment.`;
            nState.effect = `Traffic is advancing smoothly without queues.`;
            nState.takeaway = `The system is beginning to distribute load.`;
        } else {
            nState.tag = 'Dispersal';
            nState.scene = `The crowd at ${aName} is steadily clearing out.`;
            nState.cause = `More people are leaving the area than arriving.`;
            nState.effect = `Congestion is easing back to normal levels.`;
            nState.takeaway = `The major bottleneck is safely resolving.`;
        }
    }

    if (mode === 'optimized') {
        nState.takeaway = `Optimization is actively preventing severe locks by spreading routing.`;
    }

    return nState;
}

function updateIntelligence() {
    if (!DATA) return;
    const md = DATA.modes[mode];
    const f = SIM.frame;
    const nodes = DATA.graph.nodes;
    const ef = md.edge_flows;

    const curOcc = {};
    let maxOcc = 0, busiestName = '', busiestCap = 1;
    for (const n of nodes) {
        const oa = md.node_occupancy[n.id];
        const occ = oa && f < oa.length ? oa[f] : 0;
        curOcc[n.id] = occ;
        
        if (occ > maxOcc) {
            maxOcc = occ;
            busiestName = n.name;
            busiestCap = n.capacity || 1;
        }
    }

    if (maxOcc > runObs.peakOcc) {
        runObs.peakOcc = maxOcc;
        runObs.peakNode = busiestName;
        runObs.peakCap = busiestCap;
        runObs.peakFrame = f;
    }

    // Build the state
    const nState = buildNarrativeState(mode, f, md, nodes, ef, curOcc);

    // Apply to UI
    document.getElementById('story-tag').textContent = nState.tag;
    document.getElementById('st-scene').textContent = nState.scene;
    document.getElementById('st-cause').textContent = nState.cause;
    document.getElementById('st-effect').textContent = nState.effect;
    document.getElementById('st-takeaway').textContent = nState.takeaway;

    // Optional tag colors
    const tagEl = document.getElementById('story-tag');
    if (nState.tag.includes('Queue') || nState.tag.includes('High')) {
        tagEl.style.background = '#eab308'; // yellow
        tagEl.style.color = '#000';
    } else if (nState.tag.includes('Peak')) {
        tagEl.style.background = '#ef4444'; // red
        tagEl.style.color = '#fff';
    } else if (nState.tag.includes('Smooth') || nState.tag.includes('Dispersal')) {
        tagEl.style.background = '#22c55e'; // green
        tagEl.style.color = '#000';
    } else {
        tagEl.style.background = '#334155'; // gray
        tagEl.style.color = '#fff';
    }

    // Update decision panel below Graph
    updateDecisionPanel();

    prevOcc = { ...curOcc };
}

// ════════════════════════════════════════════════════════
// DECISION VISUALIZATION PANEL
// ════════════════════════════════════════════════════════
function updateDecisionPanel() {
    if (!DATA) return;
    const decPanel = document.getElementById('decision-panel');
    const listDiv = document.getElementById('dec-options-list');
    const fromLine = document.getElementById('dec-from');
    const reasonLine = document.getElementById('dec-reasoning');
    
    if (!decPanel || !listDiv || !fromLine || !reasonLine) return; // safety
    
    // Safety checks: hide if baseline, no narrative anchor, anchor is an edge, or not running
    if (mode === 'baseline' || mode === 'ready' || STORY === 'ready' || SIM.frame === 0 || !currentNarrative.anchorId || currentNarrative.anchorId.includes('→')) {
        decPanel.classList.add('hidden');
        if (typeof glowPaths !== 'undefined') glowPaths.chosenEdge = null;
        return;
    }

    const anchorId = currentNarrative.anchorId;
    const md = DATA.modes[mode];
    const ef = md.edge_flows;
    const nodes = DATA.graph.nodes;
    const anchorNode = nodes.find(n => n.id === anchorId);
    
    if (!anchorNode || anchorNode.type === 'exit') {
        decPanel.classList.add('hidden');
        if (typeof glowPaths !== 'undefined') glowPaths.chosenEdge = null;
        return;
    }

    // Find outgoing edges from anchor
    const options = [];
    for (const [k, a] of Object.entries(ef)) {
        if (k.startsWith(anchorId + '→')) {
            const fv = a && SIM.frame < a.length ? a[SIM.frame] : 0;
            const dstId = k.split('→')[1];
            const dstNode = nodes.find(n => n.id === dstId);
            
            const dstOcc = md.node_occupancy[dstId] ? md.node_occupancy[dstId][SIM.frame] : 0;
            const dstCap = Math.max(1, dstNode.capacity || 1);
            const crowdRatio = Math.min(1, dstOcc / dstCap * congestionScale());
            
            // Euclidean distance proxy
            const dx = dstNode.x - anchorNode.x;
            const dy = dstNode.y - anchorNode.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            options.push({ edgeKey: k, dstNode: dstNode, flow: fv, crowdRatio: crowdRatio, dist: dist });
        }
    }

    if (options.length < 2) {
        decPanel.classList.add('hidden');
        if (typeof glowPaths !== 'undefined') glowPaths.chosenEdge = null;
        return;
    }

    // Sort to pick max 3, based on actual utilization logic
    options.sort((a, b) => b.flow - a.flow);
    const topOptions = options.slice(0, 3);
    
    // The "chosen" one is the one with highest active flow distribution
    const chosenOpt = topOptions[0];
    if (typeof glowPaths !== 'undefined') glowPaths.chosenEdge = chosenOpt.edgeKey; 
    
    fromLine.textContent = `FROM: ${anchorNode.name}`;
    
    // Render HTML cleanly
    let html = '';
    for (const opt of topOptions) {
        const isChosen = (opt === chosenOpt);
        const name = opt.dstNode.name;
        
        let goodScore = 5 - Math.round(opt.crowdRatio * 3.5 + (opt.dist > 200 ? 1 : 0));
        goodScore = Math.max(1, Math.min(5, goodScore));
        const bars = '█'.repeat(goodScore) + '░'.repeat(5 - goodScore);

        html += `
        <div style="display:flex; justify-content:space-between; align-items:center; opacity:${isChosen ? 1 : 0.6}; transition:0.2s;">
            <div style="font-size:0.8rem; color:var(--tx); min-width:80px;">→ ${name}</div>
            <div style="font-family:monospace; font-size: 0.9rem; color:${isChosen ? 'var(--green)' : 'var(--mt)'}; letter-spacing:2px; flex:1; text-align:right; margin-right:8px;">${bars}</div>
            <div style="color:var(--green); width:12px; font-weight:bold; font-size:1.1rem">${isChosen ? '✓' : ''}</div>
        </div>
        `;
    }
    
    listDiv.innerHTML = html;
    
    reasonLine.innerHTML = `Chosen because:<br>• Less crowded paths<br>• Faster overall movement mapping`;

    decPanel.classList.remove('hidden');
}

// ── Metrics ────────────────────────────────────────────
function updateMetrics() {
    if (!DATA) return;
    const m = DATA.modes[mode].metrics_summary;

    const queueR = m.peak_queue;
    const avgLoad = queueR / (DATA.meta.nodes || 24);
    const [tl, , tp] = congLabel(clamp(avgLoad, 0, 1));
    const trafficEl = document.getElementById('m-traffic');
    trafficEl.textContent = tl;
    trafficEl.className = 'pill ' + tp;

    document.getElementById('m-speed').textContent = travelLabel(m.avg_travel_time);
    document.getElementById('m-wait').textContent = waitLabel(m.avg_wait_time);
    document.getElementById('m-travel-n').textContent = m.avg_travel_time.toFixed(1) + 's';
    document.getElementById('m-thru-n').textContent = m.throughput.toFixed(1) + ' p/s';
}

// ════════════════════════════════════════════════════════
// ANIMATION LOOP — runs ONCE then stops, with auto-pauses
// ════════════════════════════════════════════════════════
function loop(time) {
    if (!SIM.isRunning) return;

    const dur = SIM.baseDur;
    const dt = time - lastTime;

    if (dt >= dur) {
        SIM.frame++;
        lastTime = time;

        // ── STOP at end — NO looping ──
        if (SIM.frame >= SIM.max - 1) {
            SIM.frame = SIM.max - 1;
            SIM.isRunning = false;
            SIM.finished = true;
            STORY = 'complete';
            
            console.log("Frame:", SIM.frame);
            console.log("Running:", SIM.isRunning);
            console.log("Phase/Story:", STORY);
            
            handleSimulationEnd();
            return;
        }

        updateFrameUI();
        updatePhaseBadge();

        // Delayed text update — let visual settle first, then update explanations
        setTimeout(() => {
            updateNarration();
            updateIntelligence();
        }, 80);

        // Auto-pause at key moments
        const pauseMsg = checkKeyMoments();
        if (pauseMsg) {
            // Draw one more frame then pause
            drawGraph();
            autoPause(pauseMsg);
            return;
        }
    }

    drawGraph();
    if (typeof occChart !== 'undefined' && occChart) { occChart.update('none'); }
    if (SIM.isRunning) requestAnimationFrame(loop);
}

// ════════════════════════════════════════════════════════
// RUN COMPLETE — handle end states
// ════════════════════════════════════════════════════════
function handleSimulationEnd() {
    hidePauseMsg();
    setPhase('done');
    updateFrameUI();
    updateNarration();
    updateIntelligence();
    drawGraph();

    const modeLabel = mode === 'baseline' ? 'Baseline' : 'Optimized';
    document.getElementById('narration').textContent = `[${modeLabel}] Simulation complete — ${SIM.max} steps finished.`;

    if (mode === 'baseline') {
        STORY = 'baseline_done';
        showBaselineSummary();
    } else {
        STORY = 'comparison';
        computeOptInsights();
        showComparisonSummary();
    }
    
    updateControlsForEndState();
}

function updateControlsForEndState() {
    const btnPlay = document.getElementById('btn-play');
    const btnPause = document.getElementById('btn-pause');
    const btnStep = document.getElementById('btn-step');

    btnPause.disabled = true;
    btnStep.disabled = true;

    if (mode === 'baseline') {
        btnPlay.textContent = '▶ View Optimized';
        btnPlay.className = 'btn btn-optimized';
        btnPlay.disabled = false;
    } else {
        btnPlay.textContent = '⟲ Restart';
        btnPlay.className = 'btn';
        btnPlay.disabled = false;
    }
    document.getElementById('btn-reset').disabled = false;
}

// ── Baseline Summary Overlay ───────────────────────────
function showBaselineSummary() {
    const ms = DATA.modes.baseline.metrics_summary;
    const body = document.getElementById('overlay-body');
    const actions = document.getElementById('overlay-actions');

    document.getElementById('overlay-title').textContent = '🏁 Baseline Simulation Complete';

    body.innerHTML = `
        <p>The baseline simulation ran with <b>no routing optimization</b> — people moved randomly through the station.</p>
        <div class="obs-label">Key Observations</div>
        <ul>
            <li>Peak congestion formed at <b>${runObs.peakNode}</b> (${runObs.peakOcc.toFixed(0)} people, capacity ${runObs.peakCap})</li>
            <li>Average travel time: <b>${ms.avg_travel_time.toFixed(1)}s</b></li>
            <li>Throughput: <b>${ms.throughput.toFixed(1)} people/step</b></li>
            <li>Movement slowed during peak phase due to unmanaged crowd distribution</li>
        </ul>
        <p style="color:var(--mt);margin-top:12px;font-size:.78rem">Now see how <b style="color:var(--green)">optimization</b> improves the system.</p>
    `;

    actions.innerHTML = `
        <button class="btn btn-optimized" id="btn-view-opt">▶ View Optimized Version</button>
        <button class="btn" id="btn-replay-peak">↻ Replay Peak Moment</button>
        <button class="btn" id="btn-dismiss">Close</button>
    `;

    document.getElementById('btn-view-opt').addEventListener('click', startOptimizedRun);
    document.getElementById('btn-replay-peak').addEventListener('click', () => replayPeak('baseline'));
    document.getElementById('btn-dismiss').addEventListener('click', hideOverlay);

    showOverlay();
}

// ── Replay Peak Moment ─────────────────────────────────
function replayPeak(m) {
    hideOverlay();
    mode = m;
    const md = DATA.modes[mode];
    const peakF = md._peakFrame || Math.floor(SIM.max * 0.6);

    // Jump to 5 frames before peak and step through
    SIM.frame = Math.max(0, peakF - 5);
    SIM.isRunning = false;
    prevOcc = {};
    prevRadii = {};
    prevFlows = {};
    displayedRatios = {};

    updateModeCard();
    updateFrameUI();
    updateNarration();
    updateIntelligence();
    drawGraph();

    document.getElementById('btn-play').disabled = false;
    document.getElementById('btn-play').textContent = '▶ Resume';
    document.getElementById('btn-step').disabled = false;
    document.getElementById('btn-pause').disabled = true;
    document.getElementById('btn-reset').disabled = false;
    setPhase('paused');

    autoPause(`Replaying from step ${SIM.frame} — peak congestion at step ${peakF}. Use Step ⏭ or Continue.`);
}

// ── Start Optimized Run ────────────────────────────────
function computeOptInsights() {
    if (!DATA || !DATA.modes.optimized) return;
    const baseMd = DATA.modes.baseline;
    const optMd = DATA.modes.optimized;
    const len = baseMd.edge_flows[Object.keys(baseMd.edge_flows)[0]].length;
    
    const edgeSums = {};
    for (const k in baseMd.edge_flows) {
        let bSum = 0, oSum = 0;
        for (let i=0; i<len; i++) {
            bSum += baseMd.edge_flows[k][i] || 0;
            oSum += optMd.edge_flows[k][i] || 0;
        }
        if (bSum > 0 || oSum > 0) edgeSums[k] = oSum - bSum;
    }
    
    const sortedEdges = Object.entries(edgeSums).sort((a, b) => b[1] - a[1]);
    const topInc = sortedEdges.slice(0, 2).filter(e => e[1] > 2);
    const topDec = sortedEdges.slice().reverse().slice(0, 2).filter(e => e[1] < -2);
    
    glowPaths.increased = new Set(topInc.map(e => e[0]));
    glowPaths.decreased = new Set(topDec.map(e => e[0]));
    
    let maxBOcc = 0, bNodeId = null;
    const nodes = DATA.graph.nodes;
    for (const n of nodes) {
        if (n.type === 'entry' || n.type === 'exit') continue;
        let pB = Math.max(...(baseMd.node_occupancy[n.id] || []));
        if (pB > maxBOcc) { maxBOcc = pB; bNodeId = n.id; }
    }
    
    const cap = nodes.find(n => n.id === bNodeId).capacity || 1;
    const pOpt = Math.max(...(optMd.node_occupancy[bNodeId] || []));
    
    const bRatio = Math.round((maxBOcc / cap) * 100);
    const oRatio = Math.round((pOpt / cap) * 100);
    const bName = nodeName(bNodeId);
    
    optInsights = { bName, bRatio, oRatio, topInc, topDec };
    
    const explCard = document.getElementById('opt-expl-card');
    if (explCard) explCard.classList.remove('hidden');
    
    let r1, r2, r3;
    if (topInc.length > 0) {
        let nPair = topInc[0][0].split('→').map(nodeName);
        r1 = `Traffic redistributed towards <b style="color:#22d3ee">${nPair[1]}</b>`;
    } else r1 = "Traffic is distributed more evenly";
    
    if (bRatio > oRatio) {
        r2 = `<b style="color:#4ade80">Less crowd buildup</b> at ${bName} reduces delays`;
        r3 = `${bName} congestion reduced:<br><span style="color:var(--mt)">Baseline: ${bRatio}% full → Optimized: ${Math.min(oRatio, 100)}% full</span>`;
    } else {
        r2 = "Flow spread prevents localized choking";
        r3 = "Waiting eliminated due to balanced routing";
    }
    
    const r1el = document.getElementById('opt-reason-1');
    const r2el = document.getElementById('opt-reason-2');
    const r3el = document.getElementById('opt-reason-3');
    if (r1el) r1el.innerHTML = r1;
    if (r2el) r2el.innerHTML = r2;
    if (r3el) r3el.innerHTML = r3;
}

function startOptimizedRun() {
    hideOverlay();
    hidePauseMsg();

    mode = 'optimized';
    STORY = 'optimized_run';
    SIM.frame = 0;
    SIM.isRunning = true;
    SIM.finished = false;
    prevOcc = {};
    prevRadii = {};
    prevFlows = {};
    displayedRatios = {};
    runObs = { peakNode: '', peakOcc: 0, peakCap: 0, peakFrame: 0 };
    keyMoments = { firstCongestion: false, peakFrame: -1, peakFired: false };

    optStartTime = performance.now();

    const playBtn = document.getElementById('btn-play');
    playBtn.textContent = '▶ Running Optimized…';
    playBtn.className = 'btn btn-optimized';
    playBtn.disabled = true;
    document.getElementById('btn-pause').disabled = false;
    document.getElementById('btn-step').disabled = true;
    document.getElementById('btn-reset').disabled = true;
    
    // Hide insights initially during run
    const explCard = document.getElementById('opt-expl-card');
    if (explCard) explCard.classList.add('hidden');

    updateModeCard();
    updateMetrics();
    updateChart();
    setPhase('ready');

    lastTime = performance.now();
    requestAnimationFrame(loop);
}

// ── Comparison Summary Overlay ─────────────────────────
function showComparisonSummary() {
    const bm = DATA.modes.baseline.metrics_summary;
    const om = DATA.modes.optimized.metrics_summary;
    const body = document.getElementById('overlay-body');
    const actions = document.getElementById('overlay-actions');

    document.getElementById('overlay-title').textContent = '📊 Baseline vs Optimized';

    const travelDiff = ((bm.avg_travel_time - om.avg_travel_time) / bm.avg_travel_time * 100);
    const thruDiff = ((om.throughput - bm.throughput) / bm.throughput * 100);

    function row(label, bv, ov, unit, lowerBetter) {
        const ok = lowerBetter ? ov < bv : ov > bv;
        const cls = ok ? 'val-better' : (ov === bv ? 'val-base' : 'val-worse');
        return `<div class="cmp-row">
            <span>${label}</span>
            <span class="val-base">${bv.toFixed(1)}${unit}</span>
            <span class="${cls}">${ov.toFixed(1)}${unit} ${ok ? '✓' : ''}</span>
        </div>`;
    }

    body.innerHTML = `
        <p>The <b style="color:var(--green)">optimized system</b> balanced crowd distribution across paths, reducing congestion and improving flow.</p>
        <div class="obs-label" style="display:flex;justify-content:space-between">
            <span>Metric</span><span style="color:var(--tx)">Baseline → Optimized</span>
        </div>
        ${row('Avg Travel Time', bm.avg_travel_time, om.avg_travel_time, 's', true)}
        ${row('Avg Wait Time', bm.avg_wait_time, om.avg_wait_time, 's', true)}
        ${row('Throughput', bm.throughput, om.throughput, ' p/s', false)}
        ${row('Peak Queue', bm.peak_queue, om.peak_queue, '', true)}

        <div class="obs-label" style="margin-top:16px">Optimization Result</div>
        <ul>
            <li>Congestion materially reduced at <b>${optInsights ? optInsights.bName : runObs.peakNode}</b></li>
            <li>Traffic elegantly redistributed to alternate paths</li>
            <li>Overall movement became significantly smoother and faster</li>
        </ul>
    `;

    actions.innerHTML = `
        <button class="btn" id="btn-final-reset">⟲ Start Over</button>
        <button class="btn" id="btn-final-close">Close</button>
    `;

    document.getElementById('btn-final-reset').addEventListener('click', () => {
        hideOverlay();
        document.getElementById('btn-reset').click();
    });
    document.getElementById('btn-final-close').addEventListener('click', hideOverlay);

    document.getElementById('btn-reset').disabled = false;
    document.getElementById('btn-play').textContent = '✓ Done';
    document.getElementById('btn-play').className = 'btn';

    showOverlay();
}

// ── Overlay Helpers ────────────────────────────────────
function showOverlay() { document.getElementById('end-overlay').classList.remove('hidden'); }
function hideOverlay() { document.getElementById('end-overlay').classList.add('hidden'); }

// ── Canvas Draw ────────────────────────────────────────
const KEY_TYPES = new Set(['gate','exit','entry','platform_seg']);
function isKeyNode(n) {
    return KEY_TYPES.has(n.type) || /gate|exit|entry|platform/i.test(n.name);
}

function drawGraph() {
    ctx.fillStyle = '#060A12';
    ctx.fillRect(0, 0, W, H);
    if (!pos) return;

    const md = DATA.modes[mode];
    const f = SIM.frame;
    const scale = congestionScale();

    // Layer labels
    const LY = { Street: 0.1, Concourse: 0.5, Platform: 0.9 };
    ctx.textAlign = 'left';
    for (const [name, yf] of Object.entries(LY)) {
        if (layer !== 'all' && name.toLowerCase() !== layer) continue;
        const y = 0.08 * H + yf * H * 0.84;
        ctx.strokeStyle = 'rgba(99,179,237,.06)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 7]);
        ctx.beginPath(); ctx.moveTo(55, y); ctx.lineTo(W - 8, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#3B4A63';
        ctx.font = '600 10px Inter,sans-serif';
        ctx.fillText(name, 6, y + 3);
    }

    // Focus zone ambient glow
    const rawRatios = {};
    for (const n of DATA.graph.nodes) {
        const oa = md.node_occupancy[n.id];
        const occ = oa && f < oa.length ? oa[f] : 0;
        rawRatios[n.id] = clamp((occ / (n.capacity || 1)) * scale, 0, 1);
    }
    const rawSorted = Object.entries(rawRatios).sort((a, b) => b[1] - a[1]);
    const top3Raw = rawSorted.slice(0, 3).filter(x => x[1] > 0.2);
    
    if (top3Raw.length > 0) {
        let cx = 0, cy = 0, cc = 0;
        for (const [id] of top3Raw) {
            const p = pos[id];
            if (p) { cx += p.x; cy += p.y; cc++; }
        }
        if (cc > 0) {
            cx /= cc; cy /= cc;
            const grad = ctx.createRadialGradient(cx, cy, 20, cx, cy, 200);
            grad.addColorStop(0, 'rgba(56,189,248,0.08)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);
        }
    }

    // Node ratios (with congestion ampl. and color stabilization)
    const nodeRatios = {};
    const nodes = DATA.graph.nodes;
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const targetRatio = rawRatios[n.id];
        
        let dispRatio = displayedRatios[n.id] !== undefined ? displayedRatios[n.id] : targetRatio;
        if (Math.abs(targetRatio - dispRatio) > 0.1) {
            dispRatio = targetRatio;
            displayedRatios[n.id] = dispRatio;
        }
        nodeRatios[n.id] = dispRatio;
    }
    const sortedNodes = Object.entries(nodeRatios).sort((a, b) => b[1] - a[1]);
    const top3Nodes = new Set(sortedNodes.slice(0, 3).filter(x => x[1] > 0.2).map(x => x[0]));
    const bottleneckId = sortedNodes.length > 0 && sortedNodes[0][1] > 0.3 ? sortedNodes[0][0] : null;

    // Edge flows (with temporal smoothing)
    const edges = DATA.graph.edges;
    const edgeFlows = [];
    let maxFlow = 0;

    for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        const s = pos[e.source], tg = pos[e.target];
        if (!s || !tg) continue;
        if (layer !== 'all' && s.layer !== layer && tg.layer !== layer) continue;
        
        const key = `${e.source}→${e.target}`;
        const fa = md.edge_flows[key];
        const rawFlow = fa && f < fa.length ? fa[f] : 0;
        
        const prev = prevFlows[key] || 0;
        const flow = prev * 0.7 + rawFlow * 0.3;
        prevFlows[key] = flow;
        
        if (flow > maxFlow) maxFlow = flow;
        edgeFlows.push({ idx: i, key, flow, s, tg, cap: e.capacity || 1 });
    }
    if (maxFlow < 0.01) maxFlow = 1;

    const sortedEdges = edgeFlows.slice().sort((a, b) => b.flow - a.flow);
    const topEdges = sortedEdges.slice(0, 4).filter(e => e.flow > 0.1);
    const topEdgeKeys = new Set(topEdges.map(e => e.key));
    
    // Path tracing for dominant route
    const mainRouteSet = new Set();
    if (topEdges.length > 0) {
        let cur = topEdges[0];
        mainRouteSet.add(cur.key);
        let dst = cur.key.split('→')[1];
        
        for (let hop = 0; hop < 3; hop++) {
            const nextEdges = topEdges.filter(e => e.key.startsWith(dst + '→'));
            if (nextEdges.length > 0) {
                cur = nextEdges[0];
                mainRouteSet.add(cur.key);
                dst = cur.key.split('→')[1];
            } else break;
        }
    }

    // Draw edges
    for (const ef of edgeFlows) {
        const { key, s, tg, flow } = ef;
        const flowRatio = clamp(flow / maxFlow, 0, 1);
        
        const isMain = mainRouteSet.has(key);
        const isTop = topEdgeKeys.has(key);

        if (!isTop) {
            ctx.strokeStyle = 'rgba(56,189,248,0.05)';
            ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tg.x, tg.y); ctx.stroke();
            continue;
        }

        let lw = isMain ? 4 : Math.min(1 + flowRatio * 2, 3);
        const alpha = isMain ? 0.9 : 0.3 + flowRatio * 0.3;
        const isBackflow = tg.y < s.y - 10;
        
        let isGlowInc = false, isGlowDec = false, isDecChosen = false;
        
        if (glowPaths && glowPaths.chosenEdge === key) {
            isDecChosen = true;
        }

        if (mode === 'optimized' && optStartTime > 0) {
            const el = performance.now() - optStartTime;
            if (el < 3000) {
                isGlowInc = glowPaths.increased.has(key);
                isGlowDec = glowPaths.decreased.has(key);
            }
        }
        
        if (isGlowInc) {
            ctx.shadowBlur = 12;
            ctx.shadowColor = 'rgba(74, 222, 128, 0.9)';
            ctx.strokeStyle = `rgba(74, 222, 128, 1)`;
            lw = 5;
        } else if (isGlowDec) {
            ctx.shadowBlur = 0;
            ctx.strokeStyle = `rgba(248, 113, 113, 0.4)`;
            lw = 1.5;
        } else if (isDecChosen && STORY !== 'complete') { // Add emphasis pulsing logic for decisions
            ctx.shadowBlur = 8;
            ctx.shadowColor = 'rgba(34, 197, 94, 0.4)';
            ctx.strokeStyle = `rgba(34, 197, 94, 0.8)`;
            lw = Math.max(3.5, lw);
        } else {
            ctx.shadowBlur = 0;
            ctx.strokeStyle = isMain ? `rgba(34,211,238,${alpha})` : (isBackflow ? `rgba(148,163,184,${alpha})` : `rgba(56,189,248,${alpha})`);
        }
        
        ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tg.x, tg.y); ctx.stroke();
        ctx.shadowBlur = 0;

        const ang = Math.atan2(tg.y - s.y, tg.x - s.x);
        
        // Fixed Arrowhead
        const ax = tg.x - Math.cos(ang) * 14;
        const ay = tg.y - Math.sin(ang) * 14;
        const sz = isMain ? 7 : 4 + flowRatio * 2;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - sz * Math.cos(ang - 0.4), ay - sz * Math.sin(ang - 0.4));
        ctx.lineTo(ax - sz * Math.cos(ang + 0.4), ay - sz * Math.sin(ang + 0.4));
        ctx.closePath();
        ctx.fill();
        
        // Static chevrons for direction along the active edge
        if (isMain) {
            const dist = Math.hypot(tg.x - s.x, tg.y - s.y);
            const steps = Math.floor(dist / 40);
            for (let k = 1; k <= steps; k++) {
                const cx = s.x + (tg.x - s.x) * (k / (steps + 1));
                const cy = s.y + (tg.y - s.y) * (k / (steps + 1));
                ctx.beginPath();
                ctx.moveTo(cx - 3 * Math.cos(ang - 0.5), cy - 3 * Math.sin(ang - 0.5));
                ctx.lineTo(cx, cy);
                ctx.lineTo(cx - 3 * Math.cos(ang + 0.5), cy - 3 * Math.sin(ang + 0.5));
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        }
    }

    // Flow dots (Main route only)
    if (SIM.isRunning && mainRouteSet.size > 0) {
        const t = (performance.now() % 2000) / 2000;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        for (const ef of edgeFlows) {
            if (!mainRouteSet.has(ef.key)) continue;
            const { s, tg } = ef;
            const d1 = t;
            const d2 = (t + 0.5) % 1;
            ctx.beginPath(); ctx.arc(lerp(s.x, tg.x, d1), lerp(s.y, tg.y, d1), 2.5, 0, 6.2832); ctx.fill();
            ctx.beginPath(); ctx.arc(lerp(s.x, tg.x, d2), lerp(s.y, tg.y, d2), 2.5, 0, 6.2832); ctx.fill();
        }
    }

    // Draw nodes with interpolated radii
    ctx.textAlign = 'center';
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (layer !== 'all' && n.layer !== layer) continue;
        const p = pos[n.id];
        if (!p) continue;

        const ratio = nodeRatios[n.id];
        const targetR = clamp(6 + ratio * 10, 6, 16);

        // Smooth radius interpolation heavily — prevents jarring size jumps
        const prevR = prevRadii[n.id] !== undefined ? prevRadii[n.id] : targetR;
        const smoothR = lerp(prevR, targetR, 0.2);
        prevRadii[n.id] = smoothR;

        const r = Math.round(smoothR);
        const px = Math.round(p.x);
        const py = Math.round(p.y);

        let fill;
        if (n.type === 'entry') fill = '#60A5FA';
        else if (n.type === 'exit') fill = '#A78BFA';
        else fill = nodeColor(ratio);

        if (ratio < 0.1 && n.type !== 'entry' && n.type !== 'exit') {
            ctx.globalAlpha = 0.45;
        }

        ctx.beginPath();
        ctx.arc(px, py, r, 0, 6.2832);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;

        if (ratio > 0.75 && n.type !== 'entry' && n.type !== 'exit') {
            ctx.beginPath(); ctx.arc(px, py, r + 3, 0, 6.2832);
            ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.stroke();
        } else if (top3Nodes.has(n.id) && n.type !== 'entry' && n.type !== 'exit') {
            ctx.beginPath(); ctx.arc(px, py, r + 2, 0, 6.2832);
            ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
        }

        if (hoverNode && hoverNode.id === n.id) {
            ctx.beginPath(); ctx.arc(px, py, r + 1, 0, 6.2832);
            ctx.strokeStyle = '#FFF'; ctx.lineWidth = 2.5; ctx.stroke();
        }

        const showLabel = isKeyNode(n) || ratio > 0.5;
        if (showLabel) {
            ctx.fillStyle = ratio < 0.1 ? 'rgba(136,153,170,0.5)' : '#8899AA';
            ctx.font = '10px JetBrains Mono,monospace';
            let lbl = n.name;
            if (lbl.length > 11) lbl = lbl.slice(0, 10) + '…';
            ctx.fillText(lbl, px, py + r + 13);
        }

        if (n.type === 'entry') {
            ctx.fillStyle = '#60A5FA'; ctx.font = '600 8px Inter,sans-serif';
            ctx.fillText('ENTRY', px, py - r - 5);
        } else if (n.type === 'exit') {
            ctx.fillStyle = '#A78BFA'; ctx.font = '600 8px Inter,sans-serif';
            ctx.fillText('EXIT', px, py - r - 5);
        }

        if (n.id === bottleneckId && n.type !== 'entry' && n.type !== 'exit') {
            let inF = 0, outF = 0;
            for (const [k, a] of Object.entries(md.edge_flows)) {
                const fv = a && f < a.length ? a[f] : 0;
                if (k.endsWith('→' + n.id)) inF += fv;
                if (k.startsWith(n.id + '→')) outF += fv;
            }
            let reason = 'Overloaded';
            if (inF > outF * 1.3) reason = 'Queue forming';
            else if (ratio > 0.9) reason = 'Near capacity';
            ctx.fillStyle = '#ef4444'; ctx.font = '600 9px Inter,sans-serif';
            ctx.fillText(`⚠ ${reason}`, px, py - r - 5);
        }
    }
}

// ── Tooltip ────────────────────────────────────────────
function showTip(n, cx, cy) {
    const tip = document.getElementById('graph-tooltip');
    const md = DATA.modes[mode];
    const f = SIM.frame;
    const oa = md.node_occupancy[n.id];
    const qa = md.queue_lengths[n.id];
    const occ = oa && f < oa.length ? oa[f] : 0;
    const q = qa && f < qa.length ? qa[f] : 0;
    const ratio = clamp(occ / (n.capacity || 1), 0, 1);
    const [sl, sc] = congLabel(ratio);

    if (lastHover !== n.id) {
        lastHover = n.id;
        tip.innerHTML = `<div class="tt-n">${n.name}</div>
<div class="tt-r"><span>People</span><span id="tt-o">${occ.toFixed(0)} / ${n.capacity}</span></div>
<div class="tt-r"><span>Queue</span><span id="tt-q">${q.toFixed(1)}</span></div>
<div class="tt-r tt-s"><span>Status</span><span id="tt-s" style="color:${sc}">${sl}</span></div>`;
    } else {
        const eo = document.getElementById('tt-o');
        const eq = document.getElementById('tt-q');
        const es = document.getElementById('tt-s');
        if (eo) eo.textContent = `${occ.toFixed(0)} / ${n.capacity}`;
        if (eq) eq.textContent = q.toFixed(1);
        if (es) { es.textContent = sl; es.style.color = sc; }
    }
    tip.classList.remove('hidden');
    tip.style.left = (cx + 14) + 'px';
    tip.style.top = (cy - 10) + 'px';
}
function hideTip() { document.getElementById('graph-tooltip').classList.add('hidden'); lastHover = null; }

// ── Node Click Popup ───────────────────────────────────
function showPopup(n, cx, cy) {
    const popup = document.getElementById('node-popup');
    const md = DATA.modes[mode];
    const f = SIM.frame;
    const oa = md.node_occupancy[n.id];
    const qa = md.queue_lengths[n.id];
    const occ = oa && f < oa.length ? oa[f] : 0;
    const q = qa && f < qa.length ? qa[f] : 0;
    const ratio = clamp(occ / (n.capacity || 1), 0, 1);
    const [sl, sc] = congLabel(ratio);

    let inFlow = 0, outFlow = 0;
    for (const [k, a] of Object.entries(md.edge_flows)) {
        const fv = a && f < a.length ? a[f] : 0;
        if (k.endsWith('→' + n.id)) inFlow += fv;
        if (k.startsWith(n.id + '→')) outFlow += fv;
    }
    const inLbl = inFlow > 4 ? 'High' : inFlow > 1.5 ? 'Medium' : 'Low';
    const outLbl = outFlow > 4 ? 'High' : outFlow > 1.5 ? 'Medium' : 'Low';

    popup.innerHTML = `<button class="np-close" onclick="hidePopup()">✕</button>
<div class="np-name">${n.name}</div>
<div class="np-row"><span>People</span><b>${occ.toFixed(0)} / ${n.capacity}</b></div>
<div class="np-row"><span>Queue</span><b>${q.toFixed(1)}</b></div>
<div class="np-row"><span>Status</span><b style="color:${sc}">${sl}</b></div>
<div class="np-row"><span>Incoming</span><b>${inLbl} (${inFlow.toFixed(1)})</b></div>
<div class="np-row"><span>Outgoing</span><b>${outLbl} (${outFlow.toFixed(1)})</b></div>`;

    popup.classList.remove('hidden');
    popup.style.left = Math.min(cx + 16, window.innerWidth - 210) + 'px';
    popup.style.top = Math.min(cy - 20, window.innerHeight - 200) + 'px';
}
function hidePopup() { document.getElementById('node-popup').classList.add('hidden'); }
window.hidePopup = hidePopup;

// ── Chart ──────────────────────────────────────────────
const COLORS = ['#38BDF8', '#22c55e', '#eab308'];

// Plugin definition for Chart.js
const verticalLinePlugin = {
    id: 'verticalLine',
    afterDraw: (chart) => {
        if (typeof SIM !== 'undefined' && SIM.isRunning) {
            const ctx = chart.ctx;
            const x = chart.scales.x.getPixelForTick(SIM.frame);
            const topY = chart.scales.y.top;
            const bottomY = chart.scales.y.bottom;
            
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x, topY);
            ctx.lineTo(x, bottomY);
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.setLineDash([3, 3]);
            ctx.stroke();
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.textAlign = 'center';
            ctx.font = '9px JetBrains Mono';
            ctx.fillText('Current step', x, topY - 5);
            ctx.restore();
        }
    }
};

function topKeys(m, key, n = 3) {
    const d = DATA.modes[m][key];
    return Object.entries(d).map(([id, v]) => ({ id, pk: Math.max(...v) })).sort((a, b) => b.pk - a.pk).slice(0, n).map(x => x.id);
}

function updateChart() {
    if (!DATA) return;
    const steps = Array.from({ length: DATA.meta.steps }, (_, i) => i);
    // Use fixed baseline nodes to keep lines strictly stable between modes
    const top = topKeys('baseline', 'node_occupancy', 3);
    const nodes = DATA.graph.nodes;

    if (!occChart) {
        occChart = new Chart(document.getElementById('occ-chart'), {
            type: 'line',
            data: {
                labels: steps,
                datasets: top.map((id, i) => {
                    const n = nodes.find(x => x.id === id);
                    return { label: n ? n.name : id, id: id, data: DATA.modes[mode].node_occupancy[id] || [], borderColor: COLORS[i], borderWidth: 1.5, fill: false };
                }),
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: { 
                    legend: { labels: { color: '#94A3B8', font: { family: 'JetBrains Mono', size: 9 }, boxWidth: 8 } }
                },
                onHover: (event, chartElement) => {
                    if (chartElement && chartElement.length > 0) {
                        const datasetIndex = chartElement[0].datasetIndex;
                        const id = occChart.data.datasets[datasetIndex].id;
                        hoverNode = { id: id };
                    } else {
                        hoverNode = null;
                    }
                },
                scales: {
                    x: { ticks: { color: '#475569', maxTicksLimit: 8, font: { size: 8 } }, grid: { color: 'rgba(99,179,237,.04)' } },
                    y: { beginAtZero: true, ticks: { color: '#475569', font: { size: 8 } }, grid: { color: 'rgba(99,179,237,.04)' } },
                },
                elements: { point: { radius: 0, hitRadius: 8, hoverRadius: 4 }, line: { tension: 0, borderWidth: 1.5 } },
            },
            plugins: [verticalLinePlugin]
        });
    } else {
        occChart.data.datasets = top.map((id, i) => {
            const n = nodes.find(x => x.id === id);
            return { label: n ? n.name : id, id: id, data: DATA.modes[mode].node_occupancy[id] || [], borderColor: COLORS[i], borderWidth: 1.5, fill: false };
        });
        occChart.update();
    }
}

// ── Comparison Table ───────────────────────────────────
function renderTable() {
    if (!DATA) return;
    const MS = ['baseline', 'biased', 'selfish', 'optimized'];
    const MET = [
        { key: 'avg_travel_time', label: 'Avg Travel (s)', lb: true },
        { key: 'avg_wait_time', label: 'Avg Wait (s)', lb: true },
        { key: 'peak_queue', label: 'Peak Queue', lb: true },
        { key: 'throughput', label: 'Throughput', lb: false },
    ];
    document.getElementById('cmp-tbody').innerHTML = MET.map(m => {
        const bv = DATA.modes.baseline.metrics_summary[m.key];
        return `<tr><td>${m.label}</td>${MS.map(md => {
            const v = DATA.modes[md].metrics_summary[m.key];
            if (md === 'baseline') return `<td class="base">${v.toFixed(1)}</td>`;
            const ok = m.lb ? v < bv : v > bv;
            return `<td class="${ok ? 'better' : 'worse'}">${v.toFixed(1)}${ok ? ' ↓' : ' ↑'}</td>`;
        }).join('')}</tr>`;
    }).join('');
}
