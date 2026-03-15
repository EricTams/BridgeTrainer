import { deal, SEATS } from '../model/deal.js';
import { classifyDeal, SCENARIO_IDS } from './classify.js';

/**
 * @typedef {import('../model/deal.js').Deal} Deal
 * @typedef {import('../model/deal.js').Seat} Seat
 * @typedef {import('../model/bid.js').Auction} Auction
 * @typedef {import('./classify.js').ScenarioTag} ScenarioTag
 *
 * @typedef {{
 *   hands: Deal,
 *   dealer: Seat,
 *   fullAuction: Auction,
 *   tags: ScenarioTag[],
 * }} ClassifiedDeal
 */

/**
 * Pool of pre-classified deals bucketed by scenario ID.
 * A single deal may appear in multiple buckets when it triggers
 * several scenarios (possibly at different seats).
 */
export class Pool {
  constructor() {
    /** @type {Map<string, ClassifiedDeal[]>} */
    this.buckets = new Map();
    for (const id of SCENARIO_IDS) this.buckets.set(id, []);
    this.built = false;
    this.totalClassified = 0;
  }

  /**
   * Deal and classify `size` hands, storing results in scenario buckets.
   * @param {number} [size]
   */
  build(size = 5000) {
    this._generateBatch(size);
    this.built = true;
  }

  /**
   * Pick and remove a random deal from the given scenario bucket.
   * @param {string} scenarioId
   * @returns {ClassifiedDeal | null}
   */
  selectDeal(scenarioId) {
    const bucket = this.buckets.get(scenarioId);
    if (!bucket || bucket.length === 0) return null;
    const idx = Math.floor(Math.random() * bucket.length);
    return bucket.splice(idx, 1)[0];
  }

  /**
   * If the total number of available entries across all buckets drops
   * below `threshold`, generate a fresh batch to top up the pool.
   * @param {number} [threshold]
   * @param {number} [batchSize]
   */
  refill(threshold = 500, batchSize = 1000) {
    let total = 0;
    for (const [, arr] of this.buckets) total += arr.length;
    if (total < threshold) this._generateBatch(batchSize);
  }

  /**
   * Map of scenario ID → current bucket size.
   * @returns {Map<string, number>}
   */
  bucketSizes() {
    const sizes = new Map();
    for (const [id, arr] of this.buckets) sizes.set(id, arr.length);
    return sizes;
  }

  /**
   * Scenario IDs that currently have at least one deal available.
   * @returns {string[]}
   */
  availableScenarios() {
    return [...this.buckets.entries()]
      .filter(([, arr]) => arr.length > 0)
      .map(([id]) => id);
  }

  /**
   * @param {number} count
   * @private
   */
  _generateBatch(count) {
    for (let i = 0; i < count; i++) {
      const hands = deal();
      /** @type {Seat} */
      const dealer = SEATS[Math.floor(Math.random() * SEATS.length)];
      const { fullAuction, tags } = classifyDeal(hands, dealer);
      if (tags.length === 0) continue;

      this.totalClassified++;
      /** @type {ClassifiedDeal} */
      const cd = { hands, dealer, fullAuction, tags };

      for (const tag of tags) {
        const bucket = this.buckets.get(tag.id);
        if (bucket) bucket.push(cd);
      }
    }
  }
}
