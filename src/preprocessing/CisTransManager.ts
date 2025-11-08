import MolecularPreprocessor from "./MolecularPreprocessor";
import Edge = require("../graph/Edge");
import Vertex = require("../graph/Vertex");
import Vector2 = require("../graph/Vector2");
import { CisTransOrientation, DirectionalBond } from "../types/CommonTypes";

interface SideResolution {
    anchor: Vertex | null;
    partner: Vertex | null;
    anchorSymbol: DirectionalBond;
    partnerSymbol: DirectionalBond | null;
}

type OrientationActual = 'cis' | 'trans' | 'collinear' | 'undrawn';

interface BondOrientationEvaluation {
    leftAtomId: number;
    rightAtomId: number;
    expected: CisTransOrientation;
    actual: OrientationActual;
}

export interface BondOrientationAnalysis {
    edgeId: number | null;
    isCorrect: boolean;
    evaluations: BondOrientationEvaluation[];
}

interface RingFlipPlan {
    central: Vertex;
    flanking: [Vertex, Vertex];
}

class CisTransManager {
    private drawer: MolecularPreprocessor;
    private fixedStereoBonds: Set<number>;
    private sequenceAssignments: Map<number, number>;

    constructor(drawer: MolecularPreprocessor) {
        this.drawer = drawer;
        this.fixedStereoBonds = new Set<number>();
        this.sequenceAssignments = new Map<number, number>();
    }

    /**
     * Derive cis/trans metadata for every stereochemically-defined double bond.
     */
    buildMetadata(): void {
        if (!this.drawer.graph) {
            return;
        }

        for (const edge of this.drawer.graph.edges) {
            edge.cisTrans = false;
            edge.cisTransNeighbours = {};
            edge.chiralDict = {};
        }

        for (const edge of this.drawer.graph.edges) {
            if (edge.bondType !== '=') {
                continue;
            }

            const mapping = this.resolveCisTrans(edge);
            if (mapping && Object.keys(mapping).length > 0) {
                edge.cisTrans = true;
                this.assignChiralMetadata(edge, mapping);
            }
        }
    }

    correctBondOrientations(): void {
        if (!this.drawer.graph) {
            return;
        }

        this.fixedStereoBonds.clear();

        const sequences = this.findDoubleBondSequences();
        this.assignSequenceIds(sequences);
        for (const sequence of sequences) {
            for (const bond of sequence) {
                this.ensureBondOrientation(bond);
            }
        }

        for (const edge of this.drawer.graph.edges) {
            this.ensureBondOrientation(edge);
        }
    }

    private resolveCisTrans(edge: Edge): Record<number, Record<number, CisTransOrientation>> | null {
        if (!this.drawer.graph) {
            return null;
        }

        const vertexA = this.drawer.graph.vertices[edge.sourceId];
        const vertexB = this.drawer.graph.vertices[edge.targetId];

        const sideA = this.resolveSide(vertexA, vertexB.id);
        const sideB = this.resolveSide(vertexB, vertexA.id);

        if (!sideA || !sideB || !sideA.anchor || !sideB.anchor) {
            return null;
        }

        const sameSymbol = sideA.anchorSymbol === sideB.anchorSymbol;
        const map: Record<number, Record<number, CisTransOrientation>> = {};
        const register = (from: Vertex | null, to: Vertex | null, orientation: CisTransOrientation) => {
            if (!from || !to) {
                return;
            }
            if (!map[from.id]) {
                map[from.id] = {};
            }
            map[from.id][to.id] = orientation;
        };
        const registerBidirectional = (a: Vertex | null, b: Vertex | null, orientation: CisTransOrientation) => {
            register(a, b, orientation);
            register(b, a, orientation);
        };

        if (sameSymbol) {
            registerBidirectional(sideA.anchor, sideB.anchor, 'cis');
            registerBidirectional(sideA.partner, sideB.partner, 'cis');
            registerBidirectional(sideA.anchor, sideB.partner, 'trans');
            registerBidirectional(sideA.partner, sideB.anchor, 'trans');
        } else {
            registerBidirectional(sideA.anchor, sideB.anchor, 'trans');
            registerBidirectional(sideA.partner, sideB.partner, 'trans');
            registerBidirectional(sideA.anchor, sideB.partner, 'cis');
            registerBidirectional(sideA.partner, sideB.anchor, 'cis');
        }

        return Object.keys(map).length > 0 ? map : null;
    }

