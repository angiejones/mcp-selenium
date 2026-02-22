// Browser-side script — walks DOM to build accessibility tree.
// Uses `var` intentionally: this is executed via WebDriver's executeScript in arbitrary
// browser contexts, so we avoid `const`/`let` for maximum compatibility.
var ROLE_MAP = {
    A: 'link', BUTTON: 'button', INPUT: 'textbox', SELECT: 'combobox',
    TEXTAREA: 'textbox', IMG: 'img', TABLE: 'table', THEAD: 'rowgroup',
    TBODY: 'rowgroup', TR: 'row', TH: 'columnheader', TD: 'cell',
    UL: 'list', OL: 'list', LI: 'listitem', NAV: 'navigation',
    MAIN: 'main', HEADER: 'banner', FOOTER: 'contentinfo', ASIDE: 'complementary',
    FORM: 'form', SECTION: 'region', H1: 'heading', H2: 'heading',
    H3: 'heading', H4: 'heading', H5: 'heading', H6: 'heading',
    DIALOG: 'dialog', DETAILS: 'group', SUMMARY: 'button',
    FIELDSET: 'group', LEGEND: 'legend', LABEL: 'label',
    PROGRESS: 'progressbar', METER: 'meter'
};
var INPUT_ROLES = {
    checkbox: 'checkbox', radio: 'radio', button: 'button',
    submit: 'button', reset: 'button', range: 'slider',
    search: 'searchbox', email: 'textbox', url: 'textbox',
    tel: 'textbox', number: 'spinbutton'
};
var SKIP = { SCRIPT:1, STYLE:1, NOSCRIPT:1, TEMPLATE:1, SVG:1 };

function walk(el) {
    if (el.nodeType === 3) {
        var t = el.textContent.trim();
        return t ? { role: 'text', name: t.substring(0, 200) } : null;
    }
    if (el.nodeType !== 1 || SKIP[el.tagName]) return null;
    if (el.hidden || el.getAttribute('aria-hidden') === 'true') return null;

    var tag = el.tagName;
    var role = el.getAttribute('role') || (tag === 'INPUT' ? INPUT_ROLES[el.type] : null) || ROLE_MAP[tag] || null;
    var name = el.getAttribute('aria-label') || el.getAttribute('alt') || el.getAttribute('title')
        || el.getAttribute('placeholder') || el.getAttribute('name') || null;
    var node = {};
    if (role) node.role = role;
    if (name) node.name = name;
    if (el.id) node.id = el.id;
    if (tag.match(/^H[1-6]$/)) node.level = parseInt(tag[1]);
    if (el.href) node.href = el.href;
    if (el.disabled) node.disabled = true;
    if (el.checked) node.checked = true;
    if (el.required) node.required = true;
    if (el.value && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')) node.value = el.value.substring(0, 200);

    var kids = [];
    for (var i = 0; i < el.childNodes.length; i++) {
        var c = walk(el.childNodes[i]);
        if (c) kids.push(c);
    }

    // Collapse: text-only node with no role gets merged up
    if (!role && !name && !el.id && kids.length === 1 && kids[0].role === 'text') return kids[0];
    // Skip empty containers with no semantic meaning
    if (!role && !name && !el.id && kids.length === 0) return null;

    if (kids.length > 0) node.children = kids;
    // If the node has nothing useful, skip it
    if (!node.role && !node.name && !node.id && !node.children) return null;
    return node;
}
return walk(document.body);
