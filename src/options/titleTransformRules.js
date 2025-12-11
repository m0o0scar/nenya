/* global chrome, URLPattern */

/**
 * @typedef {'remove' | 'replace' | 'prefix' | 'suffix'} TitleTransformOperationType
 */

/**
 * @typedef {Object} TitleTransformOperation
 * @property {string} id
 * @property {TitleTransformOperationType} type
 * @property {string} [pattern] - Regex pattern for remove/replace operations
 * @property {string} [value] - Replacement value for replace, or text for prefix/suffix
 */

/**
 * @typedef {Object} TitleTransformRule
 * @property {string} id
 * @property {string} name
 * @property {string[]} urlPatterns
 * @property {TitleTransformOperation[]} operations
 * @property {boolean | undefined} disabled
 * @property {string | undefined} createdAt
 * @property {string | undefined} updatedAt
 */

const STORAGE_KEY = 'titleTransformRules';

const form = /** @type {HTMLFormElement | null} */ (
  document.getElementById('titleTransformRuleForm')
);
const nameInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('titleTransformRuleNameInput')
);
const saveButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('titleTransformRuleSaveButton')
);
const cancelButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('titleTransformRuleCancelEditButton')
);
const formError = /** @type {HTMLParagraphElement | null} */ (
  document.getElementById('titleTransformRuleFormError')
);
const emptyState = /** @type {HTMLDivElement | null} */ (
  document.getElementById('titleTransformRulesEmpty')
);
const listElement = /** @type {HTMLDivElement | null} */ (
  document.getElementById('titleTransformRulesList')
);
const detailsPanel = /** @type {HTMLDivElement | null} */ (
  document.getElementById('titleTransformRuleDetails')
);
const detailName = /** @type {HTMLElement | null} */ (
  document.getElementById('titleTransformRuleDetailName')
);
const detailPatterns = /** @type {HTMLElement | null} */ (
  document.getElementById('titleTransformRuleDetailPatterns')
);
const detailOperations = /** @type {HTMLElement | null} */ (
  document.getElementById('titleTransformRuleDetailOperations')
);
const detailCreated = /** @type {HTMLElement | null} */ (
  document.getElementById('titleTransformRuleDetailCreated')
);
const detailUpdated = /** @type {HTMLElement | null} */ (
  document.getElementById('titleTransformRuleDetailUpdated')
);
const patternsList = /** @type {HTMLDivElement | null} */ (
  document.getElementById('titleTransformRulePatternsList')
);
const addPatternInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('titleTransformRuleAddPatternInput')
);
const addPatternButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('titleTransformRuleAddPatternButton')
);
const operationsList = /** @type {HTMLDivElement | null} */ (
  document.getElementById('titleTransformRuleOperationsList')
);
const operationTypeSelect = /** @type {HTMLSelectElement | null} */ (
  document.getElementById('titleTransformRuleOperationTypeSelect')
);
const operationPatternInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('titleTransformRuleOperationPatternInput')
);
const operationValueInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById('titleTransformRuleOperationValueInput')
);
const addOperationButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('titleTransformRuleAddOperationButton')
);

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** @type {TitleTransformRule[]} */
let rules = [];
let selectedRuleId = '';
let editingRuleId = '';
let syncing = false;
let editingPatterns = [];
let editingOperations = [];

/**
 * Generate a unique identifier for new rules.
 * @returns {string}
 */
function generateRuleId() {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  return 'rule-' + Date.now().toString(36) + '-' + random;
}

/**
 * Generate a unique identifier for operations.
 * @returns {string}
 */
function generateOperationId() {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  return 'op-' + Date.now().toString(36) + '-' + random;
}

/**
 * Create a deep copy of the provided rules and sort them for consistent rendering.
 * @param {TitleTransformRule[]} collection
 * @returns {TitleTransformRule[]}
 */
