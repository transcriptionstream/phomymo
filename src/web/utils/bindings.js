/**
 * Event Binding Helpers
 * Reusable functions to eliminate copy-paste event handlers
 */

import {
  validateWidth,
  validateHeight,
  validateRotation,
  validatePosition,
} from './validation.js';

// DOM helpers
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

/**
 * Bind a checkbox to an element property
 * @param {string} selector - CSS selector for the checkbox
 * @param {string} property - Element property to set
 * @param {string} elementType - Element type this applies to ('text', 'image', etc.)
 * @param {Object} ctx - Context with getSelected, modifyElement
 */
export function bindCheckbox(selector, property, elementType, ctx) {
  const el = $(selector);
  if (!el) {
    console.warn(`bindCheckbox: Element not found: ${selector}`);
    return;
  }

  el.addEventListener('change', (e) => {
    const selected = ctx.getSelected();
    if (selected && selected.type === elementType) {
      ctx.modifyElement(selected.id, { [property]: e.target.checked });
    }
  });
}

/**
 * Bind a toggle button that switches between two values
 * @param {string} selector - CSS selector for the button
 * @param {string} property - Element property to toggle
 * @param {string} elementType - Element type this applies to
 * @param {Object} ctx - Context with getSelected, modifyElement
 * @param {Object} options - { onValue, offValue } defaults to { onValue: property-specific, offValue: 'normal'/'none' }
 */
export function bindToggleButton(selector, property, elementType, ctx, options = {}) {
  const el = $(selector);
  if (!el) {
    console.warn(`bindToggleButton: Element not found: ${selector}`);
    return;
  }

  // Determine on/off values based on property type
  const defaults = {
    fontWeight: { onValue: 'bold', offValue: 'normal' },
    fontStyle: { onValue: 'italic', offValue: 'normal' },
    textDecoration: { onValue: 'underline', offValue: 'none' },
  };

  const { onValue, offValue } = options.onValue
    ? options
    : (defaults[property] || { onValue: true, offValue: false });

  el.addEventListener('click', () => {
    const selected = ctx.getSelected();
    if (selected && selected.type === elementType) {
      const currentValue = selected[property];
      const newValue = currentValue === onValue ? offValue : onValue;
      ctx.modifyElement(selected.id, { [property]: newValue });

      // Update button visual state
      el.classList.toggle('active', newValue === onValue);
      el.classList.toggle('bg-gray-100', newValue === onValue);
    }
  });
}

/**
 * Bind a group of buttons where one is selected at a time
 * @param {string} selector - CSS selector for all buttons in the group (e.g., '.bg-btn')
 * @param {string} property - Element property to set
 * @param {string} dataAttr - Data attribute containing the value (e.g., 'bg' for data-bg)
 * @param {string} elementType - Element type this applies to
 * @param {Object} ctx - Context with getSelected, modifyElement
 */
export function bindButtonGroup(selector, property, dataAttr, elementType, ctx) {
  const buttons = $$(selector);
  if (!buttons.length) {
    console.warn(`bindButtonGroup: No elements found: ${selector}`);
    return;
  }

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const selected = ctx.getSelected();
      if (selected && selected.type === elementType) {
        const value = btn.dataset[dataAttr];
        ctx.modifyElement(selected.id, { [property]: value });

        // Update button states
        buttons.forEach(b => {
          const isActive = b === btn;
          b.classList.toggle('bg-gray-100', isActive);
          b.classList.toggle('ring-2', isActive);
          b.classList.toggle('ring-blue-400', isActive);
        });
      }
    });
  });
}

/**
 * Bind a select dropdown to an element property
 * @param {string} selector - CSS selector for the select
 * @param {string} property - Element property to set
 * @param {string} elementType - Element type this applies to
 * @param {Object} ctx - Context with getSelected, modifyElement
 * @param {Function} onChange - Optional callback after change
 */
export function bindSelect(selector, property, elementType, ctx, onChange = null) {
  const el = $(selector);
  if (!el) {
    console.warn(`bindSelect: Element not found: ${selector}`);
    return;
  }

  el.addEventListener('change', (e) => {
    const selected = ctx.getSelected();
    if (selected && selected.type === elementType) {
      ctx.modifyElement(selected.id, { [property]: e.target.value });
      if (onChange) onChange(e.target.value, selected);
    }
  });
}

/**
 * Bind a numeric input with min/max validation
 * @param {string} selector - CSS selector for the input
 * @param {string} property - Element property to set
 * @param {string} elementType - Element type this applies to
 * @param {Object} ctx - Context with getSelected, modifyElement
 * @param {Object} constraints - { min, max, defaultVal, parser }
 */
export function bindNumericInput(selector, property, elementType, ctx, constraints = {}) {
  const el = $(selector);
  if (!el) {
    console.warn(`bindNumericInput: Element not found: ${selector}`);
    return;
  }

  const { min = 0, max = Infinity, defaultVal = 0, parser = parseInt } = constraints;

  el.addEventListener('input', (e) => {
    const selected = ctx.getSelected();
    if (selected && selected.type === elementType) {
      let value = parser(e.target.value);
      if (isNaN(value)) value = defaultVal;
      value = Math.max(min, Math.min(max, value));
      ctx.modifyElement(selected.id, { [property]: value });
    }
  });
}

/**
 * Bind a slider with optional display element
 * @param {string} sliderSelector - CSS selector for the slider input
 * @param {string} displaySelector - CSS selector for the value display (optional)
 * @param {Function} onChange - Callback with (value, selected, ctx)
 * @param {string} elementType - Element type this applies to
 * @param {Object} ctx - Context with getSelected, modifyElement
 * @param {Object} options - { suffix: '%', parser: parseInt }
 */