    private resolveSide(center: Vertex, oppositeId: number): SideResolution | null {
        if (!this.drawer.graph) {
            return null;
        }

        const neighbourIds = center.getNeighbours(oppositeId);
        if (neighbourIds.length === 0) {
            return null;
        }

        const neighbours = neighbourIds.map((id) => this.drawer.graph!.vertices[id]);
        let anchor: Vertex | null = neighbours[0] ?? null;
        let partner: Vertex | null = neighbours[1] ?? null;
        let anchorSymbol = anchor ? this.getRelativeSymbol(center.id, anchor.id) : null;
        let partnerSymbol = partner ? this.getRelativeSymbol(center.id, partner.id) : null;

        if (!anchor && partner) {
            anchor = partner;
            partner = null;
            anchorSymbol = partnerSymbol;
            partnerSymbol = null;
        }

        if (!anchorSymbol && partnerSymbol) {
            [anchor, partner] = [partner, anchor];
            [anchorSymbol, partnerSymbol] = [partnerSymbol, anchorSymbol];
        }

        if (!anchor || !anchorSymbol) {
            return null;
        }

        if (!partnerSymbol && partner) {
            partnerSymbol = this.inferSymbol(center, anchor, partner, anchorSymbol);
        }

        return {
            anchor,
            partner: partner ?? null,
            anchorSymbol,
            partnerSymbol
        };
    }

    private getRelativeSymbol(centerId: number, neighbourId: number): DirectionalBond | null {
        if (!this.drawer.graph) {
            return null;
        }

        const edge = this.drawer.graph.getEdge(centerId, neighbourId);
        if (!edge || !edge.stereoSymbol) {
            return null;
        }

        if (edge.stereoSourceId === null || edge.stereoSourceId === centerId) {
            return edge.stereoSymbol;
        }

        return edge.stereoSymbol === '/' ? '\\' : '/';
    }

    private inferSymbol(center: Vertex, defined: Vertex, undefinedVertex: Vertex, definedSymbol: DirectionalBond): DirectionalBond {
        const sameSide = this.areBothBeforeOrAfter(center, defined, undefinedVertex);
        if (definedSymbol === '/') {
            return sameSide ? '\\' : '/';
        }

        return sameSide ? '/' : '\\';
    }

    private areBothBeforeOrAfter(center: Vertex, a: Vertex, b: Vertex): boolean {
        return (a.id > center.id && b.id > center.id) || (a.id < center.id && b.id < center.id);
    }

    private findDoubleBondSequences(): Edge[][] {
        const sequences: Edge[][] = [];

        if (!this.drawer.graph) {
            return sequences;
        }

        const fragments: Edge[][] = [];
        for (const edge of this.drawer.graph.edges) {
            if (!this.isSingleBond(edge)) {
                continue;
            }

            const first = this.findAdjacentStereoBond(edge.sourceId, edge.targetId);
            const second = this.findAdjacentStereoBond(edge.targetId, edge.sourceId);

            if (first && second) {
                fragments.push([first, second]);
            }
        }

        let previousLength = -1;
        while (fragments.length !== previousLength) {
            previousLength = fragments.length;
            let merged = false;

            for (let i = 0; i < fragments.length && !merged; i++) {
                for (let j = i + 1; j < fragments.length; j++) {
                    const mergedFragment = this.mergeFragmentsIfPossible(fragments[i], fragments[j]);
                    if (mergedFragment) {
                        fragments.splice(j, 1);
                        fragments.splice(i, 1);
                        fragments.push(mergedFragment);
                        merged = true;
                        break;
                    }
                }
            }

            if (!merged) {
                break;
            }
        }

        return fragments;
    }

    private mergeFragmentsIfPossible(fragmentA: Edge[], fragmentB: Edge[]): Edge[] | null {
        const firstA = fragmentA[0];
        const lastA = fragmentA[fragmentA.length - 1];
        const firstB = fragmentB[0];
        const lastB = fragmentB[fragmentB.length - 1];

        if (lastA.id === firstB.id) {
            return fragmentA.concat(fragmentB.slice(1));
        }

        if (lastA.id === lastB.id) {
            return fragmentA.concat(fragmentB.slice(0, -1).reverse());
        }

        if (firstA.id === firstB.id) {
            return fragmentB.slice(1).reverse().concat(fragmentA);
        }

        if (firstA.id === lastB.id) {
            return fragmentB.slice(0, -1).concat(fragmentA);
        }

        return null;
    }

