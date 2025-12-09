/* global chrome, URLPattern */

import {
  generateHighlightId,
  migrateHighlightRules,
} from '../shared/highlightTextMigration.js';

/**
 * @typedef {import('../shared/highlightTextMigration.js').HighlightEntry} HighlightEntry
 * @typedef {import('../shared/highlightTextMigration.js').HighlightTextRuleSettings} HighlightTextRuleSettings
 */

const HIGHLIGHT_TEXT_RULES_KEY = 'highlightTextRules';
const DEFAULT_TEXT_COLOR = '#000000';
const DEFAULT_BACKGROUND_COLOR = '#ffff00';

// ============================================================================
// DOM Elements
// ============================================================================

const form = /** @type {HTMLFormElement | null} */ (
  document.getElementById('highlightTextRuleForm')
);
const patternInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('highlightTextPatternInput')
);
const patternsChipsContainer = /** @type {HTMLDivElement | null} */ (
  document.getElementById('highlightTextPatternsChips')
);
const addPatternBtn = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('highlightTextAddPatternBtn')
);
const patternError = /** @type {HTMLParagraphElement | null} */ (
  document.getElementById('highlightTextPatternError')
);
const highlightsAccordion = /** @type {HTMLDivElement | null} */ (
  document.getElementById('highlightTextHighlightsAccordion')
);
const addHighlightBtn = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('highlightTextAddHighlightBtn')
);
const formError = /** @type {HTMLParagraphElement | null} */ (
  document.getElementById('highlightTextFormError')
);
const saveButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('highlightTextSaveButton')
);
const cancelEditButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('highlightTextCancelEditButton')
);
const rulesEmpty = /** @type {HTMLDivElement | null} */ (
  document.getElementById('highlightTextRulesEmpty')
);
const rulesList = /** @type {HTMLDivElement | null} */ (
  document.getElementById('highlightTextRulesList')
);
const ruleDetails = /** @type {HTMLDivElement | null} */ (
  document.getElementById('highlightTextRuleDetails')
);

// ============================================================================
// State
// ============================================================================

/** @type {HighlightTextRuleSettings[]} */
let rules = [];
/** @type {string | null} */
let editingRuleId = null;
/** @type {string[]} */
let currentPatterns = [];
/** @type {HighlightEntry[]} */
let currentHighlights = [];
/** @type {Set<string>} */
let expandedHighlights = new Set();

// ============================================================================
// Utilities
// ============================================================================

/**
 * Generate a stable identifier for rules.
 * @returns {string}
 */
function generateRuleId() {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  return 'highlight-rule-' + Date.now().toString(36) + '-' + random;
}

/**
 * Validate URL pattern using URLPattern constructor.
 * @param {string} pattern
 * @returns {boolean}
 */
