const MODULE = 'paper_bg';
const STYLE_ID = 'paper-bg-runtime';
const BODY_INK = '#1A1814';
const BODY_PAPER = '#F4F0E8';
const EM_GRAY = '#5E5953';
const EM_GRAY_SOFT = '#8A837A';

const PRESETS = [
    { id: 'paper', name: '米纸', color: '#F0E8DD' },
    { id: 'white', name: '暖白', color: '#F7F5F2' },
    { id: 'green', name: '淡松绿', color: '#E4EFE6' },
    { id: 'blue', name: '雾蓝', color: '#E4EDF3' },
    { id: 'gray', name: '暖灰', color: '#E6E1D8' },
];

const DEFAULTS = {
    enabled: true,
    preset: 'paper',
    customColor: '#F0E8DD',
    textMode: 'auto',
    textColor: BODY_INK,
    quoteCustom: false,
    quoteColor: '#E18A24',
    image: '',
    imageLuma: '#F0E8DD',
    wash: 45,
};

let metaSnapshot = null;

function ctx() {
    return globalThis.SillyTavern.getContext();
}

function $(selector) {
    return globalThis.jQuery(selector);
}

function parseColor(input) {
    if (!input) return null;
    const s = String(input).trim();
    const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
        let h = hex[1];
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
    }
    const m = s.match(/rgba?\(([^)]+)\)/i);
    if (!m) return null;
    const p = m[1].split(',').map(part => parseFloat(part));
    if (p.length < 3 || p.some(n => Number.isNaN(n))) return null;
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
}

