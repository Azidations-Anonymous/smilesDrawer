import Graph = require('../graph/Graph');

type AdjacencyMatrix = number[][];
type DistanceMatrix = number[][];
type PathElement = [number, number];
type Path = PathElement[];
type PathMatrix = Path[][][]; // pe[i][j] -> Path[]
type ExtendedPathMatrix = Path[][][]; // pe_prime
interface RingCandidate {
    size: number;
    paths: Path[];
    extendedPaths: Path[];
}

/** A class encapsulating the functionality to find the smallest set of smallest rings in a graph. */
class SSSR {
    /**
     * Returns an array containing arrays, each representing a ring from the smallest set of smallest rings in the graph.
     *
     * @param {Graph} graph A Graph object.
     * @returns {Array[]} An array containing arrays, each representing a ring from the smallest set of smallest rings in the group.
     */
    static getRings(graph: Graph): number[][] | null {
        let adjacencyMatrix = graph.getComponentsAdjacencyMatrix();
        if (adjacencyMatrix.length === 0) {
            return null;
        }

        let connectedComponents = Graph.getConnectedComponents(adjacencyMatrix);
        let rings = Array();

        const allCycles = Array.isArray((graph as any).cycles) ? (graph as any).cycles as number[][] : [];

        for (var i = 0; i < connectedComponents.length; i++) {
            let connectedComponent = connectedComponents[i];
            let ccAdjacencyMatrix = graph.getSubgraphAdjacencyMatrix([...connectedComponent]);

            let arrRingCount = new Uint16Array(ccAdjacencyMatrix.length);
            let arrBondCount = Uint16Array.from({ length: ccAdjacencyMatrix.length }, (_, rowIdx) =>
                ccAdjacencyMatrix[rowIdx].reduce((sum, value) => sum + value, 0)
            );

            // Get the edge number and the theoretical number of rings in SSSR
            let nEdges = ccAdjacencyMatrix.reduce((sum, row, rowIndex) =>
                sum + row.slice(rowIndex + 1).reduce((rowSum, value) => rowSum + value, 0), 0);

            let nSssr = nEdges - ccAdjacencyMatrix.length + 1;

            // console.log(nEdges, ccAdjacencyMatrix.length, nSssr);
            // console.log(SSSR.getEdgeList(ccAdjacencyMatrix));
            // console.log(ccAdjacencyMatrix);

            // If all vertices have 3 incident edges, calculate with different formula (see Euler)
            let allThree = arrBondCount.every(bondCount => bondCount === 3);

            if (allThree) {
                nSssr = 2.0 + nEdges - ccAdjacencyMatrix.length;
            }

            // All vertices are part of one ring if theres only one ring.
            if (nSssr === 1) {
                rings.push([...connectedComponent]);
                continue;
            }
            
            let { d, pe, pe_prime } = SSSR.getPathIncludedDistanceMatrices(ccAdjacencyMatrix);
            let candidates = SSSR.getRingCandidates(d, pe, pe_prime);
            let sssr = SSSR.getSSSR(candidates, ccAdjacencyMatrix, arrBondCount, arrRingCount, nSssr);
            let limited = sssr.slice(0, nSssr);

            const componentInventory = SSSR.getComponentInventory(connectedComponent, allCycles);
            if (componentInventory.length > 0) {
                const adjusted = SSSR.alignLargeRingsWithInventory(limited, connectedComponent, componentInventory);
                if (adjusted) {
                    limited = adjusted;
                }
            }

            for (var j = 0; j < limited.length; j++) {
                const ordered = SSSR.orderRingVertices(limited[j], ccAdjacencyMatrix);
                const ring = ordered.map((val) => connectedComponent[val]);
                rings.push(ring);
            }
        }
        

        // So, for some reason, this would return three rings for C1CCCC2CC1CCCC2, which is wrong
        // As I don't have time to fix this properly, it will stay in. I'm sorry next person who works
        // on it. At that point it might be best to reimplement the whole SSSR thing...
        return rings;
    }

    /**
     * Creates a printable string from a matrix (2D array).
     *
     * @param {Array[]} matrix A 2D array.
     * @returns {String} A string representing the matrix.
     */
    static matrixToString(matrix: number[][]): string {
        let str = '';

        for (var i = 0; i < matrix.length; i++) {
            for (var j = 0; j < matrix[i].length; j++) {
                str += matrix[i][j] + ' ';
            }

            str += '\n';
        }

        return str;
    }

