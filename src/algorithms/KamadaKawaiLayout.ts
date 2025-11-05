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
        if (length === 0) {
          return;
        }

        type VertexIndex = number;
        type MovableVertexIndices = VertexIndex[];
        type ForceVector = { x: number; y: number };
        type VertexEnergy = { magnitude: number; gradient: ForceVector };
        type VertexEnergyCandidate = { index: number; energy: VertexEnergy };

        const sumForces = (accumulatedForce: ForceVector, contribution: ForceVector): ForceVector => ({
          x: accumulatedForce.x + contribution.x,
          y: accumulatedForce.y + contribution.y
        });
        const findMovableVertices = (anchoredFlags: ReadonlyArray<boolean>): MovableVertexIndices =>
          anchoredFlags.flatMap((isAnchored, vertexIndex) => (isAnchored ? [] : [vertexIndex]));

        const zeroForce = (): ForceVector => ({ x: 0, y: 0 });
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
        const movableVertexIndices = findMovableVertices(arrPositioned);
        const layoutVertexIndices = Array.from({ length }, (_, idx) => idx);

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
        const calculatePairForce = (
          sourceX: number,
          sourceY: number,
          targetX: number,
          targetY: number,
          strength: number,
          desiredLength: number,
          isSameVertex: boolean
        ): ForceVector => {
          if (isSameVertex || strength === 0) {
            return zeroForce();
          }

          const dx = sourceX - targetX;
          const dy = sourceY - targetY;
          const distanceSquared = dx * dx + dy * dy;

          if (distanceSquared === 0) {
            return zeroForce();
          }

          const invDistance = 1.0 / Math.sqrt(distanceSquared);

          return {
            x: strength * (dx - desiredLength * dx * invDistance),
            y: strength * (dy - desiredLength * dy * invDistance)
          };
        };

        const initializeEnergyRow = (rowIdx: number): void => {
          const sourceX = arrPositionX[rowIdx];
          const sourceY = arrPositionY[rowIdx];
          const strengthsRow = matStrength[rowIdx];
          const desiredLengthsRow = matLength[rowIdx];
          const energyRow = matEnergy[rowIdx];

          const rowGradient = Array.from({ length }, (_, colIdx) => {
            const force = calculatePairForce(
              sourceX,
              sourceY,
              arrPositionX[colIdx],
              arrPositionY[colIdx],
              strengthsRow[colIdx],
              desiredLengthsRow[colIdx],
              rowIdx === colIdx
            );
            energyRow[colIdx] = force;
            matEnergy[colIdx][rowIdx] = force;
            return force;
          }).reduce(sumForces, zeroForce());

          arrEnergySumX[rowIdx] = rowGradient.x;
          arrEnergySumY[rowIdx] = rowGradient.y;
        };

        for (let rowIdx = length - 1; rowIdx >= 0; rowIdx--) {
          initializeEnergyRow(rowIdx);
        }

        // Returns both gradient components and the squared gradient magnitude ||Δ_m||^2.
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
        const findHighestEnergy = (): VertexEnergyCandidate => {
          if (movableVertexIndices.length === 0) {
            return { index: 0, energy: { magnitude: 0.0, gradient: zeroForce() } };
          }

          const [firstCandidateIndex, ...remainingCandidateIndices] = movableVertexIndices;
          const initialCandidate: VertexEnergyCandidate = {
            index: firstCandidateIndex,
            energy: computeVertexEnergy(firstCandidateIndex)
          };

          return remainingCandidateIndices.reduce<VertexEnergyCandidate>((bestCandidate, candidateIndex) => {
            const candidateEnergy = computeVertexEnergy(candidateIndex);
            if (candidateEnergy.magnitude > bestCandidate.energy.magnitude) {
              return { index: candidateIndex, energy: candidateEnergy };
            }
            return bestCandidate;
          }, initialCandidate);
        };

        // Performs a two-dimensional Newton-Raphson update for a single vertex (Section 3.2).
        // The Hessian is represented by dxx, dyy, dxy and the gradient is dEX/dEY. After the
        // position update we refresh the cached energy contributions to keep the global sums valid.
        type Hessian = { dxx: number; dyy: number; dxy: number };
        const stabiliseHessian = ({ dxx, dyy, dxy }: Hessian): Hessian => ({
          dxx: dxx === 0 ? 0.1 : dxx,
          dyy: dyy === 0 ? 0.1 : dyy,
          dxy: dxy === 0 ? 0.1 : dxy
        });

        const computeHessian = (vertexIndex: number, ux: number, uy: number, arrL: number[], arrK: number[]): Hessian => {
          return layoutVertexIndices.reduce<Hessian>(
            (accumulatedHessian, idx) => {
              if (idx === vertexIndex) {
                return accumulatedHessian;
              }

              const vx = arrPositionX[idx];
              const vy = arrPositionY[idx];
              const l = arrL[idx];
              const k = arrK[idx];
              const dxToNeighbour = ux - vx;
              const dyToNeighbour = uy - vy;
              const distanceSquared = dxToNeighbour * dxToNeighbour + dyToNeighbour * dyToNeighbour;
              if (distanceSquared === 0) {
                return accumulatedHessian;
              }
              const invDistance = 1.0 / Math.sqrt(distanceSquared);
              const denom = invDistance * invDistance * invDistance;

              return {
                dxx: accumulatedHessian.dxx + k * (1 - l * dyToNeighbour * dyToNeighbour * denom),
                dyy: accumulatedHessian.dyy + k * (1 - l * dxToNeighbour * dxToNeighbour * denom),
                dxy: accumulatedHessian.dxy + k * (l * dxToNeighbour * dyToNeighbour * denom)
              };
            },
            { dxx: 0.0, dyy: 0.0, dxy: 0.0 }
          );
        };

        const computeNewtonDisplacement = (gradient: ForceVector, { dxx, dyy, dxy }: Hessian): ForceVector => {
          const dyNumerator = gradient.x / dxx + gradient.y / dxy;
          const dyDenominator = dxy / dxx - dyy / dxy;
          const displacementY = dyNumerator / dyDenominator;
          const displacementX = -(dxy * displacementY + gradient.x) / dxx;
          return { x: displacementX, y: displacementY };
        };

        type NewtonContext = { index: number; gradient: ForceVector };
        const applyNewtonUpdate = ({ index, gradient }: NewtonContext): void => {
          let ux = arrPositionX[index];
          let uy = arrPositionY[index];
          const arrL = matLength[index];
          const arrK = matStrength[index];

          // Compute the Hessian entries around vertex m (Kamada-Kawai eq. 15). Each neighbouring vertex
          // contributes to the second derivatives d²E/dx², d²E/dy² and d²E/dxdy used by the Newton update.
          const stabilisedHessian = stabiliseHessian(computeHessian(index, ux, uy, arrL, arrK));

          // Solve the 2x2 linear system that Newton-Raphson requires. The formulas below are the
          // closed-form solutions for dx and dy when dealing with the symmetric Hessian in the paper.
          const displacement = computeNewtonDisplacement(gradient, stabilisedHessian);

          // Apply the positional correction for vertex m. dx/dy describe how far we move the point
          // along the x and y axes to reduce the local spring energy.
          arrPositionX[index] += displacement.x;
          arrPositionY[index] += displacement.y;

          // Update the energies
          const arrE = matEnergy[index];

          ux = arrPositionX[index];
          uy = arrPositionY[index];

          const updatedGradient = layoutVertexIndices.reduce<ForceVector>((accumulatedGradient, idx) => {
            if (index === idx) {
              return accumulatedGradient;
            }

            const vx = arrPositionX[idx];
            const vy = arrPositionY[idx];
            const dxUnit = ux - vx;
            const dyUnit = uy - vy;
            const distanceSquared = dxUnit * dxUnit + dyUnit * dyUnit;
            if (distanceSquared === 0.0) {
              return accumulatedGradient;
            }

            const invDistance = 1.0 / Math.sqrt(distanceSquared);
            const denom = arrL[idx] * invDistance;
            const dxLocal = arrK[idx] * (dxUnit - dxUnit * denom);
            const dyLocal = arrK[idx] * (dyUnit - dyUnit * denom);

            const prevEx = arrE[idx].x;
            const prevEy = arrE[idx].y;
            arrE[idx] = { x: dxLocal, y: dyLocal };
            // Adjust the global force sums by the delta between old and new partial derivatives.
            arrEnergySumX[idx] += dxLocal - prevEx;
            arrEnergySumY[idx] += dyLocal - prevEy;

            return {
              x: accumulatedGradient.x + dxLocal,
              y: accumulatedGradient.y + dyLocal
            };
          }, zeroForce());
          arrEnergySumX[index] = updatedGradient.x;
          arrEnergySumY[index] = updatedGradient.y;
        };

        // Setting up variables for the nested optimisation loops (outer = vertex selection,
        // inner = Newton iteration for that vertex).
        let maxEnergyId = 0;
        let dEX = 0.0;
        let dEY = 0.0;

        // Outer loop mirrors the stopping criterion in Section 3.2: iterate until the residual energy
        // (initially supplied via the maxEnergy parameter) drops below threshold or we hit the iteration cap.
        for (let iteration = 0; maxEnergy > threshold && iteration < maxIteration; iteration++) {
          const candidate = findHighestEnergy();
          maxEnergyId = candidate.index;
          maxEnergy = candidate.energy.magnitude;
          dEX = candidate.energy.gradient.x;
          dEY = candidate.energy.gradient.y;
          let delta = maxEnergy;

          // Inner loop: apply Newton updates to the selected vertex until the forces acting on it are
          // below the requested tolerance or a hard iteration limit is reached to avoid infinite loops.
          for (let innerIteration = 0; delta > innerThreshold && innerIteration < maxInnerIteration; innerIteration++) {
            applyNewtonUpdate({ index: maxEnergyId, gradient: { x: dEX, y: dEY } });
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
        vertexIds.forEach((vertexId, idx) => {
          const vertex = this.graph.vertices[vertexId];
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
