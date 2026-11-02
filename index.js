import { saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

const MODULE = 'romance_pulse';

const defaults = {
    enabled: false,
    color: '#ff0028',
    sway: 4,    // 0..10 насколько плывёт страница
    pulse: 60,  // 0..100 сила красной пульсации, %
    speed: 5,   // 1..10 скорость
    sound: true,   // звук сердцебиения
    volume: 50,    // 0..100
};

let overlay;

function settings() {
    if (!extension_settings[MODULE]) extension_settings[MODULE] = {};
    for (const [k, v] of Object.entries(defaults)) {
        if (extension_settings[MODULE][k] === undefined) extension_settings[MODULE][k] = v;
    }
    return extension_settings[MODULE];
}

function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'rp-overlay';
    overlay.innerHTML = '<div class="rp-pulse"></div>';
    document.body.appendChild(overlay);
}

function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [0, 2, 4].map(i => parseInt(h.substring(i, i + 2), 16));
}


// ---------- Сердцебиение (Web Audio, без файлов) ----------
let actx, beatTimer, beating = false;

function periodSec() {
    return 6 - settings().speed * 0.45;
}

function getCtx() {
    if (!actx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        actx = new AC();
    }
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    return actx;
}

function thump(when, vol, freq, len) {
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    const lp = actx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, when);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.55, when + len);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(vol, when + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + len);
    osc.connect(lp).connect(gain).connect(actx.destination);
    osc.start(when);
    osc.stop(when + len + 0.05);
}

function beat() {
    const c = getCtx();
    if (!c || c.state !== 'running') return;
    const v = settings().volume / 100;
    if (v <= 0) return;
    const t = c.currentTime + 0.02;
    thump(t, v * 0.9, 70, 0.16);          // "туп"
    thump(t + 0.2, v * 0.6, 58, 0.14);    // "тук"
}

function beatLoop() {
    if (!beating) return;
    beat();
    beatTimer = setTimeout(beatLoop, periodSec() * 1000);
}

function updateSound() {
    const s = settings();
    const want = s.enabled && s.sound;
    if (want && !beating) {
        beating = true;
        getCtx();
        // перезапускаем анимацию пульса, чтобы пик совпал с ударом
        const pulse = overlay?.querySelector('.rp-pulse');
        if (pulse) {
            pulse.style.animation = 'none';
            void pulse.offsetWidth;
            pulse.style.animation = '';
        }
        // пик пульса на середине периода
        beatTimer = setTimeout(beatLoop, periodSec() * 500);
    } else if (!want && beating) {
        beating = false;
        clearTimeout(beatTimer);
    }
}

// браузер не даёт играть звук до первого касания — подхватываем его
document.addEventListener('pointerdown', () => {
    if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
}, { passive: true });

function apply() {
    const s = settings();
    ensureOverlay();
    const root = document.documentElement.style;
    root.setProperty('--rp-rgb', hexToRgb(s.color).join(','));
    root.setProperty('--rp-alpha', (s.pulse / 100).toFixed(2));
    root.setProperty('--rp-amp', s.sway);
    root.setProperty('--rp-period', (6 - s.speed * 0.45).toFixed(2) + 's');
    overlay.classList.toggle('rp-on', s.enabled);
    document.body.classList.toggle('rp-sway', s.enabled && s.sway > 0);
    $('#rp_enabled').prop('checked', s.enabled);
    $('#rp_wand .rp-state').text(s.enabled ? 'вкл' : 'выкл');
    updateSound();
}

function toggle() {
    const s = settings();
    s.enabled = !s.enabled;
    saveSettingsDebounced();
    apply();
}

function buildUI() {
    const s = settings();

    $('#extensions_settings2').append(`
    <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>Romance Pulse</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <label class="checkbox_label"><input type="checkbox" id="rp_enabled"><span>Включить эффект</span></label>
            <label>Цвет: <input type="color" id="rp_color"></label>
            <label>Насколько плывёт страница: <b id="rp_sway_val"></b>
                <input type="range" id="rp_sway" min="0" max="10" step="1"></label>
            <label>Сила пульсации: <b id="rp_pulse_val"></b>%
                <input type="range" id="rp_pulse" min="0" max="100" step="5"></label>
            <label>Скорость: <b id="rp_speed_val"></b>
                <input type="range" id="rp_speed" min="1" max="10" step="1"></label>
            <label class="checkbox_label"><input type="checkbox" id="rp_sound"><span>Звук сердцебиения</span></label>
            <label>Громкость: <b id="rp_volume_val"></b>%
                <input type="range" id="rp_volume" min="0" max="100" step="5"></label>
        </div>
    </div>`);

    // пункт в меню-палочке
    $('#extensionsMenu').append(`
        <div id="rp_wand" class="list-group-item flex-container flexGap5">
            <div class="fa-solid fa-heart extensionsMenuExtensionButton"></div>
            Romance Pulse (<span class="rp-state"></span>)
        </div>`);
    $('#rp_wand').on('click', toggle);

    $('#rp_enabled').on('change', function () {
        s.enabled = this.checked; saveSettingsDebounced(); apply();
    });
    $('#rp_color').val(s.color).on('input', function () {
        s.color = this.value; saveSettingsDebounced(); apply();
    });
    $('#rp_sound').prop('checked', s.sound).on('change', function () {
        s.sound = this.checked; saveSettingsDebounced(); apply();
    });
    for (const key of ['sway', 'pulse', 'speed', 'volume']) {
        $(`#rp_${key}`).val(s[key]);
        $(`#rp_${key}_val`).text(s[key]);
        $(`#rp_${key}`).on('input', function () {
            s[key] = Number(this.value);
            $(`#rp_${key}_val`).text(this.value);
            saveSettingsDebounced();
            apply();
        });
    }
}

jQuery(() => {
    settings();
    buildUI();
    apply();
});
