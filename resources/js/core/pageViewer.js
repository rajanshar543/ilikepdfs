import { openPdf, renderPage } from './pdfjs.js';

const MAX_WIDTH = 760;
const MIN_DRAG = 6;
const SVG = 'http://www.w3.org/2000/svg';

/**
 * Shows every page of a PDF as a canvas with an empty layer on top. The
 * layers are where annotation tools draw. Sizes are in PDF points as the page
 * is displayed (rotation applied), origin at the top left.
 *
 * @param {HTMLElement} container
 * @param {File} file
 */
export async function mountViewer(container, file) {
    container.replaceChildren();
    const document_ = await openPdf(file);
    const pages = [];
    const observers = [];

    const draw = async (entry) => {
        if (entry.rendered) {
            return;
        }

        entry.rendered = true;
        const ratio = Math.min(2, globalThis.devicePixelRatio ?? 1);
        const { canvas } = await renderPage(entry.pdfPage, entry.scale * ratio);
        canvas.className = 'pv-canvas';
        entry.wrapper.prepend(canvas);
    };

    for (let number = 1; number <= document_.numPages; number += 1) {
        const pdfPage = await document_.getPage(number);
        const view = pdfPage.getViewport({ scale: 1 });
        const scale = Math.min(1.6, MAX_WIDTH / view.width);

        const wrapper = globalThis.document.createElement('div');
        wrapper.className = 'pv-page';
        wrapper.dataset.page = String(number - 1);
        wrapper.style.width = `${view.width * scale}px`;
        wrapper.style.height = `${view.height * scale}px`;

        const layer = globalThis.document.createElement('div');
        layer.className = 'pv-layer';
        wrapper.append(layer);
        container.append(wrapper);

        pages.push({ index: number - 1, width: view.width, height: view.height, scale, wrapper, layer, pdfPage, rendered: false });
    }

    if (typeof IntersectionObserver === 'function') {
        const observer = new IntersectionObserver((entries) => {
            entries.filter((entry) => entry.isIntersecting).forEach((entry) => {
                draw(pages[Number(entry.target.dataset.page)]);
                observer.unobserve(entry.target);
            });
        }, { rootMargin: '600px' });

        pages.forEach((entry) => observer.observe(entry.wrapper));
        observers.push(observer);
    } else {
        for (const entry of pages) {
            await draw(entry);
        }
    }

    return {
        pages,
        destroy() {
            observers.forEach((observer) => observer.disconnect());
            container.replaceChildren();
            document_.loadingTask.destroy();
        },
    };
}

let counter = 1;

/**
 * Lets the visitor create, move, resize and delete annotations on a viewer.
 *
 * Tools are objects: `{ kind: 'drag' | 'click' | 'freehand', create(page, geometry) }`
 * where geometry is `{x, y, w, h, x1, y1, x2, y2}` (drag), `{x, y}` (click) or
 * `{points}` (freehand), in points. `create` returns an item (or null).
 * An item is `{type, page, ...}`; `x, y, w, h` make it movable and resizable.
 */