    /**
     * Returnes the two path-included distance matrices used to find the sssr.
     *
     * @param {Array[]} adjacencyMatrix An adjacency matrix.
     * @returns {Object} The path-included distance matrices. { p1, p2 }
     */
    static getPathIncludedDistanceMatrices(adjacencyMatrix: AdjacencyMatrix): { d: DistanceMatrix, pe: PathMatrix, pe_prime: ExtendedPathMatrix } {
        const length = adjacencyMatrix.length;
        const d: DistanceMatrix = Array.from({ length }, () => Array(length).fill(Infinity));
        const pe: PathMatrix = Array.from({ length }, () => Array.from({ length }, () => [] as Path[]));
        const peKeys: Array<Array<Set<string>>> = Array.from({ length }, () => Array.from({ length }, () => new Set<string>()));
        const pePrime: ExtendedPathMatrix = Array.from({ length }, () => Array.from({ length }, () => [] as Path[]));
        const pePrimeKeys: Array<Array<Set<string>>> = Array.from({ length }, () => Array.from({ length }, () => new Set<string>()));

        for (let i = 0; i < length; i++) {
            for (let j = 0; j < length; j++) {
                if (i === j) {
                    d[i][j] = 0;
                } else if (adjacencyMatrix[i][j] === 1) {
                    d[i][j] = 1;
                    const path: Path = [[i, j]];
                    const key = SSSR.pathToKey(path);
                    pe[i][j].push(path);
                    peKeys[i][j].add(key);
                }
            }
        }

        for (let k = 0; k < length; k++) {
            for (let i = 0; i < length; i++) {
                if (d[i][k] === Infinity) {
                    continue;
                }
                for (let j = 0; j < length; j++) {
                    if (d[k][j] === Infinity) {
                        continue;
                    }

                    const previous = d[i][j];
                    const throughK = d[i][k] + d[k][j];

                    const leftPaths = pe[i][k].length > 0 ? pe[i][k] : (i === k ? [[]] : []);
                    const rightPaths = pe[k][j].length > 0 ? pe[k][j] : (k === j ? [[]] : []);

                    if (leftPaths.length === 0 || rightPaths.length === 0) {
                        continue;
                    }

                    if (throughK < previous) {
                        d[i][j] = throughK;
                        pe[i][j] = [];
                        peKeys[i][j].clear();
                        for (const left of leftPaths) {
                            for (const right of rightPaths) {
                                const combined = SSSR.combinePaths(left, right);
                                if (!combined.length) {
                                    continue;
                                }
                                const key = SSSR.pathToKey(combined);
                                if (!peKeys[i][j].has(key)) {
                                    peKeys[i][j].add(key);
                                    pe[i][j].push(combined);
                                }
                            }
                        }
                    } else if (throughK === previous) {
                        for (const left of leftPaths) {
                            for (const right of rightPaths) {
                                const combined = SSSR.combinePaths(left, right);
                                if (!combined.length) {
                                    continue;
                                }
                                const key = SSSR.pathToKey(combined);
                                if (!peKeys[i][j].has(key)) {
                                    peKeys[i][j].add(key);
                                    pe[i][j].push(combined);
                                }
                            }
                        }
                    }
                }
            }
        }

        for (let k = 0; k < length; k++) {
            for (let i = 0; i < length; i++) {
                if (d[i][k] === Infinity) {
                    continue;
                }
                for (let j = 0; j < length; j++) {
                    if (d[k][j] === Infinity) {
                        continue;
                    }

                    const shortest = d[i][j];
                    const throughK = d[i][k] + d[k][j];

                    if (throughK - 1 !== shortest) {
                        continue;
                    }

                    const leftPaths = pe[i][k].length > 0 ? pe[i][k] : (i === k ? [[]] : []);
                    const rightPaths = pe[k][j].length > 0 ? pe[k][j] : (k === j ? [[]] : []);

                    if (leftPaths.length === 0 || rightPaths.length === 0) {
                        continue;
                    }

                    for (const left of leftPaths) {
                        for (const right of rightPaths) {
                            const combined = SSSR.combinePaths(left, right);
                            if (!combined.length) {
                                continue;
                            }
                            const key = SSSR.pathToKey(combined);
                            if (!pePrimeKeys[i][j].has(key)) {
                                pePrimeKeys[i][j].add(key);
                                pePrime[i][j].push(combined);
                            }
                        }
                    }
                }
            }
        }

        return {
            d,
            pe,
            pe_prime: pePrime
        };
    }
    /**
     * Get the ring candidates from the path-included distance matrices.
     *
     * @param {Array[]} d The distance matrix.
     * @param {Array[]} pe A matrix containing the shortest paths.
     * @param {Array[]} pe_prime A matrix containing the shortest paths + one vertex.
     * @returns {Array[]} The ring candidates.
     */
    static getRingCandidates(d: DistanceMatrix, pe: PathMatrix, pe_prime: ExtendedPathMatrix): RingCandidate[] {
        const length = d.length;
        const candidates: RingCandidate[] = [];

        for (let i = 0; i < length; i++) {
            for (let j = 0; j < length; j++) {
                if (d[i][j] === 0 || (pe[i][j].length === 1 && pe_prime[i][j].length === 0)) {
                    continue;
                }

                let cycleSize: number;
                if (pe[i][j].length > 1) {
                    cycleSize = 2 * d[i][j];
                } else if (pe_prime[i][j].length !== 0) {
                    cycleSize = 2 * d[i][j] + 1;
                } else {
                    cycleSize = 2 * d[i][j];
                }

                if (!Number.isFinite(cycleSize)) {
                    continue;
                }

                candidates.push({
                    size: cycleSize,
                    paths: pe[i][j].map((path) => path.slice()),
                    extendedPaths: pe_prime[i][j].map((path) => path.slice())
                });
            }
        }

        candidates.sort((a, b) => a.size - b.size);
        return candidates;
    }