    private isSingleBond(edge: Edge): boolean {
        return edge.bondType === '-' || edge.bondType === '/' || edge.bondType === '\\';
    }

    private findAdjacentStereoBond(vertexId: number, excludeVertexId: number): Edge | null {
        if (!this.drawer.graph) {
            return null;
        }

        const vertex = this.drawer.graph.vertices[vertexId];
        for (const neighbourId of vertex.neighbours) {
            if (neighbourId === excludeVertexId) {
                continue;
            }

            const edge = this.drawer.graph.getEdge(vertexId, neighbourId);
            if (edge && edge.bondType === '=' && edge.cisTrans) {
                return edge;
            }
        }

        return null;
    }

    private assignSequenceIds(sequences: Edge[][]): void {
        this.sequenceAssignments.clear();
        let index = 1;
        for (const sequence of sequences) {
            for (const bond of sequence) {
                if (bond.id !== null) {
                    this.sequenceAssignments.set(bond.id, index);
                }
            }
            index++;
        }
    }

    getSequenceId(edgeOrId: Edge | number | null | undefined): number | null {
        if (edgeOrId === null || edgeOrId === undefined) {
            return null;
        }

        const id = typeof edgeOrId === 'number' ? edgeOrId : edgeOrId.id;
        if (id === null || id === undefined) {
            return null;
        }

        return this.sequenceAssignments.get(id) ?? null;
    }

    private ensureBondOrientation(edge: Edge | null | undefined): void {
        if (!edge || edge.bondType !== '=' || !edge.cisTrans || edge.id === null || this.fixedStereoBonds.has(edge.id)) {
            return;
        }

        if (this.isBondDrawnCorrectly(edge)) {
            this.fixedStereoBonds.add(edge.id);
            return;
        }

        const corrected = this.fixChiralBond(edge);
        if (corrected && this.isBondDrawnCorrectly(edge)) {
            this.fixedStereoBonds.add(edge.id);
        }
    }

    public getBondOrientationAnalysis(edge: Edge): BondOrientationAnalysis | null {
        return this.analyzeBondOrientation(edge);
    }

    private analyzeBondOrientation(edge: Edge): BondOrientationAnalysis | null {
        if (!this.drawer.graph) {
            return null;
        }

        const vertexA = this.drawer.graph.vertices[edge.sourceId];
        const vertexB = this.drawer.graph.vertices[edge.targetId];
        const evaluatedPairs = new Set<string>();
        const evaluations: BondOrientationEvaluation[] = [];
        let isCorrect = true;

        for (const [sourceKey, mapping] of Object.entries(edge.cisTransNeighbours)) {
            const sourceId = Number(sourceKey);
            const sourceVertex = this.drawer.graph.vertices[sourceId];

            for (const [targetKey, orientation] of Object.entries(mapping)) {
                const targetId = Number(targetKey);
                const targetVertex = this.drawer.graph.vertices[targetId];

                const pairKey = `${Math.min(sourceId, targetId)}_${Math.max(sourceId, targetId)}`;
                if (evaluatedPairs.has(pairKey)) {
                    continue;
                }

                const sourceOnA = vertexA.neighbours.includes(sourceId);
                const sourceOnB = vertexB.neighbours.includes(sourceId);
                const targetOnA = vertexA.neighbours.includes(targetId);
                const targetOnB = vertexB.neighbours.includes(targetId);

                let leftVertex: Vertex | null = null;
                let rightVertex: Vertex | null = null;

                if (sourceOnA && targetOnB) {
                    leftVertex = sourceVertex;
                    rightVertex = targetVertex;
                } else if (sourceOnB && targetOnA) {
                    leftVertex = targetVertex;
                    rightVertex = sourceVertex;
                } else {
                    continue;
                }

                if (!leftVertex.value.isDrawn || !rightVertex.value.isDrawn) {
                    evaluations.push({
                        leftAtomId: leftVertex.id!,
                        rightAtomId: rightVertex.id!,
                        expected: orientation,
                        actual: 'undrawn'
                    });
                    continue;
                }

                evaluatedPairs.add(pairKey);

                const placementLeft = this.getSideOfLine(vertexA.position, vertexB.position, leftVertex.position);
                const placementRight = this.getSideOfLine(vertexA.position, vertexB.position, rightVertex.position);

                const sameSide = placementLeft === placementRight;
                let actual: OrientationActual;
                if (placementLeft === 0 || placementRight === 0) {
                    actual = 'collinear';
                } else {
                    actual = sameSide ? 'cis' : 'trans';
                }
                const matches = (orientation === 'cis' && sameSide) || (orientation === 'trans' && !sameSide);

                evaluations.push({
                    leftAtomId: leftVertex.id!,
                    rightAtomId: rightVertex.id!,
                    expected: orientation,
                    actual
                });

                if (!matches) {
                    isCorrect = false;
                }
            }
        }

        return {
            edgeId: edge.id,
            isCorrect,
            evaluations
        };
    }