function toHex(input, fallback) {
    const p = parseColor(input);
    if (!p) return fallback;
    return '#' + p.slice(0, 3).map(n => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')).join('');
}

function luminance(rgb) {
    const f = (c) => {
        const x = c / 255;
        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}

function contrast(a, b) {
    const l1 = luminance(a);
    const l2 = luminance(b);
    const hi = Math.max(l1, l2);
    const lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
}

function mix(a, b, t) {
    return [0, 1, 2].map(i => a[i] + (b[i] - a[i]) * t);
}

function paperOf(settings) {
    if (settings.preset === 'custom') return toHex(settings.customColor, '#F0E8DD');
    return PRESETS.find(item => item.id === settings.preset)?.color || '#F0E8DD';
}

function effectiveBg(settings) {
    const paper = parseColor(paperOf(settings));
    if (!settings.image) return paper;
    const photo = parseColor(settings.imageLuma) || paper;
    const wash = Math.min(80, Math.max(0, Number(settings.wash) || 0)) / 100;
    return mix(photo, paper, wash);
}

function resolveBody(settings, bg) {
    if (settings.textMode === 'custom') return parseColor(toHex(settings.textColor, BODY_INK));
    return luminance(bg) > 0.62 ? parseColor(BODY_INK) : parseColor(BODY_PAPER);
}

function pickGray(bg, body) {
    let gray = parseColor(rgbDist(parseColor(EM_GRAY), body) < 52 ? EM_GRAY_SOFT : EM_GRAY);
    if (contrast(gray, bg) < 4.5) gray = parseColor('#4E4944');
    if (rgbDist(gray, body) < 36) gray = parseColor(EM_GRAY_SOFT);
    return gray;
}

function rgbDist(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function resolveEm(bg, body, themeEm) {
    if (!themeEm) return null;
    const gray = pickGray(bg, body);
    const tooLight = contrast(themeEm, bg) < 4.5 && luminance(themeEm) > luminance(gray);
    return tooLight ? gray : null;
}

function resolveUnderline(bg, themeUnderline) {
    if (!themeUnderline) return null;
    const pale = contrast(themeUnderline, bg) < 3 && luminance(themeUnderline) > 0.5;
    return pale ? parseColor(EM_GRAY) : null;
}

function settingsOf() {
    const all = ctx().extensionSettings;
    if (!all[MODULE]) all[MODULE] = {};
    const settings = all[MODULE];
    for (const [key, value] of Object.entries(DEFAULTS)) {
        if (settings[key] === undefined) settings[key] = value;
    }
    settings.wash = Math.min(80, Math.max(0, Number(settings.wash) || 0));
    return settings;
}

function save() {
    ctx().saveSettingsDebounced();
}

function themeColor(key, fallback) {
    return ctx().powerUserSettings?.[key] || fallback;
}

function buildCss(settings) {
    const paper = paperOf(settings);
    const paperRgb = parseColor(paper);
    const bg = effectiveBg(settings);
    const body = resolveBody(settings, bg);
    const bodyHex = toHex(`rgb(${body[0]}, ${body[1]}, ${body[2]})`);
    const light = luminance(bg) > 0.62;
    const themeEm = parseColor(themeColor('italics_text_color', ''));
    const themeUnderline = parseColor(themeColor('underline_text_color', ''));
    const em = resolveEm(bg, body, themeEm);
    const underline = resolveUnderline(bg, themeUnderline);
    const wash = settings.image ? Math.min(80, Math.max(0, Number(settings.wash) || 0)) / 100 : 1;
    const chatTint = wash >= 0.999
        ? paper
        : `rgba(${Math.round(paperRgb[0])}, ${Math.round(paperRgb[1])}, ${Math.round(paperRgb[2])}, ${wash.toFixed(3)})`;
    const bubble = light ? 'rgba(26, 24, 20, 0.045)' : 'rgba(255, 255, 255, 0.07)';
    const border = light ? 'rgba(26, 24, 20, 0.16)' : 'rgba(244, 240, 232, 0.22)';
    const shadow = light ? 'rgba(26, 24, 20, 0)' : 'rgba(0, 0, 0, 0.45)';
    const image = settings.image ? `url("${String(settings.image).replace(/["\\\n\r]/g, '')}")` : 'none';
    const quote = settings.quoteCustom ? toHex(settings.quoteColor, '#E18A24') : null;

    let css = `
html.paper-bg-on {
    color-scheme: ${light ? 'light' : 'dark'};
    --SmartThemeBodyColor: ${bodyHex} !important;
    --SmartThemeBlurTintColor: ${paper} !important;
    --SmartThemeChatTintColor: ${chatTint} !important;
    --SmartThemeUserMesBlurTintColor: ${bubble} !important;
    --SmartThemeBotMesBlurTintColor: ${bubble} !important;
    --SmartThemeBorderColor: ${border} !important;
    --SmartThemeShadowColor: ${shadow} !important;
    --SmartThemeBlurStrength: 0px !important;
    --SmartThemeCheckboxBgColorR: ${Math.round(body[0])} !important;
    --SmartThemeCheckboxBgColorG: ${Math.round(body[1])} !important;
    --SmartThemeCheckboxBgColorB: ${Math.round(body[2])} !important;
    --SmartThemeCheckboxBgColorA: 1 !important;
    --interactable-outline-color: ${bodyHex} !important;
    --pb-image: ${image};
}
html.paper-bg-on body {
    background-color: ${paper} !important;
}
html.paper-bg-on #bg1 {
    background-color: ${paper} !important;
    background-image: var(--pb-image) !important;
    background-size: cover !important;
    background-position: center center !important;
    background-repeat: no-repeat !important;
}
`;
    if (em) css += `html.paper-bg-on { --SmartThemeEmColor: ${toHex(`rgb(${em[0]},${em[1]},${em[2]})`)} !important; }\n`;
    if (underline) css += `html.paper-bg-on { --SmartThemeUnderlineColor: ${toHex(`rgb(${underline[0]},${underline[1]},${underline[2]})`)} !important; }\n`;
    if (quote) css += `html.paper-bg-on { --SmartThemeQuoteColor: ${quote} !important; }\n`;
    if (light) {
        css += `
html.paper-bg-on textarea,
html.paper-bg-on input[type="text"],
html.paper-bg-on input[type="search"],
html.paper-bg-on input[type="number"],
html.paper-bg-on input[type="password"],
html.paper-bg-on select {
    background-color: rgba(26, 24, 20, 0.05) !important;
    color: ${bodyHex} !important;
}
html.paper-bg-on code {
    background-color: rgba(26, 24, 20, 0.06) !important;
    color: inherit !important;
}
html.paper-bg-on #send_textarea::placeholder {
    color: rgba(26, 24, 20, 0.45);
}
`;
    }
    return { css, paper, bodyHex, em, quote, bg };
}

function applyTheme() {
    const settings = settingsOf();
    const root = document.documentElement;
    if (!settings.enabled) {
        clearTheme();
        return buildCss({ ...settings, enabled: true });
    }
    const built = buildCss(settings);
    let style = document.getElementById(STYLE_ID);
    if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
    }
    style.textContent = built.css;
    document.head.appendChild(style);
    root.classList.add('paper-bg-on');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
        if (metaSnapshot === null) metaSnapshot = meta.getAttribute('content');
        meta.setAttribute('content', built.paper);
    }
    return built;
}

function clearTheme() {
    document.getElementById(STYLE_ID)?.remove();
    document.documentElement.classList.remove('paper-bg-on');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && metaSnapshot !== null) meta.setAttribute('content', metaSnapshot);
    metaSnapshot = null;
}