    /**
     * Searches the candidates for the smallest set of smallest rings.
     *
     * @param {RingCandidate[]} candidates The ring candidates.
     * @param {Array[]} adjacencyMatrix An adjacency matrix.
     * @param {Uint16Array} arrBondCount A matrix containing the bond count of each vertex.
     * @param {Uint16Array} arrRingCount A matrix containing the number of rings associated with each vertex.
     * @param {Number} nsssr The theoretical number of rings in the graph.
     * @returns {Set[]} The smallest set of smallest rings.
     */
    static getSSSR(candidates: RingCandidate[], adjacencyMatrix: AdjacencyMatrix, arrBondCount: Uint16Array, arrRingCount: Uint16Array, nsssr: number): Set<number>[] {
        const cSssr: Set<number>[] = [];
        const allBondCounts = new Map<string, number>();

        for (const candidate of candidates) {
            const { size, paths, extendedPaths } = candidate;

            if (size % 2 !== 0) {
                if (paths.length === 0) {
                    continue;
                }

                const basePath = paths[0];
                for (const extended of extendedPaths) {
                    const bonds: Path = [...basePath, ...extended];
                    const atoms = SSSR.bondsToAtoms(bonds);

                    if (SSSR.getBondCount(atoms, adjacencyMatrix) === atoms.size &&
                        !SSSR.pathSetsContain(cSssr, atoms, bonds, allBondCounts, arrBondCount, arrRingCount)) {
                        cSssr.push(atoms);
                        for (const bond of bonds) {
                            const key = SSSR.bondKey(bond);
                            allBondCounts.set(key, (allBondCounts.get(key) ?? 0) + 1);
                        }
                    }

                    if (cSssr.length > nsssr) {
                        return cSssr.slice(0, nsssr);
                    }
                }
            } else {
                if (paths.length < 2) {
                    continue;
                }

                for (let j = 0; j < paths.length - 1; j++) {
                    const bonds: Path = [...paths[j], ...paths[j + 1]];
                    const atoms = SSSR.bondsToAtoms(bonds);

                    if (SSSR.getBondCount(atoms, adjacencyMatrix) === atoms.size &&
                        !SSSR.pathSetsContain(cSssr, atoms, bonds, allBondCounts, arrBondCount, arrRingCount)) {
                        cSssr.push(atoms);
                        for (const bond of bonds) {
                            const key = SSSR.bondKey(bond);
                            allBondCounts.set(key, (allBondCounts.get(key) ?? 0) + 1);
                        }
                    }

                    if (cSssr.length > nsssr) {
                        return cSssr.slice(0, nsssr);
                    }
                }
            }
        }

        return cSssr.slice(0, nsssr);
    }

    private static readonly INVENTORY_THRESHOLD = 10;

    private static getComponentInventory(component: number[], inventory: number[][]): number[][] {
        if (!inventory || inventory.length === 0) {
            return [];
        }

        const componentSet = new Set(component);
        return inventory
            .filter((cycle) => cycle.every((vertexId) => componentSet.has(vertexId)))
            .map((cycle) => cycle.slice());
    }

