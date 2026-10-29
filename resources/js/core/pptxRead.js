import { strFromU8, unzipSync } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import { ToolError } from './errors.js';

const EMU_PER_POINT = 12700;
const MAX_SLIDES = 300;
const MAX_XML_BYTES = 8 * 1024 * 1024;
const MAX_MEDIA_BYTES = 40 * 1024 * 1024;

const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: false,
    parseTagValue: false,
    parseAttributeValue: false,
});

const tagOf = (node) => Object.keys(node).find((key) => key !== ':@' && key !== '#text');
const kids = (node) => (node ? node[tagOf(node)] ?? [] : []);
const attrs = (node) => node?.[':@'] ?? {};
const find = (nodes, tag) => nodes?.find((node) => tagOf(node) === tag);
const findAll = (nodes, tag) => (nodes ?? []).filter((node) => tagOf(node) === tag);
const textOf = (nodes) => (nodes ?? []).map((node) => ('#text' in node ? String(node['#text']) : '')).join('');

/** Follows a path like 'p:spPr/a:xfrm' through ordered nodes. */
function dig(nodes, path) {
    let current = nodes;

    for (const tag of path.split('/')) {
        const match = find(current, tag);

        if (!match) {
            return null;
        }

        current = kids(match);
        if (tag === path.split('/').at(-1)) {
            return match;
        }
    }

    return null;
}

const THEME_ALIASES = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };

function parseXml(files, name) {
    const entry = files[name];

    if (!entry) {
        return null;
    }

    return parser.parse(strFromU8(entry));
}

function relsOf(files, partName) {
    const folder = partName.slice(0, partName.lastIndexOf('/') + 1);
    const file = partName.slice(partName.lastIndexOf('/') + 1);
    const tree = parseXml(files, `${folder}_rels/${file}.rels`);
    const map = new Map();

    if (tree) {
        for (const rel of kids(find(tree, 'Relationships'))) {
            if (tagOf(rel) === 'Relationship') {
                map.set(attrs(rel)['@_Id'], { target: attrs(rel)['@_Target'], type: attrs(rel)['@_Type'] ?? '', external: attrs(rel)['@_TargetMode'] === 'External' });
            }
        }
    }

    return { map, folder };
}

/** Resolves a relationship target like "../media/a.png" against the part that owns it. */
function resolve(folder, target) {
    const parts = target.startsWith('/') ? target.slice(1).split('/') : [...folder.split('/').filter(Boolean), ...target.split('/')];
    const out = [];

    for (const part of parts) {
        if (part === '..') {
            out.pop();
        } else if (part !== '.' && part !== '') {
            out.push(part);
        }
    }

    return out.join('/');
}

function themeColors(files, themePath) {
    const colors = {};
    const tree = parseXml(files, themePath);
    const scheme = tree && dig(kids(find(tree, 'a:theme')), 'a:themeElements/a:clrScheme');

    for (const entry of kids(scheme)) {
        const name = tagOf(entry).replace('a:', '');
        const value = kids(entry)[0];
        const attributes = attrs(value);
        colors[name] = (attributes['@_val'] && tagOf(value) === 'a:srgbClr' ? attributes['@_val'] : attributes['@_lastClr']) ?? '000000';
    }

    return colors;
}