function previewColors(built, settings) {
    const themeQuote = toHex(themeColor('quote_text_color', '#E18A24'), '#E18A24');
    const quote = settings.quoteCustom ? toHex(settings.quoteColor, themeQuote) : themeQuote;
    const em = built.em
        ? toHex(`rgb(${built.em[0]},${built.em[1]},${built.em[2]})`)
        : toHex(themeColor('italics_text_color', EM_GRAY), EM_GRAY);
    return { quote, em };
}

function syncUi() {
    const settings = settingsOf();
    const built = settings.enabled ? applyTheme() : (clearTheme(), buildCss(settings));
    const preview = previewColors(built, settings);
    $('#pb_enabled').prop('checked', !!settings.enabled);
    $('#pb_custom_color').val(toHex(settings.customColor, '#F0E8DD'));
    $('#pb_text_custom').prop('checked', settings.textMode === 'custom');
    $('#pb_text_color').val(toHex(settings.textColor, BODY_INK)).prop('disabled', settings.textMode !== 'custom');
    $('#pb_quote_custom').prop('checked', !!settings.quoteCustom);
    $('#pb_quote_color').val(toHex(settings.quoteColor, '#E18A24')).prop('disabled', !settings.quoteCustom);
    $('#pb_wash').val(settings.wash);
    $('#pb_wash_val').text(`${settings.wash}%`);
    $('#pb_wash_row').prop('hidden', !settings.image);
    $('#pb_clear').prop('disabled', !settings.image);
    const chip = document.getElementById('pb_custom_chip');
    if (chip) chip.style.background = toHex(settings.customColor, '#F0E8DD');
    $('#pb_swatches .pb-swatch').each(function () {
        $(this).toggleClass('selected', $(this).data('preset') === settings.preset);
    });
    const previewEl = document.getElementById('pb_preview');
    if (previewEl) {
        previewEl.style.backgroundColor = built.paper;
        previewEl.style.backgroundImage = settings.image ? `url("${settings.image}")` : 'none';
    }
    const sample = document.getElementById('pb_sample');
    if (sample) {
        sample.style.setProperty('--pb-preview-ink', built.bodyHex);
        sample.style.setProperty('--pb-preview-em', preview.em);
        sample.style.setProperty('--pb-preview-quote', preview.quote);
        if (settings.image) {
            const wash = Math.min(80, Math.max(0, Number(settings.wash) || 0)) / 100;
            const rgb = parseColor(built.paper);
            const veil = `rgba(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])}, ${wash})`;
            sample.style.backgroundImage = `linear-gradient(${veil}, ${veil}), url("${settings.image}")`;
            sample.style.backgroundSize = 'cover';
            sample.style.backgroundPosition = 'center';
        } else {
            sample.style.backgroundImage = 'none';
            sample.style.backgroundColor = built.paper;
        }
    }
}

