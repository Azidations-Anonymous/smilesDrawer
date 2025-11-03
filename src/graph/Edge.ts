import { BondType, WedgeType } from '../types/CommonTypes';

/**
 * A class representing an edge.
 *
 * @property {Number} id The id of this edge.
 * @property {Number} sourceId The id of the source vertex.
 * @property {Number} targetId The id of the target vertex.
 * @property {Number} weight The weight of this edge. That is, the degree of the bond (single bond = 1, double bond = 2, etc).
 * @property {String} [bondType='-'] The bond type of this edge.
 * @property {Boolean} [isPartOfAromaticRing=false] Whether or not this edge is part of an aromatic ring.
 * @property {Boolean} [center=false] Wheter or not the bond is centered. For example, this affects straight double bonds.
 * @property {String} [wedge=''] Wedge direction. Either '', 'up' or 'down'
 */
class Edge {
    id: number | null;
    sourceId: number;
    targetId: number;
    weight: number;
    bondType: BondType;
    isPartOfAromaticRing: boolean;
    center: boolean;
    wedge: WedgeType;

    /**
     * The constructor for the class Edge.
     *
     * @param {Number} sourceId A vertex id.
     * @param {Number} targetId A vertex id.
     * @param {Number} [weight=1] The weight of the edge.
     */
    constructor(sourceId: number, targetId: number, weight: number = 1) {
        this.id = null;
        this.sourceId = sourceId;
        this.targetId = targetId;
        this.weight = weight;
        this.bondType = '-';
        this.isPartOfAromaticRing = false;
        this.center = false;
        this.wedge = '';
    }

    /**
     * Set the bond type of this edge. This also sets the edge weight.
     * @param {String} bondType
     */
    setBondType(bondType: BondType): void {
      this.bondType = bondType;
      this.weight = Edge.bonds[bondType];
    }

    /**
     * An object mapping the bond type to the number of bonds.
     *
     * @returns {Object} The object containing the map.
     */
    static get bonds(): Record<string, number> {
        return {
            '.': 0,
            '-': 1,
            '/': 1,
            '\\': 1,
            '=': 2,
            '#': 3,
            '$': 4
        }
    }
}

export = Edge;
