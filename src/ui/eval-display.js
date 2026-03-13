import { shapeString } from '../engine/evaluate.js';

/**
 * @typedef {import('../engine/evaluate.js').Evaluation} Evaluation
 */

const SHAPE_LABELS = /** @type {const} */ ({
  'balanced': 'Balanced',
  'semi-balanced': 'Semi-balanced',
  'unbalanced': 'Unbalanced',
});

/**
 * Render hand evaluation into the given container.
 * @param {Evaluation} evaluation
 * @param {HTMLElement} container
 */
export function renderEval(evaluation, container) {
  container.innerHTML = '';
  container.classList.add('eval-display');

  container.appendChild(
    statRow('HCP', String(evaluation.hcp)),
  );
  container.appendChild(
    statRow('Short-suit pts', String(evaluation.shortPoints)),
  );
  container.appendChild(
    statRow('Long-suit pts', String(evaluation.longPoints)),
  );
  container.appendChild(
    statRow('Total pts', String(evaluation.totalPoints)),
  );
  container.appendChild(
    statRow('Shape', shapeString(evaluation.shape)),
  );
  container.appendChild(
    statRow('Type', SHAPE_LABELS[evaluation.shapeClass]),
  );
}

/**
 * @param {string} label
 * @param {string} value
 * @returns {HTMLElement}
 */
function statRow(label, value) {
  const row = document.createElement('div');
  row.className = 'eval-row';

  const labelEl = document.createElement('span');
  labelEl.className = 'eval-label';
  labelEl.textContent = label;
  row.appendChild(labelEl);

  const valueEl = document.createElement('span');
  valueEl.className = 'eval-value';
  valueEl.textContent = value;
  row.appendChild(valueEl);

  return row;
}