function bindSettings() {
    const root = document.getElementById('paper_bg_settings');
    if (!root || root.dataset.bound === '1') return;
    root.dataset.bound = '1';

    root.querySelector('.pb-head').addEventListener('click', () => {
        root.querySelector('.pb-head').classList.toggle('open');
        root.querySelector('.pb-body').classList.toggle('open');
    });

    $('#pb_enabled').on('change', function () {
        settingsOf().enabled = this.checked;
        save();
        syncUi();
    });

    $('#pb_swatches').on('click', '.pb-swatch', function () {
        const settings = settingsOf();
        settings.preset = $(this).data('preset');
        save();
        syncUi();
    });

    $('#pb_custom_color').on('input', function () {
        const settings = settingsOf();
        settings.preset = 'custom';
        settings.customColor = this.value;
        save();
        syncUi();
    });

    $('#pb_text_custom').on('change', function () {
        const settings = settingsOf();
        settings.textMode = this.checked ? 'custom' : 'auto';
        if (this.checked) settings.textColor = $('#pb_text_color').val();
        save();
        syncUi();
    });

    $('#pb_text_color').on('input', function () {
        const settings = settingsOf();
        settings.textMode = 'custom';
        settings.textColor = this.value;
        save();
        syncUi();
    });

    $('#pb_quote_custom').on('change', function () {
        const settings = settingsOf();
        settings.quoteCustom = this.checked;
        if (this.checked) settings.quoteColor = $('#pb_quote_color').val();
        save();
        syncUi();
    });

    $('#pb_quote_color').on('input', function () {
        const settings = settingsOf();
        settings.quoteCustom = true;
        settings.quoteColor = this.value;
        save();
        syncUi();
    });

    $('#pb_wash').on('input', function () {
        settingsOf().wash = Number(this.value);
        save();
        syncUi();
    });

    $('#pb_upload').on('click', () => $('#pb_file').trigger('click'));
    $('#pb_file').on('change', function () {
        const file = this.files && this.files[0];
        this.value = '';
        if (file) openCropper(file);
    });
    $('#pb_clear').on('click', () => {
        const settings = settingsOf();
        settings.image = '';
        settings.imageLuma = paperOf(settings);
        save();
        syncUi();
    });
}

function mountSettings() {
    if (document.getElementById('paper_bg_settings')) {
        bindSettings();
        syncUi();
        return;
    }
    const swatches = PRESETS.map(item => `
        <button type="button" class="pb-swatch" data-preset="${item.id}">
            <span class="pb-chip" style="background:${item.color}"></span>
            <small>${item.name}</small>
        </button>`).join('') + `
        <button type="button" class="pb-swatch" data-preset="custom">
            <span class="pb-chip" id="pb_custom_chip"></span>
            <small>自定义</small>
        </button>`;

    const html = `
<div id="paper_bg_settings">
    <div class="pb-head">
        <b>纸色背景</b>
        <i class="pb-chevron fa-solid fa-chevron-down"></i>
    </div>
    <div class="pb-body">
        <div class="pb-row">
            <label><input type="checkbox" id="pb_enabled"> 启用</label>
        </div>
        <div class="pb-label">纯色</div>
        <div class="pb-swatches" id="pb_swatches">${swatches}</div>
        <div class="pb-row">
            <span>自定义颜色</span>
            <input type="color" id="pb_custom_color" value="#F0E8DD">
        </div>
        <div class="pb-preview" id="pb_preview"></div>
        <div class="pb-label">主文字</div>
        <div class="pb-row">
            <label><input type="checkbox" id="pb_text_custom"> 自己指定</label>
            <input type="color" id="pb_text_color" value="${BODY_INK}">
        </div>
        <p class="pb-hint">不勾选时，浅底自动用黑色，深底自动用浅色。金黄对白不跟着变。</p>
        <div class="pb-label">引用色</div>
        <div class="pb-row">
            <label><input type="checkbox" id="pb_quote_custom"> 自己指定</label>
            <input type="color" id="pb_quote_color" value="#E18A24">
        </div>
        <p class="pb-hint">默认保持酒馆现在的引用色。金黄对白在浅底上会比黑底上淡，如果发飘，再勾自己指定，选一个更深的琥珀色。斜体只有太浅时才压成灰色，和正文黑色分开。引号里的斜体仍是引用色。</p>
        <div class="pb-label">图片背景</div>
        <div class="pb-row">
            <button type="button" class="pb-btn" id="pb_upload">上传并裁剪</button>
            <button type="button" class="pb-btn" id="pb_clear">移除图片</button>
            <input type="file" id="pb_file" accept="image/*" hidden>
        </div>
        <div class="pb-row" id="pb_wash_row" hidden>
            <span>图片淡化</span>
            <input type="range" id="pb_wash" min="0" max="80" step="1" value="45">
            <span id="pb_wash_val">45%</span>
        </div>
        <p class="pb-hint">图片铺在聊天区后面。顶栏、输入栏和扩展抽屉保持纯色，图标才不会看丢。淡化越高，字越好读。</p>
        <p class="pb-warn" id="pb_warn" hidden></p>
        <p class="pb-sample" id="pb_sample">窗外的雨停了。<em>她把玩偶抱紧了一点。</em><q>哥哥，欢迎回家。</q></p>
    </div>
</div>`;

    const host = document.querySelector('#extensions_settings')
        || document.querySelector('#extensions_settings2')
        || document.querySelector('#rm_extensions_block');
    if (!host) return;
    host.insertAdjacentHTML('beforeend', html);
    const chip = document.getElementById('pb_custom_chip');
    const custom = document.getElementById('pb_custom_color');
    const paintChip = () => { if (chip && custom) chip.style.background = custom.value; };
    custom.addEventListener('input', paintChip);
    paintChip();
    bindSettings();
    syncUi();
}

