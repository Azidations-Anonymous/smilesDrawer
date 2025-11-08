const BASE_MOLECULE_OPTIONS = Object.freeze({});

function createMoleculeOptions(overrides = {}) {
    return Object.assign({}, BASE_MOLECULE_OPTIONS, overrides);
}

module.exports = {
    BASE_MOLECULE_OPTIONS,
    createMoleculeOptions,
};