export function createAnnotator(viewer, { onChange = () => {}, render = {}, resizable = true } = {}) {
    let items = [];
    let tool = null;
    let selected = null;
    const cleanups = [];

    const find = (id) => items.find((item) => item.id === id);
    const pageOf = (item) => viewer.pages[item.page];

    function changed() {
        redraw();
        onChange(items.map((item) => ({ ...item })));
    }

    function pointerPoint(page, event) {
        const bounds = page.layer.getBoundingClientRect();

        return [Math.min(Math.max((event.clientX - bounds.left) / page.scale, 0), page.width), Math.min(Math.max((event.clientY - bounds.top) / page.scale, 0), page.height)];
    }

    function place(element, item, page) {
        element.style.left = `${item.x * page.scale}px`;
        element.style.top = `${item.y * page.scale}px`;

        if (item.w !== undefined) {
            element.style.width = `${item.w * page.scale}px`;
            element.style.height = `${item.h * page.scale}px`;
        }
    }

    function build(item, page) {
        const custom = render[item.type];
        let element;

        if (custom) {
            element = custom(item, page);
            element.style.position = 'absolute';

            if (item.x !== undefined) {
                place(element, item, page);
            }
        } else if (item.type === 'ink' || item.type === 'line') {
            element = globalThis.document.createElementNS(SVG, 'svg');
            element.setAttribute('class', 'pv-svg');
            element.setAttribute('width', String(page.width * page.scale));
            element.setAttribute('height', String(page.height * page.scale));
            const shape = globalThis.document.createElementNS(SVG, item.type === 'ink' ? 'polyline' : 'line');

            if (item.type === 'ink') {
                shape.setAttribute('points', item.points.map(([x, y]) => `${x * page.scale},${y * page.scale}`).join(' '));
                shape.setAttribute('fill', 'none');
            } else {
                shape.setAttribute('x1', String(item.x1 * page.scale));
                shape.setAttribute('y1', String(item.y1 * page.scale));
                shape.setAttribute('x2', String(item.x2 * page.scale));
                shape.setAttribute('y2', String(item.y2 * page.scale));
            }

            shape.setAttribute('stroke', item.color ?? '#d33');
            shape.setAttribute('stroke-width', String((item.stroke ?? 2) * page.scale));
            shape.setAttribute('stroke-linecap', 'round');
            shape.setAttribute('stroke-linejoin', 'round');
            shape.style.pointerEvents = 'stroke';
            element.append(shape);
            element.style.position = 'absolute';
            element.style.left = '0';
            element.style.top = '0';
            element.style.pointerEvents = 'none';
            shape.addEventListener('pointerdown', (event) => {
                event.stopPropagation();
                selected = item.id;
                redraw();
            });
        } else {
            element = globalThis.document.createElement('div');
            element.className = `pv-item pv-item--${item.type}`;
            place(element, item, page);

            if (item.type === 'rect' || item.type === 'ellipse') {
                element.style.border = `${Math.max(1, (item.stroke ?? 2) * page.scale)}px solid ${item.color ?? '#d33'}`;

                if (item.fill) {
                    element.style.background = item.fill;
                }

                if (item.type === 'ellipse') {
                    element.style.borderRadius = '50%';
                }
            }
        }

        element.dataset.id = String(item.id);
        element.classList.add('pv-annotation');

        if (item.id === selected) {
            element.classList.add('is-selected');
        }

        if (item.x !== undefined && item.w !== undefined || ['text'].includes(item.type)) {
            makeMovable(element, item, page);
        }

        return element;
    }

    function makeMovable(element, item, page) {
        element.addEventListener('pointerdown', (event) => {
            if (event.target.closest('.pv-remove') || event.target.isContentEditable) {
                return;
            }

            event.stopPropagation();
            selected = item.id;
            const [startX, startY] = pointerPoint(page, event);
            const origin = { x: item.x, y: item.y, w: item.w, h: item.h };
            const resizing = event.target.classList.contains('pv-handle');
            element.setPointerCapture?.(event.pointerId);
            let moved = false;

            const move = (moveEvent) => {
                const [x, y] = pointerPoint(page, moveEvent);
                moved = true;

                if (resizing) {
                    item.w = Math.max(8, origin.w + (x - startX));
                    item.h = Math.max(8, origin.h + (y - startY));

                    if (item.keepAspect) {
                        item.h = item.w * (origin.h / origin.w);
                    }
                } else {
                    item.x = Math.min(Math.max(0, origin.x + (x - startX)), page.width - 4);
                    item.y = Math.min(Math.max(0, origin.y + (y - startY)), page.height - 4);
                }

                place(element, item, page);
            };

            const up = () => {
                element.removeEventListener('pointermove', move);
                element.removeEventListener('pointerup', up);
                moved ? changed() : redraw();
            };

            element.addEventListener('pointermove', move);
            element.addEventListener('pointerup', up);
        });
    }

    function decorate(element, item) {
        if (item.id !== selected) {
            return;
        }

        if (resizable && item.w !== undefined && !element.querySelector('.pv-handle')) {
            const handle = globalThis.document.createElement('span');
            handle.className = 'pv-handle';
            element.append(handle);
        }

        if (!element.querySelector('.pv-remove') && element.tagName !== 'svg') {
            const remove = globalThis.document.createElement('button');
            remove.type = 'button';
            remove.className = 'pv-remove';
            remove.setAttribute('aria-label', 'Delete');
            remove.textContent = '×';
            remove.addEventListener('pointerdown', (event) => event.stopPropagation());
            remove.addEventListener('click', () => api.remove(item.id));
            element.append(remove);
        }
    }

    function redraw() {
        viewer.pages.forEach((page) => page.layer.querySelectorAll('.pv-annotation').forEach((node) => node.remove()));

        for (const item of items) {
            const page = pageOf(item);

            if (!page) {
                continue;
            }

            const element = build(item, page);
            decorate(element, item);
            page.layer.append(element);
        }
    }

    // Creating items by dragging, clicking or drawing on a page.
    viewer.pages.forEach((page) => {
        const preview = globalThis.document.createElement('div');
        preview.className = 'pv-preview';
        preview.hidden = true;
        page.layer.append(preview);

        const onDown = (event) => {
            if (!tool || event.button > 0) {
                selected = null;
                redraw();

                return;
            }

            selected = null;
            event.preventDefault();
            const [startX, startY] = pointerPoint(page, event);
            page.layer.setPointerCapture?.(event.pointerId);

            if (tool.kind === 'click') {
                const item = tool.create(page, { x: startX, y: startY });

                if (item) {
                    api.add({ ...item, page: page.index });
                }

                return;
            }

            const points = [[startX, startY]];
            let endX = startX;
            let endY = startY;

            const move = (moveEvent) => {
                [endX, endY] = pointerPoint(page, moveEvent);
                points.push([endX, endY]);

                if (tool.kind === 'drag') {
                    preview.hidden = false;
                    preview.style.left = `${Math.min(startX, endX) * page.scale}px`;
                    preview.style.top = `${Math.min(startY, endY) * page.scale}px`;
                    preview.style.width = `${Math.abs(endX - startX) * page.scale}px`;
                    preview.style.height = `${Math.abs(endY - startY) * page.scale}px`;
                }
            };

            const up = () => {
                page.layer.removeEventListener('pointermove', move);
                page.layer.removeEventListener('pointerup', up);
                preview.hidden = true;
                let item = null;

                if (tool.kind === 'drag' && (Math.abs(endX - startX) >= MIN_DRAG || Math.abs(endY - startY) >= MIN_DRAG)) {
                    item = tool.create(page, {
                        x: Math.min(startX, endX), y: Math.min(startY, endY), w: Math.abs(endX - startX), h: Math.abs(endY - startY), x1: startX, y1: startY, x2: endX, y2: endY,
                    });
                } else if (tool.kind === 'freehand' && points.length > 2) {
                    item = tool.create(page, { points });
                }

                if (item) {
                    api.add({ ...item, page: page.index });
                }
            };

            page.layer.addEventListener('pointermove', move);
            page.layer.addEventListener('pointerup', up);
        };

        page.layer.addEventListener('pointerdown', onDown);
        cleanups.push(() => page.layer.removeEventListener('pointerdown', onDown));
    });

    const onKey = (event) => {
        if ((event.key === 'Delete' || event.key === 'Backspace') && selected !== null && !event.target.isContentEditable && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) {
            event.preventDefault();
            api.remove(selected);
        }
    };

    globalThis.document.addEventListener('keydown', onKey);
    cleanups.push(() => globalThis.document.removeEventListener('keydown', onKey));

    const api = {
        add(item) {
            const added = { id: counter, ...item };
            counter += 1;
            items.push(added);
            selected = added.id;
            changed();

            return added;
        },
        update(id, changes) {
            Object.assign(find(id) ?? {}, changes);
            changed();
        },
        remove(id) {
            items = items.filter((item) => item.id !== id);
            selected = null;
            changed();
        },
        undo() {
            items.pop();
            selected = null;
            changed();
        },
        clear() {
            items = [];
            selected = null;
            changed();
        },
        list: () => items.map((item) => ({ ...item })),
        setTool(next) {
            tool = next;
            viewer.pages.forEach((page) => page.layer.classList.toggle('is-tool', next !== null));
        },
        destroy() {
            cleanups.forEach((cleanup) => cleanup());
            items = [];
        },
    };

    return api;
}