function sortRules(collection) {
  return [...collection].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Validate URL pattern using URLPattern API.
 * @param {string} pattern
 * @returns {boolean}
 */
function isValidUrlPattern(pattern) {
  if (!pattern || typeof pattern !== 'string') {
    return false;
  }

  const trimmedPattern = pattern.trim();
  if (!trimmedPattern) {
    return false;
  }

  try {
    // Use URL Pattern API for robust validation
    if (trimmedPattern.includes('://')) {
      // Full URL pattern
      new URLPattern(trimmedPattern);
    } else if (trimmedPattern.startsWith('/')) {
      // Pathname pattern
      new URLPattern({ pathname: trimmedPattern });
    } else if (trimmedPattern.includes('*') || trimmedPattern.includes(':')) {
      // Pattern with wildcards or named groups - treat as pathname
      new URLPattern({ pathname: '/' + trimmedPattern });
    } else {
      // Domain or hostname pattern
      new URLPattern({ hostname: trimmedPattern });
    }
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
  if (!pattern || typeof pattern !== 'string') {
    return false;
  }
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalize possibly partial rule data read from storage.
 * @param {unknown} value
 * @returns {{ rules: TitleTransformRule[], mutated: boolean }}
 */
function normalizeRules(value) {
  const sanitized = [];
  let mutated = false;
  const originalLength = Array.isArray(value) ? value.length : 0;

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const raw =
        /** @type {{ id?: unknown, name?: unknown, urlPatterns?: unknown, operations?: unknown, disabled?: unknown, createdAt?: unknown, updatedAt?: unknown }} */ (
          entry
        );
      const name =
        typeof raw.name === 'string' ? raw.name.trim() : '';
      if (!name) {
        return;
      }

      const urlPatterns = Array.isArray(raw.urlPatterns)
        ? raw.urlPatterns
            .map((p) => (typeof p === 'string' ? p.trim() : ''))
            .filter((p) => p && isValidUrlPattern(p))
        : [];
      if (urlPatterns.length === 0) {
        return;
      }

      const operations = Array.isArray(raw.operations)
        ? raw.operations
            .map((op) => {
              if (!op || typeof op !== 'object') {
                return null;
              }
              const opRaw =
                /** @type {{ id?: unknown, type?: unknown, pattern?: unknown, value?: unknown }} */ (
                  op
                );
              const type = opRaw.type;
              if (
                typeof type !== 'string' ||
                !['remove', 'replace', 'prefix', 'suffix'].includes(type)
              ) {
                return null;
              }

              const opId =
                typeof opRaw.id === 'string' && opRaw.id.trim()
                  ? opRaw.id.trim()
                  : generateOperationId();

              /** @type {TitleTransformOperation} */
              const operation = {
                id: opId,
                type: /** @type {TitleTransformOperationType} */ (type),
              };

              // For remove and replace, pattern is required
              if (type === 'remove' || type === 'replace') {
                const pattern =
                  typeof opRaw.pattern === 'string' ? opRaw.pattern.trim() : '';
                if (!pattern) {
                  return null;
                }
                // Validate regex if it looks like one (wrapped in slashes)
                if (pattern.startsWith('/') && pattern.endsWith('/')) {
                  const regexPattern = pattern.slice(1, -1);
                  if (!isValidRegex(regexPattern)) {
                    return null;
                  }
                } else if (!isValidRegex(pattern)) {
                  // Try validating as regex even without slashes
                  return null;
                }
                operation.pattern = pattern;
                // For replace, value is optional (defaults to empty string)
                if (type === 'replace') {
                  operation.value =
                    typeof opRaw.value === 'string' ? opRaw.value : '';
                }
              } else {
                // For prefix and suffix, value is required
                const value =
                  typeof opRaw.value === 'string' ? opRaw.value : '';
                if (!value) {
                  return null;
                }
                operation.value = value;
              }

              return operation;
            })
            .filter((op) => op !== null)
        : [];
      if (operations.length === 0) {
        return;
      }

      const id =
        typeof raw.id === 'string' && raw.id.trim()
          ? raw.id.trim()
          : generateRuleId();
      if (!id) {
        mutated = true;
      }

      /** @type {TitleTransformRule} */
      const normalized = {
        id,
        name,
        urlPatterns,
        operations,
        disabled: !!raw.disabled,
      };

      if (typeof raw.createdAt === 'string') {
        normalized.createdAt = raw.createdAt;
      }
      if (typeof raw.updatedAt === 'string') {
        normalized.updatedAt = raw.updatedAt;
      }

      sanitized.push(normalized);
    });
  }

  const sorted = sortRules(sanitized);
  if (!mutated && sanitized.length !== originalLength) {
    mutated = true;
  }
  return { rules: sorted, mutated };
}