let cropUrl = '';

function openCropper(file) {
    const overlay = document.getElementById('pb_crop');
    const frame = document.getElementById('pb_frame');
    const img = document.getElementById('pb_img');
    const zoom = document.getElementById('pb_zoom');
    if (!overlay || !frame || !img) return;
    if (cropUrl) URL.revokeObjectURL(cropUrl);

    const url = URL.createObjectURL(file);
    cropUrl = url;
    const state = { z: 1, left: 0, top: 0, s0: 1, iw: 1, ih: 1, fw: 1, fh: 1 };

    const layout = () => {
        const dw = state.iw * state.s0 * state.z;
        const dh = state.ih * state.s0 * state.z;
        state.left = Math.min(0, Math.max(state.fw - dw, state.left));
        state.top = Math.min(0, Math.max(state.fh - dh, state.top));
        img.style.width = `${dw}px`;
        img.style.height = `${dh}px`;
        img.style.left = `${state.left}px`;
        img.style.top = `${state.top}px`;
    };

    const fit = () => {
        const aspect = Math.max(0.35, window.innerWidth / Math.max(1, window.innerHeight));
        const maxW = Math.min(520, window.innerWidth - 48);
        const maxH = Math.min(window.innerHeight * 0.62, 680);
        let fw = maxW;
        let fh = fw / aspect;
        if (fh > maxH) {
            fh = maxH;
            fw = fh * aspect;
        }
        frame.style.width = `${fw}px`;
        frame.style.height = `${fh}px`;
        state.fw = fw;
        state.fh = fh;
        state.s0 = Math.max(fw / state.iw, fh / state.ih);
        state.z = Math.max(1, Number(zoom.value) || 1);
        const dw = state.iw * state.s0 * state.z;
        const dh = state.ih * state.s0 * state.z;
        state.left = (fw - dw) / 2;
        state.top = (fh - dh) / 2;
        layout();
    };

    img.onload = () => {
        state.iw = img.naturalWidth || 1;
        state.ih = img.naturalHeight || 1;
        zoom.value = '1';
        fit();
        overlay.hidden = false;
    };
    img.onerror = () => {
        URL.revokeObjectURL(url);
        cropUrl = '';
        overlay.hidden = true;
        const warn = document.getElementById('pb_warn');
        if (warn) {
            warn.hidden = false;
            warn.textContent = '这张图读不出来，换一张 jpg 或 png。';
        }
    };
    img.src = url;

    const onZoom = () => {
        const prev = state.z || 1;
        const next = Math.max(1, Number(zoom.value) || 1);
        const cx = (-state.left + state.fw / 2) / (state.s0 * prev);
        const cy = (-state.top + state.fh / 2) / (state.s0 * prev);
        state.z = next;
        state.left = state.fw / 2 - cx * state.s0 * next;
        state.top = state.fh / 2 - cy * state.s0 * next;
        layout();
    };
    zoom.oninput = onZoom;

    let drag = null;
    const down = (event) => {
        drag = { x: event.clientX, y: event.clientY, left: state.left, top: state.top };
        frame.classList.add('dragging');
        frame.setPointerCapture?.(event.pointerId);
    };
    const move = (event) => {
        if (!drag) return;
        state.left = drag.left + event.clientX - drag.x;
        state.top = drag.top + event.clientY - drag.y;
        layout();
    };
    const up = () => {
        drag = null;
        frame.classList.remove('dragging');
    };
    frame.onpointerdown = down;
    frame.onpointermove = move;
    frame.onpointerup = up;
    frame.onpointercancel = up;

    const close = () => {
        overlay.hidden = true;
        img.removeAttribute('src');
        if (cropUrl) URL.revokeObjectURL(cropUrl);
        cropUrl = '';
    };

    document.getElementById('pb_crop_cancel').onclick = close;
    overlay.onclick = (event) => {
        if (event.target === overlay) close();
    };
    document.getElementById('pb_crop_ok').onclick = () => {
        const scale = state.s0 * state.z;
        const sx = Math.max(0, -state.left / scale);
        const sy = Math.max(0, -state.top / scale);
        const sw = Math.min(state.iw - sx, state.fw / scale);
        const sh = Math.min(state.ih - sy, state.fh / scale);
        const aspect = sw / sh;
        let edge = 1600;
        let quality = 0.82;
        let dataUrl = '';
        let canvas;
        for (let attempt = 0; attempt < 4; attempt++) {
            canvas = document.createElement('canvas');
            if (aspect >= 1) {
                canvas.width = edge;
                canvas.height = Math.max(1, Math.round(edge / aspect));
            } else {
                canvas.height = edge;
                canvas.width = Math.max(1, Math.round(edge * aspect));
            }
            const g = canvas.getContext('2d');
            g.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            dataUrl = canvas.toDataURL('image/jpeg', quality);
            if (dataUrl.length < 700000) break;
            quality = Math.max(0.55, quality - 0.1);
            edge = Math.round(edge * 0.8);
        }
        const probe = document.createElement('canvas');
        probe.width = 16;
        probe.height = 16;
        const pg = probe.getContext('2d');
        pg.drawImage(canvas, 0, 0, 16, 16);
        const pixels = pg.getImageData(0, 0, 16, 16).data;
        let r = 0; let gsum = 0; let b = 0; let n = 0;
        for (let i = 0; i < pixels.length; i += 4) {
            r += pixels[i];
            gsum += pixels[i + 1];
            b += pixels[i + 2];
            n++;
        }
        const settings = settingsOf();
        settings.image = dataUrl;
        settings.imageLuma = toHex(`rgb(${r / n}, ${gsum / n}, ${b / n})`, paperOf(settings));
        const warn = document.getElementById('pb_warn');
        if (warn) {
            warn.hidden = true;
            warn.textContent = '';
        }
        save();
        close();
        syncUi();
    };
}

