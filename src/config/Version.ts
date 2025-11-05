import packageJson = require('../../package.json');

export const POSITION_DATA_VERSION = parseInt(packageJson.version.split('.')[0], 10);
