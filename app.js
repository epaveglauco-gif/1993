'use strict';
/* ================= utilitários ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const PI = Math.PI, SQ2 = Math.SQRT2, SQ3 = Math.sqrt(3), MU0 = 4 * PI * 1e-7;
const store = {
  get(k, d) { try { const v = localStorage.getItem('uc1993:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('uc1993:' + k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } }
};
const nf = (x, d) => {
  if (!isFinite(x)) return x > 0 ? '∞' : '—';
  return new Intl.NumberFormat('pt-PT', { maximumFractionDigits: d, minimumFractionDigits: 0, useGrouping: Math.abs(x) >= 10000 }).format(x);
};
// número com cerca de 3 algarismos significativos
const sig = (x, s = 3) => {
  if (!isFinite(x)) return x > 0 ? '∞' : '—';
  if (x === 0) return '0';
  const a = Math.abs(x), d = Math.max(0, s - 1 - Math.floor(Math.log10(a)));
  return nf(x, Math.min(d, 6));
};
const PREF = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'μ'], [1e-9, 'n'], [1e-12, 'p']];
// formatação de engenharia: 0,0047 F → 4,7 mF
const eng = (x, u = '', s = 3) => {
  if (!isFinite(x)) return (x > 0 ? '∞' : '—') + (u ? ' ' + u : '');
  if (x === 0) return '0 ' + u;
  const a = Math.abs(x);
  let p = PREF.find(([f]) => a >= f * 0.9995) || PREF[PREF.length - 1];
  return sig(x / p[0], s) + ' ' + p[1] + u;
};
const deg = r => r * 180 / PI, rad = d => d * PI / 180;
const parseNum = s => {
  s = String(s).trim().replace(/\s/g, '').replace(',', '.');
  if (s === '' || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
  return parseFloat(s);
};
const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let UID = 0;
const uid = p => (p || 'u') + (++UID);

/* ---------- controlos deslizantes ---------- */
// def: {k,label,min,max,v,step?,log?,unit?,f?(fmt)}
function snap(d, v) {
  if (d.log) { const e = Math.pow(10, Math.floor(Math.log10(v)) - 1); return Math.round(v / e) * e; }
  const st = d.step || (d.max - d.min) / 1000;
  return Math.round((v - d.min) / st) * st + d.min;
}
const toPos = (d, v) => d.log ? 1000 * Math.log(v / d.min) / Math.log(d.max / d.min) : 1000 * (v - d.min) / (d.max - d.min);
const fromPos = (d, p) => snap(d, d.log ? d.min * Math.pow(d.max / d.min, p / 1000) : d.min + (d.max - d.min) * p / 1000);
function slidersHTML(id, defs) {
  return defs.map(d => `<div class="rng"><label for="${id}-${d.k}">${d.label}</label><input type="range" id="${id}-${d.k}" min="0" max="1000" step="1"><output id="${id}-${d.k}-o" for="${id}-${d.k}"></output></div>`).join('');
}
function bindSliders(root, id, defs, cb) {
  const vals = {};
  const show = d => { const o = $('#' + id + '-' + d.k + '-o', root); o.textContent = d.f ? d.f(vals[d.k]) : eng(vals[d.k], d.unit || ''); };
  defs.forEach(d => {
    const el = $('#' + id + '-' + d.k, root);
    vals[d.k] = d.v; el.value = Math.round(toPos(d, d.v)); show(d);
    el.addEventListener('input', () => { vals[d.k] = fromPos(d, +el.value); show(d); cb(vals); });
  });
  const api = {
    vals,
    set(k, v) { const d = defs.find(x => x.k === k); vals[k] = v; $('#' + id + '-' + k, root).value = Math.round(toPos(d, v)); show(d); }
  };
  cb(vals);
  return api;
}
const readout = items => '<div class="readout">' + items.map(([k, v, cls]) => `<div class="${cls && cls.includes('wide') ? 'wide' : ''}"><span class="k">${k}</span><span class="v ${cls && cls.includes('hi') ? 'hi' : ''}">${v}</span></div>`).join('') + '</div>';
function seg(id, opts, cur) {
  return `<div class="seg" role="group" id="${id}">` + opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === cur}">${l}</button>`).join('') + '</div>';
}
function bindSeg(root, id, cb) {
  const g = $('#' + id, root);
  g.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $$('button', g).forEach(x => x.setAttribute('aria-pressed', x === b));
    cb(b.dataset.v);
  });
}
const toolHead = (title, sub) => `<span class="tag">Instrumento</span><h4>${title}</h4>${sub ? `<p style="color:var(--muted);font-size:.92rem">${sub}</p>` : ''}`;

/* ---------- desenho em canvas (ecrã tipo osciloscópio) ---------- */
function scopeCanvas(cv, W = 640, H = 300) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, W, H };
}
const LCD = { bg: '#0A1A33', grid: 'rgba(98,240,214,.13)', axis: 'rgba(98,240,214,.35)', ch1: '#FFD54A', ch2: '#5EC8FF', ch3: '#FF7A9C', ink: '#B9CBE6', hi: '#62F0D6' };
function scopeGrid(g, W, H, nx = 10, ny = 8) {
  g.fillStyle = LCD.bg; g.fillRect(0, 0, W, H);
  g.strokeStyle = LCD.grid; g.lineWidth = 1; g.beginPath();
  for (let i = 0; i <= nx; i++) { const x = Math.round(i * W / nx) + .5; g.moveTo(x, 0); g.lineTo(x, H); }
  for (let j = 0; j <= ny; j++) { const y = Math.round(j * H / ny) + .5; g.moveTo(0, y); g.lineTo(W, y); }
  g.stroke();
  g.strokeStyle = LCD.axis; g.beginPath(); g.moveTo(0, H / 2 + .5); g.lineTo(W, H / 2 + .5); g.stroke();
}
function trace(g, fn, x0, x1, W, H, ymax, color, width = 2.2, dash) {
  g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash || []); g.beginPath();
  for (let px = 0; px <= W; px++) {
    const t = x0 + (x1 - x0) * px / W, y = H / 2 - fn(t) / ymax * (H / 2);
    px ? g.lineTo(px, y) : g.moveTo(px, y);
  }
  g.stroke(); g.setLineDash([]);
}
function label(g, txt, x, y, color, align = 'left') {
  g.font = '600 12px "JetBrains Mono", monospace'; g.fillStyle = color; g.textAlign = align; g.fillText(txt, x, y);
}

