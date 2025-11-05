import Graph = require('../graph/Graph');
import Vector2 = require('../graph/Vector2');
import Ring = require('../graph/Ring');
import MathHelper = require('../utils/MathHelper');
import ArrayHelper = require('../utils/ArrayHelper');

/**
 * Implements the Kamada-Kawai force-directed graph layout algorithm.
 *
 * The implementation follows the original paper:
 *   T. Kamada, S. Kawai. "An Algorithm for Drawing General Undirected Graphs",
 *   Information Processing Letters 31(1), 1989, pp. 7-15.
 *
 * In SmileDrawer the layout is only applied to locally bridged ring systems.
 * The class therefore focuses on a comparatively small sub graph and does not
 * model the full global optimisation described in the paper.
 */
class KamadaKawaiLayout {
    constructor(private readonly graph: Graph) {
    }

    /**
     * Positions the provided sub graph by iteratively minimising the spring energy.
     *
     * @param vertexIds Indices of vertices forming the sub graph to optimise.
     * @param center Target centroid used for the initial circular placement of the sub graph.
     * @param startVertexId Index of the vertex used as the entry point (kept for API compatibility).
     * @param ring Ring that triggered the layout pass (used by callers, not within this routine).
     * @param bondLength Desired Euclidean length for a single graph edge (the L constant in the paper).
     * @param threshold Energy threshold that stops the outer optimisation loop (epsilon in the paper).
     * @param innerThreshold Energy threshold for the per-vertex Newton iteration.
     * @param maxIteration Maximum number of outer iterations before we abort.
     * @param maxInnerIteration Maximum number of Newton updates per vertex.
     * @param maxEnergy Historical parameter: expected energy level of unconverged layouts (kept for API compatibility).
     */
    layout(vertexIds: number[], center: Vector2, startVertexId: number, ring: Ring, bondLength: number, threshold: number, innerThreshold: number, maxIteration: number, maxInnerIteration: number, maxEnergy: number): void {
        // Spring stiffness constant (K in the paper). In the molecular drawing context one unit of
        // length already corresponds to an ideal bond length, so reusing bondLength keeps distances
        // and strengths in the same scale.
        const edgeStrength = bondLength;

        // Pair-wise shortest path distances between all vertices in the sub graph (d_ij in the paper).
        // These graph distances are the input that drives how far apart the nodes should sit in 2D.
        const matDist = this.graph.getSubgraphDistanceMatrix(vertexIds);
        const length = vertexIds.length;

        type VertexState = { id: number; anchored: boolean; x: number; y: number };
        type ForceVector = { x: number; y: number };
        type EnergyState = { matrix: ForceVector[][]; sums: ForceVector[] };
        type LayoutState = { vertices: VertexState[]; energy: EnergyState };
        type Hessian = { dxx: number; dyy: number; dxy: number };

        const zeroForce = (): ForceVector => ({ x: 0, y: 0 });
        const addForces = (a: ForceVector, b: ForceVector): ForceVector => ({ x: a.x + b.x, y: a.y + b.y });
        const squaredGradientMagnitude = (force: ForceVector): number => force.x * force.x + force.y * force.y;

        // --- Initial placement -------------------------------------------------------------
        //
        // Before the optimisation starts we need a concrete 2D position for every vertex.
        // Following Section 3.3 of the paper, we distribute the nodes evenly on the
        // circumference of a large circle centred on the requested drawing centre.
        // This avoids the algorithm getting stuck in a degenerate layout (e.g. everything on a line).
        const radius = MathHelper.polyCircumradius(500, length);
        const angle = MathHelper.centralAngle(length);
        const arrPositionX = new Float32Array(length);
        const arrPositionY = new Float32Array(length);
        // Tracks whether the caller already anchored a vertex. Anchored vertices provide better
        // continuity with the rest of the molecule (bridged rings are often partially positioned already).
        const arrPositioned = Array(length);

        const placeVertex = (currentAngle: number, vertexId: number, idx: number): number => {
          const vertex = this.graph.vertices[vertexId];
          if (!vertex.positioned) {
            // Vertex has no previous coordinates: place it on the current angle on the circle.
            arrPositionX[idx] = center.x + Math.cos(currentAngle) * radius;
            arrPositionY[idx] = center.y + Math.sin(currentAngle) * radius;
          } else {
            // A coordinate already exists (e.g. due to earlier layout passes). Reuse it so the
            // optimiser nudges from an informed starting point rather than overwriting it.
            arrPositionX[idx] = vertex.position.x;
            arrPositionY[idx] = vertex.position.y;
          }
          arrPositioned[idx] = vertex.positioned;
          return currentAngle + angle;
        };
        vertexIds.reduceRight(placeVertex, 0.0);

        // Equivalent of equation (2) in the paper: desired Euclidean distance l_ij = L * d_ij.
        // Each graph-theoretical distance gets translated into how far the points should sit apart
        // in the final drawing. If d_ij == 1 we end up with the base bond length.
        const matLength = matDist.map((row) => row.map((value) => bondLength * value));

        // Equation (4): spring strength k_ij = K / d_ij^2. We use bondLength as K because the
        // molecular input is already scaled to bond lengths in the drawing space.
        const springStrength = (graphDistance: number): number => {
          if (graphDistance === 0) {
            return 0;
          }
          return edgeStrength / (graphDistance * graphDistance);
        };
        const matStrength = matDist.map((row) => row.map((value) => springStrength(value)));

        // Stores the first-order partial derivatives dE/dx and dE/dy for each pair. These values
        // are repeatedly reused and updated after each Newton step (see Section 3.2).
        const matEnergy: ForceVector[][] = Array.from({ length }, () => new Array<ForceVector>(length));
        // Keep track of the net force components acting on each vertex. When both values are close
        // to zero the vertex is considered to be in equilibrium.
        const arrEnergySumX = new Float32Array(length);
        const arrEnergySumY = new Float32Array(length);

        // Populate the initial energy/force contributions for all vertex pairs. Conceptually each
        // pair of vertices is connected by a spring that wants to sit at length l_ij. The values
        // stored in matEnergy correspond to the net x/y force the spring exerts on vertex i.
        ArrayHelper.forEachIndexReverse(length, (rowIdx) => {
          const sourceX = arrPositionX[rowIdx];
          const sourceY = arrPositionY[rowIdx];
          let rowGradientX = 0.0;
          let rowGradientY = 0.0;
          ArrayHelper.forEachIndexReverse(length, (colIdx) => {
            if (rowIdx === colIdx) {
              return;
            }
            const vx = arrPositionX[colIdx];
            const vy = arrPositionY[colIdx];
            // denom = 1 / |u - v| converts Cartesian coordinates into unit direction vectors.
            // The value recurs throughout the derivatives, so we compute it once here.
            const denom = 1.0 / Math.sqrt((sourceX - vx) * (sourceX - vx) + (sourceY - vy) * (sourceY - vy));
            const force: ForceVector = {
              x: matStrength[rowIdx][colIdx] * ((sourceX - vx) - matLength[rowIdx][colIdx] * (sourceX - vx) * denom),
              y: matStrength[rowIdx][colIdx] * ((sourceY - vy) - matLength[rowIdx][colIdx] * (sourceY - vy) * denom)
            };
            matEnergy[rowIdx][colIdx] = force;
            // The energy contribution is symmetric: the force that i exerts on j equals the opposite force j exerts on i.
            matEnergy[colIdx][rowIdx] = force;
            rowGradientX += force.x;
            rowGradientY += force.y;
          });
          // Store the net force components for vertex rowIdx. These values are re-used when the
          // algorithm decides which vertex to optimise next.
          arrEnergySumX[rowIdx] = rowGradientX;
          arrEnergySumY[rowIdx] = rowGradientY;
        });

        // Returns both gradient components and the squared gradient magnitude ||Δ_m||^2.
        type VertexEnergy = { magnitude: number; gradient: ForceVector };
        const computeVertexEnergy = (index: number): VertexEnergy => {
          const gradient = { x: arrEnergySumX[index], y: arrEnergySumY[index] };
          return {
            magnitude: squaredGradientMagnitude(gradient),
            gradient
          };
        };

        // Identifies the vertex with the highest residual energy (see equation (9) in the paper).
        // The optimisation always targets the node that is currently "unhappiest", i.e. subject
        // to the largest displacement forces.
        const findHighestEnergy = (): { index: number; energy: VertexEnergy } => {
          let maxEnergyMagnitude = 0.0;
          let maxEnergyIndex = 0;
          let maxEnergy: VertexEnergy = { magnitude: 0.0, gradient: zeroForce() };

          ArrayHelper.forEachIndexReverse(length, (idx) => {
            const currentEnergy = computeVertexEnergy(idx);

            if (currentEnergy.magnitude > maxEnergyMagnitude && arrPositioned[idx] === false) {
              // Once a vertex has been marked as "positioned" we skip it so that pre-existing anchors
              // such as previously drawn rings remain stable.
              maxEnergyMagnitude = currentEnergy.magnitude;
              maxEnergyIndex = idx;
              maxEnergy = currentEnergy;
            }
          });

          return { index: maxEnergyIndex, energy: maxEnergy };
        };

        // Performs a two-dimensional Newton-Raphson update for a single vertex (Section 3.2).
        // The Hessian is represented by dxx, dyy, dxy and the gradient is dEX/dEY. After the
        // position update we refresh the cached energy contributions to keep the global sums valid.
        type NewtonContext = { index: number; gradient: ForceVector };
        const update = function ({ index, gradient }: NewtonContext): void {
          let dxx = 0.0;
          let dyy = 0.0;
          let dxy = 0.0;
          let ux = arrPositionX[index];
          let uy = arrPositionY[index];
          const arrL = matLength[index];
          const arrK = matStrength[index];

          // Compute the Hessian entries around vertex m (Kamada-Kawai eq. 15). Each neighbouring vertex
          // contributes to the second derivatives d²E/dx², d²E/dy² and d²E/dxdy used by the Newton update.
          ArrayHelper.forEachIndexReverse(length, (idx) => {
            if (idx === index) {
              return;
            }

            const vx = arrPositionX[idx];
            const vy = arrPositionY[idx];
            const l = arrL[idx];
            const k = arrK[idx];
            const m = (ux - vx) * (ux - vx);
            const dySquared = (uy - vy) * (uy - vy);
            const distanceSquared = m + dySquared;
            if (distanceSquared === 0) {
              return;
            }
            const invDistance = 1.0 / Math.sqrt(distanceSquared);
            const denom = invDistance * invDistance * invDistance;

            dxx += k * (1 - l * (uy - vy) * (uy - vy) * denom);
            dyy += k * (1 - l * m * denom);
            dxy += k * (l * (ux - vx) * (uy - vy) * denom);
          });

          // Prevent division by zero or extremely small matrix pivots that would explode the update.
          if (dxx === 0) {
            dxx = 0.1;
          }

          if (dyy === 0) {
            dyy = 0.1;
          }

          if (dxy === 0) {
            dxy = 0.1;
          }

          // Solve the 2x2 linear system that Newton-Raphson requires. The formulas below are the
          // closed-form solutions for dx and dy when dealing with the symmetric Hessian in the paper.
          let dy = (gradient.x / dxx + gradient.y / dxy);
          dy /= (dxy / dxx - dyy / dxy); // had to split this onto two lines because the syntax highlighter went crazy.
          let dx = -(dxy * dy + gradient.x) / dxx;

          // Apply the positional correction for vertex m. dx/dy describe how far we move the point
          // along the x and y axes to reduce the local spring energy.
          arrPositionX[index] += dx;
          arrPositionY[index] += dy;

          // Update the energies
          const arrE = matEnergy[index];
          let updatedGradientX = 0.0;
          let updatedGradientY = 0.0;

          ux = arrPositionX[index];
          uy = arrPositionY[index];

          ArrayHelper.forEachIndexReverse(length, (idx) => {
            if (index === idx) {
              return;
            }
            const vx = arrPositionX[idx];
            const vy = arrPositionY[idx];
            // Store old energies
            const prevEx = arrE[idx].x;
            const prevEy = arrE[idx].y;
            const denom = 1.0 / Math.sqrt((ux - vx) * (ux - vx) + (uy - vy) * (uy - vy));
            const dxLocal = arrK[idx] * ((ux - vx) - arrL[idx] * (ux - vx) * denom);
            const dyLocal = arrK[idx] * ((uy - vy) - arrL[idx] * (uy - vy) * denom);

            arrE[idx] = { x: dxLocal, y: dyLocal };
            updatedGradientX += dxLocal;
            updatedGradientY += dyLocal;
            // Adjust the global force sums by the delta between old and new partial derivatives.
            arrEnergySumX[idx] += dxLocal - prevEx;
            arrEnergySumY[idx] += dyLocal - prevEy;
          });
          arrEnergySumX[index] = updatedGradientX;
          arrEnergySumY[index] = updatedGradientY;
        };

        // Setting up variables for the nested optimisation loops (outer = vertex selection,
        // inner = Newton iteration for that vertex).
        let maxEnergyId = 0;
        let dEX = 0.0;
        let dEY = 0.0;
          let delta = 0.0;
        let iteration = 0;
        let innerIteration = 0;

        // Outer loop mirrors the stopping criterion in Section 3.2: iterate until the residual energy
        // (initially supplied via the maxEnergy parameter) drops below threshold or we hit the iteration cap.
        while (maxEnergy > threshold && maxIteration > iteration) {
          iteration++;
          const candidate = findHighestEnergy();
          maxEnergyId = candidate.index;
          maxEnergy = candidate.energy.magnitude;
          dEX = candidate.energy.gradient.x;
          dEY = candidate.energy.gradient.y;
          delta = maxEnergy;
          innerIteration = 0;
          // Inner loop: apply Newton updates to the selected vertex until the forces acting on it are
          // below the requested tolerance or a hard iteration limit is reached to avoid infinite loops.
          while (delta > innerThreshold && maxInnerIteration > innerIteration) {
            innerIteration++;
            update({ index: maxEnergyId, gradient: { x: dEX, y: dEY } });
            const energyAfterUpdate = computeVertexEnergy(maxEnergyId);
            delta = energyAfterUpdate.magnitude;
            dEX = energyAfterUpdate.gradient.x;
            dEY = energyAfterUpdate.gradient.y;
          }
        }

        // --- Final transfer ----------------------------------------------------------------
        //
        // Copy the optimised positions back into the main graph structure so that the drawing
        // pipeline can render the bridged ring using the newly computed coordinates.
        ArrayHelper.forEachReverse([vertexIds], (vertexId, idx) => {
          let vertex = this.graph.vertices[vertexId];
          // Transfer the computed coordinates to the vertex so downstream rendering can use them.
          vertex.position.x = arrPositionX[idx];
          vertex.position.y = arrPositionY[idx];
          vertex.positioned = true;
          // forcePositioned keeps future layout passes from moving the vertex unless explicitly allowed.
          vertex.forcePositioned = true;
        });
    }
}

export = KamadaKawaiLayout;