/** Reads a colour element (a:solidFill) as [r, g, b] in 0..1, or null. */
export function readFill(node, theme) {
    const fill = find(kids(node), 'a:solidFill');
    const color = kids(fill)[0];

    if (!color) {
        return null;
    }

    let hex = attrs(color)['@_val'];

    if (tagOf(color) === 'a:schemeClr') {
        hex = theme[THEME_ALIASES[hex] ?? hex] ?? '000000';
    } else if (tagOf(color) === 'a:sysClr') {
        hex = attrs(color)['@_lastClr'] ?? '000000';
    }

    if (!/^[0-9a-f]{6}$/i.test(hex ?? '')) {
        return null;
    }

    return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

/** Reads an xfrm node (a:xfrm or p:xfrm) into a frame in points. */
function readXfrm(xfrm) {
    if (!xfrm) {
        return null;
    }

    const off = attrs(find(kids(xfrm), 'a:off'));
    const ext = attrs(find(kids(xfrm), 'a:ext'));
    const chOff = attrs(find(kids(xfrm), 'a:chOff'));
    const chExt = attrs(find(kids(xfrm), 'a:chExt'));

    if (off['@_x'] === undefined || ext['@_cx'] === undefined) {
        return null;
    }

    const number = (value) => Number(value ?? 0) / EMU_PER_POINT;

    return {
        x: number(off['@_x']), y: number(off['@_y']), w: number(ext['@_cx']), h: number(ext['@_cy']),
        childX: number(chOff['@_x']), childY: number(chOff['@_y']), childW: number(chExt['@_cx']), childH: number(chExt['@_cy']),
    };
}

function readParagraphs(txBody, theme) {
    return findAll(kids(txBody), 'a:p').map((paragraph) => {
        const properties = find(kids(paragraph), 'a:pPr');
        const settings = attrs(properties);
        const bullet = find(kids(properties), 'a:buChar');
        const runs = [];

        for (const node of kids(paragraph)) {
            const tag = tagOf(node);

            if (tag === 'a:r' || tag === 'a:fld') {
                const runProps = find(kids(node), 'a:rPr');
                const attributes = attrs(runProps);

                runs.push({
                    text: textOf(kids(find(kids(node), 'a:t'))),
                    size: attributes['@_sz'] ? Number(attributes['@_sz']) / 100 : null,
                    bold: attributes['@_b'] === '1',
                    italic: attributes['@_i'] === '1',
                    color: readFill(runProps, theme),
                });
            } else if (tag === 'a:br') {
                runs.push({ text: '\n' });
            }
        }

        return {
            runs,
            align: settings['@_algn'] ?? 'l',
            level: Number(settings['@_lvl'] ?? 0),
            bullet: bullet ? (attrs(bullet)['@_char'] || '•') : null,
        };
    });
}

function readTable(children) {
    const table = dig(kids(find(children, 'a:graphic')), 'a:graphicData/a:tbl');

    if (!table) {
        return null;
    }

    const columns = findAll(kids(find(kids(table), 'a:tblGrid')), 'a:gridCol').map((column) => Number(attrs(column)['@_w'] ?? 0) / EMU_PER_POINT);
    const rows = findAll(kids(table), 'a:tr').map((row) => ({
        height: Number(attrs(row)['@_h'] ?? 0) / EMU_PER_POINT,
        cells: findAll(kids(row), 'a:tc').map((cell) => findAll(kids(find(kids(cell), 'a:txBody')), 'a:p')
            .map((paragraph) => findAll(kids(paragraph), 'a:r').map((run) => textOf(kids(find(kids(run), 'a:t')))).join('')).join('\n')),
    }));

    return { columns, rows };
}

/** Collects the shapes of a shape tree in drawing order, flattening groups. */
function readShapes(nodes, context, offset = { x: 0, y: 0, sx: 1, sy: 1 }) {
    const shapes = [];

    for (const node of nodes) {
        const tag = tagOf(node);

        if (tag === 'p:grpSp') {
            const xfrm = readXfrm(find(kids(find(kids(node), 'p:grpSpPr')), 'a:xfrm'));
            const next = xfrm && xfrm.childW > 0 && xfrm.childH > 0
                ? {
                    x: offset.x + (xfrm.x - xfrm.childX * (xfrm.w / xfrm.childW)) * offset.sx,
                    y: offset.y + (xfrm.y - xfrm.childY * (xfrm.h / xfrm.childH)) * offset.sy,
                    sx: offset.sx * (xfrm.w / xfrm.childW),
                    sy: offset.sy * (xfrm.h / xfrm.childH),
                }
                : offset;

            shapes.push(...readShapes(kids(node), context, next));
            continue;
        }

        if (!['p:sp', 'p:pic', 'p:graphicFrame', 'p:cxnSp'].includes(tag)) {
            continue;
        }

        const children = kids(node);
        const spPr = find(children, 'p:spPr');
        const raw = readXfrm(tag === 'p:graphicFrame' ? find(children, 'p:xfrm') : find(kids(spPr), 'a:xfrm'));
        const placeholder = dig(kids(find(children, 'p:nvSpPr')), 'p:nvPr/p:ph');
        const geometry = attrs(find(kids(spPr), 'a:prstGeom'))['@_prst'];
        const placeholderInfo = placeholder ? { type: attrs(placeholder)['@_type'] ?? 'body', idx: attrs(placeholder)['@_idx'] ?? null } : null;

        const shape = {
            kind: tag === 'p:pic' ? 'picture' : tag === 'p:graphicFrame' ? 'table' : 'shape',
            frame: raw ? {
                x: offset.x + raw.x * offset.sx, y: offset.y + raw.y * offset.sy, w: raw.w * offset.sx, h: raw.h * offset.sy,
            } : null,
            placeholder: placeholderInfo,
            geometry,
            fill: spPr ? readFill(spPr, context.theme) : null,
            line: spPr ? readFill(find(kids(spPr), 'a:ln'), context.theme) : null,
            paragraphs: tag === 'p:sp' ? readParagraphs(find(children, 'p:txBody'), context.theme) : [],
            embed: tag === 'p:pic' ? attrs(dig(kids(find(children, 'p:blipFill')), 'a:blip'))['@_r:embed'] ?? null : null,
            table: tag === 'p:graphicFrame' ? readTable(children) : null,
        };

        shapes.push(shape);
    }

    return shapes;
}

/**
 * Reads a .pptx into slides of shapes with positions in points. Layout and
 * master placeholders provide the position and default size when a slide
 * shape does not set its own.
 *
 * @param {Uint8Array} bytes
 */
export function readPresentation(bytes) {
    let files;

    try {
        files = unzipSync(bytes, {
            filter: (entry) => (/\.(xml|rels)$/.test(entry.name) && entry.originalSize <= MAX_XML_BYTES)
                || (/^ppt\/media\//.test(entry.name) && entry.originalSize <= MAX_MEDIA_BYTES),
        });
    } catch {
        throw new ToolError('This file could not be read. It may be damaged.');
    }

    const presentation = parseXml(files, 'ppt/presentation.xml');

    if (!presentation) {
        throw new ToolError('This file is not a valid PowerPoint presentation.');
    }

    const root = kids(find(presentation, 'p:presentation'));
    const size = attrs(find(root, 'p:sldSz'));
    const width = Number(size['@_cx'] ?? 9144000) / EMU_PER_POINT;
    const height = Number(size['@_cy'] ?? 6858000) / EMU_PER_POINT;
    const presentationRels = relsOf(files, 'ppt/presentation.xml');
    const slideIds = kids(find(root, 'p:sldIdLst')).map((entry) => attrs(entry)['@_r:id']);

    if (slideIds.length === 0) {
        throw new ToolError('This presentation has no slides.');
    }

    if (slideIds.length > MAX_SLIDES) {
        throw new ToolError(`Choose a presentation with at most ${MAX_SLIDES} slides.`);
    }

    const slides = slideIds.map((id) => {
        const slidePath = resolve(presentationRels.folder, presentationRels.map.get(id)?.target ?? '');
        const slideTree = parseXml(files, slidePath);

        if (!slideTree) {
            return { shapes: [], background: null, media: new Map() };
        }

        const rels = relsOf(files, slidePath);
        const layoutRel = [...rels.map.values()].find((rel) => rel.type.endsWith('/slideLayout'));
        const layoutPath = layoutRel ? resolve(rels.folder, layoutRel.target) : null;
        const layoutRels = layoutPath ? relsOf(files, layoutPath) : null;
        const masterRel = layoutRels && [...layoutRels.map.values()].find((rel) => rel.type.endsWith('/slideMaster'));
        const masterPath = masterRel ? resolve(layoutRels.folder, masterRel.target) : null;
        const masterRels = masterPath ? relsOf(files, masterPath) : null;
        const themeRel = masterRels && [...masterRels.map.values()].find((rel) => rel.type.endsWith('/theme'));
        const theme = themeRel ? themeColors(files, resolve(masterRels.folder, themeRel.target)) : {};
        const context = { theme };

        const shapesOf = (path) => {
            const tree = path ? parseXml(files, path) : null;
            const spTree = tree && dig(kids(find(tree, tagOf(tree[0]))), 'p:cSld/p:spTree');

            return spTree ? readShapes(kids(spTree), context) : [];
        };

        const layoutShapes = shapesOf(layoutPath);
        const masterShapes = shapesOf(masterPath);
        const master = masterPath ? parseXml(files, masterPath) : null;
        const styles = master ? kids(dig(kids(find(master, 'p:sldMaster')), 'p:txStyles')) : [];
        const levelSize = (styleTag, level) => {
            const style = find(styles, styleTag);
            const levelNode = find(kids(style), `a:lvl${level + 1}pPr`);
            const value = attrs(find(kids(levelNode), 'a:defRPr'))['@_sz'];

            return value ? Number(value) / 100 : null;
        };

        const slideBody = kids(find(slideTree, 'p:sld'));
        const cSld = find(slideBody, 'p:cSld');
        const background = readFill(find(kids(find(kids(cSld), 'p:bg')), 'p:bgPr'), theme);
        const shapes = readShapes(kids(find(kids(cSld), 'p:spTree')), context);
        const media = new Map();

        for (const shape of shapes) {
            if (shape.placeholder) {
                const match = (list) => list.find((candidate) => candidate.placeholder
                    && ((shape.placeholder.idx !== null && candidate.placeholder.idx === shape.placeholder.idx)
                        || (shape.placeholder.idx === null && candidate.placeholder.type === shape.placeholder.type)));
                const inherited = (match(layoutShapes)?.frame ? match(layoutShapes) : null) ?? match(masterShapes);
                const typeMaster = masterShapes.find((candidate) => candidate.placeholder?.type === shape.placeholder.type);

                shape.frame ??= inherited?.frame ?? typeMaster?.frame ?? null;
                shape.defaultSize = ['title', 'ctrTitle'].includes(shape.placeholder.type)
                    ? levelSize('p:titleStyle', 0) ?? 40
                    : levelSize('p:bodyStyle', 0) ?? 24;
                shape.isTitle = ['title', 'ctrTitle'].includes(shape.placeholder.type);
            }

            if (shape.embed) {
                const rel = rels.map.get(shape.embed);
                const path = rel && !rel.external ? resolve(rels.folder, rel.target) : null;

                if (path && files[path] && !media.has(shape.embed)) {
                    media.set(shape.embed, { path, bytes: files[path] });
                }
            }
        }

        return { shapes, background, media };
    });

    return { width, height, slides };
}