/**
 * Load rules from storage and update the UI.
 * @returns {Promise<void>}
 */
async function loadAndRenderRules() {
  if (syncing) {
    return;
  }
  syncing = true;

  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const { rules: sanitized, mutated } = normalizeRules(
      result?.[STORAGE_KEY],
    );
    if (mutated) {
      await chrome.storage.local.set({
        [STORAGE_KEY]: sanitized,
      });
    }
    rules = sanitized;
    render();
  } catch (error) {
    console.error('[titleTransformRules] Failed to load rules:', error);
    if (formError) {
      formError.textContent =
        'Failed to load rules. Please refresh the page.';
      formError.hidden = false;
    }
  } finally {
    syncing = false;
  }
}

/**
 * Render the rules list and details panel.
 * @returns {void}
 */
function render() {
  if (!listElement || !emptyState) {
    return;
  }

  if (rules.length === 0) {
    listElement.innerHTML = '';
    emptyState.hidden = false;
    if (detailsPanel) {
      detailsPanel.hidden = true;
    }
    return;
  }

  emptyState.hidden = true;
  listElement.textContent = '';

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

    const name = document.createElement('p');
    name.className = 'font-medium text-base-content truncate';
    name.textContent = rule.name;
    info.appendChild(name);

    const summary = document.createElement('p');
    summary.className = 'text-sm text-base-content/70';
    summary.textContent = rule.urlPatterns.length + ' pattern' + (rule.urlPatterns.length !== 1 ? 's' : '') + ', ' + rule.operations.length + ' operation' + (rule.operations.length !== 1 ? 's' : '');
    info.appendChild(summary);

    container.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'flex flex-wrap gap-2';

    const viewButton = document.createElement('button');
    viewButton.type = 'button';
    viewButton.className = 'btn btn-sm btn-ghost';
    viewButton.textContent = 'View';
    viewButton.addEventListener('click', () => {
      selectedRuleId = rule.id;
      renderDetails(rule.id);
      render();
    });
    actions.appendChild(viewButton);

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'btn btn-sm btn-outline';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => {
      startEdit(rule.id);
    });
    actions.appendChild(editButton);

    const deleteButtonEl = document.createElement('button');
    deleteButtonEl.type = 'button';
    deleteButtonEl.className = 'btn btn-sm btn-error btn-outline';
    deleteButtonEl.textContent = 'Delete';
    deleteButtonEl.addEventListener('click', () => {
      void deleteRule(rule.id);
    });
    actions.appendChild(deleteButtonEl);

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
      void (async () => {
        syncing = true;
        try {
          await chrome.storage.local.set({ [STORAGE_KEY]: rules });
          render();
        } catch (error) {
          console.error('[titleTransformRules] Failed to save rule:', error);
        } finally {
          syncing = false;
        }
      })();
    });
    toggleContainer.appendChild(toggle);
    actions.appendChild(toggleContainer);

    container.appendChild(actions);
    listElement.appendChild(container);
  });

  if (selectedRuleId) {
    const ruleExists = rules.some((r) => r.id === selectedRuleId);
    if (ruleExists) {
      renderDetails(selectedRuleId);
    } else {
      selectedRuleId = '';
      if (detailsPanel) {
        detailsPanel.hidden = true;
      }
    }
  } else if (detailsPanel) {
    detailsPanel.hidden = true;
  }
}

/**
 * Render the details panel for a selected rule.
 * @param {string} ruleId
 * @returns {void}
 */