function mountCropper() {
    if (document.getElementById('pb_crop')) return;
    const html = `
<div class="pb-crop" id="pb_crop" hidden>
    <div class="pb-crop-card">
        <div class="pb-crop-title">裁成当前窗口的比例</div>
        <p class="pb-crop-hint">拖动选位置，滑杆放大。裁完的图会铺满聊天区，不会把主体切到画面外面。</p>
        <div class="pb-crop-frame" id="pb_frame"><img id="pb_img" alt=""></div>
        <div class="pb-crop-zoom">
            <span>放大</span>
            <input type="range" id="pb_zoom" min="1" max="3" step="0.01" value="1">
        </div>
        <div class="pb-crop-actions">
            <button type="button" class="pb-btn" id="pb_crop_cancel">取消</button>
            <button type="button" class="pb-btn pb-btn-primary" id="pb_crop_ok">用这张</button>
        </div>
    </div>
</div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}

function boot() {
    try {
        const settings = settingsOf();
        if (!settings._quoteSeeded) {
            const themeQuote = toHex(themeColor('quote_text_color', ''), '');
            if (themeQuote) settings.quoteColor = themeQuote;
            settings._quoteSeeded = true;
            save();
        }
        mountCropper();
        mountSettings();
        if (!globalThis.__paperBgListener) {
            globalThis.__paperBgListener = true;
            const context = ctx();
            const event = context.eventTypes?.SETTINGS_UPDATED;
            if (event && context.eventSource?.on) {
                context.eventSource.on(event, () => {
                    if (settingsOf().enabled) applyTheme();
                });
            }
        }
    } catch (error) {
        console.error('纸色背景启动失败', error);
    }
}

export function onEnable() {
    const settings = settingsOf();
    settings.enabled = true;
    save();
    mountCropper();
    mountSettings();
    applyTheme();
}

export function onDisable() {
    clearTheme();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bootWhenReady());
} else {
    bootWhenReady();
}

function bootWhenReady(tries = 0) {
    if (!globalThis.SillyTavern?.getContext || !globalThis.jQuery) {
        if (tries < 40) setTimeout(() => bootWhenReady(tries + 1), 250);
        return;
    }
    boot();
}
