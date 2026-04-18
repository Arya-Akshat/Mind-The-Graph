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
    });

    resetBtn.addEventListener('click', () => {
        SIM.frame = 0;
        SIM.isRunning = false;
        SIM.finished = false;
        mode = 'baseline';
        STORY = 'ready';
        prevOcc = {};
        prevRadii = {};
        prevFlows = {};
        displayedRatios = {};
        runObs = { peakNode: '', peakOcc: 0, peakCap: 0, peakFrame: 0 };
        keyMoments = { firstCongestion: false, peakFrame: -1, peakFired: false };

        playBtn.textContent = '▶ Start Baseline';
        playBtn.disabled = false;
        playBtn.className = 'btn btn-primary';
        pauseBtn.disabled = true;
        stepBtn.disabled = true;
        resetBtn.disabled = true;

        hidePauseMsg();
        hideOverlay();
        setPhase('ready');
        refresh();
        drawGraph();
        document.getElementById('narration').textContent = 'Press Start to watch how crowd moves through the station.';
        document.getElementById('key-insight').textContent = '';
    });

    // Continue button (in pause message bar)
    document.getElementById('btn-continue').addEventListener('click', () => {
        hidePauseMsg();
        playBtn.click();
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
function updateIntelligence() {
    if (!DATA) return;
    const md = DATA.modes[mode];
    const f = SIM.frame;
    const nodes = DATA.graph.nodes;
    const ef = md.edge_flows;

    const curOcc = {};
    let totalOcc = 0, totalCap = 0;
    for (const n of nodes) {
        const oa = md.node_occupancy[n.id];
        const occ = oa && f < oa.length ? oa[f] : 0;
        curOcc[n.id] = occ;
        totalOcc += occ;
        totalCap += n.capacity;
    }

    // System status
    const avgRatio = totalCap > 0 ? totalOcc / totalCap : 0;
    const displayAvg = avgRatio * congestionScale();
    const dot = document.getElementById('sys-dot');
    const lbl = document.getElementById('sys-label');
    if (displayAvg < 0.2)       { dot.className = 'sys-dot green'; lbl.textContent = 'Smooth'; }
    else if (displayAvg < 0.45) { dot.className = 'sys-dot yellow'; lbl.textContent = 'Building congestion'; }
    else                        { dot.className = 'sys-dot red'; lbl.textContent = 'Heavy congestion'; }

    // Busiest node
    let maxOcc = 0, busiestId = '', busiestName = '';
    for (const n of nodes) {
        if (curOcc[n.id] > maxOcc) { maxOcc = curOcc[n.id]; busiestId = n.id; busiestName = n.name; }
    }
    const busiestNode = nodes.find(x => x.id === busiestId);
    const busiestCap = busiestNode ? busiestNode.capacity : 1;
    const busiestRatio = clamp((maxOcc / busiestCap) * congestionScale(), 0, 1);

    // Track peak for summary
    if (maxOcc > runObs.peakOcc) {
        runObs.peakOcc = maxOcc;
        runObs.peakNode = busiestName;
        runObs.peakCap = busiestCap;
        runObs.peakFrame = f;
    }

    // In/out flows
    const nodeInFlow = {}, nodeOutFlow = {};
    for (const [k, a] of Object.entries(ef)) {
        const fv = a && f < a.length ? a[f] : 0;
        const [src, dst] = k.split('→');
        nodeOutFlow[src] = (nodeOutFlow[src] || 0) + fv;
        nodeInFlow[dst] = (nodeInFlow[dst] || 0) + fv;
    }

    // Top edges
    const edgeList = [];
    for (const [key, arr] of Object.entries(ef)) {
        const fv = arr && f < arr.length ? arr[f] : 0;
        if (fv > 0.3) edgeList.push({ key, fv });
    }
    edgeList.sort((a, b) => b.fv - a.fv);
    const top2Edges = edgeList.slice(0, 2);

    // Flow chain
    let mainFlowText = '—';
    if (top2Edges.length > 0) {
        const [src0, dst0] = top2Edges[0].key.split('→');
        const chain = [nodeName(src0), nodeName(dst0)];
        let cur = dst0;
        for (let hop = 0; hop < 2; hop++) {
            let bestNext = '', bestF = 0;
            for (const [k, a] of Object.entries(ef)) {
                if (!k.startsWith(cur + '→')) continue;
                const fv = a && f < a.length ? a[f] : 0;
                if (fv > bestF) { bestF = fv; bestNext = k.split('→')[1]; }
            }
            if (bestNext && bestF > 0.3) { chain.push(nodeName(bestNext)); cur = bestNext; }
            else break;
        }
        mainFlowText = chain.join(' → ');
    }
    document.getElementById('flow-line').textContent = `Main flow: ${mainFlowText}`;

    const entries = nodes.filter(n => n.type === 'entry');
    const entryNames = entries.map(n => n.name).join(' and ');

    // 3-layer explanation
    let flowTxt, pressureTxt, impactTxt;

    if (f === 0) {
        flowTxt = '—'; pressureTxt = '—'; impactTxt = '—';
    } else {
        if (top2Edges.length >= 2) {
            const p1 = top2Edges[0].key.split('→').map(nodeName);
            const p2 = top2Edges[1].key.split('→').map(nodeName);
            flowTxt = `People moving from ${entryNames} toward ${p1[1]} and ${p2[1]}.`;
        } else if (top2Edges.length === 1) {
            const p1 = top2Edges[0].key.split('→').map(nodeName);
            flowTxt = `People moving from ${entryNames} toward ${p1[1]}.`;
        } else {
            flowTxt = 'Light movement across all paths.';
        }

        const pressureNodes = [];
        for (const n of nodes) {
            if (n.type === 'entry' || n.type === 'exit') continue;
            const inF = nodeInFlow[n.id] || 0;
            const outF = nodeOutFlow[n.id] || 0;
            const ratio = clamp((curOcc[n.id] / (n.capacity || 1)) * congestionScale(), 0, 1);
            if (inF > outF * 1.2 && ratio > 0.3) {
                pressureNodes.push({ name: n.name, inF, outF, ratio });
            }
        }
        pressureNodes.sort((a, b) => b.ratio - a.ratio);

        if (pressureNodes.length > 0) {
            const pn = pressureNodes[0];
            pressureTxt = `Traffic building at ${pn.name} — more arriving (${pn.inF.toFixed(0)}) than leaving (${pn.outF.toFixed(0)}).`;
        } else if (busiestRatio > 0.5) {
            pressureTxt = `${busiestName} is the busiest area with ${maxOcc.toFixed(0)} people.`;
        } else {
            pressureTxt = 'No pressure points — traffic flowing smoothly.';
        }

        let trending = 'stable';
        if (Object.keys(prevOcc).length > 0) {
            const delta = curOcc[busiestId] - (prevOcc[busiestId] || 0);
            if (delta > 0.5) trending = 'increasing';
            else if (delta < -0.5) trending = 'decreasing';
        }

        if (busiestRatio > 0.75 && trending === 'increasing') {
            impactTxt = `⚠ Queue forming at ${busiestName} — movement slowing.`;
        } else if (busiestRatio > 0.75) {
            impactTxt = `${busiestName} near capacity — waits expected.`;
        } else if (busiestRatio > 0.5 && trending === 'increasing') {
            impactTxt = `Crowd at ${busiestName} growing — could bottleneck soon.`;
        } else if (trending === 'decreasing') {
            impactTxt = 'Congestion easing — crowd dispersing.';
        } else {
            impactTxt = 'System flowing normally — no delays expected.';
        }
    }

    document.getElementById('st-flow').textContent = flowTxt;
    document.getElementById('st-pressure').textContent = pressureTxt;
    document.getElementById('st-impact').textContent = impactTxt;

    // Key insight
    let insightTxt = '';
    if (f > 0) {
        if (busiestRatio > 0.75) {
            const inF = nodeInFlow[busiestId] || 0;
            const outF = nodeOutFlow[busiestId] || 0;
            insightTxt = inF > outF * 1.3
                ? `💡 ${busiestName} is a bottleneck — more arriving than can leave.`
                : `💡 ${busiestName} at ${(busiestRatio * 100).toFixed(0)}% capacity.`;
        } else if (busiestRatio > 0.5) {
            insightTxt = `💡 Watch ${busiestName} — crowd building, may cause delays.`;
        } else {
            insightTxt = '💡 All areas flowing well — no bottlenecks.';
        }
    }
    document.getElementById('key-insight').textContent = insightTxt;

    // What changed
    let changeTxt = '';
    if (f === 0 || Object.keys(prevOcc).length === 0) {
        changeTxt = 'Waiting for simulation…';
    } else {
        let bigInc = '', bigIncV = 0, bigDec = '', bigDecV = 0;
        for (const n of nodes) {
            const prev = prevOcc[n.id] || 0;
            const d = curOcc[n.id] - prev;
            if (d > bigIncV) { bigIncV = d; bigInc = n.name; }
            if (d < bigDecV) { bigDecV = d; bigDec = n.name; }
        }
        const parts = [];
        if (bigIncV > 0.5) parts.push(`+${bigIncV.toFixed(0)} people to ${bigInc}`);
        if (bigDecV < -0.5) parts.push(`${Math.abs(bigDecV).toFixed(0)} left ${bigDec}`);
        changeTxt = parts.length > 0 ? parts.join('. ') + '.' : 'No significant changes.';
    }
    document.getElementById('change-text').textContent = changeTxt;

    prevOcc = { ...curOcc };
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
        if (SIM.frame >= SIM.max) {
            SIM.frame = SIM.max - 1;
            SIM.isRunning = false;
            SIM.finished = true;
            onRunComplete();
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
    requestAnimationFrame(loop);
}

// ════════════════════════════════════════════════════════
// RUN COMPLETE — show summary overlay
// ════════════════════════════════════════════════════════
function onRunComplete() {
    const playBtn = document.getElementById('btn-play');
    const pauseBtn = document.getElementById('btn-pause');
    const resetBtn = document.getElementById('btn-reset');
    const stepBtn = document.getElementById('btn-step');

    playBtn.disabled = true;
    pauseBtn.disabled = true;
    stepBtn.disabled = true;
    resetBtn.disabled = false;

    hidePauseMsg();
    setPhase('done');
    updateFrameUI();
    updateNarration();
    updateIntelligence();
    drawGraph();

    const modeLabel = mode === 'baseline' ? 'Baseline' : 'Optimized';
    document.getElementById('narration').textContent = `[${modeLabel}] Simulation complete — ${SIM.max} steps finished.`;

    if (STORY === 'baseline_run') {
        STORY = 'baseline_done';
        showBaselineSummary();
    } else if (STORY === 'optimized_run') {
        STORY = 'comparison';
        showComparisonSummary();
    }
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

    const playBtn = document.getElementById('btn-play');
    playBtn.textContent = '▶ Running Optimized…';
    playBtn.className = 'btn btn-optimized';
    playBtn.disabled = true;
    document.getElementById('btn-pause').disabled = false;
    document.getElementById('btn-step').disabled = true;
    document.getElementById('btn-reset').disabled = true;

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

        <div class="obs-label" style="margin-top:16px">Impact</div>
        <ul>
            <li>Travel time improved by <b style="color:var(--green)">${travelDiff.toFixed(0)}%</b></li>
            <li>Throughput increased by <b style="color:var(--green)">${thruDiff.toFixed(0)}%</b></li>
            <li>Better distribution reduced bottleneck formation</li>
            <li>Flow was smoother with fewer congested areas</li>
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

        const lw = isMain ? 4 : Math.min(1 + flowRatio * 2, 3);
        const alpha = isMain ? 0.9 : 0.3 + flowRatio * 0.3;
        const isBackflow = tg.y < s.y - 10;
        
        ctx.strokeStyle = isMain ? `rgba(34,211,238,${alpha})` : (isBackflow ? `rgba(148,163,184,${alpha})` : `rgba(56,189,248,${alpha})`);
        ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tg.x, tg.y); ctx.stroke();

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

function topKeys(m, key, n = 3) {
    const d = DATA.modes[m][key];
    return Object.entries(d).map(([id, v]) => ({ id, pk: Math.max(...v) })).sort((a, b) => b.pk - a.pk).slice(0, n).map(x => x.id);
}

function updateChart() {
    if (!DATA) return;
    const steps = Array.from({ length: DATA.meta.steps }, (_, i) => i);
    const top = topKeys(mode, 'node_occupancy');

    if (!occChart) {
        occChart = new Chart(document.getElementById('occ-chart'), {
            type: 'line',
            data: {
                labels: steps,
                datasets: top.map((id, i) => ({ label: id, data: DATA.modes[mode].node_occupancy[id] || [], borderColor: COLORS[i], borderWidth: 1.5, fill: false })),
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: { legend: { labels: { color: '#94A3B8', font: { family: 'JetBrains Mono', size: 9 }, boxWidth: 8 } } },
                scales: {
                    x: { ticks: { color: '#475569', maxTicksLimit: 8, font: { size: 8 } }, grid: { color: 'rgba(99,179,237,.04)' } },
                    y: { beginAtZero: true, ticks: { color: '#475569', font: { size: 8 } }, grid: { color: 'rgba(99,179,237,.04)' } },
                },
                elements: { point: { radius: 0 }, line: { tension: 0, borderWidth: 1.5 } },
            },
        });
    } else {
        occChart.data.datasets = top.map((id, i) => ({ label: id, data: DATA.modes[mode].node_occupancy[id] || [], borderColor: COLORS[i], borderWidth: 1.5, fill: false }));
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