function renderDetails(ruleId) {
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule || !detailsPanel) {
    return;
  }

  detailsPanel.hidden = false;

  if (detailName) {
    detailName.textContent = rule.name;
  }
  if (detailCreated) {
    detailCreated.textContent = rule.createdAt
      ? dateFormatter.format(new Date(rule.createdAt))
      : 'Unknown';
  }
  if (detailUpdated) {
    detailUpdated.textContent = rule.updatedAt
      ? dateFormatter.format(new Date(rule.updatedAt))
      : 'Unknown';
  }

  if (detailPatterns) {
    detailPatterns.innerHTML = rule.urlPatterns
      .map(
        (pattern) => `
      <div class="font-mono text-sm break-words text-base-content">${pattern}</div>
    `,
      )
      .join('');
  }

  if (detailOperations) {
    detailOperations.innerHTML = rule.operations
      .map((operation) => {
        const typeLabel =
          operation.type === 'remove'
            ? 'Remove'
            : operation.type === 'replace'
              ? 'Replace'
              : operation.type === 'prefix'
                ? 'Prefix'
                : 'Suffix';
        const patternDisplay =
          operation.type === 'remove' || operation.type === 'replace'
            ? operation.pattern
              ? `<span class="font-mono">${operation.pattern}</span>`
              : ''
            : '';
        const valueDisplay =
          operation.type === 'replace' || operation.type === 'prefix' || operation.type === 'suffix'
            ? operation.value !== undefined
              ? ` = "${operation.value}"`
              : ''
            : '';
        return `
      <div class="text-sm text-base-content">
        <span class="badge badge-outline">${typeLabel}</span>
        ${patternDisplay}${valueDisplay}
      </div>
    `;
      })
      .join('');
  }
}

/**
 * Clear the form and reset editing state.
 * @returns {void}
 */
function clearForm() {
  editingRuleId = '';
  editingPatterns = [];
  editingOperations = [];

  if (nameInput) {
    nameInput.value = '';
  }
  if (addPatternInput) {
    addPatternInput.value = '';
  }
  if (operationPatternInput) {
    operationPatternInput.value = '';
  }
  if (operationValueInput) {
    operationValueInput.value = '';
  }
  if (operationTypeSelect) {
    operationTypeSelect.value = 'remove';
  }
  if (formError) {
    formError.textContent = '';
    formError.hidden = true;
  }

  updatePatternsList();
  updateOperationsList();
  updateOperationFormVisibility();

  if (saveButton) {
    saveButton.textContent = 'Add rule';
  }
  if (cancelButton) {
    cancelButton.hidden = true;
  }
}

/**
 * Validate the form.
 * @returns {boolean}
 */
function validateForm() {
  if (!nameInput) {
    return false;
  }

  const name = nameInput.value.trim();
  if (!name) {
    if (formError) {
      formError.textContent = 'Rule name is required.';
      formError.hidden = false;
    }
    return false;
  }

  if (editingPatterns.length === 0) {
    if (formError) {
      formError.textContent = 'At least one URL pattern is required.';
      formError.hidden = false;
    }
    return false;
  }

  if (editingOperations.length === 0) {
    if (formError) {
      formError.textContent = 'At least one transform operation is required.';
      formError.hidden = false;
    }
    return false;
  }

  if (formError) {
    formError.textContent = '';
    formError.hidden = true;
  }
  return true;
}

/**
 * Start editing an existing rule.
 * @param {string} ruleId
 * @returns {void}
 */
function startEdit(ruleId) {
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule) {
    return;
  }

  editingRuleId = ruleId;
  selectedRuleId = ruleId;

  if (nameInput) {
    nameInput.value = rule.name;
  }

  editingPatterns = [...rule.urlPatterns];
  editingOperations = rule.operations.map((op) => ({ ...op }));

  updatePatternsList();
  updateOperationsList();
  updateOperationFormVisibility();

  if (saveButton) {
    saveButton.textContent = 'Save changes';
  }
  if (cancelButton) {
    cancelButton.hidden = false;
  }

  render();
  renderDetails(ruleId);
}

/**
 * Delete a rule.
 * @param {string} ruleId
 * @returns {Promise<void>}
 */