/* ---------- gráficos SVG ---------- */
// fasores: lista {x,y,c,l,dash} em unidades; desenha centrado em (0,0)
function phasorSVG(vecs, opts = {}) {
  const W = opts.W || 320, H = opts.H || 280, cx = opts.cx ?? 70, cy = opts.cy ?? H / 2;
  let m = 1e-12; vecs.forEach(v => { m = Math.max(m, Math.abs(v.x), Math.abs(v.y), Math.abs((v.x0 || 0) + v.x), Math.abs((v.y0 || 0) + v.y)); });
  const k = Math.min((W - cx - 40), (H / 2 - 24)) / m;
  let s = `<svg class="plot" viewBox="0 0 ${W} ${H}" role="img" aria-label="${opts.aria || 'Diagrama vetorial'}"><defs>`;
  vecs.forEach((v, i) => { s += `<marker id="${opts.id}-a${i}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:${v.c}"/></marker>`; });
  s += `</defs><line x1="10" y1="${cy}" x2="${W - 10}" y2="${cy}" style="stroke:var(--line)"/><line x1="${cx}" y1="10" x2="${cx}" y2="${H - 10}" style="stroke:var(--line)"/>`;
  vecs.forEach((v, i) => {
    const x0 = cx + (v.x0 || 0) * k, y0 = cy - (v.y0 || 0) * k, x1 = x0 + v.x * k, y1 = y0 - v.y * k;
    if (Math.hypot(x1 - x0, y1 - y0) < 2) return;
    s += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" style="stroke:${v.c};stroke-width:${v.w || 2.6};${v.dash ? 'stroke-dasharray:5 4;' : ''}" marker-end="url(#${opts.id}-a${i})"/>`;
    if (v.l) { const lx = x1 + (v.lx || 6), ly = y1 + (v.ly ?? (v.y >= 0 ? -6 : 14)); s += `<text x="${lx}" y="${ly}" style="fill:${v.c};font-weight:700">${v.l}</text>`; }
  });
  if (opts.arc) { const r = 30, a = opts.arc; const x = cx + r * Math.cos(a), y = cy - r * Math.sin(a); s += `<path d="M${cx + r},${cy} A${r},${r} 0 0 ${a > 0 ? 0 : 1} ${x},${y}" style="fill:none;stroke:var(--muted)"/><text x="${cx + r + 6}" y="${cy + (a > 0 ? -6 : 16)}">φ</text>`; }
  return s + '</svg>';
}
// gráfico x-y simples
function linePlot(o) {
  const W = o.W || 560, H = o.H || 260, L = 52, R = 14, T = 14, B = 34;
  const xs = v => o.xlog ? L + (W - L - R) * Math.log(v / o.x0) / Math.log(o.x1 / o.x0) : L + (W - L - R) * (v - o.x0) / (o.x1 - o.x0);
  const ys = v => T + (H - T - B) * (1 - (v - o.y0) / (o.y1 - o.y0));
  let s = `<svg class="plot" viewBox="0 0 ${W} ${H}" role="img" aria-label="${o.aria || ''}">`;
  (o.yt || []).forEach(v => { const y = ys(v); s += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" style="stroke:var(--line)"/><text x="${L - 6}" y="${y + 4}" text-anchor="end">${o.yf ? o.yf(v) : sig(v)}</text>`; });
  (o.xt || []).forEach(v => { const x = xs(v); s += `<line y1="${T}" y2="${H - B}" x1="${x}" x2="${x}" style="stroke:var(--line);stroke-dasharray:2 3"/><text x="${x}" y="${H - B + 16}" text-anchor="middle">${o.xf ? o.xf(v) : sig(v)}</text>`; });
  if (o.xl) s += `<text x="${W - R}" y="${H - 4}" text-anchor="end">${o.xl}</text>`;
  if (o.yl) s += `<text x="${L - 46}" y="${T + 2}" text-anchor="start" dominant-baseline="hanging" transform="rotate(0)">${o.yl}</text>`;
  (o.series || []).forEach(sr => {
    const d = sr.pts.map((p, i) => (i ? 'L' : 'M') + xs(p[0]).toFixed(1) + ',' + Math.max(T - 2, Math.min(H - B + 2, ys(p[1]))).toFixed(1)).join('');
    if (sr.fill) s += `<path d="${d}L${xs(sr.pts[sr.pts.length - 1][0])},${ys(o.y0)}L${xs(sr.pts[0][0])},${ys(o.y0)}z" style="fill:${sr.c};opacity:.12"/>`;
    s += `<path d="${d}" style="fill:none;stroke:${sr.c};stroke-width:${sr.w || 2.4};${sr.dash ? 'stroke-dasharray:6 4' : ''}"/>`;
  });
  (o.vlines || []).forEach(v => { const x = xs(v.x); s += `<line x1="${x}" x2="${x}" y1="${T}" y2="${H - B}" style="stroke:${v.c};stroke-width:1.6;${v.dash ? 'stroke-dasharray:4 3' : ''}"/>${v.l ? `<text x="${x + 5}" y="${T + 12}" style="fill:${v.c}">${v.l}</text>` : ''}`; });
  (o.dots || []).forEach(p => { s += `<circle cx="${xs(p.x)}" cy="${ys(p.y)}" r="5" style="fill:${p.c};stroke:var(--surface);stroke-width:2"/>${p.l ? `<text x="${xs(p.x) + 8}" y="${ys(p.y) - 8}" style="fill:${p.c};font-weight:700">${p.l}</text>` : ''}`; });
  s += `<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" style="stroke:var(--muted)"/><line x1="${L}" x2="${L}" y1="${T}" y2="${H - B}" style="stroke:var(--muted)"/>`;
  return s + '</svg>';
}
const niceTicks = (a, b, n = 5) => {
  const span = b - a, step0 = span / n, m = Math.pow(10, Math.floor(Math.log10(step0))), f = step0 / m;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * m, out = [];
  for (let v = Math.ceil(a / step) * step; v <= b + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
};
const logTicks = (a, b) => { const out = []; for (let e = Math.floor(Math.log10(a)); e <= Math.ceil(Math.log10(b)); e++) [1, 2, 5].forEach(m => { const v = m * Math.pow(10, e); if (v >= a * 0.999 && v <= b * 1.001) out.push(v); }); return out; };
/* ================= instrumentos da Parte 1 ================= */
const TOOLS = {};

/* --- conversor de prefixos --- */
TOOLS.prefixos = (p, id) => {
  const opt = PREF.map(([f, s]) => `<option value="${f}">${s || '(unidade)'}</option>`).join('');
  p.innerHTML = toolHead('Conversor de prefixos', 'Escreva um valor e escolha o prefixo de origem e o de destino.') +
    `<div class="row"><div class="fld"><label for="${id}-v">Valor</label><input type="text" inputmode="decimal" id="${id}-v" value="3,3"></div>
     <div class="fld"><label for="${id}-a">De</label><select id="${id}-a">${opt}</select></div>
     <div class="fld"><label for="${id}-b">Para</label><select id="${id}-b">${opt}</select></div></div><div id="${id}-r"></div>`;
  $('#' + id + '-a', p).value = '1000'; $('#' + id + '-b', p).value = '1';
  const go = () => {
    const v = parseNum($('#' + id + '-v', p).value), a = +$('#' + id + '-a', p).value, b = +$('#' + id + '-b', p).value;
    const sa = PREF.find(x => x[0] === a)[1], sb = PREF.find(x => x[0] === b)[1];
    const r = v * a / b, base = v * a;
    $('#' + id + '-r', p).innerHTML = isNaN(v) ? '<div class="fb bad">Escreva um número, por exemplo 3,3 ou 0,05.</div>' :
      readout([[`${nf(v, 6)} ${sa}`, `= ${nf(r, 9)} ${sb}`, 'hi wide'], ['Notação científica', base === 0 ? '0' : (base / Math.pow(10, Math.floor(Math.log10(Math.abs(base))))).toFixed(3).replace('.', ',') + ' × 10^' + Math.floor(Math.log10(Math.abs(base))), 'wide']]);
  };
  $$('input,select', p).forEach(e => e.addEventListener('input', go)); go();
};

/* --- resistividade --- */
TOOLS.resistividade = (p, id) => {
  const MAT = [['cobre', 1.7e-8], ['prata', 1.6e-8], ['alumínio', 2.8e-8], ['ferro', 1.0e-7], ['níquel-crómio', 1.1e-6]];
  p.innerHTML = toolHead('Calculadora de resistividade', 'R = ρ · L / S, com a secção calculada a partir do diâmetro do fio.') +
    `<div class="tool-body"><div class="ctrls"><div class="fld"><label for="${id}-m">Material</label><select id="${id}-m">${MAT.map(([n, r], i) => `<option value="${i}">${n} (ρ = ${sig(r / 1e-8)} × 10⁻⁸ Ω·m)</option>`).join('')}</select></div>
    ${slidersHTML(id, [{ k: 'L', label: 'Comprimento L' }, { k: 'd', label: 'Diâmetro d' }])}</div><div id="${id}-r"></div></div>`;
  let vals;
  const go = () => {
    const rho = MAT[+$('#' + id + '-m', p).value][1], S = PI * Math.pow(vals.d * 1e-3, 2) / 4, R = rho * vals.L / S;
    $('#' + id + '-r', p).innerHTML = readout([['Secção S', sig(S * 1e6) + ' mm²'], ['Resistência R', eng(R, 'Ω'), 'hi'], ['Com o dobro de L', eng(2 * R, 'Ω')], ['Com o dobro de d', eng(R / 4, 'Ω')]]);
  };
  vals = bindSliders(p, id, [{ k: 'L', min: 1, max: 20000, v: 10000, log: true, unit: 'm' }, { k: 'd', min: 0.1, max: 10, v: 4, log: true, f: v => sig(v) + ' mm' }], v => { vals = v; if ($('#' + id + '-r', p)) go(); }).vals;
  $('#' + id + '-m', p).addEventListener('change', go); go();
};

/* --- código de cores --- */
const CORES = [['preto', '#111'], ['castanho', '#7B3F12'], ['vermelho', '#D32F2F'], ['laranja', '#F57C00'], ['amarelo', '#FBC02D'], ['verde', '#2E7D32'], ['azul', '#1565C0'], ['violeta', '#7B1FA2'], ['cinzento', '#9E9E9E'], ['branco', '#FAFAFA'], ['dourado', '#C9A227'], ['prateado', '#C0C0C0']];
TOOLS.cores = (p, id) => {
  const MULT = { 0: 1, 1: 10, 2: 100, 3: 1e3, 4: 1e4, 5: 1e5, 6: 1e6, 10: 0.1, 11: 0.01 };
  const TOL = { 1: 1, 2: 2, 5: 0.5, 6: 0.25, 7: 0.1, 10: 5, 11: 10 };
  const st = { b: [3, 6, 2, 10], quiz: false, secret: null };
  const rowsDef = [['1.º anel – algarismo', [...Array(10).keys()]], ['2.º anel – algarismo', [...Array(10).keys()]], ['3.º anel – multiplicador', [0, 1, 2, 3, 4, 5, 6, 10, 11]], ['4.º anel – tolerância', [1, 2, 5, 6, 7, 10, 11]]];
  p.innerHTML = toolHead('Código de cores (4 anéis)', 'Clique nas cores para montar a resistência, ou experimente o modo desafio.') +
    `<div class="tool-body"><div class="ctrls">${rowsDef.map(([l, opts], i) => `<div class="band-row"><span class="lbl">${l}</span><div class="sw" data-i="${i}">${opts.map(c => `<button type="button" data-c="${c}" title="${CORES[c][0]}" aria-label="${CORES[c][0]}" style="background:${CORES[c][1]}"></button>`).join('')}</div></div>`).join('')}</div>
     <div class="ctrls"><div class="resistor" id="${id}-svg"></div><div id="${id}-r"></div>
     <div class="row"><button type="button" class="btn ghost" id="${id}-q">Modo desafio</button></div><div id="${id}-quiz"></div></div></div>`;
  const val = b => (b[0] * 10 + b[1]) * MULT[b[2]];
  const draw = () => {
    const b = st.b, xs = [118, 150, 182, 262];
    $('#' + id + '-svg', p).innerHTML = `<svg viewBox="0 0 400 120" role="img" aria-label="Resistência com anéis ${b.map(c => CORES[c][0]).join(', ')}">
      <line x1="0" y1="60" x2="400" y2="60" stroke="#8a8a8a" stroke-width="6"/>
      <rect x="80" y="26" width="240" height="68" rx="30" fill="#E6CFA0" stroke="#B89B62" stroke-width="2"/>
      ${b.map((c, i) => `<rect x="${xs[i]}" y="27" width="18" height="66" fill="${CORES[c][1]}" stroke="rgba(0,0,0,.25)"/>`).join('')}</svg>`;
    $$('.sw', p).forEach(g => $$('button', g).forEach(x => x.setAttribute('aria-pressed', +x.dataset.c === b[+g.dataset.i])));
    const R = val(b), t = TOL[b[3]];
    $('#' + id + '-r', p).innerHTML = st.quiz ? readout([['Valor', '? (desafio)', 'hi wide']]) :
      readout([['Valor', eng(R, 'Ω') + ' ± ' + nf(t, 2) + ' %', 'hi wide'], ['Mínimo', eng(R * (1 - t / 100), 'Ω')], ['Máximo', eng(R * (1 + t / 100), 'Ω')]]);
  };
  p.addEventListener('click', e => {
    const b = e.target.closest('.sw button'); if (!b || st.quiz) return;
    st.b[+b.closest('.sw').dataset.i] = +b.dataset.c; draw();
  });
  $('#' + id + '-q', p).addEventListener('click', () => {
    st.quiz = !st.quiz;
    $('#' + id + '-q', p).textContent = st.quiz ? 'Sair do desafio' : 'Modo desafio';
    if (st.quiz) {
      const m = [0, 1, 2, 3, 4][Math.floor(Math.random() * 5)];
      st.b = [1 + Math.floor(Math.random() * 9), Math.floor(Math.random() * 10), m, [10, 10, 11, 1][Math.floor(Math.random() * 4)]];
      $('#' + id + '-quiz', p).innerHTML = `<div class="ain"><span class="in"><label for="${id}-qa">R =</label><input type="text" inputmode="decimal" id="${id}-qa"><span class="u">Ω</span></span><button type="button" class="btn" id="${id}-qv">Verificar</button></div><div class="fb" id="${id}-qf"></div>`;
      $('#' + id + '-qv', p).addEventListener('click', () => {
        const a = parseNum($('#' + id + '-qa', p).value), R = val(st.b), f = $('#' + id + '-qf', p);
        const ok = Math.abs(a - R) <= R * 0.005;
        f.className = 'fb ' + (ok ? 'ok' : 'bad');
        f.textContent = ok ? `Certo: ${eng(R, 'Ω')} ± ${nf(TOL[st.b[3]], 2)} %. Carregue em «Sair do desafio» e de novo em «Modo desafio» para outra.` : `Ainda não. Leia: ${CORES[st.b[0]][0]} = ${st.b[0]}, ${CORES[st.b[1]][0]} = ${st.b[1]}, multiplicador ${CORES[st.b[2]][0]}. Escreva o valor em ohm (por exemplo 4700).`;
      });
    } else $('#' + id + '-quiz', p).innerHTML = '';
    draw();
  });
  draw();
};

/* --- Lei de Ohm e potência --- */
TOOLS.ohm = (p, id) => {
  p.innerHTML = toolHead('Lei de Ohm, potência e energia', 'Mude a tensão e a resistência; a energia e o custo calculam-se para o tempo escolhido.') +
    `<div class="tool-body"><div class="ctrls">${slidersHTML(id, [{ k: 'U', label: 'Tensão U' }, { k: 'R', label: 'Resistência R' }, { k: 't', label: 'Tempo t' }])}
     <div class="fld"><label for="${id}-pr">Preço da energia (€/kWh, exemplo)</label><input type="text" inputmode="decimal" id="${id}-pr" value="0,16" style="width:7em"></div></div><div id="${id}-r"></div></div>`;
  let v;
  const go = () => {
    const I = v.U / v.R, P = v.U * I, W = P * v.t / 1000, pr = parseNum($('#' + id + '-pr', p).value);
    $('#' + id + '-r', p).innerHTML = readout([['Corrente I = U/R', eng(I, 'A'), 'hi'], ['Potência P = U·I', eng(P, 'W'), 'hi'], ['P = R·I²', eng(v.R * I * I, 'W')], ['Energia W = P·t', sig(W) + ' kWh'], ['Energia em joule', eng(P * v.t * 3600, 'J')], ['Custo', isNaN(pr) ? '—' : nf(W * pr, 2) + ' €']]);
  };
  v = bindSliders(p, id, [{ k: 'U', min: 0, max: 400, v: 230, step: 1, unit: 'V' }, { k: 'R', min: 1, max: 1e6, v: 26.45, log: true, unit: 'Ω' }, { k: 't', min: 0, max: 24, v: 3, step: 0.5, f: x => nf(x, 1) + ' h' }], x => { v = x; if ($('#' + id + '-r', p)) go(); }).vals;
  $('#' + id + '-pr', p).addEventListener('input', go); go();
};

/* --- associação de R, C ou L --- */
TOOLS.assoc = (p, id) => {
  const kind = p.dataset.kind;
  const K = {
    R: { t: 'Associação de resistências', u: 'Ω', mul: 1, def: [100, 220, 330], mode: 'serie', U: 12, sym: 'R' },
    C: { t: 'Associação de condensadores', u: 'μF', mul: 1e-6, def: [10, 15], mode: 'serie', U: 12, sym: 'C' },
    L: { t: 'Associação de bobines', u: 'mH', mul: 1e-3, def: [10, 15], mode: 'paralelo', U: null, sym: 'L' }
  }[kind];
  const st = { list: K.def.slice(), mode: K.mode };
  p.innerHTML = toolHead(K.t, kind === 'C' ? 'Atenção: as fórmulas dos condensadores trocam de lugar em relação às das resistências.' : 'Acrescente ou retire componentes e escolha a ligação.') +
    `<div class="tool-body"><div class="ctrls">${seg(id + '-m', [['serie', 'Série'], ['paralelo', 'Paralelo']], st.mode)}<div class="rlist" id="${id}-l"></div>
     <div class="row"><button type="button" class="btn ghost" id="${id}-add">+ Acrescentar</button></div>
     ${K.U ? `<div class="fld"><label for="${id}-U">Tensão aplicada U (V)</label><input type="text" inputmode="decimal" id="${id}-U" value="${K.U}" style="width:7em"></div>` : ''}</div>
     <div class="ctrls"><div id="${id}-r"></div><div class="tbl" id="${id}-t"></div></div></div>`;
  const list = () => {
    $('#' + id + '-l', p).innerHTML = st.list.map((x, i) => `<div class="r"><span>${K.sym}${i + 1}</span><input type="text" inputmode="decimal" id="${id}-v${i}" value="${nf(x, 6)}" aria-label="${K.sym}${i + 1} em ${K.u}"><span>${K.u}</span><button type="button" data-del="${i}" aria-label="Retirar ${K.sym}${i + 1}">×</button></div>`).join('');
  };
  const go = () => {
    const xs = st.list.map(x => x * K.mul).filter(x => x > 0);
    if (!xs.length) { $('#' + id + '-r', p).innerHTML = '<div class="fb bad">Escreva pelo menos um valor maior do que zero.</div>'; $('#' + id + '-t', p).innerHTML = ''; return; }
    const sum = xs.reduce((a, b) => a + b, 0), inv = 1 / xs.reduce((a, b) => a + 1 / b, 0);
    const ser = st.mode === 'serie';
    const eq = kind === 'C' ? (ser ? inv : sum) : (ser ? sum : inv);
    const unit = { R: 'Ω', C: 'F', L: 'H' }[kind];
    const U = K.U ? parseNum($('#' + id + '-U', p).value) : NaN;
    const items = [[`${K.sym}eq (${ser ? 'série' : 'paralelo'})`, eng(eq, unit), 'hi wide']];
    let rows = '';
    if (kind === 'R' && isFinite(U)) {
      const I = U / eq; items.push(['Corrente total', eng(I, 'A')], ['Potência total', eng(U * I, 'W')]);
      rows = xs.map((r, i) => { const Ui = ser ? r * I : U, Ii = ser ? I : U / r; return `<tr><td>R${i + 1}</td><td class="m">${eng(r, 'Ω')}</td><td class="m">${eng(Ui, 'V')}</td><td class="m">${eng(Ii, 'A')}</td><td class="m">${eng(Ui * Ii, 'W')}</td></tr>`; }).join('');
      $('#' + id + '-t', p).innerHTML = `<table><thead><tr><th></th><th>Valor</th><th>U</th><th>I</th><th>P</th></tr></thead><tbody>${rows}</tbody></table>`;
    } else if (kind === 'C' && isFinite(U)) {
      const Q = eq * U; items.push(['Carga total Q', eng(Q, 'C')], ['Energia W = ½CU²', eng(eq * U * U / 2, 'J')]);
      rows = xs.map((c, i) => { const Ui = ser ? Q / c : U, Qi = ser ? Q : c * U; return `<tr><td>C${i + 1}</td><td class="m">${eng(c, 'F')}</td><td class="m">${eng(Ui, 'V')}</td><td class="m">${eng(Qi, 'C')}</td></tr>`; }).join('');
      $('#' + id + '-t', p).innerHTML = `<table><thead><tr><th></th><th>Valor</th><th>U</th><th>Q</th></tr></thead><tbody>${rows}</tbody></table>`;
    } else $('#' + id + '-t', p).innerHTML = '';
    const note = kind === 'C' ? (ser ? 'Em série: menor do que o menor condensador.' : 'Em paralelo: soma das capacidades.') : (ser ? 'Em série: maior do que o maior componente.' : 'Em paralelo: menor do que o menor componente.');
    items.push(['', note, 'wide']);
    $('#' + id + '-r', p).innerHTML = readout(items);
  };
  bindSeg(p, id + '-m', v => { st.mode = v; go(); });
  p.addEventListener('input', e => { const m = e.target.id.match(new RegExp('^' + id + '-v(\\d+)$')); if (m) { st.list[+m[1]] = parseNum(e.target.value); } go(); });
  p.addEventListener('click', e => {
    if (e.target.dataset.del !== undefined) { st.list.splice(+e.target.dataset.del, 1); list(); go(); }
    if (e.target.id === id + '-add') { st.list.push(st.list[st.list.length - 1] || 100); list(); go(); }
  });
  list(); go();
};

/* --- código de 3 dígitos --- */
TOOLS.codigo3 = (p, id) => {
  p.innerHTML = toolHead('Descodificador do código de 3 dígitos') +
    `<div class="row"><div class="fld"><label for="${id}-c">Código impresso</label><input type="text" inputmode="numeric" id="${id}-c" value="104" maxlength="3" style="width:6em"></div></div><div id="${id}-r"></div>`;
  const go = () => {
    const c = $('#' + id + '-c', p).value.trim();
    if (!/^\d{3}$/.test(c)) { $('#' + id + '-r', p).innerHTML = '<div class="fb bad">Escreva três algarismos, por exemplo 473.</div>'; return; }
    const pf = (+c.slice(0, 2)) * Math.pow(10, +c[2]);
    $('#' + id + '-r', p).innerHTML = readout([['Em pF', nf(pf, 0) + ' pF'], ['Em nF', nf(pf / 1000, 3) + ' nF', 'hi'], ['Em μF', nf(pf / 1e6, 6) + ' μF']]);
  };
  $('#' + id + '-c', p).addEventListener('input', go); go();
};

/* --- carga e descarga RC --- */
TOOLS.rc = (p, id) => {
  const st = { mode: 'carga' };
  p.innerHTML = toolHead('Carga e descarga de um condensador', 'Arraste o instante t para ler a tensão e a corrente na curva.') +
    `<div class="tool-body"><div class="ctrls">${seg(id + '-m', [['carga', 'Carga'], ['descarga', 'Descarga']], 'carga')}${slidersHTML(id, [{ k: 'U', label: 'Tensão U' }, { k: 'R', label: 'Resistência R' }, { k: 'C', label: 'Capacidade C' }, { k: 'x', label: 'Instante t' }])}</div>
     <div class="ctrls"><div id="${id}-g"></div><div id="${id}-r"></div></div></div>`;
  let v;
  const go = () => {
    const tau = v.R * v.C, t = v.x * tau, ch = st.mode === 'carga';
    const u = ch ? v.U * (1 - Math.exp(-v.x)) : v.U * Math.exp(-v.x), i = v.U / v.R * Math.exp(-v.x);
    const pts = []; for (let k = 0; k <= 100; k++) { const x = 5 * k / 100; pts.push([x, ch ? 1 - Math.exp(-x) : Math.exp(-x)]); }
    const lv = ch ? 0.632 : 0.368;
    $('#' + id + '-g', p).innerHTML = linePlot({ x0: 0, x1: 5, y0: 0, y1: 1.05, xt: [0, 1, 2, 3, 4, 5], xf: x => x ? x + 'τ' : '0', yt: [0, 0.37, 0.63, 1], yf: y => Math.round(y * 100) + ' %', xl: 'tempo', aria: 'Curva de ' + st.mode,
      series: [{ pts, c: ch ? 'var(--pcb)' : 'var(--accent)', fill: true }], vlines: [{ x: 1, c: 'var(--muted)', dash: true, l: 'τ' }], dots: [{ x: 1, y: lv, c: 'var(--muted)' }, { x: v.x, y: u / v.U, c: 'var(--accent)', l: Math.round(u / v.U * 100) + ' %' }] });
    $('#' + id + '-r', p).innerHTML = readout([['τ = R·C', eng(tau, 's'), 'hi'], ['5τ (completo)', eng(5 * tau, 's')], ['t', eng(t, 's')], ['u(t)', eng(u, 'V'), 'hi'], ['i(t)', eng(i, 'A')], ['Energia em C', eng(v.C * u * u / 2, 'J')]]);
  };
  v = bindSliders(p, id, [{ k: 'U', min: 1, max: 50, v: 35, step: 1, unit: 'V' }, { k: 'R', min: 10, max: 1e6, v: 100, log: true, unit: 'Ω' }, { k: 'C', min: 1e-6, max: 0.01, v: 4.7e-3, log: true, unit: 'F' }, { k: 'x', min: 0, max: 5, v: 1, step: 0.05, f: x => nf(x, 2) + ' τ' }], x => { v = x; if ($('#' + id + '-r', p)) go(); }).vals;
  bindSeg(p, id + '-m', m => { st.mode = m; go(); }); go();
};

/* --- campo magnético --- */
TOOLS.campoB = (p, id) => {
  const st = { t: 'fio' };
  p.innerHTML = toolHead('Campo magnético criado por uma corrente', 'Compare com o campo terrestre, de cerca de 50 μT.') +
    `<div class="tool-body"><div class="ctrls">${seg(id + '-t', [['fio', 'Fio retilíneo'], ['espira', 'Espira'], ['sol', 'Solenoide']], 'fio')}
     ${slidersHTML(id, [{ k: 'I', label: 'Corrente I' }, { k: 'r', label: 'Distância / raio r' }, { k: 'N', label: 'Espiras N' }, { k: 'l', label: 'Comprimento ℓ' }, { k: 'mu', label: 'Núcleo μr' }])}</div><div id="${id}-r"></div></div>`;
  let v;
  const vis = () => { const show = { fio: ['I', 'r'], espira: ['I', 'r'], sol: ['I', 'N', 'l', 'mu'] }[st.t]; ['I', 'r', 'N', 'l', 'mu'].forEach(k => { $('#' + id + '-' + k, p).closest('.rng').hidden = !show.includes(k); }); };
  const go = () => {
    let B, f;
    if (st.t === 'fio') { B = MU0 * v.I / (2 * PI * v.r / 100); f = 'B = μ0·I / (2π·r)'; }
    else if (st.t === 'espira') { B = MU0 * v.I / (2 * v.r / 100); f = 'B = μ0·I / (2r)'; }
    else { B = MU0 * v.mu * v.N * v.I / (v.l / 100); f = v.mu > 1 ? 'B = μ0·μr·N·I / ℓ' : 'B = μ0·N·I / ℓ'; }
    $('#' + id + '-r', p).innerHTML = readout([['Fórmula', f, 'wide'], ['B', eng(B, 'T'), 'hi'], ['× campo terrestre', sig(B / 50e-6)]]);
  };
  v = bindSliders(p, id, [{ k: 'I', min: 0, max: 50, v: 10, step: 0.5, unit: 'A' }, { k: 'r', min: 0.5, max: 50, v: 2, step: 0.5, f: x => nf(x, 1) + ' cm' }, { k: 'N', min: 1, max: 2000, v: 500, step: 1, f: x => nf(x, 0) }, { k: 'l', min: 1, max: 100, v: 25, step: 1, f: x => nf(x, 0) + ' cm' }, { k: 'mu', min: 1, max: 2000, v: 1, log: true, f: x => nf(x, 0) + (x <= 1 ? ' (ar)' : ' (ferro)') }], x => { v = x; if ($('#' + id + '-r', p)) go(); }).vals;
  bindSeg(p, id + '-t', t => { st.t = t; vis(); go(); }); vis(); go();
};

/* --- Lei de Laplace --- */
TOOLS.laplace = (p, id) => {
  p.innerHTML = toolHead('Força de Laplace sobre um condutor', 'O campo B aponta para a direita; rode o condutor e veja a força mudar.') +
    `<div class="tool-body"><div class="ctrls">${slidersHTML(id, [{ k: 'B', label: 'Campo B' }, { k: 'I', label: 'Corrente I' }, { k: 'l', label: 'Comprimento ℓ' }, { k: 'th', label: 'Ângulo θ' }])}</div><div class="ctrls"><div id="${id}-g"></div><div id="${id}-r"></div></div></div>`;
  let v;
  const go = () => {
    const F = v.B * v.I * v.l * Math.sin(rad(v.th)), Fm = v.B * v.I * v.l;
    const a = rad(v.th), cx = 160, cy = 90, L = 70, x1 = cx - L * Math.cos(a), y1 = cy + L * Math.sin(a), x2 = cx + L * Math.cos(a), y2 = cy - L * Math.sin(a);
    const rr = 6 + 22 * (Fm ? F / Fm : 0);
    let lines = ''; for (let y = 25; y <= 160; y += 27) lines += `<line x1="20" y1="${y}" x2="300" y2="${y}" style="stroke:var(--pcb);opacity:.45" marker-end="url(#${id}-ar)"/>`;
    $('#' + id + '-g', p).innerHTML = `<svg class="plot" viewBox="0 0 320 180" role="img" aria-label="Condutor a ${v.th} graus do campo"><defs><marker id="${id}-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0L10,5L0,10z" style="fill:var(--pcb)"/></marker></defs>${lines}
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="stroke:var(--accent);stroke-width:6;stroke-linecap:round"/>
      <circle cx="${cx}" cy="${cy}" r="${rr}" style="fill:var(--surface);stroke:var(--ok);stroke-width:3"/><circle cx="${cx}" cy="${cy}" r="3" style="fill:var(--ok)"/>
      <text x="306" y="18" text-anchor="end" style="fill:var(--pcb)">B →</text><text x="${cx + rr + 6}" y="${cy - 6}" style="fill:var(--ok);font-weight:700">F ⊙</text></svg>`;
    $('#' + id + '-r', p).innerHTML = readout([['F = B·I·ℓ·sen θ', eng(F, 'N'), 'hi'], ['Força máxima (90°)', eng(Fm, 'N')], ['sen θ', nf(Math.sin(a), 3)]]);
  };
  v = bindSliders(p, id, [{ k: 'B', min: 0, max: 2, v: 0.5, step: 0.05, unit: 'T' }, { k: 'I', min: 0, max: 20, v: 8, step: 0.5, unit: 'A' }, { k: 'l', min: 0.05, max: 1, v: 0.2, step: 0.05, unit: 'm' }, { k: 'th', min: 0, max: 90, v: 90, step: 1, f: x => nf(x, 0) + '°' }], x => { v = x; if ($('#' + id + '-r', p)) go(); }).vals; go();
};

/* --- fluxo e Lei de Faraday --- */
TOOLS.faraday = (p, id) => {
  p.innerHTML = toolHead('Fluxo magnético e Lei de Faraday', 'À esquerda, o fluxo numa espira inclinada. À direita, a f.e.m. induzida quando o fluxo varia.') +
    `<div class="tool-body"><div class="ctrls"><h4>Fluxo Φ = B·A·cos θ</h4>${slidersHTML(id, [{ k: 'B', label: 'Campo B' }, { k: 'A', label: 'Área A' }, { k: 'th', label: 'Ângulo θ' }])}<div id="${id}-g"></div><div id="${id}-r1"></div></div>
     <div class="ctrls"><h4>f.e.m. |ε| = N·ΔΦ/Δt</h4>${slidersHTML(id, [{ k: 'N', label: 'Espiras N' }, { k: 'dF', label: 'Variação ΔΦ' }, { k: 'dt', label: 'Intervalo Δt' }, { k: 'R', label: 'Resistência R' }])}<div id="${id}-r2"></div></div></div>`;
  let v;
  const go = () => {
    const a = rad(v.th), Phi = v.B * v.A * Math.cos(a);
    const w = 70 * Math.cos(a);
    let lines = ''; for (let y = 20; y <= 140; y += 24) lines += `<line x1="10" y1="${y}" x2="290" y2="${y}" style="stroke:var(--pcb);opacity:.4"/>`;
    $('#' + id + '-g', p).innerHTML = `<svg class="plot" viewBox="0 0 300 160" role="img" aria-label="Espira a ${v.th} graus">${lines}<ellipse cx="150" cy="80" rx="${Math.max(2, Math.abs(w) * 0.35)}" ry="62" style="fill:var(--accent-soft);stroke:var(--accent);stroke-width:4"/>
      <line x1="150" y1="80" x2="${150 + 60 * Math.cos(a)}" y2="${80 - 60 * Math.sin(a)}" style="stroke:var(--ok);stroke-width:2.5"/><text x="${154 + 60 * Math.cos(a)}" y="${76 - 60 * Math.sin(a)}" style="fill:var(--ok)">normal</text><text x="290" y="14" text-anchor="end" style="fill:var(--pcb)">B →</text></svg>`;
    $('#' + id + '-r1', p).innerHTML = readout([['Φ', eng(Phi, 'Wb'), 'hi'], ['Φ máximo (0°)', eng(v.B * v.A, 'Wb')]]);
    const e = v.N * v.dF / v.dt;
    $('#' + id + '-r2', p).innerHTML = readout([['|ε|', eng(e, 'V'), 'hi'], ['I = ε / R', eng(e / v.R, 'A'), 'hi'], ['ΔΦ/Δt por espira', eng(v.dF / v.dt, 'V')]]);
  };
  v = bindSliders(p, id, [{ k: 'B', min: 0, max: 1.5, v: 0.5, step: 0.05, unit: 'T' }, { k: 'A', min: 0.001, max: 0.1, v: 0.02, step: 0.001, f: x => nf(x, 3) + ' m²' }, { k: 'th', min: 0, max: 90, v: 60, step: 1, f: x => nf(x, 0) + '°' },
    { k: 'N', min: 1, max: 1000, v: 200, step: 1, f: x => nf(x, 0) }, { k: 'dF', min: 0.0005, max: 0.05, v: 0.006, step: 0.0005, unit: 'Wb' }, { k: 'dt', min: 0.01, max: 1, v: 0.1, step: 0.01, unit: 's' }, { k: 'R', min: 1, max: 100, v: 4, step: 1, unit: 'Ω' }], x => { v = x; if ($('#' + id + '-r2', p)) go(); }).vals; go();
};

/* --- transformador --- */
TOOLS.trafo = (p, id) => {
  p.innerHTML = toolHead('Transformador ideal', 'Us/Up = Ns/Np. Com carga no secundário, Is = Us/R e Ip = Is·Ns/Np.') +
    `<div class="tool-body"><div class="ctrls">${slidersHTML(id, [{ k: 'Up', label: 'Tensão primária Up' }, { k: 'Np', label: 'Espiras Np' }, { k: 'Ns', label: 'Espiras Ns' }, { k: 'R', label: 'Carga R' }])}</div><div id="${id}-r"></div></div>`;
  let v;
  const go = () => {
    const m = v.Ns / v.Np, Us = v.Up * m, Is = Us / v.R, Ip = Is * m;
    $('#' + id + '-r', p).innerHTML = readout([['Us', eng(Us, 'V'), 'hi'], ['Relação Ns/Np', sig(m)], ['Tipo', m > 1 ? 'elevador' : m < 1 ? 'abaixador' : 'isolamento (1:1)'], ['Is', eng(Is, 'A')], ['Ip', eng(Ip, 'A')], ['Potência', eng(Us * Is, 'VA')]]);
  };
  v = bindSliders(p, id, [{ k: 'Up', min: 1, max: 400, v: 230, step: 1, unit: 'V' }, { k: 'Np', min: 10, max: 2000, v: 1150, step: 10, f: x => nf(x, 0) }, { k: 'Ns', min: 10, max: 2000, v: 60, step: 10, f: x => nf(x, 0) }, { k: 'R', min: 1, max: 1000, v: 12, log: true, unit: 'Ω' }], x => { v = x; if ($('#' + id + '-r', p)) go(); }).vals; go();
};

/* --- autoindução --- */
TOOLS.autoinducao = (p, id) => {
  p.innerHTML = toolHead('Autoindução e energia numa bobina', 'Quanto mais rápida a variação da corrente, maior a f.e.m. de autoindução.') +
    `<div class="tool-body"><div class="ctrls">${slidersHTML(id, [{ k: 'L', label: 'Indutância L' }, { k: 'I', label: 'Corrente I' }, { k: 'dI', label: 'Variação ΔI' }, { k: 'dt', label: 'Intervalo Δt' }])}</div><div id="${id}-r"></div></div>`;
  let v;
  const go = () => {
    $('#' + id + '-r', p).innerHTML = readout([['|e| = L·ΔI/Δt', eng(v.L * v.dI / v.dt, 'V'), 'hi'], ['W = ½·L·I²', eng(v.L * v.I * v.I / 2, 'J'), 'hi'], ['Em CC estabelecida', 'ΔI = 0 → e = 0', 'wide']]);
  };
  v = bindSliders(p, id, [{ k: 'L', min: 1e-3, max: 10, v: 0.5, log: true, unit: 'H' }, { k: 'I', min: 0, max: 10, v: 2, step: 0.1, unit: 'A' }, { k: 'dI', min: 0.1, max: 10, v: 2, step: 0.1, unit: 'A' }, { k: 'dt', min: 1e-4, max: 1, v: 0.01, log: true, unit: 's' }], x => { v = x; if ($('#' + id + '-r', p)) go(); }).vals; go();
};
/* ================= instrumentos da Parte 2 ================= */
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function animLoop(p, step) {
  // corre só quando o painel está visível
  let on = false, last = 0, raf = 0;
  const tick = ts => { if (!on) return; const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts; if (p.offsetParent) step(dt); raf = requestAnimationFrame(tick); };
  return { play() { if (on) return; on = true; last = 0; raf = requestAnimationFrame(tick); }, pause() { on = false; cancelAnimationFrame(raf); }, get on() { return on; } };
}

/* --- alternador elementar --- */
TOOLS.alternador = (p, id) => {
  p.innerHTML = toolHead('Alternador elementar', 'A espira roda no campo. Compare o fluxo Φ (tracejado) com a f.e.m. e: a f.e.m. é máxima quando o fluxo passa por zero.') +
    `<div class="tool-body"><div class="ctrls">${slidersHTML(id, [{ k: 'th', label: 'Ângulo θ' }, { k: 'N', label: 'Espiras N' }, { k: 'B', label: 'Campo B' }, { k: 'A', label: 'Área A' }, { k: 'f', label: 'Frequência f' }])}
     <div class="row"><button type="button" class="btn" id="${id}-p">Rodar</button></div><div id="${id}-r"></div></div>
     <div class="ctrls"><canvas class="scope" id="${id}-c" aria-label="Fluxo e f.e.m. ao longo de uma volta"></canvas><div class="legend"><span><i style="background:${LCD.ch2}"></i>Φ (fluxo)</span><span><i style="background:${LCD.ch1}"></i>e (f.e.m.)</span></div><div id="${id}-s"></div></div></div>`;
  const cv = $('#' + id + '-c', p), { g, W, H } = scopeCanvas(cv, 640, 280);
  let v, ctl;
  const go = () => {
    const w = 2 * PI * v.f, Em = v.N * v.B * v.A * w, a = rad(v.th);
    scopeGrid(g, W, H, 8, 8);
    trace(g, t => Math.cos(t), 0, 2 * PI, W, H, 1.15, LCD.ch2, 2, [6, 4]);
    trace(g, t => Math.sin(t), 0, 2 * PI, W, H, 1.15, LCD.ch1, 2.6);
    const x = W * (a % (2 * PI)) / (2 * PI);
    g.strokeStyle = LCD.hi; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
    g.fillStyle = LCD.ch1; g.beginPath(); g.arc(x, H / 2 - Math.sin(a) / 1.15 * H / 2, 5, 0, 7); g.fill();
    g.fillStyle = LCD.ch2; g.beginPath(); g.arc(x, H / 2 - Math.cos(a) / 1.15 * H / 2, 4, 0, 7); g.fill();
    ['0°', '90°', '180°', '270°', '360°'].forEach((s, i) => label(g, s, Math.min(W - 4, Math.max(4, i * W / 4)), H - 6, LCD.ink, i === 0 ? 'left' : i === 4 ? 'right' : 'center'));
    // vista da espira
    const cx = 60, cy = 60, ww = 40 * Math.cos(a);
    $('#' + id + '-s', p).innerHTML = `<svg class="plot" viewBox="0 0 320 120" role="img" aria-label="Espira vista de lado"><rect x="10" y="20" width="34" height="80" rx="4" style="fill:#C62828"/><text x="27" y="65" text-anchor="middle" style="fill:#fff;font-weight:700">N</text><rect x="276" y="20" width="34" height="80" rx="4" style="fill:#1D6FE0"/><text x="293" y="65" text-anchor="middle" style="fill:#fff;font-weight:700">S</text>
      <line x1="${160 - 70 * Math.sin(a)}" y1="${60 - 40 * Math.cos(a)}" x2="${160 + 70 * Math.sin(a)}" y2="${60 + 40 * Math.cos(a)}" style="stroke:var(--accent);stroke-width:6;stroke-linecap:round"/><circle cx="160" cy="60" r="4" style="fill:var(--ink)"/>
      <text x="160" y="114" text-anchor="middle">θ = ${nf(v.th % 360, 0)}° · plano da espira ${Math.abs(Math.cos(a)) > 0.98 ? 'perpendicular ao campo' : Math.abs(Math.cos(a)) < 0.05 ? 'paralelo ao campo' : 'inclinado'}</text></svg>`;
    $('#' + id + '-r', p).innerHTML = readout([['Emáx = N·B·A·ω', eng(Em, 'V'), 'hi'], ['ω = 2πf', sig(w) + ' rad/s'], ['T', eng(1 / v.f, 's')], ['e(θ)', eng(Em * Math.sin(a), 'V'), 'hi'], ['Φ(θ)', eng(v.B * v.A * Math.cos(a), 'Wb')]]);
  };
  ctl = bindSliders(p, id, [{ k: 'th', min: 0, max: 360, v: 45, step: 1, f: x => nf(x, 0) + '°' }, { k: 'N', min: 1, max: 500, v: 100, step: 1, f: x => nf(x, 0) }, { k: 'B', min: 0.05, max: 1.5, v: 0.5, step: 0.05, unit: 'T' }, { k: 'A', min: 0.001, max: 0.05, v: 0.01, step: 0.001, f: x => nf(x, 3) + ' m²' }, { k: 'f', min: 1, max: 60, v: 50, step: 1, unit: 'Hz' }], x => { v = x; if ($('#' + id + '-r', p)) go(); });
  v = ctl.vals;
  const an = animLoop(p, dt => { ctl.set('th', (v.th + 90 * dt) % 360); go(); });
  $('#' + id + '-p', p).addEventListener('click', e => { if (an.on) { an.pause(); e.target.textContent = 'Rodar'; } else { an.play(); e.target.textContent = 'Parar'; } });
  go();
};

/* --- gerador de sinusoides e valores característicos --- */
TOOLS.sinusoide = (p, id) => {
  const st = { w: 'sin' };
  p.innerHTML = toolHead('Gerador de sinais', 'Escolha a forma de onda: o valor eficaz e o valor médio mudam com ela.') +
    `<div class="tool-body"><div class="ctrls">${seg(id + '-w', [['sin', 'Sinusoidal'], ['sq', 'Quadrada'], ['tri', 'Triangular']], 'sin')}${slidersHTML(id, [{ k: 'Um', label: 'Amplitude Umáx' }, { k: 'f', label: 'Frequência f' }, { k: 'ph', label: 'Fase φ' }, { k: 'x', label: 'Instante t' }])}</div>
     <div class="ctrls"><canvas class="scope" id="${id}-c" aria-label="Forma de onda"></canvas><div class="legend"><span><i style="background:${LCD.ch1}"></i>u(t)</span><span><i style="background:${LCD.hi}"></i>valor eficaz</span><span><i style="background:${LCD.ch3}"></i>valor médio (alternância)</span></div><div id="${id}-r"></div></div></div>`;
  const cv = $('#' + id + '-c', p), { g, W, H } = scopeCanvas(cv, 640, 280);
  const wave = (w, x) => { // x em radianos
    const s = ((x % (2 * PI)) + 2 * PI) % (2 * PI);
    if (w === 'sin') return Math.sin(x);
    if (w === 'sq') return s < PI ? 1 : -1;
    return s < PI / 2 ? s / (PI / 2) : s < 3 * PI / 2 ? 2 - s / (PI / 2) : s / (PI / 2) - 4;
  };
  let v;
  const go = () => {
    const T = 1 / v.f, w = 2 * PI * v.f, ph = rad(v.ph), Um = v.Um;
    const Uef = st.w === 'sin' ? Um / SQ2 : st.w === 'sq' ? Um : Um / SQ3;
    const Umed = st.w === 'sin' ? 2 * Um / PI : st.w === 'sq' ? Um : Um / 2;
    const fac = st.w === 'sin' ? '0,707' : st.w === 'sq' ? '1' : '0,577';
    const t = v.x * T, u = Um * wave(st.w, w * t + ph);
    scopeGrid(g, W, H);
    const ym = Um * 1.25;
    trace(g, tt => Um * wave(st.w, w * tt + ph), 0, 2 * T, W, H, ym, LCD.ch1, 2.6);
    [[Uef, LCD.hi], [-Uef, LCD.hi], [Umed, LCD.ch3]].forEach(([y, c]) => { g.strokeStyle = c; g.setLineDash([6, 5]); g.lineWidth = 1.4; g.beginPath(); const yy = H / 2 - y / ym * H / 2; g.moveTo(0, yy); g.lineTo(W, yy); g.stroke(); });
    g.setLineDash([]);
    const px = W * t / (2 * T), py = H / 2 - u / ym * H / 2;
    g.strokeStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.moveTo(px, 0); g.lineTo(px, H); g.stroke();
    g.fillStyle = LCD.ch1; g.beginPath(); g.arc(px, py, 5, 0, 7); g.fill();
    label(g, 'U = ' + eng(Uef, 'V'), W - 6, H / 2 - Uef / ym * H / 2 - 6, LCD.hi, 'right');
    label(g, '2 períodos · T = ' + eng(T, 's'), 6, 16, LCD.ink);
    $('#' + id + '-r', p).innerHTML = readout([['Período T = 1/f', eng(T, 's')], ['ω = 2πf', sig(w) + ' rad/s'], ['Upp = 2·Umáx', eng(2 * Um, 'V')], [`U eficaz = ${fac}·Umáx`, eng(Uef, 'V'), 'hi'], ['Uméd (alternância)', eng(Umed, 'V')], ['u(t) em t = ' + eng(t, 's'), eng(u, 'V'), 'hi']]);
  };
  v = bindSliders(p, id, [{ k: 'Um', min: 1, max: 400, v: 325.3, step: 0.1, unit: 'V' }, { k: 'f', min: 1, max: 1000, v: 50, log: true, unit: 'Hz' }, { k: 'ph', min: -180, max: 180, v: 0, step: 5, f: x => nf(x, 0) + '°' }, { k: 'x', min: 0, max: 2, v: 0.125, step: 0.005, f: x => nf(x, 3) + ' T' }], x => { v = x; if ($('#' + id + '-r', p)) go(); }).vals;
  bindSeg(p, id + '-w', w => { st.w = w; go(); }); go();
};

/* --- osciloscópio virtual com desafio de leitura --- */
TOOLS.osciloscopio = (p, id) => {
  const VD = [0.5, 1, 2, 5, 10, 20, 50], TD = [0.1e-3, 0.2e-3, 0.5e-3, 1e-3, 2e-3, 5e-3, 10e-3];
  const st = { vd: 5, td: 5e-3, sig: null, ch2: true, reveal: false };
  const newSig = () => {
    const Ums = [3, 4, 5, 6, 8, 10, 12, 15, 20], fs = [50, 100, 200, 250, 500, 1000];
    const phs = [30, 45, 60, 72, 90, 36];
    st.sig = { Um: Ums[Math.floor(Math.random() * Ums.length)], f: fs[Math.floor(Math.random() * fs.length)], k: [0.4, 0.5, 0.6, 0.8][Math.floor(Math.random() * 4)], ph: phs[Math.floor(Math.random() * phs.length)] };
  };
  p.innerHTML = toolHead('Osciloscópio virtual', 'Ajuste V/div e a base de tempo até ver um a dois ciclos. Conte as divisões e calcule. O CH1 é a tensão u e o CH2 a corrente i.') +
    `<div class="tool-body"><div class="ctrls">
      <div class="fld"><label for="${id}-vd">CH1 e CH2: volts por divisão</label><select id="${id}-vd">${VD.map(x => `<option value="${x}">${nf(x, 1)} V/div</option>`).join('')}</select></div>
      <div class="fld"><label for="${id}-td">Base de tempo</label><select id="${id}-td">${TD.map(x => `<option value="${x}">${eng(x, 's')}/div</option>`).join('')}</select></div>
      <div class="row"><button type="button" class="btn ghost" id="${id}-n">Novo sinal</button><button type="button" class="btn ghost" id="${id}-2" aria-pressed="true">CH2 ligado</button></div>
      <div class="ain" style="flex-direction:column;align-items:flex-start">
        ${[['upp', 'Upp', 'V'], ['T', 'T', 'ms'], ['f', 'f', 'Hz'], ['U', 'U (eficaz)', 'V'], ['ph', 'φ (i em atraso)', '°']].map(([k, l, u]) => `<span class="in"><label for="${id}-a${k}">${l} =</label><input type="text" inputmode="decimal" id="${id}-a${k}"><span class="u">${u}</span></span>`).join('')}
      </div>
      <div class="row"><button type="button" class="btn" id="${id}-v">Verificar leituras</button><button type="button" class="btn ghost" id="${id}-s">Mostrar valores</button></div><div class="fb" id="${id}-fb"></div></div>
      <div class="ctrls"><canvas class="scope" id="${id}-c" aria-label="Ecrã do osciloscópio com 10 por 8 divisões"></canvas><div class="legend"><span><i style="background:${LCD.ch1}"></i>CH1 – u</span><span><i style="background:${LCD.ch2}"></i>CH2 – i (sobre uma resistência shunt)</span></div><div id="${id}-r"></div></div></div>`;
  const cv = $('#' + id + '-c', p), { g, W, H } = scopeCanvas(cv, 640, 512);
  const truth = () => { const s = st.sig; return { upp: 2 * s.Um, T: 1000 / s.f, f: s.f, U: s.Um / SQ2, ph: s.ph }; };
  const draw = () => {
    const s = st.sig, ym = st.vd * 4, x1 = st.td * 10, w = 2 * PI * s.f;
    scopeGrid(g, W, H, 10, 8);
    // marcas de subdivisão no eixo central
    g.strokeStyle = LCD.axis; for (let i = 0; i <= 50; i++) { const x = i * W / 50; g.beginPath(); g.moveTo(x, H / 2 - 4); g.lineTo(x, H / 2 + 4); g.stroke(); }
    for (let j = 0; j <= 40; j++) { const y = j * H / 40; g.beginPath(); g.moveTo(W / 2 - 4, y); g.lineTo(W / 2 + 4, y); g.stroke(); }
    trace(g, t => s.Um * Math.sin(w * t), 0, x1, W, H, ym, LCD.ch1, 2.4);
    if (st.ch2) trace(g, t => s.Um * s.k * Math.sin(w * t - rad(s.ph)), 0, x1, W, H, ym, LCD.ch2, 2.2);
    label(g, `CH1 ${nf(st.vd, 1)} V/div`, 8, H - 10, LCD.ch1); if (st.ch2) label(g, `CH2 ${nf(st.vd, 1)} V/div`, 170, H - 10, LCD.ch2);
    label(g, `${eng(st.td, 's')}/div`, W - 8, H - 10, LCD.ink, 'right');
    const tr = truth();
    $('#' + id + '-r', p).innerHTML = st.reveal ? readout([['Upp', eng(tr.upp, 'V'), 'hi'], ['Umáx', eng(s.Um, 'V')], ['U eficaz', eng(tr.U, 'V')], ['T', eng(tr.T / 1000, 's'), 'hi'], ['f', eng(tr.f, 'Hz')], ['φ (i em atraso)', nf(tr.ph, 0) + '°']]) : '';
  };
  const ans = { upp: 'upp', T: 'T', f: 'f', U: 'U', ph: 'ph' };
  $('#' + id + '-v', p).addEventListener('click', () => {
    const tr = truth(); let ok = 0, n = 0, miss = [];
    Object.keys(ans).forEach(k => {
      const el = $('#' + id + '-a' + k, p), a = parseNum(el.value);
      el.classList.remove('ok', 'bad'); if (isNaN(a)) return; n++;
      const good = Math.abs(a - tr[k]) <= Math.max(0.05 * Math.abs(tr[k]), 0.01);
      el.classList.add(good ? 'ok' : 'bad'); if (good) ok++; else miss.push(k);
    });
    const fb = $('#' + id + '-fb', p);
    if (!n) { fb.className = 'fb bad'; fb.textContent = 'Escreva pelo menos uma leitura.'; return; }
    fb.className = 'fb ' + (ok === n ? 'ok' : 'bad');
    fb.textContent = ok === n ? `Todas as ${n} leituras estão certas.` : `${ok} de ${n} certas. Dica: Upp = divisões de pico a pico × V/div; T = divisões de um ciclo × base de tempo; φ = 360° × Δt / T.`;
  });
  $('#' + id + '-vd', p).addEventListener('change', e => { st.vd = +e.target.value; draw(); });
  $('#' + id + '-td', p).addEventListener('change', e => { st.td = +e.target.value; draw(); });
  $('#' + id + '-n', p).addEventListener('click', () => { newSig(); st.reveal = false; $$('input', p).forEach(i => { i.value = ''; i.classList.remove('ok', 'bad'); }); $('#' + id + '-fb', p).textContent = ''; draw(); });
  $('#' + id + '-2', p).addEventListener('click', e => { st.ch2 = !st.ch2; e.target.setAttribute('aria-pressed', st.ch2); e.target.textContent = st.ch2 ? 'CH2 ligado' : 'CH2 desligado'; draw(); });
  $('#' + id + '-s', p).addEventListener('click', e => { st.reveal = !st.reveal; e.target.textContent = st.reveal ? 'Esconder valores' : 'Mostrar valores'; draw(); });
  // primeiro sinal: o do exemplo 6.3 (15 V, 50 Hz) com corrente em atraso de 45°
  st.sig = { Um: 15, f: 50, k: 0.6, ph: 45 };
  $('#' + id + '-vd', p).value = '5'; $('#' + id + '-td', p).value = String(5e-3);
  draw();
};

/* --- R, L ou C isolado em CA --- */
TOOLS.rlc1 = (p, id) => {
  const st = { e: 'L' };
  p.innerHTML = toolHead('R, L ou C ligado a uma fonte alternada', 'Escolha o componente e mude a frequência: veja a reatância e o desfasamento entre u e i.') +
    `<div class="tool-body"><div class="ctrls">${seg(id + '-e', [['R', 'Resistência'], ['L', 'Bobina'], ['C', 'Condensador']], 'L')}${slidersHTML(id, [{ k: 'U', label: 'Tensão U' }, { k: 'f', label: 'Frequência f' }, { k: 'R', label: 'R' }, { k: 'L', label: 'L' }, { k: 'C', label: 'C' }])}<div id="${id}-ph"></div></div>
     <div class="ctrls"><canvas class="scope" id="${id}-c" aria-label="Tensão e corrente no tempo"></canvas><div class="legend"><span><i style="background:${LCD.ch1}"></i>u(t)</span><span><i style="background:${LCD.ch2}"></i>i(t) (escala própria)</span></div><div id="${id}-r"></div></div></div>`;
  const cv = $('#' + id + '-c', p), { g, W, H } = scopeCanvas(cv, 640, 260);
  let v;
  const vis = () => ['R', 'L', 'C'].forEach(k => { $('#' + id + '-' + k, p).closest('.rng').hidden = k !== st.e; });
  const go = () => {
    const w = 2 * PI * v.f, X = st.e === 'R' ? v.R : st.e === 'L' ? w * v.L : 1 / (w * v.C);
    const phi = st.e === 'R' ? 0 : st.e === 'L' ? PI / 2 : -PI / 2; // atraso de i
    const I = v.U / X;
    scopeGrid(g, W, H);
    trace(g, t => Math.sin(t), 0, 4 * PI, W, H, 1.2, LCD.ch1, 2.6);
    trace(g, t => 0.7 * Math.sin(t - phi), 0, 4 * PI, W, H, 1.2, LCD.ch2, 2.4);
    label(g, st.e === 'R' ? 'u e i em fase' : st.e === 'L' ? 'i em atraso de 90°' : 'i em avanço de 90°', 8, 16, LCD.ink);
    $('#' + id + '-ph', p).innerHTML = phasorSVG([{ x: 1, y: 0, c: '#C9A227', l: 'U' }, { x: 0.7 * Math.cos(-phi), y: 0.7 * Math.sin(-phi), c: 'var(--pcb)', l: 'I' }], { id: id + 'p', W: 300, H: 200, cx: 110, aria: 'Fasores de U e I' });
    const name = st.e === 'R' ? 'R' : st.e === 'L' ? 'XL = 2πfL' : 'XC = 1/(2πfC)';
    $('#' + id + '-r', p).innerHTML = readout([[name, eng(X, 'Ω'), 'hi'], ['I = U / ' + (st.e === 'R' ? 'R' : 'X'), eng(I, 'A'), 'hi'], ['Desfasamento', st.e === 'R' ? '0°' : '90°'], ['Potência ativa P', eng(st.e === 'R' ? v.U * I : 0, 'W')], ['Potência reativa Q', st.e === 'R' ? '0 var' : eng(v.U * I, 'var')], ['Valor a 2f', eng(st.e === 'R' ? v.R : st.e === 'L' ? 2 * X : X / 2, 'Ω')]]);
  };
  v = bindSliders(p, id, [{ k: 'U', min: 1, max: 400, v: 230, step: 1, unit: 'V' }, { k: 'f', min: 1, max: 10000, v: 50, log: true, unit: 'Hz' }, { k: 'R', min: 1, max: 1000, v: 200, log: true, unit: 'Ω' }, { k: 'L', min: 1e-3, max: 2, v: 0.7, log: true, unit: 'H' }, { k: 'C', min: 1e-7, max: 1e-3, v: 8e-6, log: true, unit: 'F' }], x => { v = x; if ($('#' + id + '-r', p)) go(); }).vals;
  bindSeg(p, id + '-e', e => { st.e = e; vis(); go(); }); vis(); go();
};

/* --- RLC série / paralelo --- */
TOOLS.rlc = (p, id) => {
  const ser = p.dataset.mode === 'serie';
  const st = { useL: true, useC: true };
  const D = ser ? { R: 40, L: 0.3, C: 100e-6 } : { R: 100, L: 0.5, C: 40e-6 };
  p.innerHTML = toolHead(ser ? 'Analisador de circuito RLC série' : 'Analisador de circuito RLC paralelo', ser ? 'Os valores iniciais são os do exemplo 8.1. Desligue L ou C para obter um RC ou um RL.' : 'Os valores iniciais são os do exemplo 8.2.') +
    `<div class="tool-body"><div class="ctrls">${slidersHTML(id, [{ k: 'U', label: 'Tensão U' }, { k: 'f', label: 'Frequência f' }, { k: 'R', label: 'Resistência R' }, { k: 'L', label: 'Indutância L' }, { k: 'C', label: 'Capacidade C' }])}
      <div class="row"><button type="button" class="btn ghost" id="${id}-l" aria-pressed="true">Com bobina</button><button type="button" class="btn ghost" id="${id}-k" aria-pressed="true">Com condensador</button></div><div id="${id}-r"></div></div>
      <div class="ctrls"><div id="${id}-g"></div><div id="${id}-g2"></div></div></div>`;
  let v;
  const go = () => {
    const w = 2 * PI * v.f, XL = st.useL ? w * v.L : 0, XC = st.useC ? 1 / (w * v.C) : (ser ? 0 : Infinity);
    let items, vecs, tri = '';
    if (ser) {
      const X = XL - XC, Z = Math.hypot(v.R, X), I = v.U / Z, UR = v.R * I, UL = XL * I, UC = XC * I, phi = Math.atan2(X, v.R);
      const kind = Math.abs(X) < 1e-9 * Z ? 'res' : X > 0 ? 'ind' : 'cap';
      items = [['XL', eng(XL, 'Ω')], ['XC', st.useC ? eng(XC, 'Ω') : '0 Ω (sem C)'], ['Z', eng(Z, 'Ω'), 'hi'], ['I = U/Z', eng(I, 'A'), 'hi'], ['UR', eng(UR, 'V')], ['UL', eng(UL, 'V')], ['UC', eng(UC, 'V')], ['cos φ = R/Z', nf(Math.cos(phi), 3), 'hi'], ['φ', nf(deg(phi), 1) + '°'],
        ['Circuito', kind === 'ind' ? 'indutivo: I em atraso' : kind === 'cap' ? 'capacitivo: I em avanço' : 'em ressonância: Z = R', 'wide']];
      if (UL > v.U * 1.001 || UC > v.U * 1.001) items.push(['Atenção', `tensão parcial maior do que U (${eng(Math.max(UL, UC), 'V')})`, 'wide hi']);
      vecs = [{ x: UR, y: 0, c: 'var(--ok)', l: 'UR', ly: 16 }, { x: 0, y: UL, c: 'var(--pcb)', l: 'UL', lx: 8, ly: 4 }, { x: 0, y: -UC, c: 'var(--accent)', l: 'UC', lx: 8, ly: 4 }, { x: 0, y: UL - UC, x0: UR, c: 'var(--muted)', l: 'UL − UC', dash: true, w: 1.8, lx: 8, ly: 4 }, { x: UR, y: UL - UC, c: '#C9A227', l: 'U', w: 3.2, lx: -22 }];
      $('#' + id + '-g', p).innerHTML = '<div class="tcap">Diagrama vetorial das tensões (I como referência)</div>' + phasorSVG(vecs, { id: id + 'v', W: 360, H: 300, cx: 50, arc: phi, aria: 'Diagrama vetorial das tensões' });
      tri = '<div class="tcap">Triângulo de impedâncias</div>' + phasorSVG([{ x: v.R, y: 0, c: 'var(--ok)', l: 'R', ly: 16 }, { x: 0, y: X, x0: v.R, c: 'var(--pcb)', l: 'X = XL − XC' }, { x: v.R, y: X, c: '#C9A227', l: 'Z', w: 3.2, lx: -24 }], { id: id + 't', W: 360, H: 220, cx: 50, arc: phi, aria: 'Triângulo de impedâncias' });
      $('#' + id + '-g2', p).innerHTML = tri;
      $('#' + id + '-r', p).innerHTML = readout(items) + `<span class="state ${kind}">${kind === 'ind' ? 'XL > XC · indutivo' : kind === 'cap' ? 'XL < XC · capacitivo' : 'XL = XC · ressonância'}</span>`;
    } else {
      const IR = v.U / v.R, IL = st.useL ? v.U / XL : 0, IC = st.useC ? v.U / XC : 0, Iy = IC - IL, I = Math.hypot(IR, Iy), Z = v.U / I, phi = Math.atan2(Iy, IR);
      const kind = Math.abs(Iy) < 1e-9 * I ? 'res' : Iy > 0 ? 'cap' : 'ind';
      items = [['XL', st.useL ? eng(XL, 'Ω') : '— (sem L)'], ['XC', st.useC ? eng(XC, 'Ω') : '— (sem C)'], ['IR = U/R', eng(IR, 'A')], ['IL = U/XL', eng(IL, 'A')], ['IC = U/XC', eng(IC, 'A')], ['I total', eng(I, 'A'), 'hi'], ['Z = U/I', eng(Z, 'Ω'), 'hi'], ['cos φ = IR/I', nf(Math.cos(phi), 3), 'hi'], ['Soma dos ramos', eng(IR + IL + IC, 'A')],
        ['Circuito', kind === 'ind' ? 'indutivo: I em atraso' : kind === 'cap' ? 'capacitivo: I em avanço' : 'em ressonância: Z máxima', 'wide']];
      vecs = [{ x: IR, y: 0, c: 'var(--ok)', l: 'IR', ly: 16 }, { x: 0, y: IC, c: 'var(--accent)', l: 'IC', lx: 8, ly: 4 }, { x: 0, y: -IL, c: 'var(--pcb)', l: 'IL', lx: 8, ly: 4 }, { x: 0, y: Iy, x0: IR, c: 'var(--muted)', l: 'IC − IL', dash: true, w: 1.8, lx: 8, ly: 4 }, { x: IR, y: Iy, c: '#C9A227', l: 'I', w: 3.2, lx: -18 }];
      $('#' + id + '-g', p).innerHTML = '<div class="tcap">Diagrama vetorial das correntes (U como referência)</div>' + phasorSVG(vecs, { id: id + 'v', W: 360, H: 300, cx: 50, arc: phi, aria: 'Diagrama vetorial das correntes' });
      $('#' + id + '-g2', p).innerHTML = '';
      $('#' + id + '-r', p).innerHTML = readout(items) + `<span class="state ${kind}">${kind === 'ind' ? 'IL > IC · indutivo' : kind === 'cap' ? 'IC > IL · capacitivo' : 'IL = IC · ressonância'}</span>`;
    }
  };
  v = bindSliders(p, id, [{ k: 'U', min: 1, max: 400, v: 230, step: 1, unit: 'V' }, { k: 'f', min: 10, max: 5000, v: 50, log: true, unit: 'Hz' }, { k: 'R', min: 1, max: 1000, v: D.R, log: true, unit: 'Ω' }, { k: 'L', min: 1e-3, max: 2, v: D.L, log: true, unit: 'H' }, { k: 'C', min: 1e-6, max: 1e-3, v: D.C, log: true, unit: 'F' }], x => { v = x; if ($('#' + id + '-r', p)) go(); }).vals;
  [['l', 'useL', 'bobina'], ['k', 'useC', 'condensador']].forEach(([s, k, n]) => $('#' + id + '-' + s, p).addEventListener('click', e => {
    st[k] = !st[k]; e.target.setAttribute('aria-pressed', st[k]); e.target.textContent = (st[k] ? 'Com ' : 'Sem ') + n;
    $('#' + id + '-' + (k === 'useL' ? 'L' : 'C'), p).disabled = !st[k]; go();
  }));
  go();
};

/* --- ressonância --- */
TOOLS.ressonancia = (p, id) => {
  p.innerHTML = toolHead('Curva de ressonância de um RLC série', 'Varra a frequência e veja a corrente subir até ao máximo em f0. Diminua R para estreitar o pico.') +
    `<div class="tool-body"><div class="ctrls">${slidersHTML(id, [{ k: 'U', label: 'Tensão U' }, { k: 'R', label: 'Resistência R' }, { k: 'L', label: 'Indutância L' }, { k: 'C', label: 'Capacidade C' }, { k: 'x', label: 'Frequência f / f0' }])}<div id="${id}-r"></div></div>
     <div class="ctrls"><div id="${id}-g"></div><div class="legend"><span><i style="background:var(--ca)"></i>I(f)</span><span><i style="background:var(--pcb)"></i>XL</span><span><i style="background:var(--accent)"></i>XC</span></div><div id="${id}-g2"></div></div></div>`;
  let v;
  const go = () => {
    const f0 = 1 / (2 * PI * Math.sqrt(v.L * v.C)), f = f0 * v.x, w = 2 * PI * f;
    const XL = w * v.L, XC = 1 / (w * v.C), Z = Math.hypot(v.R, XL - XC), I = v.U / Z, I0 = v.U / v.R, X0 = 2 * PI * f0 * v.L;
    const a = f0 / 10, b = f0 * 10, pts = [], pl = [], pc = [];
    for (let k = 0; k <= 240; k++) { const ff = a * Math.pow(b / a, k / 240), ww = 2 * PI * ff, xl = ww * v.L, xc = 1 / (ww * v.C); pts.push([ff, v.U / Math.hypot(v.R, xl - xc)]); pl.push([ff, xl]); pc.push([ff, xc]); }
    const yt = niceTicks(0, I0 * 1.08, 4);
    $('#' + id + '-g', p).innerHTML = linePlot({ x0: a, x1: b, xlog: true, y0: 0, y1: Math.max(I0 * 1.1, yt[yt.length - 1]), xt: logTicks(a, b).filter((_, i, arr) => arr.length < 8 || i % 2 === 0), xf: x => eng(x, 'Hz', 2), yt, yf: y => eng(y, 'A', 2), aria: 'Corrente em função da frequência', series: [{ pts, c: 'var(--ca)', fill: true }], vlines: [{ x: f0, c: 'var(--muted)', dash: true, l: 'f0' }], dots: [{ x: f, y: I, c: 'var(--accent)' }] });
    const ym = X0 * 4, ytx = niceTicks(0, ym, 4);
    $('#' + id + '-g2', p).innerHTML = linePlot({ H: 200, x0: a, x1: b, xlog: true, y0: 0, y1: ytx[ytx.length - 1] || ym, xt: logTicks(a, b).filter((_, i, arr) => arr.length < 8 || i % 2 === 0), xf: x => eng(x, 'Hz', 2), yt: ytx, yf: y => eng(y, 'Ω', 2), aria: 'Reatâncias em função da frequência', series: [{ pts: pl, c: 'var(--pcb)' }, { pts: pc, c: 'var(--accent)' }], vlines: [{ x: f0, c: 'var(--muted)', dash: true }, { x: f, c: 'var(--ca)' }] });
    $('#' + id + '-r', p).innerHTML = readout([['f0 = 1/(2π√LC)', eng(f0, 'Hz'), 'hi'], ['f', eng(f, 'Hz')], ['XL', eng(XL, 'Ω')], ['XC', eng(XC, 'Ω')], ['Z', eng(Z, 'Ω')], ['I', eng(I, 'A'), 'hi'], ['UL', eng(XL * I, 'V')], ['UC', eng(XC * I, 'V')], ['Fator Q = XL0/R', sig(X0 / v.R)], ['Imáx = U/R (em f0)', eng(I0, 'A')]]);
  };
  v = bindSliders(p, id, [{ k: 'U', min: 1, max: 50, v: 10, step: 1, unit: 'V' }, { k: 'R', min: 1, max: 500, v: 10, log: true, unit: 'Ω' }, { k: 'L', min: 1e-3, max: 1, v: 0.1, log: true, unit: 'H' }, { k: 'C', min: 1e-7, max: 1e-4, v: 10e-6, log: true, unit: 'F' }, { k: 'x', min: 0.1, max: 10, v: 1, log: true, f: x => sig(x, 2) + ' × f0' }], x => { v = x; if ($('#' + id + '-r', p)) go(); }).vals; go();
};

/* --- triângulo de potências --- */
TOOLS.potencias = (p, id) => {
  const st = { t: 'ind' };
  p.innerHTML = toolHead('Triângulo de potências', 'Os valores iniciais são os do exemplo 10.1 (motor a 230 V, 10 A, cos φ = 0,8).') +
    `<div class="tool-body"><div class="ctrls">${seg(id + '-t', [['ind', 'Carga indutiva'], ['cap', 'Carga capacitiva']], 'ind')}${slidersHTML(id, [{ k: 'U', label: 'Tensão U' }, { k: 'I', label: 'Corrente I' }, { k: 'c', label: 'cos φ' }])}<div id="${id}-r"></div></div><div id="${id}-g"></div></div>`;
  let v;
  const go = () => {
    const S = v.U * v.I, P = S * v.c, sn = Math.sqrt(1 - v.c * v.c), Q = S * sn * (st.t === 'ind' ? 1 : -1), phi = Math.acos(v.c) * (st.t === 'ind' ? 1 : -1);
    $('#' + id + '-r', p).innerHTML = readout([['S = U·I', eng(S, 'VA'), 'hi'], ['P = S·cos φ', eng(P, 'W'), 'hi'], ['Q = S·sen φ', eng(Q, 'var'), 'hi'], ['φ', nf(deg(phi), 1) + '°'], ['sen φ', nf(sn, 3)], ['tg φ', nf(Math.tan(phi), 3)]]);
    $('#' + id + '-g', p).innerHTML = phasorSVG([{ x: P, y: 0, c: 'var(--ok)', l: 'P (W)', ly: 16 }, { x: 0, y: Q, x0: P, c: 'var(--pcb)', l: 'Q (var)' }, { x: P, y: Q, c: '#C9A227', l: 'S (VA)', w: 3.2, lx: -60 }], { id: id + 't', W: 360, H: 300, cx: 50, arc: phi, aria: 'Triângulo de potências' });
  };
  v = bindSliders(p, id, [{ k: 'U', min: 1, max: 400, v: 230, step: 1, unit: 'V' }, { k: 'I', min: 0.1, max: 50, v: 10, step: 0.1, unit: 'A' }, { k: 'c', min: 0.1, max: 1, v: 0.8, step: 0.01, f: x => nf(x, 2) }], x => { v = x; if ($('#' + id + '-r', p)) go(); }).vals;
  bindSeg(p, id + '-t', t => { st.t = t; go(); }); go();
};

/* --- Boucherot --- */
TOOLS.boucherot = (p, id) => {
  const st = { rows: [['Aquecedor', 2000, 1, 'ind'], ['Motor', 3000, 0.8, 'ind'], ['Lâmpadas fluorescentes', 1000, 0.6, 'ind']] };
  p.innerHTML = toolHead('Soma de potências de uma instalação', 'Edite as cargas. Somam-se P e Q; S calcula-se no fim. Os valores iniciais são os da tabela da sebenta.') +
    `<div class="tbl"><table><thead><tr><th>Carga</th><th>P (W)</th><th>cos φ</th><th>Tipo</th><th>Q (var)</th><th>S (VA)</th><th></th></tr></thead><tbody id="${id}-b"></tbody></table></div>
     <div class="row"><button type="button" class="btn ghost" id="${id}-a">+ Acrescentar carga</button><div class="fld"><label for="${id}-U">Tensão U (V)</label><input type="text" inputmode="decimal" id="${id}-U" value="230" style="width:6em"></div></div><div id="${id}-r"></div>`;
  const rows = () => {
    $('#' + id + '-b', p).innerHTML = st.rows.map((r, i) => `<tr><td><input type="text" id="${id}-n${i}" value="${r[0]}" aria-label="Nome da carga ${i + 1}" style="width:11em"></td><td><input type="text" inputmode="decimal" id="${id}-p${i}" value="${nf(r[1], 2).replace(/\s/g, '')}" aria-label="P da carga ${i + 1}" style="width:6em"></td><td><input type="text" inputmode="decimal" id="${id}-c${i}" value="${nf(r[2], 3)}" aria-label="cos φ da carga ${i + 1}" style="width:5em"></td><td><select id="${id}-t${i}" aria-label="Tipo da carga ${i + 1}"><option value="ind"${r[3] === 'ind' ? ' selected' : ''}>indutiva</option><option value="cap"${r[3] === 'cap' ? ' selected' : ''}>capacitiva</option></select></td><td class="m" id="${id}-q${i}"></td><td class="m" id="${id}-s${i}"></td><td><button type="button" class="btn ghost" data-del="${i}" aria-label="Retirar carga ${i + 1}">×</button></td></tr>`).join('');
  };
  const go = () => {
    let PT = 0, QT = 0, bad = false;
    st.rows.forEach((r, i) => {
      const c = r[2]; if (!(c > 0 && c <= 1) || !(r[1] >= 0)) { bad = true; $('#' + id + '-q' + i, p).textContent = '—'; $('#' + id + '-s' + i, p).textContent = '—'; return; }
      const Q = r[1] * Math.tan(Math.acos(c)) * (r[3] === 'ind' ? 1 : -1); PT += r[1]; QT += Q;
      $('#' + id + '-q' + i, p).textContent = nf(Q, 0); $('#' + id + '-s' + i, p).textContent = nf(r[1] / c, 0);
    });
    const ST = Math.hypot(PT, QT), U = parseNum($('#' + id + '-U', p).value), sumS = st.rows.reduce((a, r) => a + (r[2] > 0 ? r[1] / r[2] : 0), 0);
    $('#' + id + '-r', p).innerHTML = (bad ? '<div class="fb bad">Verifique os valores: P ≥ 0 e cos φ entre 0 e 1.</div>' : '') + readout([['PT = ΣP', eng(PT, 'W'), 'hi'], ['QT = ΣQ', eng(QT, 'var'), 'hi'], ['ST = √(PT² + QT²)', eng(ST, 'VA'), 'hi'], ['cos φT = PT/ST', ST ? nf(PT / ST, 3) : '—'], ['I = ST/U', isFinite(U) && U > 0 ? eng(ST / U, 'A') : '—'], ['Soma (errada) dos S', eng(sumS, 'VA')]]);
  };
  p.addEventListener('input', e => {
    const m = e.target.id.match(new RegExp('^' + id + '-([npct])(\\d+)$'));
    if (m) { const i = +m[2], k = { n: 0, p: 1, c: 2, t: 3 }[m[1]]; st.rows[i][k] = k === 0 || k === 3 ? e.target.value : parseNum(e.target.value); }
    go();
  });
  p.addEventListener('change', e => { if (e.target.tagName === 'SELECT') { const m = e.target.id.match(/(\d+)$/); st.rows[+m[1]][3] = e.target.value; go(); } });
  p.addEventListener('click', e => {
    if (e.target.dataset.del !== undefined) { st.rows.splice(+e.target.dataset.del, 1); rows(); go(); }
    if (e.target.id === id + '-a') { st.rows.push(['Nova carga', 500, 0.9, 'ind']); rows(); go(); }
  });
  rows(); go();
};

/* --- compensação do fator de potência --- */
TOOLS.compensacao = (p, id) => {
  p.innerHTML = toolHead('Calculadora de compensação do fator de potência', 'Os valores iniciais são os do exemplo 10.2. O condensador liga-se em paralelo com a carga.') +
    `<div class="tool-body"><div class="ctrls">${slidersHTML(id, [{ k: 'P', label: 'Potência ativa P' }, { k: 'U', label: 'Tensão U' }, { k: 'f', label: 'Frequência f' }, { k: 'c1', label: 'cos φ1 (atual)' }, { k: 'c2', label: 'cos φ2 (pretendido)' }])}<div id="${id}-r"></div></div><div id="${id}-g"></div></div>`;
  let v;
  const go = () => {
    const t1 = Math.tan(Math.acos(v.c1)), t2 = Math.tan(Math.acos(v.c2)), w = 2 * PI * v.f;
    const Q1 = v.P * t1, Q2 = v.P * t2, Qc = Math.max(0, Q1 - Q2), C = Qc / (w * v.U * v.U), I1 = v.P / (v.U * v.c1), I2 = v.P / (v.U * Math.max(v.c1, v.c2));
    const okk = v.c2 > v.c1;
    $('#' + id + '-r', p).innerHTML = (okk ? '' : '<div class="fb bad">O cos φ pretendido tem de ser maior do que o atual.</div>') + readout([['tg φ1', nf(t1, 3)], ['tg φ2', nf(t2, 3)], ['QC = P(tg φ1 − tg φ2)', eng(Qc, 'var'), 'hi'], ['C = QC/(ωU²)', eng(C, 'F'), 'hi'], ['I antes', eng(I1, 'A')], ['I depois', eng(I2, 'A'), 'hi'], ['S antes', eng(v.P / v.c1, 'VA')], ['S depois', eng(v.P / Math.max(v.c1, v.c2), 'VA')], ['Redução da corrente', okk ? nf(100 * (1 - I2 / I1), 1) + ' %' : '0 %', 'wide']]);
    $('#' + id + '-g', p).innerHTML = '<div class="tcap">Triângulos de potências antes (φ1) e depois (φ2)</div>' + phasorSVG([{ x: v.P, y: 0, c: 'var(--ok)', l: 'P', ly: 16 }, { x: v.P, y: Q1, c: 'var(--muted)', l: 'S1', lx: -30, dash: true }, { x: 0, y: -Qc, x0: v.P, y0: Q1, c: 'var(--accent)', l: 'QC', lx: 8 }, { x: v.P, y: Q2, c: '#C9A227', l: 'S2', w: 3.2, lx: -30 }], { id: id + 'c', W: 360, H: 320, cx: 40, aria: 'Triângulos de potências antes e depois da compensação' });
  };
  v = bindSliders(p, id, [{ k: 'P', min: 100, max: 50000, v: 5000, log: true, unit: 'W' }, { k: 'U', min: 100, max: 400, v: 230, step: 1, unit: 'V' }, { k: 'f', min: 50, max: 60, v: 50, step: 10, unit: 'Hz' }, { k: 'c1', min: 0.3, max: 1, v: 0.7, step: 0.01, f: x => nf(x, 2) }, { k: 'c2', min: 0.3, max: 1, v: 0.95, step: 0.01, f: x => nf(x, 2) }], x => { v = x; if ($('#' + id + '-r', p)) go(); }).vals; go();
};

/* --- tensões trifásicas --- */
TOOLS.trifasico = (p, id) => {
  p.innerHTML = toolHead('Tensões trifásicas', 'Três tensões iguais desfasadas de 120°. Em qualquer instante, a soma é zero.') +
    `<div class="tool-body"><div class="ctrls">${slidersHTML(id, [{ k: 'V', label: 'Tensão simples V' }, { k: 'x', label: 'Instante (graus)' }])}<div class="row"><button type="button" class="btn" id="${id}-p">Animar</button></div><div id="${id}-r"></div><div id="${id}-ph"></div></div>
     <div class="ctrls"><canvas class="scope" id="${id}-c" aria-label="Tensões L1, L2 e L3 ao longo de um período"></canvas><div class="legend"><span><i style="background:${LCD.ch1}"></i>L1</span><span><i style="background:${LCD.ch2}"></i>L2</span><span><i style="background:${LCD.ch3}"></i>L3</span></div></div></div>`;
  const cv = $('#' + id + '-c', p), { g, W, H } = scopeCanvas(cv, 640, 280);
  let ctl, v;
  const go = () => {
    const Vm = v.V * SQ2, a = rad(v.x), cols = [LCD.ch1, LCD.ch2, LCD.ch3];
    scopeGrid(g, W, H, 12, 8);
    [0, 1, 2].forEach(k => trace(g, t => Math.sin(t - k * 2 * PI / 3), 0, 2 * PI, W, H, 1.15, cols[k], 2.4));
    const x = W * a / (2 * PI); g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
    const vs = [0, 1, 2].map(k => Vm * Math.sin(a - k * 2 * PI / 3));
    vs.forEach((y, k) => { g.fillStyle = cols[k]; g.beginPath(); g.arc(x, H / 2 - y / Vm / 1.15 * H / 2, 4.5, 0, 7); g.fill(); });
    ['0°', '120°', '240°', '360°'].forEach((s, i) => label(g, s, Math.min(W - 4, Math.max(4, i * W / 3)), H - 6, LCD.ink, i === 0 ? 'left' : i === 3 ? 'right' : 'center'));
    $('#' + id + '-r', p).innerHTML = readout([['v1', eng(vs[0], 'V')], ['v2', eng(vs[1], 'V')], ['v3', eng(vs[2], 'V')], ['v1 + v2 + v3', eng(Math.abs(vs[0] + vs[1] + vs[2]) < 1e-6 ? 0 : vs[0] + vs[1] + vs[2], 'V'), 'hi'], ['Tensão composta U = √3·V', eng(SQ3 * v.V, 'V'), 'hi wide']]);
    $('#' + id + '-ph', p).innerHTML = phasorSVG([0, 1, 2].map(k => ({ x: Math.cos(a - k * 2 * PI / 3), y: Math.sin(a - k * 2 * PI / 3), c: ['#C9A227', '#1D9BD7', '#D9466F'][k], l: 'V' + (k + 1) })), { id: id + 'f', W: 300, H: 260, cx: 150, aria: 'Fasores das três tensões' });
  };
  ctl = bindSliders(p, id, [{ k: 'V', min: 100, max: 400, v: 230, step: 1, unit: 'V' }, { k: 'x', min: 0, max: 360, v: 30, step: 1, f: x => nf(x, 0) + '°' }], x => { v = x; if ($('#' + id + '-r', p)) go(); });
  v = ctl.vals;
  const an = animLoop(p, dt => { ctl.set('x', (v.x + 60 * dt) % 360); go(); });
  $('#' + id + '-p', p).addEventListener('click', e => { if (an.on) { an.pause(); e.target.textContent = 'Animar'; } else { an.play(); e.target.textContent = 'Parar'; } });
  go();
};

/* --- cargas em estrela e triângulo --- */
TOOLS.estrela = (p, id) => {
  const st = { lig: 'Y' };
  p.innerHTML = toolHead('Cargas resistivas em estrela ou em triângulo', 'Ponha uma resistência no máximo (desligada) para desequilibrar a carga e ver a corrente no neutro. Começa no exercício 11.3.') +
    `<div class="tool-body"><div class="ctrls">${seg(id + '-l', [['Y', 'Estrela (Y) com neutro'], ['D', 'Triângulo (Δ)']], 'Y')}${slidersHTML(id, [{ k: 'U', label: 'Tensão composta U' }, { k: 'R1', label: 'R da fase 1' }, { k: 'R2', label: 'R da fase 2' }, { k: 'R3', label: 'R da fase 3' }])}<div id="${id}-r"></div></div><div id="${id}-g"></div></div>`;
  let v;
  const OFF = 1000;
  const fR = x => x >= OFF ? 'desligada' : eng(x, 'Ω');
  const go = () => {
    const V = v.U / SQ3, Rs = [v.R1, v.R2, v.R3], on = Rs.map(r => r < OFF);
    const ang = k => -k * 2 * PI / 3; // fase de cada tensão simples
    let items, vecs;
    if (st.lig === 'Y') {
      const I = Rs.map((r, k) => on[k] ? V / r : 0);
      const nx = I.reduce((a, i, k) => a + i * Math.cos(ang(k)), 0), ny = I.reduce((a, i, k) => a + i * Math.sin(ang(k)), 0), IN = Math.hypot(nx, ny);
      const P = I.reduce((a, i, k) => a + (on[k] ? i * i * Rs[k] : 0), 0);
      items = [['Tensão em cada carga V = U/√3', eng(V, 'V'), 'wide'], ['I1', eng(I[0], 'A')], ['I2', eng(I[1], 'A')], ['I3', eng(I[2], 'A')], ['Corrente no neutro IN', eng(IN < 1e-9 ? 0 : IN, 'A'), 'hi'], ['Potência total P', eng(P, 'W'), 'hi'], ['Carga', on.every(x => x) && Rs.every(r => Math.abs(r - Rs[0]) < 1e-9) ? 'equilibrada' : 'desequilibrada']];
      vecs = I.map((i, k) => ({ x: i * Math.cos(ang(k) + PI / 2), y: i * Math.sin(ang(k) + PI / 2), c: ['#C9A227', '#1D9BD7', '#D9466F'][k], l: 'I' + (k + 1) }));
      if (IN > 1e-9) vecs.push({ x: nx * Math.cos(PI / 2) - ny * Math.sin(PI / 2), y: nx * Math.sin(PI / 2) + ny * Math.cos(PI / 2), c: 'var(--ok)', l: 'IN', w: 3.4 });
    } else {
      // correntes de fase em cada ramo (entre linhas): ramo 12, 23, 31
      const Iph = Rs.map((r, k) => on[k] ? v.U / r : 0), ph = [PI / 6, PI / 6 - 2 * PI / 3, PI / 6 + 2 * PI / 3];
      const c = Iph.map((i, k) => [i * Math.cos(ph[k]), i * Math.sin(ph[k])]);
      const IL = [[c[0][0] - c[2][0], c[0][1] - c[2][1]], [c[1][0] - c[0][0], c[1][1] - c[0][1]], [c[2][0] - c[1][0], c[2][1] - c[1][1]]].map(z => Math.hypot(z[0], z[1]));
      const P = Iph.reduce((a, i, k) => a + (on[k] ? i * i * Rs[k] : 0), 0);
      items = [['Tensão em cada carga = U', eng(v.U, 'V'), 'wide'], ['I fase 12', eng(Iph[0], 'A')], ['I fase 23', eng(Iph[1], 'A')], ['I fase 31', eng(Iph[2], 'A')], ['I linha L1', eng(IL[0], 'A'), 'hi'], ['I linha L2', eng(IL[1], 'A')], ['I linha L3', eng(IL[2], 'A')], ['Potência total P', eng(P, 'W'), 'hi'], ['IL / Ifase (equilibrada)', '√3 = 1,732']];
      vecs = c.map((z, k) => ({ x: -z[1], y: z[0], c: ['#C9A227', '#1D9BD7', '#D9466F'][k], l: ['I12', 'I23', 'I31'][k] }));
    }
    $('#' + id + '-r', p).innerHTML = readout(items);
    $('#' + id + '-g', p).innerHTML = '<div class="tcap">' + (st.lig === 'Y' ? 'Correntes de fase e corrente no neutro' : 'Correntes nos ramos do triângulo') + '</div>' + phasorSVG(vecs, { id: id + 'v', W: 320, H: 300, cx: 160, aria: 'Diagrama das correntes' });
  };
  v = bindSliders(p, id, [{ k: 'U', min: 200, max: 690, v: 230 * SQ3, step: 1, f: x => nf(x, 0) + ' V' }, { k: 'R1', min: 5, max: OFF, v: 23, log: true, f: fR }, { k: 'R2', min: 5, max: OFF, v: 23, log: true, f: fR }, { k: 'R3', min: 5, max: OFF, v: 23, log: true, f: fR }], x => { v = x; if ($('#' + id + '-r', p)) go(); }).vals;
  bindSeg(p, id + '-l', l => { st.lig = l; go(); }); go();
};
/* ================= navegação, exercícios e testes ================= */
const NAV = {
  1: [['inicio', '·', 'Apresentação'], ['cap-1', '1', 'Fundamentos'], ['cap-2', '2', 'Condensadores'], ['cap-3', '3', 'Magnetismo'], ['cap-4', '4', 'Indução'], ['cap-5', '5', 'Bobines'], ['videos', '▶', 'Vídeos de apoio'], ['formulario', 'Σ', 'Formulário'], ['teste-1', '✓', 'Teste rápido']],
  2: [['inicio', '·', 'Apresentação'], ['cap-6', '6', 'CA sinusoidal'], ['cap-7', '7', 'R, L e C em CA'], ['cap-8', '8', 'RLC série e paralelo'], ['cap-9', '9', 'Ressonância'], ['cap-10', '10', 'Potências'], ['cap-11', '11', 'Trifásico'], ['videos', '▶', 'Vídeos de apoio'], ['formulario', 'Σ', 'Formulário'], ['teste-2', '✓', 'Teste rápido']]
};
const QUIZ = {
  1: [
    { q: 'Uma corrente de 2 A circula durante 10 s. Que carga atravessa o condutor?', o: ['0,2 C', '5 C', '20 C', '12 C'], a: 2, w: 'Q = I · t = 2 × 10 = 20 C.' },
    { q: 'Uma resistência tem os anéis amarelo – violeta – vermelho – dourado. Qual é o valor?', o: ['47 Ω ± 5 %', '470 Ω ± 5 %', '4,7 kΩ ± 5 %', '47 kΩ ± 10 %'], a: 2, w: 'Amarelo 4, violeta 7, vermelho × 100: 47 × 100 = 4700 Ω; dourado ± 5 %.' },
    { q: 'Três resistências de 300 Ω em paralelo equivalem a…', o: ['900 Ω', '300 Ω', '150 Ω', '100 Ω'], a: 3, w: 'Iguais em paralelo: Req = R / n = 300 / 3 = 100 Ω.' },
    { q: 'Como se liga um amperímetro?', o: ['Em paralelo, com resistência interna elevada', 'Em série, com resistência interna muito baixa', 'Em série, com resistência interna elevada', 'Em paralelo, com o circuito desligado'], a: 1, w: 'Fica em série, abrindo o circuito, e deve ter resistência muito baixa para não alterar a corrente.' },
    { q: 'Dois condensadores de 10 μF em série equivalem a…', o: ['20 μF', '10 μF', '5 μF', '100 μF'], a: 2, w: 'Em série as capacidades combinam-se como resistências em paralelo: 10 × 10 / 20 = 5 μF.' },
    { q: 'Com R = 10 kΩ e C = 100 μF, quanto tempo leva o condensador a ficar praticamente carregado?', o: ['1 s', '5 s', '0,1 s', '50 s'], a: 1, w: 'τ = R · C = 10 000 × 0,0001 = 1 s; completo ao fim de 5τ = 5 s.' },
    { q: 'Se a tensão num condensador duplica, a energia armazenada…', o: ['duplica', 'fica igual', 'quadruplica', 'reduz-se a metade'], a: 2, w: 'W = ½ · C · U²: a energia cresce com o quadrado da tensão.' },
    { q: 'Qual é a forma correta de descarregar um condensador eletrolítico grande?', o: ['Curto-circuitar com uma chave de fendas', 'Por uma resistência com pontas isoladas, durante pelo menos 5τ', 'Esperar 5 segundos e tocar nos terminais', 'Ligá-lo ao contrário à fonte'], a: 1, w: 'Descarrega-se por resistência, medindo antes e depois. A chave de fendas liberta a energia toda de uma vez.' },
    { q: 'O campo magnético de um fio retilíneo a 4 cm vale 50 μT. Quanto vale a 8 cm?', o: ['100 μT', '50 μT', '25 μT', '12,5 μT'], a: 2, w: 'B = μ0 · I / (2π · r): a distância dupla, o campo é metade.' },
    { q: 'Um íman está parado dentro de uma bobina ligada a um galvanómetro. O que marca o galvanómetro?', o: ['Uma corrente constante', 'Zero', 'Uma corrente alternada', 'Depende da força do íman'], a: 1, w: 'Só há indução quando o fluxo varia. Com o íman parado, o fluxo é constante.' },
    { q: 'Porque é que os núcleos dos transformadores são laminados?', o: ['Para aumentar a remanência', 'Para reduzir as correntes de Foucault', 'Para aumentar o peso', 'Para isolar o primário do secundário'], a: 1, w: 'As chapas isoladas cortam o caminho das correntes de Foucault e reduzem as perdas.' },
    { q: 'Duas bobines de 20 mH e 30 mH em série (sem acoplamento) equivalem a…', o: ['12 mH', '25 mH', '50 mH', '600 mH'], a: 2, w: 'Em série, as indutâncias somam-se, como as resistências: 20 + 30 = 50 mH.' }
  ],
  2: [
    { q: 'Qual é o período de uma tensão de 50 Hz?', o: ['50 ms', '20 ms', '2 ms', '0,5 s'], a: 1, w: 'T = 1 / f = 1 / 50 = 0,02 s = 20 ms.' },
    { q: 'Uma tomada de 230 V tem um valor de pico de cerca de…', o: ['163 V', '230 V', '325 V', '460 V'], a: 2, w: 'Umáx = √2 × 230 ≈ 325 V. Os 230 V são o valor eficaz.' },
    { q: 'No osciloscópio (2 V/div; 1 ms/div), um ciclo ocupa 4 divisões. Qual é a frequência?', o: ['250 Hz', '400 Hz', '500 Hz', '4 kHz'], a: 0, w: 'T = 4 × 1 ms = 4 ms; f = 1 / 0,004 = 250 Hz.' },
    { q: 'Numa bobina pura em CA, a corrente…', o: ['está em fase com a tensão', 'está em atraso de 90° em relação à tensão', 'está em avanço de 90° em relação à tensão', 'é sempre nula'], a: 1, w: 'Na bobina, a tensão vem antes da corrente: i em atraso de 90°.' },
    { q: 'Se a frequência duplica, a reatância de um condensador…', o: ['duplica', 'fica igual', 'reduz-se a metade', 'quadruplica'], a: 2, w: 'XC = 1/(2πfC): é inversamente proporcional à frequência.' },
    { q: 'Num RLC série com R = 30 Ω, XL = 80 Ω e XC = 40 Ω, a impedância é…', o: ['150 Ω', '50 Ω', '70 Ω', '110 Ω'], a: 1, w: 'Z = √(30² + (80 − 40)²) = √(900 + 1600) = 50 Ω.' },
    { q: 'No circuito da pergunta anterior, o circuito é…', o: ['indutivo, com I em atraso', 'capacitivo, com I em avanço', 'resistivo puro', 'em ressonância'], a: 0, w: 'XL > XC: predomina a bobina, o circuito é indutivo.' },
    { q: 'Num RLC série em ressonância…', o: ['a impedância é máxima', 'a corrente é mínima', 'Z = R e a corrente é máxima', 'cos φ = 0'], a: 2, w: 'XL = XC anulam-se: Z = R (mínima) e I = U/R (máxima), com cos φ = 1.' },
    { q: 'Com L = 0,1 H e C = 10 μF, a frequência de ressonância é cerca de…', o: ['15,9 Hz', '159 Hz', '1,59 kHz', '50 Hz'], a: 1, w: 'f0 = 1 / (2π√(0,1 × 10⁻⁵)) ≈ 159 Hz.' },
    { q: 'Em que unidade se mede a potência reativa?', o: ['W', 'VA', 'var', 'kWh'], a: 2, w: 'P em watt, Q em volt-ampere reativo (var), S em volt-ampere (VA).' },
    { q: 'Uma carga absorve P = 3 kW e Q = 4 kvar. Quanto vale S?', o: ['7 kVA', '5 kVA', '1 kVA', '12 kVA'], a: 1, w: 'S = √(P² + Q²) = √(9 + 16) = 5 kVA.' },
    { q: 'Como se ligam os condensadores de compensação do fator de potência?', o: ['Em série com a carga', 'Em paralelo com a carga', 'Entre o neutro e a terra', 'Só no secundário do transformador'], a: 1, w: 'Em paralelo: a carga continua a receber a tensão da rede e o condensador fornece a energia reativa.' },
    { q: 'Na rede 230/400 V, a tensão composta é…', o: ['230 V', '400 V', '690 V', '133 V'], a: 1, w: 'A tensão composta, entre fases, é √3 × 230 ≈ 400 V.' },
    { q: 'Numa carga trifásica equilibrada em estrela, a corrente no neutro é…', o: ['a soma das três correntes de fase', '√3 vezes a corrente de fase', 'zero', 'igual à corrente de uma fase'], a: 2, w: 'Três correntes iguais desfasadas de 120° somam zero.' }
  ]
};

const ALLSEC = $$('section.topic');
let curPart = 1;
const navEl = $('#nav');

function buildNav() {
  navEl.innerHTML = `<div class="nh">${curPart === 1 ? 'Parte 1 · Corrente contínua' : 'Parte 2 · Corrente alternada'}</div>` +
    NAV[curPart].map(([id, n, t]) => `<button type="button" data-go="${id}"><span class="n">${n}</span><span>${t}</span></button>`).join('') +
    `<div class="score" id="score"></div>`;
  updateScore();
}
function setPart(p) {
  curPart = p; document.body.dataset.part = p;
  $$('.parts button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.part === p));
  buildNav();
}
function show(id, push) {
  const sec = document.getElementById(id) || document.getElementById('inicio');
  const sp = +sec.dataset.part;
  if (sp && sp !== curPart) setPart(sp);
  ALLSEC.forEach(s => { s.hidden = s !== sec; });
  $$('button', navEl).forEach(b => b.setAttribute('aria-current', b.dataset.go === sec.id));
  initTools(sec);
  if (push && location.hash !== '#' + sec.id) history.pushState(null, '', '#' + sec.id);
  store.set('last', sec.id);
}
navEl.addEventListener('click', e => { const b = e.target.closest('button[data-go]'); if (b) { show(b.dataset.go, true); window.scrollTo({ top: $('.layout').offsetTop - 10, behavior: reduceMotion ? 'auto' : 'smooth' }); } });
$$('.parts button').forEach(b => b.addEventListener('click', () => { const p = +b.dataset.part; setPart(p); show(p === 1 ? 'cap-1' : 'cap-6', true); }));
window.addEventListener('hashchange', () => show(location.hash.slice(1)));
window.addEventListener('popstate', () => show(location.hash.slice(1) || 'inicio'));
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]'); if (!a) return;
  e.preventDefault(); show(a.getAttribute('href').slice(1), true); window.scrollTo({ top: $('.layout').offsetTop - 10, behavior: reduceMotion ? 'auto' : 'smooth' });
});

/* --- instrumentos: construídos quando a secção abre --- */
function initTools(sec) {
  $$('.panel.tool[data-tool]', sec).forEach(p => {
    if (p.dataset.ready) return; p.dataset.ready = '1';
    const f = TOOLS[p.dataset.tool];
    if (f) { try { f(p, uid('t')); } catch (err) { p.innerHTML = toolHead('Instrumento indisponível') + '<div class="fb bad">Não foi possível abrir este instrumento neste navegador.</div>'; console.error(err); } }
  });
}

/* --- exercícios --- */
const DONE = new Set(store.get('ex', []));
const EXS = $$('.ex[data-id]');
EXS.forEach(ex => {
  const ins = $$('.ain .in', ex);
  if (!ins.length) return;
  ins.forEach(sp => {
    const iid = 'ex-' + ex.dataset.id + '-' + (ins.indexOf(sp) + 1);
    const lab = sp.textContent.trim();
    sp.innerHTML = `<label for="${iid}">${lab}</label><input type="text" inputmode="decimal" autocomplete="off" id="${iid}"><span class="u">${sp.dataset.u || ''}</span>`;
  });
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn'; btn.textContent = 'Verificar';
  $('.ain', ex).appendChild(btn);
  const fb = document.createElement('div'); fb.className = 'fb'; fb.setAttribute('role', 'status');
  $('.ain', ex).after(fb);
  if (DONE.has(ex.dataset.id)) { ex.classList.add('done'); fb.className = 'fb ok'; fb.textContent = 'Já resolvido neste dispositivo.'; }
  const check = () => {
    let ok = 0, filled = 0;
    ins.forEach(sp => {
      const inp = $('input', sp), a = parseNum(inp.value), ans = parseFloat(sp.dataset.ans);
      inp.classList.remove('ok', 'bad'); if (isNaN(a)) return; filled++;
      const tol = ans === 0 ? 0.02 : Math.abs(ans) * (parseFloat(sp.dataset.tol || '2') / 100);
      const good = Math.abs(a - ans) <= tol;
      inp.classList.add(good ? 'ok' : 'bad'); if (good) ok++;
    });
    if (!filled) { fb.className = 'fb bad'; fb.textContent = 'Escreva a sua resposta nos campos, só o número, na unidade indicada.'; return; }
    if (ok === ins.length) {
      fb.className = 'fb ok'; fb.textContent = 'Certo! ' + (ins.length > 1 ? 'Todos os valores estão corretos.' : 'O valor está correto.');
      ex.classList.add('done'); DONE.add(ex.dataset.id); store.set('ex', Array.from(DONE)); updateScore();
    } else {
      fb.className = 'fb bad';
      fb.textContent = `${ok} de ${ins.length} certo${ok === 1 ? '' : 's'}. ` + (filled < ins.length ? 'Preencha os campos em falta. ' : '') + 'Reveja o cálculo e as unidades; a resolução está logo abaixo.';
    }
  };
  btn.addEventListener('click', check);
  ex.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') check(); });
});
function updateScore() {
  const box = $('#score'); if (!box) return;
  const mine = EXS.filter(ex => $('.ain', ex) && +(document.getElementById(ex.closest('section').id).dataset.part) === curPart);
  const d = mine.filter(ex => DONE.has(ex.dataset.id)).length;
  const qb = store.get('quiz' + curPart, null);
  box.innerHTML = `<span>Exercícios resolvidos</span><b>${d} / ${mine.length}</b><div class="meter"><span style="width:${mine.length ? 100 * d / mine.length : 0}%"></span></div>` +
    (qb ? `<span>Melhor no teste: <b>${qb.s} / ${qb.n}</b></span>` : '<span>Teste rápido ainda não feito.</span>') +
    `<button type="button" id="reset">Recomeçar a contagem</button>`;
  $('#reset').addEventListener('click', () => {
    mine.forEach(ex => { DONE.delete(ex.dataset.id); ex.classList.remove('done'); $$('input', ex).forEach(i => { i.value = ''; i.classList.remove('ok', 'bad'); }); const f = $('.fb', ex); if (f) { f.textContent = ''; f.className = 'fb'; } });
    store.set('ex', Array.from(DONE)); store.set('quiz' + curPart, null); updateScore();
  });
}

/* --- testes rápidos, PDF e envio ao professor --- */
// Envio por email através do FormSubmit (só funciona fora do claude.ai, por exemplo no GitHub Pages).
// O endereço em minúsculas é o mesmo que já foi ativado no FormSubmit para os outros testes.
const ENVIO_URL = 'https://formsubmit.co/ajax/epave.glauco@gmail.com';
const EMAIL_PROF = 'Epave.glauco@gmail.com';
const NOMES_TESTE = { 1: 'Teste rápido – Parte 1 (Corrente contínua)', 2: 'Teste rápido – Parte 2 (Corrente alternada)' };
const QSTATE = {};
const pdfTxt = s => String(s)
  .replace(/[−–—]/g, '-').replace(/φ/g, 'fi').replace(/√/g, 'raiz').replace(/μ/g, 'u').replace(/Ω/g, ' ohm').replace(/²/g, '^2').replace(/³/g, '^3').replace(/≈/g, '~').replace(/·/g, '·')
  .replace(/π/g, 'pi').replace(/Σ/g, 'soma').replace(/[⁻]/g, '^-').replace(/⁰/g, '0').replace(/¹/g, '1').replace(/[⁴]/g, '4').replace(/[⁵]/g, '5').replace(/[⁶]/g, '6').replace(/[⁷]/g, '7').replace(/[⁸]/g, '8').replace(/[⁹]/g, '9')
  .replace(/[→]/g, '->').replace(/[✓]/g, 'certo').replace(/[✗]/g, 'errado').replace(/[^\x00-\xff]/g, '?');
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

function quizPDF(k, who) {
  const { jsPDF } = window.jspdf;
  const Q = QUIZ[k], st = QSTATE[k], doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 16; let y = 18;
  const line = (txt, size = 10, bold = false, color = [20, 33, 61], gap = 1.5) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color);
    doc.splitTextToSize(pdfTxt(txt), W - 2 * M).forEach(l => { if (y > 280) { doc.addPage(); y = 18; } doc.text(l, M, y); y += size * 0.42 + gap; });
  };
  doc.setFillColor(13, 42, 94); doc.rect(0, 0, W, 30, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(pdfTxt('UC 1993 · Executar análise de circuitos RLC'), M, 13);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.text(pdfTxt(NOMES_TESTE[k]), M, 21);
  doc.setFontSize(9); doc.text(pdfTxt('Professor Glauco Barbosa · ' + EMAIL_PROF + ' · EPAVE'), M, 27);
  y = 40;
  line(`Nome: ${who.nome}`, 11, true); line(`Número: ${who.num}    Turma: ${who.turma}`, 11);
  line(`Data: ${st.fim.toLocaleString('pt-PT')}`, 10, false, [85, 98, 124]);
  y += 2;
  doc.setFillColor(237, 242, 250); doc.roundedRect(M, y - 6.5, W - 2 * M, 10.5, 2, 2, 'F');
  line(`Resultado: ${st.score} certas em ${Q.length}  ·  Nota: ${nf(20 * st.score / Q.length, 1)} valores (0-20)`, 12, true, [178, 72, 10], 4);
  y += 2;
  Q.forEach((x, i) => {
    const j = st.ans[i], ok = j === x.a;
    if (y > 262) { doc.addPage(); y = 18; }
    line(`${i + 1}. ${x.q}`, 10.5, true);
    line(`Resposta do aluno: ${j === undefined ? '(sem resposta)' : String.fromCharCode(65 + j) + ') ' + x.o[j]}  -  ${ok ? 'CERTA' : 'ERRADA'}`, 10, false, ok ? [23, 138, 74] : [198, 40, 40]);
    if (!ok) line(`Resposta correta: ${String.fromCharCode(65 + x.a)}) ${x.o[x.a]}`, 10, false, [23, 138, 74]);
    line(x.w, 9, false, [85, 98, 124], 3.5);
  });
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) { doc.setPage(p); doc.setFontSize(8); doc.setTextColor(120, 130, 150); doc.text(pdfTxt(`Sebenta dinâmica UC 1993 · página ${p} de ${n}`), W / 2, 292, { align: 'center' }); }
  return doc.output('blob');
}
async function savePDF(blob, name) {
  // Dentro do claude.ai usa a capacidade de transferências; fora, uma ligação normal.
  try {
    if (window.claude && window.claude.use) {
      const dl = await window.claude.use('downloads');
      if (dl) { await dl.save({ filename: name, data: blob }); return 'ok'; }
    }
  } catch (e) { if (e && /declin|cancel|reject/i.test(String(e.code || e.message))) return 'cancel'; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  return 'ok';
}
// Envio em JSON (a forma documentada do FormSubmit para AJAX); o PDF fica para descarregar.
async function sendResult(k, who) {
  const Q = QUIZ[k], st = QSTATE[k], nota = nf(20 * st.score / Q.length, 1);
  const o = { _subject: `UC 1993 · ${NOMES_TESTE[k]} · ${who.nome} (n.º ${who.num}, ${who.turma}) · ${nota} valores`, _template: 'table', _captcha: 'false' };
  [['Teste', NOMES_TESTE[k]], ['Nome', who.nome], ['Número', who.num], ['Turma', who.turma], ['Certas', `${st.score} / ${Q.length}`], ['Nota (0-20)', nota], ['Data', st.fim.toLocaleString('pt-PT')]].forEach(([a, b]) => o[a] = b);
  Q.forEach((x, i) => { const j = st.ans[i]; o[`Pergunta ${String(i + 1).padStart(2, '0')}`] = (j === undefined ? '—' : String.fromCharCode(65 + j)) + (j === x.a ? ' ✓' : ` ✗ (certa: ${String.fromCharCode(65 + x.a)})`); });
  const r = await fetch(ENVIO_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(o) });
  const res = await r.json().catch(() => ({}));
  if (!r.ok || (res && (res.success === false || res.success === 'false'))) throw new Error((res && res.message) || ('HTTP ' + r.status));
}