    private isBondDrawnCorrectly(edge: Edge): boolean {
        const analysis = this.analyzeBondOrientation(edge);
        if (!analysis) {
            return true;
        }
        return analysis.isCorrect;
    }

    private getSideOfLine(a: Vector2, b: Vector2, point: Vector2): number {
        const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
        if (cross > 0) {
            return 1;
        }

        if (cross < 0) {
            return -1;
        }

        return 0;
    }

    private getDrawnNeighbours(vertex: Vertex, exclude: Set<number> = new Set()): Vertex[] {
        if (!this.drawer.graph) {
            return [];
        }

        const neighbours: Vertex[] = [];
        for (const neighbourId of vertex.neighbours) {
            if (exclude.has(neighbourId)) {
                continue;
            }
            const neighbour = this.drawer.graph.vertices[neighbourId];
            if (neighbour.value.isDrawn) {
                neighbours.push(neighbour);
            }
        }

        return neighbours;
    }

    private shareRing(a: Vertex, b: Vertex): boolean {
        return a.value.rings.some((ringId) => b.value.rings.includes(ringId));
    }

    private fixChiralBond(edge: Edge): boolean {
        if (!this.drawer.graph) {
            return false;
        }

        const vertexA = this.drawer.graph.vertices[edge.sourceId];
        const vertexB = this.drawer.graph.vertices[edge.targetId];
        const inSharedRing = vertexA.value.rings.length > 0 &&
            vertexB.value.rings.length > 0 &&
            this.drawer.areVerticesInSameRing(vertexA, vertexB);

        let corrected = false;
        if (inSharedRing) {
            corrected = this.flipBondInRing(edge);
        } else {
            corrected = this.flipBondOutsideRing(edge, vertexA, vertexB);
        }

        if (!corrected) {
            console.warn('Warning! Cis/trans stereochemistry could not be resolved for bond ' + edge.id);
            return false;
        }

        return true;
    }

    private isVertexAdjacentToStereoBond(vertex: Vertex, excludeEdgeId: number, requireFixed: boolean = false): boolean {
        if (!this.drawer.graph) {
            return false;
        }

        for (const neighbourId of vertex.neighbours) {
            const edge = this.drawer.graph.getEdge(vertex.id, neighbourId);
            if (!edge || edge.id === excludeEdgeId) {
                continue;
            }

            if (edge.bondType === '=' && edge.cisTrans) {
                if (!requireFixed || this.fixedStereoBonds.has(edge.id)) {
                    return true;
                }
            }
        }

        return false;
    }

    private flipBondOutsideRing(edge: Edge, vertexA: Vertex, vertexB: Vertex): boolean {
        const parent = vertexA.value.rings.length > 0 ? vertexB : vertexA;
        const root = parent === vertexA ? vertexB : vertexA;
        const neighbours = this.getDrawnNeighbours(parent, new Set([root.id]));

        if (neighbours.length === 0) {
            return false;
        }

        if (neighbours.length === 1) {
            this.flipSubtree(neighbours[0], root, parent);
            return true;
        } else if (neighbours.length === 2 && this.shareRing(neighbours[0], neighbours[1])) {
            this.flipSubtree(neighbours[0], root, parent);
            return true;
        } else {
            for (const neighbour of neighbours) {
                this.flipSubtree(neighbour, root, parent);
            }
            return true;
        }
    }

