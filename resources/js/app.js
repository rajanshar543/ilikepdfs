import { mountTool } from './core/ui.js';

const modules = import.meta.glob('./tools/*.js');

const toolRoot = document.querySelector('[data-tool]');

if (toolRoot) {
    const load = modules[`./tools/${toolRoot.dataset.tool}.js`];

    if (load) {
        load().then((tool) => mountTool(toolRoot, tool));
    }
}

const cards = [...document.querySelectorAll('.card')];
const search = document.getElementById('tool-search');
const counter = document.querySelector('[data-count]');
const empty = document.querySelector('[data-empty]');
let activeFilter = 'all';

/** Shows the cards that match the chosen category and the search words. */
function applyFilters() {
    const words = (search?.value ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    let visible = 0;

    cards.forEach((card) => {
        const inCategory = activeFilter === 'all' || card.dataset.category.split(' ').includes(activeFilter);
        const matches = words.every((word) => card.dataset.search.includes(word));
        card.hidden = !(inCategory && matches);
        visible += card.hidden ? 0 : 1;
    });

    if (counter) {
        const template = counter.dataset.template ?? ':count tools';
        counter.textContent = template.replace(':count', String(visible)).replace(/tools?$/, visible === 1 && /tools?$/.test(template) ? 'tool' : 'tools');
    }

    if (empty) {
        empty.hidden = visible !== 0;
    }
}

document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
        activeFilter = tab.dataset.filter;
        document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('is-active', item === tab));
        applyFilters();
    });
});

search?.addEventListener('input', applyFilters);
search?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        cards.find((card) => !card.hidden)?.click();
    }
});
document.querySelector('[data-search-go]')?.addEventListener('click', () => {
    applyFilters();
    cards.find((card) => !card.hidden)?.click();
});

// Header menu: opens under the header, closes on Escape, outside click or after choosing a tool.
const mega = document.getElementById('mega');
const toggles = [...document.querySelectorAll('[data-menu-toggle]')];

function setMenu(open) {
    if (!mega) {
        return;
    }

    mega.hidden = !open;
    toggles.forEach((toggle) => toggle.setAttribute('aria-expanded', String(open)));
}

toggles.forEach((toggle) => toggle.addEventListener('click', () => setMenu(mega.hidden)));
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        setMenu(false);
    }
});
document.addEventListener('click', (event) => {
    if (mega && !mega.hidden && !event.target.closest('#mega, [data-menu-toggle]')) {
        setMenu(false);
    }
});

// Light / dark mode: follows the device unless the visitor chose one.
const root = document.documentElement;
let storedTheme = null;

try {
    storedTheme = localStorage.getItem('ilikepdfs:theme');
} catch {
    storedTheme = null;
}

if (storedTheme === 'dark' || storedTheme === 'light') {
    root.dataset.theme = storedTheme;
}

document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
    const dark = root.dataset.theme === 'dark' || (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.theme = dark ? 'light' : 'dark';

    try {
        localStorage.setItem('ilikepdfs:theme', root.dataset.theme);
    } catch {
        // The choice just will not be remembered.
    }
});

// Offline use: a service worker keeps the pages and engines so every tool works without internet.
const offlineBox = document.querySelector('[data-offline-box]');

if (offlineBox && 'serviceWorker' in navigator && window.isSecureContext) {
    const button = offlineBox.querySelector('[data-offline]');
    const status = offlineBox.querySelector('[data-offline-status]');
    offlineBox.hidden = false;

    const say = (text) => {
        status.textContent = text;
    };

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(() => navigator.serviceWorker.ready).then((registration) => {
        registration.active?.postMessage({ type: 'status' });
    }).catch(() => offlineBox.remove());

    navigator.serviceWorker.addEventListener('message', (event) => {
        const { type } = event.data ?? {};

        if (type === 'progress') {
            say(`Saving... ${Math.round((event.data.done / event.data.total) * 100)}%`);
        } else if (type === 'done') {
            button.disabled = false;
            say('Saved. Works without internet.');
        } else if (type === 'failed') {
            button.disabled = false;
            say('Some files could not be saved. Check your connection and try again.');
        } else if (type === 'status' && event.data.saved) {
            say(event.data.upToDate ? 'Saved. Works without internet.' : 'Saved earlier. Press again to update.');
        }
    });

    button.addEventListener('click', async () => {
        const registration = await navigator.serviceWorker.ready;
        button.disabled = true;
        say('Saving... 0%');
        registration.active?.postMessage({ type: 'precache' });
    });
}