async function deleteRule(ruleId) {
  // eslint-disable-next-line no-alert
  if (!confirm('Are you sure you want to delete this rule?')) {
    return;
  }

  if (syncing) {
    return;
  }
  syncing = true;

  try {
    const filtered = rules.filter((r) => r.id !== ruleId);
    await chrome.storage.local.set({
      [STORAGE_KEY]: filtered,
    });
    rules = filtered;

    if (selectedRuleId === ruleId) {
      selectedRuleId = '';
    }
    if (editingRuleId === ruleId) {
      clearForm();
    }

    render();
  } catch (error) {
    console.error('[titleTransformRules] Failed to delete rule:', error);
    if (formError) {
      formError.textContent = 'Failed to delete rule. Please try again.';
      formError.hidden = false;
    }
  } finally {
    syncing = false;
  }
}

/**
 * Handle form submission.
 * @param {Event} event
 * @returns {Promise<void>}
 */
async function handleFormSubmit(event) {
  event.preventDefault();

  if (!validateForm()) {
    return;
  }

  if (syncing) {
    return;
  }
  syncing = true;

  try {
    const name = nameInput?.value.trim() || '';
    const now = new Date().toISOString();

    if (editingRuleId) {
      // Update existing rule
      const index = rules.findIndex((r) => r.id === editingRuleId);
      if (index >= 0) {
        rules[index] = {
          ...rules[index],
          name,
          urlPatterns: [...editingPatterns],
          operations: editingOperations.map((op) => ({ ...op })),
          updatedAt: now,
        };
      }
    } else {
      // Create new rule
      const newRule = {
        id: generateRuleId(),
        name,
        urlPatterns: [...editingPatterns],
        operations: editingOperations.map((op) => ({ ...op })),
        createdAt: now,
        updatedAt: now,
      };
      rules.push(newRule);
      selectedRuleId = newRule.id;
    }

    const sorted = sortRules(rules);
    await chrome.storage.local.set({
      [STORAGE_KEY]: sorted,
    });
    rules = sorted;

    clearForm();
    render();
  } catch (error) {
    console.error('[titleTransformRules] Failed to save rule:', error);
    if (formError) {
      formError.textContent = 'Failed to save rule. Please try again.';
      formError.hidden = false;
    }
  } finally {
    syncing = false;
  }
}

/**
 * Handle cancel edit button.
 * @returns {void}
 */
function handleCancelEdit() {
  clearForm();
  render();
}

/**
 * Add a URL pattern.
 * @returns {void}
 */
function addPattern() {
  if (!addPatternInput) {
    return;
  }

  const pattern = addPatternInput.value.trim();
  if (!pattern) {
    return;
  }

  if (!isValidUrlPattern(pattern)) {
    if (formError) {
      formError.textContent = 'Invalid URL pattern.';
      formError.hidden = false;
    }
    return;
  }

  if (editingPatterns.includes(pattern)) {
    if (formError) {
      formError.textContent = 'Pattern already added.';
      formError.hidden = false;
    }
    return;
  }

  editingPatterns.push(pattern);
  addPatternInput.value = '';
  updatePatternsList();

  if (formError) {
    formError.textContent = '';
    formError.hidden = true;
  }
}

/**
 * Remove a URL pattern.
 * @param {string} pattern
 * @returns {void}
 */
function removePattern(pattern) {
  editingPatterns = editingPatterns.filter((p) => p !== pattern);
  updatePatternsList();
}

/**
 * Update the patterns list display.
 * @returns {void}
 */
function updatePatternsList() {
  if (!patternsList) {
    return;
  }

  if (editingPatterns.length === 0) {
    patternsList.innerHTML =
      '<div class="text-sm text-base-content/70">No patterns added yet.</div>';
    return;
  }

  patternsList.innerHTML = editingPatterns
    .map(
      (pattern) => `
    <div class="flex items-center justify-between gap-2 p-2 rounded border border-base-300 bg-base-200">
      <span class="font-mono text-sm break-words text-base-content flex-1">${pattern}</span>
      <button
        class="btn btn-xs btn-error btn-outline"
        data-remove-pattern="${pattern}"
        type="button"
        aria-label="Remove pattern"
      >
        ❌
      </button>
    </div>
  `,
    )
    .join('');

  patternsList.querySelectorAll('[data-remove-pattern]').forEach((el) => {
    el.addEventListener('click', () => {
      const pattern = el.getAttribute('data-remove-pattern');
      if (pattern) {
        removePattern(pattern);
      }
    });
  });
}