    private findRingNeighbour(vertex: Vertex, edge: Edge): Vertex | null {
        if (!this.drawer.graph) {
            return null;
        }

        const otherA = this.drawer.graph.vertices[edge.sourceId];
        const otherB = this.drawer.graph.vertices[edge.targetId];
        const sharedRings = otherA.value.rings.filter((ringId) => otherB.value.rings.includes(ringId));

        for (const neighbourId of vertex.neighbours) {
            if (neighbourId === otherA.id || neighbourId === otherB.id) {
                continue;
            }

            const neighbour = this.drawer.graph.vertices[neighbourId];
            if (!neighbour.value.isDrawn) {
                continue;
            }

            if (neighbour.value.rings.some((ringId) => sharedRings.includes(ringId))) {
                return neighbour;
            }
        }

        return null;
    }

    private findRingBranchToFlip(edge: Edge, neighbours1: Vertex[], neighbours2: Vertex[]): { central: Vertex | null, flanking: [Vertex, Vertex] | null } | null {
        if (!this.drawer.graph) {
            return null;
        }

        const atom1 = this.drawer.graph.vertices[edge.sourceId];
        const atom2 = this.drawer.graph.vertices[edge.targetId];
        const sharedRings = new Set<number>(atom1.value.rings.filter((ringId) => atom2.value.rings.includes(ringId)));

        if (neighbours1.length === 1) {
            return { central: atom1, flanking: [neighbours1[0], atom2] };
        }

        if (neighbours2.length === 1) {
            return { central: atom2, flanking: [neighbours2[0], atom1] };
        }

        let neighbour1: Vertex | null = null;
        let neighbour1InCycle = false;
        let subtree1Size: number | null = null;

        for (const neighbour of neighbours1) {
            const inCycle = neighbour.value.rings.some((ringId) => sharedRings.has(ringId));
            if (!inCycle) {
                const size = this.getSubgraphSize(neighbour, new Set([atom1.id]));
                if (!neighbour1 || (subtree1Size !== null && size < subtree1Size)) {
                    neighbour1 = neighbour;
                    subtree1Size = size;
                }
                neighbour1InCycle = false;
            } else if (!neighbour1) {
                neighbour1 = neighbour;
                neighbour1InCycle = true;
            }
        }

        let neighbour2: Vertex | null = null;
        let neighbour2InCycle = false;
        let subtree2Size: number | null = null;

        for (const neighbour of neighbours2) {
            const inCycle = neighbour.value.rings.some((ringId) => sharedRings.has(ringId));
            if (!inCycle) {
                const size = this.getSubgraphSize(neighbour, new Set([atom2.id]));
                if (!neighbour2 || (subtree2Size !== null && size < subtree2Size)) {
                    neighbour2 = neighbour;
                    subtree2Size = size;
                }
                neighbour2InCycle = false;
            } else if (!neighbour2) {
                neighbour2 = neighbour;
                neighbour2InCycle = true;
            }
        }

        if (!neighbour1 || !neighbour2) {
            return null;
        }

        if (!neighbour1InCycle && !neighbour2InCycle) {
            const size1 = subtree1Size ?? Number.MAX_SAFE_INTEGER;
            const size2 = subtree2Size ?? Number.MAX_SAFE_INTEGER;
            const centralAtom = size2 > size1 ? atom1 : atom2;
            const ringNeighbour = this.findRingNeighbour(centralAtom, edge);

            if (!ringNeighbour) {
                return null;
            }

            if (centralAtom === atom1) {
                return { central: atom1, flanking: [atom2, ringNeighbour] };
            } else {
                return { central: atom2, flanking: [atom1, ringNeighbour] };
            }
        }

        if (neighbour1InCycle && !neighbour2InCycle) {
            const ringNeighbour = this.findRingNeighbour(atom2, edge);
            return ringNeighbour ? { central: atom2, flanking: [atom1, ringNeighbour] } : null;
        }

        if (neighbour2InCycle && !neighbour1InCycle) {
            const ringNeighbour = this.findRingNeighbour(atom1, edge);
            return ringNeighbour ? { central: atom1, flanking: [atom2, ringNeighbour] } : null;
        }

        return null;
    }

