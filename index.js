'use strict';
const noBoundaryViolation = require('./rules/no-boundary-violation');

module.exports = {
  rules: {
    'no-boundary-violation': noBoundaryViolation,
  },
};