    private static alignLargeRingsWithInventory(rings: Set<number>[], component: number[], inventory: number[][]): Set<number>[] | null {
        if (!inventory || inventory.length === 0) {
            return null;
        }

        const localIndex = new Map<number, number>();
        component.forEach((vertexId, idx) => localIndex.set(vertexId, idx));

        const inventoryByLength = new Map<number, number[][]>();
        for (const cycle of inventory) {
            if (!inventoryByLength.has(cycle.length)) {
                inventoryByLength.set(cycle.length, []);
            }
            inventoryByLength.get(cycle.length)!.push(cycle);
        }

        let changed = false;
        const adjusted = rings.map((ring) => new Set(ring));

        for (let idx = 0; idx < adjusted.length; idx++) {
            const ring = adjusted[idx];
            if (ring.size < SSSR.INVENTORY_THRESHOLD) {
                continue;
            }

            const candidates = inventoryByLength.get(ring.size);
            if (!candidates || candidates.length === 0) {
                continue;
            }

            const currentSorted = Array.from(ring)
                .map((local) => component[local])
                .sort((a, b) => a - b);

            let bestCycle: number[] | null = null;
            let bestSorted = currentSorted.slice();

            for (const cycle of candidates) {
                const sorted = cycle.slice().sort((a, b) => a - b);
                if (SSSR.isLexicographicallyGreater(sorted, bestSorted)) {
                    bestSorted = sorted;
                    bestCycle = cycle;
                }
            }

            if (!bestCycle) {
                continue;
            }

            const newSet = new Set<number>();
            let valid = true;
            for (const vertexId of bestCycle) {
                const local = localIndex.get(vertexId);
                if (local === undefined) {
                    valid = false;
                    break;
                }
                newSet.add(local);
            }

            if (!valid || newSet.size !== ring.size) {
                continue;
            }

            const newSorted = Array.from(newSet).map((local) => component[local]).sort((a, b) => a - b);
            if (newSorted.every((value, i) => value === currentSorted[i])) {
                continue;
            }

            adjusted[idx] = newSet;
            changed = true;
        }

        return changed ? adjusted : null;
    }

    private static isLexicographicallyGreater(candidate: number[], baseline: number[]): boolean {
        const len = Math.min(candidate.length, baseline.length);
        for (let i = 0; i < len; i++) {
            if (candidate[i] !== baseline[i]) {
                return candidate[i] > baseline[i];
            }
        }

        return candidate.length > baseline.length;
    }

    /**
     * Returns the number of edges in a graph defined by an adjacency matrix.
     *
     * @param {Array[]} adjacencyMatrix An adjacency matrix.
     * @returns {Number} The number of edges in the graph defined by the adjacency matrix.
     */
    static getEdgeCount(adjacencyMatrix: AdjacencyMatrix): number {
        let edgeCount = 0;
        let length = adjacencyMatrix.length;

        var i = length - 1;
        while (i--) {
            var j = length;
            while (j--) {
                if (adjacencyMatrix[i][j] === 1) {
                    edgeCount++;
                }
            }
        }

        return edgeCount;
    }

    /**
     * Returns an edge list constructed form an adjacency matrix.
     *
     * @param {Array[]} adjacencyMatrix An adjacency matrix.
     * @returns {Array[]} An edge list. E.g. [ [ 0, 1 ], ..., [ 16, 2 ] ]
     */
    static getEdgeList(adjacencyMatrix: AdjacencyMatrix): PathElement[] {
        let length = adjacencyMatrix.length;
        let edgeList = Array();

        var i = length - 1;
        while (i--) {
            var j = length;
            while (j--) {
                if (adjacencyMatrix[i][j] === 1) {
                    edgeList.push([i, j]);
                }
            }
        }

        return edgeList;
    }

    /**
     * Return a set of vertex indices contained in an array of bonds.
     *
     * @param {Array} bonds An array of bonds. A bond is defined as [ sourceVertexId, targetVertexId ].
     * @returns {Set<Number>} An array of vertices.
     */
    static bondsToAtoms(bonds: PathElement[] | any[]): Set<number> {
        let atoms = new Set<number>();

        var i = bonds.length;
        while (i--) {
            atoms.add(bonds[i][0]);
            atoms.add(bonds[i][1]);
        }
        return atoms;
    }

    /**
    * Returns the number of bonds within a set of atoms.
    *
    * @param {Set<Number>} atoms An array of atom ids.
    * @param {Array[]} adjacencyMatrix An adjacency matrix.
    * @returns {Number} The number of bonds in a set of atoms.
    */
    static getBondCount(atoms: Set<number>, adjacencyMatrix: AdjacencyMatrix): number {
        let count = 0;
        for (let u of atoms) {
            for (let v of atoms) {
                if (u === v) {
                    continue;
                }
                count += adjacencyMatrix[u][v]
            }
        }

        return count / 2;
    }