    private getSubgraphSize(root: Vertex, blocked: Set<number>): number {
        return this.collectSubtreeVertices(root, blocked).length;
    }

    private collectSubtreeVertices(root: Vertex, blocked: Set<number>): Vertex[] {
        if (!this.drawer.graph) {
            return [];
        }

        const result: Vertex[] = [];
        const visited = new Set<number>(blocked);
        const stack: Vertex[] = [root];

        while (stack.length > 0) {
            const current = stack.pop()!;
            if (visited.has(current.id)) {
                continue;
            }

            visited.add(current.id);
            result.push(current);

            for (const neighbourId of current.neighbours) {
                if (!visited.has(neighbourId)) {
                    stack.push(this.drawer.graph.vertices[neighbourId]);
                }
            }
        }

        return result;
    }

    private flipSubtree(root: Vertex, anchorA: Vertex, anchorB: Vertex): void {
        if (!this.drawer.graph) {
            return;
        }

        const blocked = new Set<number>([anchorA.id, anchorB.id]);
        const subtree = this.collectSubtreeVertices(root, blocked);

        for (const vertex of subtree) {
            vertex.position.mirrorAboutLine(anchorA.position, anchorB.position);

            if (vertex.value.anchoredRings) {
                for (const ringId of vertex.value.anchoredRings) {
                    const ring = this.drawer.rings[ringId];
                    if (ring && ring.center) {
                        ring.center.mirrorAboutLine(anchorA.position, anchorB.position);
                    }
                }
            }
        }
    }

    private flipBondInRing(edge: Edge): boolean {
        if (!this.drawer.graph) {
            return false;
        }

        const atom1 = this.drawer.graph.vertices[edge.sourceId];
        const atom2 = this.drawer.graph.vertices[edge.targetId];

        const neighbours1 = this.getDrawnNeighbours(atom1, new Set([atom2.id]));
        const neighbours2 = this.getDrawnNeighbours(atom2, new Set([atom1.id]));

        const neighbours1Adjacent = neighbours1.some((n) => this.isVertexAdjacentToStereoBond(n, edge.id));
        const neighbours2Adjacent = neighbours2.some((n) => this.isVertexAdjacentToStereoBond(n, edge.id));
        const neighbours1AdjacentFixed = neighbours1.some((n) => this.isVertexAdjacentToStereoBond(n, edge.id, true));
        const neighbours2AdjacentFixed = neighbours2.some((n) => this.isVertexAdjacentToStereoBond(n, edge.id, true));

        const plans = this.buildRingFlipPlans(
            edge,
            neighbours1,
            neighbours2,
            neighbours1Adjacent,
            neighbours2Adjacent,
            neighbours1AdjacentFixed,
            neighbours2AdjacentFixed
        );

        if (plans.length === 0) {
            console.warn('Warning! Cis/trans stereochemistry of cyclic system incorrectly drawn.');
            return false;
        }

        for (const plan of plans) {
            this.flipSubtree(plan.central, plan.flanking[0], plan.flanking[1]);
            if (this.isBondDrawnCorrectly(edge)) {
                return true;
            }
            // Revert attempt
            this.flipSubtree(plan.central, plan.flanking[0], plan.flanking[1]);
        }

        console.warn('Warning! Cis/trans stereochemistry of cyclic system incorrectly drawn.');
        return false;
    }

    private buildRingFlipPlans(
        edge: Edge,
        neighbours1: Vertex[],
        neighbours2: Vertex[],
        neighbours1Adjacent: boolean,
        neighbours2Adjacent: boolean,
        neighbours1AdjacentFixed: boolean,
        neighbours2AdjacentFixed: boolean
    ): RingFlipPlan[] {
        const plans: RingFlipPlan[] = [];
        const primary = this.resolvePrimaryRingPlan(
            edge,
            neighbours1,
            neighbours2,
            neighbours1Adjacent,
            neighbours2Adjacent,
            neighbours1AdjacentFixed,
            neighbours2AdjacentFixed
        );
        if (primary) {
            plans.push(primary);
        }

        const fallbackPlans = this.generateFallbackRingPlans(edge);
        for (const plan of fallbackPlans) {
            if (!plans.some((existing) => this.areRingPlansEquivalent(existing, plan))) {
                plans.push(plan);
            }
        }

        return plans;
    }