/**
 * Add a transform operation.
 * @returns {void}
 */
function addOperation() {
  if (!operationTypeSelect) {
    return;
  }

  const type = /** @type {TitleTransformOperationType} */ (
    operationTypeSelect.value
  );
  const pattern = operationPatternInput?.value.trim() || '';
  const value = operationValueInput?.value.trim() || '';

  if (type === 'remove' || type === 'replace') {
    if (!pattern) {
      if (formError) {
        formError.textContent = 'Pattern is required for remove/replace operations.';
        formError.hidden = false;
      }
      return;
    }
    // Validate regex
    const regexPattern = pattern.startsWith('/') && pattern.endsWith('/')
      ? pattern.slice(1, -1)
      : pattern;
    if (!isValidRegex(regexPattern)) {
      if (formError) {
        formError.textContent = 'Invalid regex pattern.';
        formError.hidden = false;
      }
      return;
    }
  } else {
    // prefix or suffix
    if (!value) {
      if (formError) {
        formError.textContent = `Value is required for ${type} operation.`;
        formError.hidden = false;
      }
      return;
    }
  }

  const operation = {
    id: generateOperationId(),
    type,
  };

  if (type === 'remove' || type === 'replace') {
    operation.pattern = pattern;
    if (type === 'replace') {
      operation.value = value;
    }
  } else {
    operation.value = value;
  }

  editingOperations.push(operation);

  if (operationPatternInput) {
    operationPatternInput.value = '';
  }
  if (operationValueInput) {
    operationValueInput.value = '';
  }
  updateOperationsList();

  if (formError) {
    formError.textContent = '';
    formError.hidden = true;
  }
}

/**
 * Remove a transform operation.
 * @param {string} operationId
 * @returns {void}
 */
function removeOperation(operationId) {
  editingOperations = editingOperations.filter((op) => op.id !== operationId);
  updateOperationsList();
}

/**
 * Move an operation up in the list.
 * @param {number} index
 * @returns {void}
 */
function moveOperationUp(index) {
  if (index <= 0) {
    return;
  }
  [editingOperations[index - 1], editingOperations[index]] = [
    editingOperations[index],
    editingOperations[index - 1],
  ];
  updateOperationsList();
}

/**
 * Move an operation down in the list.
 * @param {number} index
 * @returns {void}
 */
function moveOperationDown(index) {
  if (index >= editingOperations.length - 1) {
    return;
  }
  [editingOperations[index], editingOperations[index + 1]] = [
    editingOperations[index + 1],
    editingOperations[index],
  ];
  updateOperationsList();
}

/**
 * Update the operations list display.
 * @returns {void}
 */