$$('.quiz[data-quiz]').forEach(box => {
  const k = box.dataset.quiz, Q = QUIZ[k];
  const run = () => {
    const st = QSTATE[k] = { ans: [], score: 0, answered: 0, fim: null, sent: false };
    const who = store.get('aluno', { nome: '', num: '', turma: '' });
    box.innerHTML = `<div class="quizbar"><span id="qs${k}">0 / ${Q.length} respondidas · 0 certas</span><button type="button" class="btn" id="qr${k}">Recomeçar</button></div>` +
      Q.map((x, i) => `<div class="qq" data-i="${i}"><p><b class="mono">${i + 1}.</b> ${x.q}</p><div class="opts">${x.o.map((o, j) => `<button type="button" data-j="${j}">${String.fromCharCode(65 + j)}) ${o}</button>`).join('')}</div><p class="why" hidden></p></div>`).join('') +
      `<div class="panel send" id="qe${k}">
        <span class="tag">Entrega</span><h4>Enviar o teste ao professor</h4>
        <p style="color:var(--muted);font-size:.92rem">Responda a todas as perguntas, preencha os seus dados e carregue em «Enviar ao professor». O professor recebe um email com a nota e a resposta a cada pergunta. Também pode guardar o PDF do teste.</p>
        <div class="row">
          <div class="fld" style="flex:1 1 16em"><label for="qn${k}">Nome completo</label><input type="text" id="qn${k}" autocomplete="name" value="${who.nome.replace(/"/g, '&quot;')}"></div>
          <div class="fld"><label for="qm${k}">Número</label><input type="text" inputmode="numeric" id="qm${k}" value="${who.num.replace(/"/g, '&quot;')}" style="width:6em"></div>
          <div class="fld"><label for="qt${k}">Turma</label><input type="text" id="qt${k}" value="${who.turma.replace(/"/g, '&quot;')}" style="width:7em"></div>
        </div>
        <div class="row"><button type="button" class="btn" id="qsend${k}">Enviar ao professor</button><button type="button" class="btn ghost" id="qpdf${k}">Descarregar PDF</button></div>
        <div class="fb" id="qfb${k}" role="status"></div>
      </div>`;
    $('#qr' + k).addEventListener('click', run);
    const fb = $('#qfb' + k);
    let confirm_resend = false;
    const msg = (cls, t) => { fb.className = 'fb ' + cls; fb.textContent = t; };
    const getWho = () => {
      const w = { nome: $('#qn' + k).value.trim(), num: $('#qm' + k).value.trim(), turma: $('#qt' + k).value.trim() };
      store.set('aluno', w); return w;
    };
    const ready = (pdf = false) => {
      if (st.answered < Q.length) { msg('bad', `Ainda faltam ${Q.length - st.answered} perguntas por responder.`); return null; }
      const w = getWho();
      if (!w.nome || !w.num || !w.turma) { msg('bad', 'Preencha o nome, o número e a turma.'); return null; }
      if (pdf && !window.jspdf) { msg('bad', 'Não foi possível preparar o PDF. Verifique a ligação à internet e recarregue a página.'); return null; }
      return w;
    };
    const fname = w => `UC1993_Teste_Parte${k}_${slug(w.nome)}_n${slug(w.num)}.pdf`;
    $('#qpdf' + k).addEventListener('click', async () => {
      const w = ready(true); if (!w) return;
      const r = await savePDF(quizPDF(k, w), fname(w));
      if (r === 'ok') msg('ok', 'PDF preparado. Se o envio automático não funcionar, envie este PDF por email para ' + EMAIL_PROF + '.');
    });
    $('#qsend' + k).addEventListener('click', async e => {
      const w = ready(); if (!w) return;
      if (st.sent && !confirm_resend) { msg('ok', 'Este teste já foi enviado. Para voltar a enviar, carregue outra vez em «Enviar ao professor».'); confirm_resend = true; return; }
      const b = e.target; b.disabled = true; msg('ok', 'A enviar…');
      try {
        await sendResult(k, w);
        st.sent = true; confirm_resend = false;
        msg('ok', '✓ Enviado ao professor. Pode também guardar o PDF para si.');
      } catch (err) {
        msg('bad', /activ/i.test(String(err && err.message)) ? 'O envio por email ainda não está ativado. Avise o professor e carregue em «Descarregar PDF».' : 'Não foi possível enviar daqui (' + (err && err.message ? err.message : 'sem ligação') + '). Carregue em «Descarregar PDF» e envie o ficheiro por email para ' + EMAIL_PROF + '.');
      } finally { b.disabled = false; }
    });
    $$('.qq', box).forEach(qq => qq.addEventListener('click', e => {
      const b = e.target.closest('button[data-j]'); if (!b || qq.dataset.done) return;
      const i = +qq.dataset.i, x = Q[i], j = +b.dataset.j; qq.dataset.done = '1'; st.answered++; st.ans[i] = j;
      $$('button', qq).forEach(bb => { if (+bb.dataset.j === x.a) bb.classList.add('right'); });
      if (j === x.a) st.score++; else b.classList.add('wrong');
      const w = $('.why', qq); w.hidden = false; w.textContent = (j === x.a ? 'Certo. ' : 'Não é essa. ') + x.w;
      $('#qs' + k).textContent = `${st.answered} / ${Q.length} respondidas · ${st.score} certas` + (st.answered === Q.length ? ` · nota ${nf(20 * st.score / Q.length, 1)} valores` : '');
      if (st.answered === Q.length) {
        st.fim = new Date();
        const best = store.get('quiz' + k, null); if (!best || st.score > best.s) store.set('quiz' + k, { s: st.score, n: Q.length }); updateScore();
        msg('ok', 'Teste completo. Preencha os seus dados e envie ao professor.');
      }
    }));
  };
  run();
});