    private resolvePrimaryRingPlan(
        edge: Edge,
        neighbours1: Vertex[],
        neighbours2: Vertex[],
        neighbours1Adjacent: boolean,
        neighbours2Adjacent: boolean,
        neighbours1AdjacentFixed: boolean,
        neighbours2AdjacentFixed: boolean
    ): RingFlipPlan | null {
        if (!this.drawer.graph) {
            return null;
        }

        const atom1 = this.drawer.graph.vertices[edge.sourceId];
        const atom2 = this.drawer.graph.vertices[edge.targetId];

        if (!neighbours1Adjacent && !neighbours2Adjacent) {
            const branch = this.findRingBranchToFlip(edge, neighbours1, neighbours2);
            if (branch?.central && branch.flanking) {
                return { central: branch.central, flanking: branch.flanking };
            }
            return null;
        }

        if (neighbours1Adjacent && !neighbours2Adjacent) {
            const ringNeighbour = this.findRingNeighbour(atom2, edge);
            if (ringNeighbour) {
                return { central: atom2, flanking: [atom1, ringNeighbour] };
            }
            return null;
        }

        if (neighbours2Adjacent && !neighbours1Adjacent) {
            const ringNeighbour = this.findRingNeighbour(atom1, edge);
            if (ringNeighbour) {
                return { central: atom1, flanking: [atom2, ringNeighbour] };
            }
            return null;
        }

        if (neighbours1AdjacentFixed && !neighbours2AdjacentFixed) {
            const ringNeighbour = this.findRingNeighbour(atom2, edge);
            if (ringNeighbour) {
                return { central: atom2, flanking: [atom1, ringNeighbour] };
            }
            return null;
        }

        if (neighbours2AdjacentFixed && !neighbours1AdjacentFixed) {
            const ringNeighbour = this.findRingNeighbour(atom1, edge);
            if (ringNeighbour) {
                return { central: atom1, flanking: [atom2, ringNeighbour] };
            }
            return null;
        }

        if (!neighbours1AdjacentFixed && !neighbours2AdjacentFixed) {
            const branch = this.findRingBranchToFlip(edge, neighbours1, neighbours2);
            if (branch?.central && branch.flanking) {
                return { central: branch.central, flanking: branch.flanking };
            }
            return null;
        }

        return null;
    }

    private generateFallbackRingPlans(edge: Edge): RingFlipPlan[] {
        if (!this.drawer.graph) {
            return [];
        }

        const atom1 = this.drawer.graph.vertices[edge.sourceId];
        const atom2 = this.drawer.graph.vertices[edge.targetId];
        const plans: RingFlipPlan[] = [];

        const ringNeighbour1 = this.findRingNeighbour(atom1, edge);
        if (ringNeighbour1) {
            plans.push({ central: atom1, flanking: [atom2, ringNeighbour1] });
        }

        const ringNeighbour2 = this.findRingNeighbour(atom2, edge);
        if (ringNeighbour2) {
            plans.push({ central: atom2, flanking: [atom1, ringNeighbour2] });
        }

        return plans;
    }

    private areRingPlansEquivalent(a: RingFlipPlan, b: RingFlipPlan): boolean {
        if (a.central.id !== b.central.id) {
            return false;
        }
        const [a1, a2] = a.flanking;
        const [b1, b2] = b.flanking;
        return (a1.id === b1.id && a2.id === b2.id) || (a1.id === b2.id && a2.id === b1.id);
    }

    private assignChiralMetadata(edge: Edge, mapping: Record<number, Record<number, CisTransOrientation>>): void {
        edge.cisTransNeighbours = this.cloneOrientationMap(mapping);
        edge.chiralDict = this.cloneOrientationMap(mapping);
    }

    private cloneOrientationMap(source: Record<number, Record<number, CisTransOrientation>>): Record<number, Record<number, CisTransOrientation>> {
        const clone: Record<number, Record<number, CisTransOrientation>> = {};
        for (const [key, nested] of Object.entries(source)) {
            const numericKey = Number(key);
            const nestedClone: Record<number, CisTransOrientation> = {};
            for (const [innerKey, orientation] of Object.entries(nested)) {
                nestedClone[Number(innerKey)] = orientation;
            }
            clone[numericKey] = nestedClone;
        }
        return clone;
    }
}

export default CisTransManager;