function isValidUrlPattern(pattern) {
  try {
    new URLPattern(pattern);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Validate regex pattern.
 * @param {string} pattern
 * @returns {boolean}
 */
function isValidRegex(pattern) {
  try {
    new RegExp(pattern);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Clamp a number between min and max.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return min;
  }
  return Math.min(Math.max(number, min), max);
}

/**
 * Normalize hexadecimal color strings to #rrggbb format.
 * @param {string} color
 * @param {string} fallback
 * @returns {string}
 */
function expandHexColor(color, fallback = DEFAULT_TEXT_COLOR) {
  if (typeof color !== 'string') {
    return fallback;
  }

  const value = color.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return value;
  }
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    const r = value[1];
    const g = value[2];
    const b = value[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (/^#[0-9a-f]{8}$/i.test(value)) {
    return `#${value.slice(1, 7)}`;
  }
  if (/^#[0-9a-f]{4}$/i.test(value)) {
    const r = value[1];
    const g = value[2];
    const b = value[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

/**
 * Parse a stored color string that may include alpha information.
 * @param {string} colorValue
 * @param {string} fallbackHex
 * @returns {{hex: string, alpha: number}}
 */
function parseColorWithAlpha(colorValue, fallbackHex = DEFAULT_TEXT_COLOR) {
  const fallback = {
    hex: expandHexColor(fallbackHex),
    alpha: 1,
  };

  if (typeof colorValue !== 'string') {
    return fallback;
  }

  const value = colorValue.trim().toLowerCase();
  if (!value) {
    return fallback;
  }

  if (/^#[0-9a-f]{6}$/i.test(value) || /^#[0-9a-f]{3}$/i.test(value)) {
    return {
      hex: expandHexColor(value, fallback.hex),
      alpha: 1,
    };
  }

  if (/^#[0-9a-f]{8}$/i.test(value)) {
    const hex = `#${value.slice(1, 7)}`;
    const alpha = clamp(parseInt(value.slice(7), 16) / 255, 0, 1);
    return { hex, alpha };
  }

  if (/^#[0-9a-f]{4}$/i.test(value)) {
    const hex = expandHexColor(value, fallback.hex);
    const alphaComponent = value[4] + value[4];
    const alpha = clamp(parseInt(alphaComponent, 16) / 255, 0, 1);
    return { hex, alpha };
  }

  const rgbaMatch = value.match(/rgba?\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+))?\s*\)/i);
  if (rgbaMatch) {
    const r = clamp(parseInt(rgbaMatch[1], 10), 0, 255);
    const g = clamp(parseInt(rgbaMatch[2], 10), 0, 255);
    const b = clamp(parseInt(rgbaMatch[3], 10), 0, 255);
    const a = rgbaMatch[4] !== undefined ? clamp(parseFloat(rgbaMatch[4]), 0, 1) : 1;
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    return { hex, alpha: a };
  }

  return fallback;
}

/**
 * Build a CSS color string with optional alpha component.
 * @param {string} hexColor
 * @param {number} alpha
 * @returns {string}
 */
function formatColorWithAlpha(hexColor, alpha) {
  const normalizedHex = expandHexColor(hexColor);
  const normalizedAlpha = clamp(alpha, 0, 1);

  if (normalizedAlpha >= 0.999) {
    return normalizedHex;
  }

  const r = parseInt(normalizedHex.slice(1, 3), 16);
  const g = parseInt(normalizedHex.slice(3, 5), 16);
  const b = parseInt(normalizedHex.slice(5, 7), 16);
  const alphaRounded = Math.round(normalizedAlpha * 100) / 100;

  return `rgba(${r}, ${g}, ${b}, ${alphaRounded})`;
}

/**
 * Format date for display.
 * @param {string | undefined} dateString
 * @returns {string}
 */
function formatDate(dateString) {
  if (!dateString) return 'Unknown';
  try {
    return new Date(dateString).toLocaleString();
  } catch (error) {
    return 'Unknown';
  }
}

/**
 * Get type display name.
 * @param {string} type
 * @returns {string}
 */
function getTypeDisplayName(type) {
  switch (type) {
    case 'whole-phrase':
      return 'Whole phrase';
    case 'comma-separated':
      return 'Comma separated';
    case 'regex':
      return 'Regex';
    default:
      return type;
  }
}

// ============================================================================
// Patterns Chip UI
// ============================================================================

/**
 * Render the patterns chips.
 */
function renderPatternsChips() {
  if (!patternsChipsContainer) return;

  patternsChipsContainer.innerHTML = '';

  currentPatterns.forEach((pattern, index) => {
    const chip = document.createElement('div');
    chip.className = 'badge badge-lg gap-1 font-mono text-xs';
    chip.innerHTML = `
      <span class="max-w-48 truncate">${escapeHtml(pattern)}</span>
      <button type="button" class="btn btn-ghost btn-xs p-0 min-h-0 h-4 w-4" data-pattern-index="${index}">
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    `;
    const removeBtn = chip.querySelector('button');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        currentPatterns.splice(index, 1);
        renderPatternsChips();
      });
    }
    patternsChipsContainer.appendChild(chip);
  });
}

/**
 * Handle adding a new pattern.
 */
function handleAddPattern() {
  if (!patternInput || !patternError) return;

  const pattern = patternInput.value.trim();
  if (!pattern) {
    patternError.textContent = 'Please enter a URL pattern';
    patternError.hidden = false;
    return;
  }

  if (!isValidUrlPattern(pattern)) {
    patternError.textContent = 'Invalid URL pattern format';
    patternError.hidden = false;
    return;
  }

  if (currentPatterns.includes(pattern)) {
    patternError.textContent = 'This pattern already exists';
    patternError.hidden = false;
    return;
  }

  patternError.hidden = true;
  currentPatterns.push(pattern);
  patternInput.value = '';
  renderPatternsChips();
}

// ============================================================================
// Highlights Accordion UI
// ============================================================================

/**
 * Create the default highlight entry.
 * @returns {HighlightEntry}
 */
function createDefaultHighlight() {
  return {
    id: generateHighlightId(),
    type: 'whole-phrase',
    value: '',
    textColor: DEFAULT_TEXT_COLOR,
    backgroundColor: DEFAULT_BACKGROUND_COLOR,
    bold: false,
    italic: false,
    underline: false,
    ignoreCase: false,
  };
}