/* --- vídeos de apoio (Material de Apoio 2) --- */
const VIDEOS = [
  { n: 1, t: 'Como funciona a eletricidade – princípio de funcionamento', u: 'https://www.youtube.com/watch?v=3KePcASD0NQ', c: ['cap-1'] },
  { n: 2, t: 'Qual a diferença entre volt, watt e ampere?', u: 'https://www.youtube.com/watch?v=JtttnL28m3Q', c: ['cap-1'] },
  { n: 3, t: 'A corrente elétrica explicada', u: 'https://www.youtube.com/watch?v=ZUmQsipVQg0', c: ['cap-1'] },
  { n: 4, t: 'Resistências explicadas', u: 'https://www.youtube.com/watch?v=iSuTiYi_lCM', c: ['cap-1'] },
  { n: 5, t: 'DC series circuits explained – the basics working principle', u: 'https://youtu.be/VV6tZ3Aqfuc', c: ['cap-1'], en: true },
  { n: 6, t: 'DC parallel circuits', u: 'https://www.youtube.com/watch?v=5uyJezQNSHw', c: ['cap-1'], en: true },
  { n: 7, t: 'Como funciona um multímetro', u: 'https://www.youtube.com/watch?v=1WIWrmc-rBk', c: ['cap-1'] },
  { n: 8, t: 'Explicando capacitores (condensadores)', u: 'https://www.youtube.com/watch?v=7JDmvDzb5L8', c: ['cap-2'] },
  { n: 9, t: 'How electricity is generated', u: 'https://www.youtube.com/watch?v=sAO9gYaMZkg', c: ['cap-4', 'cap-6'], en: true },
  { n: 10, t: 'Como um alternador funciona?', u: 'https://www.youtube.com/watch?v=pO5F1bIRE3c', c: ['cap-6'] },
  { n: 11, t: 'Como funciona a energia trifásica: porquê três fases?', u: 'https://www.youtube.com/watch?v=i1dN2KTrzPA', c: ['cap-11'] },
  { n: 12, t: 'Para que servem os componentes eletrónicos?', u: 'https://www.youtube.com/watch?v=C54Cp819Ebc&t=12s', c: [], adv: true }
];
const CAPNOME = { 'cap-1': '1 · Fundamentos de eletricidade', 'cap-2': '2 · Condensadores', 'cap-4': '4 · Indução eletromagnética', 'cap-6': '6 · Corrente alternada sinusoidal', 'cap-11': '11 · Sistemas trifásicos' };
(() => {
  const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const card = v => `<a class="vcard" href="${esc(v.u)}" target="_blank" rel="noopener"><span class="play" aria-hidden="true"></span><span><span class="t">${v.n}. ${v.t}</span><span class="m"><span>YouTube</span>${v.en ? '<span class="en">EN · legendas</span>' : '<span>PT</span>'}${v.c.length ? '<span>cap. ' + v.c.map(c => c.slice(4)).join(' e ') + '</span>' : ''}</span></span></a>`;
  const groups = [['Parte 1 · Corrente contínua', ['cap-1', 'cap-2', 'cap-4']], ['Parte 2 · Corrente alternada', ['cap-6', 'cap-11']]];
  let h = '';
  groups.forEach(([g, caps]) => {
    h += `<h3>${g}</h3>`;
    caps.forEach(c => { const list = VIDEOS.filter(v => v.c[0] === c); if (list.length) h += `<div class="vgroup"><h4>Capítulo ${CAPNOME[c]}</h4><div class="vgrid">${list.map(card).join('')}</div></div>`; });
  });
  h += `<h3>Avançado</h3><div class="vgrid">${VIDEOS.filter(v => v.adv).map(card).join('')}</div>`;
  $('#videos-list').innerHTML = h;
  // atalhos no início de cada capítulo
  Object.keys(CAPNOME).forEach(c => {
    const list = VIDEOS.filter(v => v.c.includes(c)), head = $('#' + c + ' .chap-head'); if (!list.length || !head) return;
    head.insertAdjacentHTML('beforeend', `<div class="vchips"><span style="color:var(--muted)">Vídeos de apoio:</span>${list.map(v => `<a href="${esc(v.u)}" target="_blank" rel="noopener">${v.n}. ${v.t}${v.en ? ' (EN)' : ''}</a>`).join('')}<a href="#videos" style="border-style:dashed">ver todos</a></div>`);
  });
})();

/* --- botões anterior / seguinte --- */
ALLSEC.forEach(sec => {
  const part = +sec.dataset.part || 1, list = NAV[part].map(x => x[0]), i = list.indexOf(sec.id);
  if (i < 0) return;
  const prev = list[i - 1], next = list[i + 1], name = id => (NAV[part].find(x => x[0] === id) || [])[2];
  let h = '<div class="pager">';
  h += prev ? `<a class="btn ghost" href="#${prev}" style="text-decoration:none">← ${name(prev)}</a>` : '<span></span>';
  if (next) h += `<a class="btn" href="#${next}" style="text-decoration:none">${name(next)} →</a>`;
  else if (part === 1) h += `<a class="btn" href="#cap-6" style="background:var(--fill-2);border-color:var(--fill-2)">Parte 2: corrente alternada →</a>`;
  sec.insertAdjacentHTML('beforeend', h + '</div>');
});

/* --- arranque --- */
const start = location.hash.slice(1) || 'inicio';
setPart(+((document.getElementById(start) || {}).dataset || {}).part || 1);
show(document.getElementById(start) ? start : 'inicio');