    /**
     * Checks whether or not a given path already exists in an array of paths.
     *
     * @param {Set[]} pathSets An array of sets each representing a path.
     * @param {Set<Number>} pathSet A set representing a path.
     * @param {Array[]} bonds The bonds associated with the current path.
     * @param {Map<string, number>} allBondCounts Bond multiplicities currently associated with rings in the SSSR set.
     * @param {Uint16Array} arrBondCount A matrix containing the bond count of each vertex.
     * @param {Uint16Array} arrRingCount A matrix containing the number of rings associated with each vertex.
     * @returns {Boolean} A boolean indicating whether or not a given path is contained within a set.
     */
    static pathSetsContain(pathSets: Set<number>[], pathSet: Set<number>, bonds: Path, allBondCounts: Map<string, number>, arrBondCount: Uint16Array, arrRingCount: Uint16Array): boolean {
        for (let i = pathSets.length - 1; i >= 0; i--) {
            if (SSSR.isSupersetOf(pathSet, pathSets[i])) {
                return true;
            }

            if (pathSets[i].size !== pathSet.size) {
                continue;
            }

            if (SSSR.areSetsEqual(pathSets[i], pathSet)) {
                return true;
            }
        }

        const bondKeys = bonds.map((bond) => SSSR.bondKey(bond));
        const candidateBondCounts = new Map<string, number>();
        for (const key of bondKeys) {
            candidateBondCounts.set(key, (candidateBondCounts.get(key) ?? 0) + 1);
        }

        let allContained = true;
        for (const [key, required] of candidateBondCounts.entries()) {
            if ((allBondCounts.get(key) ?? 0) < required) {
                allContained = false;
                break;
            }
        }

        let specialCase = false;
        if (allContained) {
            for (const element of pathSet) {
                if (arrRingCount[element] < arrBondCount[element]) {
                    specialCase = true;
                    break;
                }
            }
        }

        if (allContained && !specialCase) {
            return true;
        }

        for (const element of pathSet) {
            arrRingCount[element]++;
        }

        return false;
    }

    private static combinePaths(pathA: Path, pathB: Path): Path {
        if (pathA.length === 0) {
            return pathB.slice();
        }

        if (pathB.length === 0) {
            return pathA.slice();
        }

        return pathA.concat(pathB);
    }

    private static pathToKey(path: Path): string {
        if (path.length === 0) {
            return '';
        }

        return path.map((bond) => SSSR.bondKey(bond)).join('|');
    }

    private static bondKey(bond: PathElement): string {
        const [a, b] = bond;
        return a < b ? `${a}-${b}` : `${b}-${a}`;
    }

    /**
     * Checks whether or not two sets are equal (contain the same elements).
     *
     * @param {Set<Number>} setA A set.
     * @param {Set<Number>} setB A set.
     * @returns {Boolean} A boolean indicating whether or not the two sets are equal.
     */
    static areSetsEqual(setA: Set<number>, setB: Set<number>): boolean {
        if (setA.size !== setB.size) {
            return false;
        }

        for (let element of setA) {
            if (!setB.has(element)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Checks whether or not a set (setA) is a superset of another set (setB).
     *
     * @param {Set<Number>} setA A set.
     * @param {Set<Number>} setB A set.
     * @returns {Boolean} A boolean indicating whether or not setB is a superset of setA.
     */
    static isSupersetOf(setA: Set<number>, setB: Set<number>): boolean {
        for (var element of setB) {
            if (!setA.has(element)) {
                return false;
            }
        }

        return true;
    }

    private static orderRingVertices(vertices: Set<number>, adjacencyMatrix: AdjacencyMatrix): number[] {
        if (vertices.size === 0) {
            return [];
        }

        const ordered: number[] = [];
        const start = Math.min(...vertices);
        let current = start;
        let previous = -1;

        do {
            ordered.push(current);

            const neighbours: number[] = [];
            for (const candidate of vertices) {
                if (candidate !== current && adjacencyMatrix[current][candidate] === 1) {
                    neighbours.push(candidate);
                }
            }
            neighbours.sort((a, b) => a - b);

            let next = neighbours.find((n) => n !== previous);
            if (next === undefined) {
                // Fallback: try any neighbour not yet used
                next = neighbours.find((n) => !ordered.includes(n));
            }

            if (next === undefined) {
                break;
            }

            previous = current;
            current = next;
        } while (current !== start && ordered.length <= vertices.size);

        return ordered;
    }
}

export = SSSR;
