'use strict';
const noBoundaryViolation = require('./rules/no-boundary-violation');
const noSiblingCycle = require('./rules/no-sibling-cycle');

module.exports = {
  rules: {
    'no-boundary-violation': noBoundaryViolation,
    'no-sibling-cycle': noSiblingCycle,
  },
};