/**
 * Escape HTML entities.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Render a single highlight accordion entry.
 * @param {HighlightEntry} highlight
 * @param {number} index
 * @returns {HTMLElement}
 */
function createHighlightAccordionEntry(highlight, index) {
  const isExpanded = expandedHighlights.has(highlight.id);
  const canDelete = currentHighlights.length > 1;

  const { hex: textHex, alpha: textAlpha } = parseColorWithAlpha(highlight.textColor, DEFAULT_TEXT_COLOR);
  const { hex: bgHex, alpha: bgAlpha } = parseColorWithAlpha(highlight.backgroundColor, DEFAULT_BACKGROUND_COLOR);

  const entry = document.createElement('div');
  entry.className = 'border border-base-300 rounded-lg overflow-hidden';
  entry.dataset.highlightId = highlight.id;

  // Header
  const header = document.createElement('div');
  header.className = 'flex items-center gap-2 p-3 bg-base-200 cursor-pointer hover:bg-base-300 transition-colors';
  header.innerHTML = `
    <svg class="w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
    </svg>
    <span class="badge badge-outline badge-sm">${escapeHtml(getTypeDisplayName(highlight.type))}</span>
    <span class="text-sm truncate flex-1 font-mono">${escapeHtml(highlight.value || '(empty)')}</span>
    <div class="flex gap-1">
      <div class="w-4 h-4 rounded border border-base-300" style="background-color: ${escapeHtml(highlight.textColor)}"></div>
      <div class="w-4 h-4 rounded border border-base-300" style="background-color: ${escapeHtml(highlight.backgroundColor)}"></div>
    </div>
    ${highlight.bold ? '<span class="text-xs font-bold">B</span>' : ''}
    ${highlight.italic ? '<span class="text-xs italic">I</span>' : ''}
    ${highlight.underline ? '<span class="text-xs underline">U</span>' : ''}
  `;

  header.addEventListener('click', (e) => {
    if ((/** @type {HTMLElement} */ (e.target)).closest('button')) return;
    if (isExpanded) {
      expandedHighlights.delete(highlight.id);
    } else {
      expandedHighlights.add(highlight.id);
    }
    renderHighlightsAccordion();
  });

  entry.appendChild(header);

  // Body (expanded content)
  if (isExpanded) {
    const body = document.createElement('div');
    body.className = 'p-4 space-y-4 border-t border-base-300';
    body.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="form-label">Type</label>
          <select class="nenya-input highlight-type-select" data-highlight-id="${highlight.id}">
            <option value="whole-phrase" ${highlight.type === 'whole-phrase' ? 'selected' : ''}>Whole phrase matches</option>
            <option value="comma-separated" ${highlight.type === 'comma-separated' ? 'selected' : ''}>Comma separated words</option>
            <option value="regex" ${highlight.type === 'regex' ? 'selected' : ''}>Regular expression</option>
          </select>
        </div>
        <div>
          <label class="flex items-center gap-3 p-3 bg-base-200 rounded-xl cursor-pointer h-full">
            <input type="checkbox" class="checkbox checkbox-sm checkbox-primary highlight-ignorecase-input" data-highlight-id="${highlight.id}" ${highlight.ignoreCase ? 'checked' : ''}>
            <span class="text-sm">Ignore case</span>
          </label>
        </div>
      </div>
      <div>
        <label class="form-label">Value</label>
        <textarea class="nenya-input font-mono text-sm resize-none highlight-value-input" data-highlight-id="${highlight.id}" placeholder="Enter text to highlight" rows="2">${escapeHtml(highlight.value)}</textarea>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="text-xs text-base-content/50 mb-2 block">Text color</label>
          <div class="flex items-center gap-3">
            <input type="color" class="w-12 h-10 rounded-lg border border-base-300 cursor-pointer highlight-textcolor-input" data-highlight-id="${highlight.id}" value="${textHex}">
            <div class="flex-1 flex items-center gap-2">
              <input type="range" class="range range-xs range-primary flex-1 highlight-textcolor-alpha" data-highlight-id="${highlight.id}" min="0" max="100" value="${Math.round(textAlpha * 100)}">
              <span class="text-xs text-base-content/50 w-10 text-right highlight-textcolor-alpha-label">${Math.round(textAlpha * 100)}%</span>
            </div>
          </div>
        </div>
        <div>
          <label class="text-xs text-base-content/50 mb-2 block">Background color</label>
          <div class="flex items-center gap-3">
            <input type="color" class="w-12 h-10 rounded-lg border border-base-300 cursor-pointer highlight-bgcolor-input" data-highlight-id="${highlight.id}" value="${bgHex}">
            <div class="flex-1 flex items-center gap-2">
              <input type="range" class="range range-xs range-primary flex-1 highlight-bgcolor-alpha" data-highlight-id="${highlight.id}" min="0" max="100" value="${Math.round(bgAlpha * 100)}">
              <span class="text-xs text-base-content/50 w-10 text-right highlight-bgcolor-alpha-label">${Math.round(bgAlpha * 100)}%</span>
            </div>
          </div>
        </div>
        <div>
          <label class="text-xs text-base-content/50 mb-2 block">Text styling</label>
          <div class="flex gap-3 mt-2">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" class="checkbox checkbox-sm checkbox-primary highlight-bold-input" data-highlight-id="${highlight.id}" ${highlight.bold ? 'checked' : ''}>
              <span class="text-sm font-bold">B</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" class="checkbox checkbox-sm checkbox-primary highlight-italic-input" data-highlight-id="${highlight.id}" ${highlight.italic ? 'checked' : ''}>
              <span class="text-sm italic">I</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" class="checkbox checkbox-sm checkbox-primary highlight-underline-input" data-highlight-id="${highlight.id}" ${highlight.underline ? 'checked' : ''}>
              <span class="text-sm underline">U</span>
            </label>
          </div>
        </div>
      </div>
      <div class="flex justify-end">
        <button type="button" class="btn btn-sm btn-error btn-outline highlight-delete-btn" data-highlight-id="${highlight.id}" ${canDelete ? '' : 'disabled'}>
          Delete highlight
        </button>
      </div>
    `;

    // Add event listeners for inputs
    setupHighlightEntryListeners(body, highlight.id);

    entry.appendChild(body);
  }

  return entry;
}

/**
 * Setup event listeners for a highlight entry's inputs.
 * @param {HTMLElement} container
 * @param {string} highlightId
 */
function setupHighlightEntryListeners(container, highlightId) {
  const highlight = currentHighlights.find((h) => h.id === highlightId);
  if (!highlight) return;

  // Type select
  const typeSelect = container.querySelector('.highlight-type-select');
  if (typeSelect) {
    typeSelect.addEventListener('change', (e) => {
      highlight.type = /** @type {'whole-phrase' | 'comma-separated' | 'regex'} */ (
        /** @type {HTMLSelectElement} */ (e.target).value
      );
    });
  }

  // Value input
  const valueInput = container.querySelector('.highlight-value-input');
  if (valueInput) {
    valueInput.addEventListener('input', (e) => {
      highlight.value = /** @type {HTMLTextAreaElement} */ (e.target).value;
    });
  }

  // Ignore case
  const ignoreCaseInput = container.querySelector('.highlight-ignorecase-input');
  if (ignoreCaseInput) {
    ignoreCaseInput.addEventListener('change', (e) => {
      highlight.ignoreCase = /** @type {HTMLInputElement} */ (e.target).checked;
    });
  }

  // Text color
  const textColorInput = container.querySelector('.highlight-textcolor-input');
  const textColorAlpha = container.querySelector('.highlight-textcolor-alpha');
  const textColorAlphaLabel = container.querySelector('.highlight-textcolor-alpha-label');
  if (textColorInput && textColorAlpha) {
    const updateTextColor = () => {
      const hex = /** @type {HTMLInputElement} */ (textColorInput).value;
      const alpha = clamp(Number(/** @type {HTMLInputElement} */ (textColorAlpha).value), 0, 100) / 100;
      highlight.textColor = formatColorWithAlpha(hex, alpha);
      if (textColorAlphaLabel) {
        textColorAlphaLabel.textContent = `${Math.round(alpha * 100)}%`;
      }
    };
    textColorInput.addEventListener('input', updateTextColor);
    textColorAlpha.addEventListener('input', updateTextColor);
  }

  // Background color
  const bgColorInput = container.querySelector('.highlight-bgcolor-input');
  const bgColorAlpha = container.querySelector('.highlight-bgcolor-alpha');
  const bgColorAlphaLabel = container.querySelector('.highlight-bgcolor-alpha-label');
  if (bgColorInput && bgColorAlpha) {
    const updateBgColor = () => {
      const hex = /** @type {HTMLInputElement} */ (bgColorInput).value;
      const alpha = clamp(Number(/** @type {HTMLInputElement} */ (bgColorAlpha).value), 0, 100) / 100;
      highlight.backgroundColor = formatColorWithAlpha(hex, alpha);
      if (bgColorAlphaLabel) {
        bgColorAlphaLabel.textContent = `${Math.round(alpha * 100)}%`;
      }
    };
    bgColorInput.addEventListener('input', updateBgColor);
    bgColorAlpha.addEventListener('input', updateBgColor);
  }

  // Bold, italic, underline
  const boldInput = container.querySelector('.highlight-bold-input');
  if (boldInput) {
    boldInput.addEventListener('change', (e) => {
      highlight.bold = /** @type {HTMLInputElement} */ (e.target).checked;
    });
  }

  const italicInput = container.querySelector('.highlight-italic-input');
  if (italicInput) {
    italicInput.addEventListener('change', (e) => {
      highlight.italic = /** @type {HTMLInputElement} */ (e.target).checked;
    });
  }

  const underlineInput = container.querySelector('.highlight-underline-input');
  if (underlineInput) {
    underlineInput.addEventListener('change', (e) => {
      highlight.underline = /** @type {HTMLInputElement} */ (e.target).checked;
    });
  }

  // Delete button
  const deleteBtn = container.querySelector('.highlight-delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      const index = currentHighlights.findIndex((h) => h.id === highlightId);
      if (index !== -1 && currentHighlights.length > 1) {
        currentHighlights.splice(index, 1);
        expandedHighlights.delete(highlightId);
        renderHighlightsAccordion();
      }
    });
  }
}

/**
 * Render all highlight accordion entries.
 */
function renderHighlightsAccordion() {
  if (!highlightsAccordion) return;

  highlightsAccordion.innerHTML = '';

  currentHighlights.forEach((highlight, index) => {
    const entry = createHighlightAccordionEntry(highlight, index);
    highlightsAccordion.appendChild(entry);
  });
}

/**
 * Handle adding a new highlight.
 */
function handleAddHighlight() {
  const newHighlight = createDefaultHighlight();
  currentHighlights.push(newHighlight);
  expandedHighlights.add(newHighlight.id);
  renderHighlightsAccordion();
}

// ============================================================================
// Form Handling
// ============================================================================

/**
 * Validate form data.
 * @returns {string | null} Error message or null if valid
 */
function validateForm() {
  if (currentPatterns.length === 0) {
    return 'At least one URL pattern is required';
  }

  if (currentHighlights.length === 0) {
    return 'At least one highlight entry is required';
  }

  for (const highlight of currentHighlights) {
    if (!highlight.value.trim()) {
      return 'All highlight entries must have a value';
    }
    if (highlight.type === 'regex' && !isValidRegex(highlight.value)) {
      return `Invalid regex pattern: ${highlight.value}`;
    }
  }

  return null;
}

/**
 * Clear form and reset to add mode.
 */
function clearForm() {
  if (patternInput) patternInput.value = '';
  if (patternError) patternError.hidden = true;
  if (formError) {
    formError.textContent = '';
    formError.hidden = true;
  }

  currentPatterns = [];
  currentHighlights = [createDefaultHighlight()];
  expandedHighlights.clear();
  expandedHighlights.add(currentHighlights[0].id);

  renderPatternsChips();
  renderHighlightsAccordion();

  if (saveButton) saveButton.textContent = 'Add rule';
  if (cancelEditButton) cancelEditButton.hidden = true;
  editingRuleId = null;
}

/**
 * Load rules from storage.
 * @returns {Promise<HighlightTextRuleSettings[]>}
 */
async function loadRules() {
  try {
    const result = await chrome.storage.local.get(HIGHLIGHT_TEXT_RULES_KEY);
    const storedRules = result[HIGHLIGHT_TEXT_RULES_KEY];

    if (!Array.isArray(storedRules)) {
      return [];
    }

    // Migrate legacy rules
    const { rules: migratedRules, migrated } = migrateHighlightRules(storedRules);

    // Save back if migration occurred
    if (migrated) {
      await chrome.storage.local.set({
        [HIGHLIGHT_TEXT_RULES_KEY]: migratedRules,
      });
    }

    // Validate and normalize rules
    return migratedRules.filter((rule) => {
      return (
        rule &&
        typeof rule === 'object' &&
        typeof rule.id === 'string' &&
        Array.isArray(rule.patterns) &&
        rule.patterns.length > 0 &&
        Array.isArray(rule.highlights) &&
        rule.highlights.length > 0
      );
    }).map((rule) => ({
      ...rule,
      disabled: typeof rule.disabled === 'boolean' ? rule.disabled : false,
      highlights: rule.highlights.map((h) => ({
        ...h,
        bold: typeof h.bold === 'boolean' ? h.bold : false,
        italic: typeof h.italic === 'boolean' ? h.italic : false,
        underline: typeof h.underline === 'boolean' ? h.underline : false,
        ignoreCase: typeof h.ignoreCase === 'boolean' ? h.ignoreCase : false,
      })),
    }));
  } catch (error) {
    console.warn('[highlightText] Failed to load rules:', error);
    return [];
  }
}

/**
 * Save rules to storage.
 * @param {HighlightTextRuleSettings[]} rulesToSave
 * @returns {Promise<void>}
 */
async function saveRules(rulesToSave) {
  try {
    await chrome.storage.local.set({
      [HIGHLIGHT_TEXT_RULES_KEY]: rulesToSave,
    });
  } catch (error) {
    console.warn('[highlightText] Failed to save rules:', error);
    throw error;
  }
}

// ============================================================================
// Rules List Rendering
// ============================================================================

/**
 * Render rules list.
 */
function renderRulesList() {
  if (!rulesList || !rulesEmpty) return;

  if (rules.length === 0) {
    rulesList.innerHTML = '';
    rulesEmpty.hidden = false;
    return;
  }

  rulesEmpty.hidden = true;
  rulesList.textContent = '';

  rules.forEach((rule) => {
    const container = document.createElement('article');
    container.className =
      'rounded-lg border border-base-300 p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between';
    container.setAttribute('role', 'listitem');

    if (rule.disabled) {
      container.classList.add('opacity-50');
    }

    const info = document.createElement('div');
    info.className = 'space-y-1 flex-1 min-w-0';

    // Pattern summary
    const patternSummary = document.createElement('p');
    patternSummary.className = 'font-mono text-sm break-words';
    if (rule.patterns.length === 1) {
      patternSummary.textContent = rule.patterns[0];
    } else {
      patternSummary.innerHTML = `${escapeHtml(rule.patterns[0])} <span class="badge badge-sm badge-ghost">+${rule.patterns.length - 1} more</span>`;
    }
    info.appendChild(patternSummary);

    // Highlight summary
    const highlightSummary = document.createElement('p');
    highlightSummary.className = 'text-sm text-base-content/70 truncate';
    const firstHighlight = rule.highlights[0];
    if (rule.highlights.length === 1) {
      highlightSummary.textContent = firstHighlight.value || '(empty)';
    } else {
      highlightSummary.innerHTML = `${escapeHtml(firstHighlight.value || '(empty)')} <span class="badge badge-sm badge-ghost">+${rule.highlights.length - 1} more</span>`;
    }
    info.appendChild(highlightSummary);

    // Meta badges for first highlight
    const meta = document.createElement('div');
    meta.className = 'flex items-center gap-2 mt-1';

    const typeBadge = document.createElement('span');
    typeBadge.className = 'badge badge-outline badge-sm';
    typeBadge.textContent = getTypeDisplayName(firstHighlight.type);
    meta.appendChild(typeBadge);

    if (firstHighlight.ignoreCase) {
      const caseBadge = document.createElement('span');
      caseBadge.className = 'badge badge-sm badge-ghost';
      caseBadge.textContent = 'Aa';
      meta.appendChild(caseBadge);
    }

    const colorPreview = document.createElement('div');
    colorPreview.className = 'flex gap-1';
    const textColorBox = document.createElement('div');
    textColorBox.className = 'w-3 h-3 rounded border border-base-300';
    textColorBox.style.backgroundColor = firstHighlight.textColor;
    colorPreview.appendChild(textColorBox);
    const bgColorBox = document.createElement('div');
    bgColorBox.className = 'w-3 h-3 rounded border border-base-300';
    bgColorBox.style.backgroundColor = firstHighlight.backgroundColor;
    colorPreview.appendChild(bgColorBox);
    meta.appendChild(colorPreview);

    const stylePreview = document.createElement('div');
    stylePreview.className = 'flex gap-1 text-xs';
    if (firstHighlight.bold) {
      const boldSpan = document.createElement('span');
      boldSpan.className = 'font-bold';
      boldSpan.textContent = 'B';
      stylePreview.appendChild(boldSpan);
    }
    if (firstHighlight.italic) {
      const italicSpan = document.createElement('span');
      italicSpan.className = 'italic';
      italicSpan.textContent = 'I';
      stylePreview.appendChild(italicSpan);
    }
    if (firstHighlight.underline) {
      const underlineSpan = document.createElement('span');
      underlineSpan.className = 'underline';
      underlineSpan.textContent = 'U';
      stylePreview.appendChild(underlineSpan);
    }
    meta.appendChild(stylePreview);

    info.appendChild(meta);
    container.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'flex flex-wrap gap-2';

    const viewButton = document.createElement('button');
    viewButton.type = 'button';
    viewButton.className = 'btn btn-sm btn-ghost';
    viewButton.textContent = 'View';
    viewButton.addEventListener('click', () => {
      showRuleDetails(rule.id);
    });
    actions.appendChild(viewButton);

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'btn btn-sm btn-outline';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => {
      editRule(rule.id);
    });
    actions.appendChild(editButton);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'btn btn-sm btn-error btn-outline';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => {
      void deleteRule(rule.id);
    });
    actions.appendChild(deleteButton);

    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'flex items-center gap-2';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'toggle toggle-success';
    toggle.checked = !rule.disabled;
    toggle.title = 'Enabled';
    toggle.addEventListener('change', (event) => {
      const isChecked = /** @type {HTMLInputElement} */ (event.target).checked;
      rule.disabled = !isChecked;
      void saveRules(rules).then(renderRulesList);
    });
    toggleContainer.appendChild(toggle);
    actions.appendChild(toggleContainer);

    container.appendChild(actions);
    rulesList.appendChild(container);
  });
}

/**
 * Show rule details.
 * @param {string} ruleId
 */
function showRuleDetails(ruleId) {
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule || !ruleDetails) return;

  const patternsDetail = document.getElementById('highlightTextRulePatternsDetail');
  const highlightsDetail = document.getElementById('highlightTextRuleHighlightsDetail');
  const createdDetail = document.getElementById('highlightTextRuleCreatedDetail');
  const updatedDetail = document.getElementById('highlightTextRuleUpdatedDetail');

  // Patterns list
  if (patternsDetail) {
    patternsDetail.innerHTML = '';
    const ul = document.createElement('ul');
    ul.className = 'list-disc list-inside space-y-1';
    rule.patterns.forEach((pattern) => {
      const li = document.createElement('li');
      li.textContent = pattern;
      ul.appendChild(li);
    });
    patternsDetail.appendChild(ul);
  }

  // Highlights list
  if (highlightsDetail) {
    highlightsDetail.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'space-y-2';
    rule.highlights.forEach((h) => {
      const item = document.createElement('div');
      item.className = 'flex items-center gap-2 p-2 bg-base-200 rounded';
      item.innerHTML = `
        <span class="badge badge-outline badge-sm">${escapeHtml(getTypeDisplayName(h.type))}</span>
        <span class="text-sm truncate flex-1 font-mono">${escapeHtml(h.value || '(empty)')}</span>
        <div class="w-4 h-4 rounded border border-base-300" style="background-color: ${escapeHtml(h.textColor)}"></div>
        <div class="w-4 h-4 rounded border border-base-300" style="background-color: ${escapeHtml(h.backgroundColor)}"></div>
        ${h.bold ? '<span class="text-xs font-bold">B</span>' : ''}
        ${h.italic ? '<span class="text-xs italic">I</span>' : ''}
        ${h.underline ? '<span class="text-xs underline">U</span>' : ''}
        ${h.ignoreCase ? '<span class="badge badge-xs badge-ghost">Aa</span>' : ''}
      `;
      container.appendChild(item);
    });
    highlightsDetail.appendChild(container);
  }

  if (createdDetail) createdDetail.textContent = formatDate(rule.createdAt);
  if (updatedDetail) updatedDetail.textContent = formatDate(rule.updatedAt);

  ruleDetails.hidden = false;
}

/**
 * Edit rule.
 * @param {string} ruleId
 */
function editRule(ruleId) {
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule) return;

  // Populate patterns
  currentPatterns = [...rule.patterns];
  renderPatternsChips();

  // Populate highlights
  currentHighlights = rule.highlights.map((h) => ({ ...h }));
  expandedHighlights.clear();
  if (currentHighlights.length > 0) {
    expandedHighlights.add(currentHighlights[0].id);
  }
  renderHighlightsAccordion();

  if (saveButton) saveButton.textContent = 'Update rule';
  if (cancelEditButton) cancelEditButton.hidden = false;
  editingRuleId = ruleId;

  // Scroll to form
  if (form) {
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/**
 * Delete rule.
 * @param {string} ruleId
 */
async function deleteRule(ruleId) {
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule) return;

  const patternPreview = rule.patterns.length === 1
    ? rule.patterns[0]
    : `${rule.patterns[0]} (+${rule.patterns.length - 1} more)`;
  const confirmed = window.confirm(`Delete rule for pattern "${patternPreview}"?`);
  if (!confirmed) return;

  try {
    rules = rules.filter((r) => r.id !== ruleId);
    await saveRules(rules);
    renderRulesList();

    // Hide details if showing deleted rule
    if (ruleDetails) {
      ruleDetails.hidden = true;
    }
  } catch (error) {
    console.warn('[highlightText] Failed to delete rule:', error);
    alert('Failed to delete rule. Please try again.');
  }
}

/**
 * Handle form submission.
 * @param {Event} event
 */
async function handleFormSubmit(event) {
  event.preventDefault();

  const error = validateForm();
  if (error) {
    if (formError) {
      formError.textContent = error;
      formError.hidden = false;
    }
    return;
  }

  try {
    if (editingRuleId) {
      // Update existing rule
      const ruleIndex = rules.findIndex((r) => r.id === editingRuleId);
      if (ruleIndex !== -1) {
        rules[ruleIndex] = /** @type {HighlightTextRuleSettings} */ ({
          ...rules[ruleIndex],
          patterns: [...currentPatterns],
          highlights: currentHighlights.map((h) => ({ ...h })),
          updatedAt: new Date().toISOString(),
        });
      }
    } else {
      // Add new rule
      const newRule = /** @type {HighlightTextRuleSettings} */ ({
        id: generateRuleId(),
        patterns: [...currentPatterns],
        highlights: currentHighlights.map((h) => ({ ...h })),
        createdAt: new Date().toISOString(),
      });
      rules.push(newRule);
    }

    await saveRules(rules);
    renderRulesList();
    clearForm();
  } catch (error) {
    console.warn('[highlightText] Failed to save rule:', error);
    alert('Failed to save rule. Please try again.');
  }
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize highlight text functionality.
 */
async function initHighlightText() {
  if (!form || !patternInput || !patternsChipsContainer || !highlightsAccordion) {
    console.warn('[highlightText] Required form elements not found');
    return;
  }

  // Load existing rules
  rules = await loadRules();
  renderRulesList();

  // Initialize form with default state
  clearForm();

  // Set up form event listeners
  form.addEventListener('submit', handleFormSubmit);

  if (addPatternBtn) {
    addPatternBtn.addEventListener('click', handleAddPattern);
  }

  if (patternInput) {
    patternInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddPattern();
      }
    });
    patternInput.addEventListener('input', () => {
      if (patternError) patternError.hidden = true;
    });
  }

  if (addHighlightBtn) {
    addHighlightBtn.addEventListener('click', handleAddHighlight);
  }

  if (cancelEditButton) {
    cancelEditButton.addEventListener('click', () => {
      clearForm();
    });
  }

  // Listen for storage changes to update UI when options are restored/imported
  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(changes, HIGHLIGHT_TEXT_RULES_KEY)) {
        return;
      }
      void (async () => {
        rules = await loadRules();
        renderRulesList();
        // Clear selection if selected rule no longer exists
        if (editingRuleId && !rules.find((r) => r.id === editingRuleId)) {
          editingRuleId = null;
          clearForm();
        }
      })();
    });
  }
}

/**
 * Check for prefilled URL from popup and set it in the pattern input.
 * @returns {Promise<void>}
 */
async function checkForPrefillUrl() {
  try {
    const stored = await chrome.storage.local.get('highlightTextPrefillUrl');
    const prefillUrl = stored?.highlightTextPrefillUrl;
    if (!prefillUrl || typeof prefillUrl !== 'string') {
      return;
    }

    // Clear the prefilled URL from storage
    await chrome.storage.local.remove('highlightTextPrefillUrl');

    // Wait for navigation manager to be available
    let attempts = 0;
    while (!window.navigationManager && attempts < 50) {
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
      attempts++;
    }

    // Navigate to highlight text section
    if (window.location.hash !== '#highlight-text-heading') {
      window.location.hash = '#highlight-text-heading';
    }

    // Show the highlight text section if navigation manager is available
    if (window.navigationManager) {
      window.navigationManager.showSection('highlight-text-heading');
    }

    // Wait a bit more for the section to be visible
    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });

    // Add the prefill URL as the first pattern
    currentPatterns.push(prefillUrl);
    renderPatternsChips();

    if (patternInput) {
      patternInput.focus();
    }
  } catch (error) {
    console.warn('[highlightText] Failed to check for prefill URL:', error);
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  void initHighlightText();
  void checkForPrefillUrl();
});

// Export for use in other modules
export { loadRules, saveRules };
