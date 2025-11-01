import Reaction = require('./Reaction');

class ReactionParser {
    /**
     * Parses a reaction SMILES string and returns a Reaction object.
     *
     * @param {String} reactionSmiles A reaction SMILES.
     * @returns {Reaction} A reaction object.
     */
    static parse(reactionSmiles: string): Reaction {
        let reaction = new Reaction(reactionSmiles);

        return reaction;
    }
}

export = ReactionParser;