function updateOperationsList() {
  if (!operationsList) {
    return;
  }

  if (editingOperations.length === 0) {
    operationsList.innerHTML =
      '<div class="text-sm text-base-content/70">No operations added yet.</div>';
    return;
  }

  operationsList.innerHTML = editingOperations
    .map((operation, index) => {
      const typeLabel =
        operation.type === 'remove'
          ? 'Remove'
          : operation.type === 'replace'
            ? 'Replace'
            : operation.type === 'prefix'
              ? 'Prefix'
              : 'Suffix';
      const patternDisplay =
        operation.type === 'remove' || operation.type === 'replace'
          ? operation.pattern
            ? `<span class="font-mono text-sm">${operation.pattern}</span>`
            : ''
          : '';
      const valueDisplay =
        operation.type === 'replace' || operation.type === 'prefix' || operation.type === 'suffix'
          ? operation.value !== undefined
            ? ` = "${operation.value}"`
            : ''
          : '';
      return `
    <div class="flex items-center gap-2 p-2 rounded border border-base-300 bg-base-200">
      <div class="flex gap-1">
        <button
          class="btn btn-xs btn-ghost"
          data-move-up="${index}"
          type="button"
          aria-label="Move up"
          ${index === 0 ? 'disabled' : ''}
        >
          ⬆️
        </button>
        <button
          class="btn btn-xs btn-ghost"
          data-move-down="${index}"
          type="button"
          aria-label="Move down"
          ${index === editingOperations.length - 1 ? 'disabled' : ''}
        >
          ⬇️
        </button>
      </div>
      <div class="flex-1">
        <span class="badge badge-outline">${typeLabel}</span>
        ${patternDisplay}${valueDisplay}
      </div>
      <button
        class="btn btn-xs btn-error btn-outline"
        data-remove-operation="${operation.id}"
        type="button"
        aria-label="Remove operation"
      >
        ❌
      </button>
    </div>
  `;
    })
    .join('');

  operationsList.querySelectorAll('[data-remove-operation]').forEach((el) => {
    el.addEventListener('click', () => {
      const operationId = el.getAttribute('data-remove-operation');
      if (operationId) {
        removeOperation(operationId);
      }
    });
  });

  operationsList.querySelectorAll('[data-move-up]').forEach((el) => {
    el.addEventListener('click', () => {
      const index = Number(el.getAttribute('data-move-up'));
      if (!Number.isNaN(index)) {
        moveOperationUp(index);
      }
    });
  });

  operationsList.querySelectorAll('[data-move-down]').forEach((el) => {
    el.addEventListener('click', () => {
      const index = Number(el.getAttribute('data-move-down'));
      if (!Number.isNaN(index)) {
        moveOperationDown(index);
      }
    });
  });
}

/**
 * Update operation form visibility based on selected type.
 * @returns {void}
 */
function updateOperationFormVisibility() {
  if (!operationTypeSelect) {
    return;
  }

  const type = operationTypeSelect.value;
  const patternContainer = operationPatternInput?.closest('.form-control');
  const valueContainer = operationValueInput?.closest('.form-control');

  if (patternContainer) {
    patternContainer.hidden = type === 'prefix' || type === 'suffix';
  }
  if (valueContainer) {
    valueContainer.hidden = type === 'remove';
  }
}

/**
 * Initialize event listeners and load rules.
 * @returns {void}
 */
function init() {
  if (form) {
    form.addEventListener('submit', (e) => {
      void handleFormSubmit(e);
    });
  }

  if (cancelButton) {
    cancelButton.addEventListener('click', handleCancelEdit);
  }

  if (addPatternButton && addPatternInput) {
    addPatternButton.addEventListener('click', (e) => {
      e.preventDefault();
      addPattern();
    });
    addPatternInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addPattern();
      }
    });
  }

  if (addOperationButton) {
    addOperationButton.addEventListener('click', (e) => {
      e.preventDefault();
      addOperation();
    });
  }

  if (operationTypeSelect) {
    // Set initial visibility
    updateOperationFormVisibility();
    operationTypeSelect.addEventListener('change', () => {
      updateOperationFormVisibility();
    });
  }

  if (operationPatternInput) {
    operationPatternInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addOperation();
      }
    });
  }

  if (operationValueInput) {
    operationValueInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addOperation();
      }
    });
  }

  // Listen for storage changes to update UI when options are restored/imported
  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) {
        return;
      }
      if (syncing) {
        return;
      }
      void (async () => {
        const { rules: sanitized } = normalizeRules(
          changes[STORAGE_KEY]?.newValue,
        );
        rules = sanitized;
        // Clear selection if selected rule no longer exists
        if (selectedRuleId && !rules.some((r) => r.id === selectedRuleId)) {
          selectedRuleId = '';
        }
        // Clear editing state if editing rule no longer exists
        if (editingRuleId && !rules.some((r) => r.id === editingRuleId)) {
          editingRuleId = '';
          editingPatterns = [];
          editingOperations = [];
          clearForm();
        }
        render();
      })();
    });
  }

  void loadAndRenderRules();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/**
 * Load rules from storage (for export/import).
 * @returns {Promise<TitleTransformRule[]>}
 */
export async function loadRules() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const { rules: sanitized } = normalizeRules(result?.[STORAGE_KEY]);
  return sanitized;
}