export function bindSlider(sliderSelector, displaySelector, onChange, elementType, ctx, options = {}) {
  const slider = $(sliderSelector);
  const display = displaySelector ? $(displaySelector) : null;

  if (!slider) {
    console.warn(`bindSlider: Slider not found: ${sliderSelector}`);
    return;
  }

  const { suffix = '', parser = parseInt } = options;

  slider.addEventListener('input', (e) => {
    const selected = ctx.getSelected();
    if (selected && selected.type === elementType) {
      const value = parser(e.target.value);
      onChange(value, selected, ctx);
      if (display) {
        display.textContent = `${value}${suffix}`;
      }
    }
  });
}

/**
 * Bind position/dimension inputs (x, y, width, height, rotation)
 * @param {Object} selectors - { x, y, width, height, rotation }
 * @param {Object} ctx - Context with getSelected, modifyElement
 * @param {Object} constraints - { maxWidth, maxHeight, minWidth, minHeight } for bounds
 */
export function bindPositionInputs(selectors, ctx, constraints = {}) {
  const {
    maxWidth = 1000,
    maxHeight = 1000,
    minWidth = 10,
    minHeight = 10,
  } = constraints;

  if (selectors.x) {
    $(selectors.x)?.addEventListener('change', (e) => {
      const id = ctx.getSelectedId();
      if (id) ctx.modifyElement(id, { x: validatePosition(e.target.value, maxWidth) });
    });
  }

  if (selectors.y) {
    $(selectors.y)?.addEventListener('change', (e) => {
      const id = ctx.getSelectedId();
      if (id) ctx.modifyElement(id, { y: validatePosition(e.target.value, maxHeight) });
    });
  }

  if (selectors.width) {
    $(selectors.width)?.addEventListener('change', (e) => {
      const id = ctx.getSelectedId();
      // Use minWidth constraint for minimum dimension
      if (id) ctx.modifyElement(id, { width: Math.max(minWidth, validateWidth(e.target.value, maxWidth)) });
    });
  }

  if (selectors.height) {
    $(selectors.height)?.addEventListener('change', (e) => {
      const id = ctx.getSelectedId();
      // Use minHeight constraint for minimum dimension
      if (id) ctx.modifyElement(id, { height: Math.max(minHeight, validateHeight(e.target.value, maxHeight)) });
    });
  }

  if (selectors.rotation) {
    $(selectors.rotation)?.addEventListener('change', (e) => {
      const id = ctx.getSelectedId();
      if (id) ctx.modifyElement(id, { rotation: validateRotation(e.target.value) });
    });
  }
}

/**
 * Bind alignment buttons (left, center, right)
 * @param {string} selector - CSS selector for all align buttons (e.g., '.align-btn')
 * @param {string} property - Property to set (e.g., 'textAlign')
 * @param {string} dataAttr - Data attribute with value (e.g., 'align')
 * @param {string} elementType - Element type this applies to
 * @param {Object} ctx - Context with getSelected, modifyElement
 */
export function bindAlignButtons(selector, property, dataAttr, elementType, ctx) {
  const buttons = $$(selector);
  if (!buttons.length) {
    console.warn(`bindAlignButtons: No elements found: ${selector}`);
    return;
  }

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const selected = ctx.getSelected();
      if (selected && selected.type === elementType) {
        const value = btn.dataset[dataAttr];
        ctx.modifyElement(selected.id, { [property]: value });

        // Update button states
        buttons.forEach(b => {
          b.classList.toggle('bg-blue-100', b === btn);
        });
      }
    });
  });
}

/**
 * Create a binding context from app state and functions
 * @param {Object} state - App state object
 * @param {Function} getSelected - Function to get selected element
 * @param {Function} modifyElement - Function to modify an element
 * @returns {Object} Context object for binding functions
 */
export function createBindingContext(state, getSelected, modifyElement) {
  return {
    state,
    getSelected,
    modifyElement,
    getSelectedId: () => state.selectedIds[0] || null,
  };
}

/**
 * Initialize all property panel bindings
 * @param {Object} ctx - Binding context
 */
export function initPropertyBindings(ctx) {
  // This function will be called from app.js to set up all the bindings
  // The actual bindings are defined in app.js using the helper functions above
}

/**
 * Update visual state of toggle buttons based on element properties
 * @param {Object} element - The selected element
 * @param {Object} buttonMap - Map of { selector: { property, onValue } }
 */
export function updateToggleButtonStates(element, buttonMap) {
  for (const [selector, config] of Object.entries(buttonMap)) {
    const btn = $(selector);
    if (btn) {
      const isActive = element[config.property] === config.onValue;
      btn.classList.toggle('active', isActive);
      btn.classList.toggle('bg-gray-100', isActive);
    }
  }
}

/**
 * Update visual state of button group based on element property
 * @param {string} selector - CSS selector for all buttons
 * @param {Object} element - The selected element
 * @param {string} property - Property to check
 * @param {string} dataAttr - Data attribute containing value
 */
export function updateButtonGroupState(selector, element, property, dataAttr) {
  const buttons = $$(selector);
  const currentValue = element[property];

  buttons.forEach(btn => {
    const isActive = btn.dataset[dataAttr] === currentValue;
    btn.classList.toggle('bg-gray-100', isActive);
    btn.classList.toggle('ring-2', isActive);
    btn.classList.toggle('ring-blue-400', isActive);
  });
}
