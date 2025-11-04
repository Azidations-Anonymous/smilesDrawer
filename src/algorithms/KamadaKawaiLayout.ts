import Graph = require('../graph/Graph');
import Vector2 = require('../graph/Vector2');
import Ring = require('../graph/Ring');
import MathHelper = require('../utils/MathHelper');
import ArrayHelper = require('../utils/ArrayHelper');

/**
 * Implements the Kamada-Kawai force-directed graph layout algorithm.
 * Used for positioning bridged ring systems.
 *
 * Reference: https://pdfs.semanticscholar.org/b8d3/bca50ccc573c5cb99f7d201e8acce6618f04.pdf
 */
class KamadaKawaiLayout {
    constructor(private readonly graph: Graph) {
    }

    layout(vertexIds: number[], center: Vector2, startVertexId: number, ring: Ring, bondLength: number, threshold: number, innerThreshold: number, maxIteration: number, maxInnerIteration: number, maxEnergy: number): void {
        let edgeStrength = bondLength;

        let matDist = this.graph.getSubgraphDistanceMatrix(vertexIds);
        let length = vertexIds.length;

        // Initialize the positions. Place all vertices on a ring around the center
        let radius = MathHelper.polyCircumradius(500, length);
        let angle = MathHelper.centralAngle(length);
        let a = 0.0;
        let arrPositionX = new Float32Array(length);
        let arrPositionY = new Float32Array(length);
        let arrPositioned = Array(length);

        ArrayHelper.forEachReverse([vertexIds], (vertexId, idx) => {
          const vertex = this.graph.vertices[vertexId];
          if (!vertex.positioned) {
            arrPositionX[idx] = center.x + Math.cos(a) * radius;
            arrPositionY[idx] = center.y + Math.sin(a) * radius;
          } else {
            arrPositionX[idx] = vertex.position.x;
            arrPositionY[idx] = vertex.position.y;
          }
          arrPositioned[idx] = vertex.positioned;
          a += angle;
        });

        // Create the matrix containing the lengths
        let matLength = matDist.map((row) => row.map((value) => bondLength * value));

        // Create the matrix containing the spring strenghts
        let matStrength = matDist.map((row) => row.map((value) => edgeStrength * Math.pow(value, -2.0)));

        // Create the matrix containing the energies
        let matEnergy = Array.from({ length }, () => Array(length));
        let arrEnergySumX = new Float32Array(length);
        let arrEnergySumY = new Float32Array(length);

        let ux, uy, dEx, dEy, vx, vy, denom;

        ArrayHelper.forEachIndexReverse(length, (rowIdx) => {
          ux = arrPositionX[rowIdx];
          uy = arrPositionY[rowIdx];
          dEx = 0.0;
          dEy = 0.0;
          ArrayHelper.forEachIndexReverse(length, (colIdx) => {
            if (rowIdx === colIdx) {
              return;
            }
            vx = arrPositionX[colIdx];
            vy = arrPositionY[colIdx];
            denom = 1.0 / Math.sqrt((ux - vx) * (ux - vx) + (uy - vy) * (uy - vy));
            matEnergy[rowIdx][colIdx] = [
              matStrength[rowIdx][colIdx] * ((ux - vx) - matLength[rowIdx][colIdx] * (ux - vx) * denom),
              matStrength[rowIdx][colIdx] * ((uy - vy) - matLength[rowIdx][colIdx] * (uy - vy) * denom)
            ];
            matEnergy[colIdx][rowIdx] = matEnergy[rowIdx][colIdx];
            dEx += matEnergy[rowIdx][colIdx][0];
            dEy += matEnergy[rowIdx][colIdx][1];
          });
          arrEnergySumX[rowIdx] = dEx;
          arrEnergySumY[rowIdx] = dEy;
        });

        // Utility functions, maybe inline them later
        let energy = function (index) {
          return [arrEnergySumX[index] * arrEnergySumX[index] + arrEnergySumY[index] * arrEnergySumY[index], arrEnergySumX[index], arrEnergySumY[index]];
        }

        let highestEnergy = function () {
          let maxEnergy = 0.0;
          let maxEnergyId = 0;
          let maxDEX = 0.0;
          let maxDEY = 0.0

          ArrayHelper.forEachIndexReverse(length, (idx) => {
            let [delta, dEX, dEY] = energy(idx);

            if (delta > maxEnergy && arrPositioned[idx] === false) {
              maxEnergy = delta;
              maxEnergyId = idx;
              maxDEX = dEX;
              maxDEY = dEY;
            }
          });

          return [maxEnergyId, maxEnergy, maxDEX, maxDEY];
        }

        let update = function (index, dEX, dEY) {
          let dxx = 0.0;
          let dyy = 0.0;
          let dxy = 0.0;
          let ux = arrPositionX[index];
          let uy = arrPositionY[index];
          let arrL = matLength[index];
          let arrK = matStrength[index];

          ArrayHelper.forEachIndexReverse(length, (idx) => {
            if (idx === index) {
              return;
            }

            let vx = arrPositionX[idx];
            let vy = arrPositionY[idx];
            let l = arrL[idx];
            let k = arrK[idx];
            let m = (ux - vx) * (ux - vx);
            let denom = 1.0 / Math.pow(m + (uy - vy) * (uy - vy), 1.5);

            dxx += k * (1 - l * (uy - vy) * (uy - vy) * denom);
            dyy += k * (1 - l * m * denom);
            dxy += k * (l * (ux - vx) * (uy - vy) * denom);
          });

          // Prevent division by zero
          if (dxx === 0) {
            dxx = 0.1;
          }

          if (dyy === 0) {
            dyy = 0.1;
          }

          if (dxy === 0) {
            dxy = 0.1;
          }

          let dy = (dEX / dxx + dEY / dxy);
          dy /= (dxy / dxx - dyy / dxy); // had to split this onto two lines because the syntax highlighter went crazy.
          let dx = -(dxy * dy + dEX) / dxx;

          arrPositionX[index] += dx;
          arrPositionY[index] += dy;

          // Update the energies
          let arrE = matEnergy[index];
          dEX = 0.0;
          dEY = 0.0;

          ux = arrPositionX[index];
          uy = arrPositionY[index];

          ArrayHelper.forEachIndexReverse(length, (idx) => {
            if (index === idx) {
              return;
            }
            const vx = arrPositionX[idx];
            const vy = arrPositionY[idx];
            // Store old energies
            const prevEx = arrE[idx][0];
            const prevEy = arrE[idx][1];
            const denom = 1.0 / Math.sqrt((ux - vx) * (ux - vx) + (uy - vy) * (uy - vy));
            const dxLocal = arrK[idx] * ((ux - vx) - arrL[idx] * (ux - vx) * denom);
            const dyLocal = arrK[idx] * ((uy - vy) - arrL[idx] * (uy - vy) * denom);

            arrE[idx] = [dxLocal, dyLocal];
            dEX += dxLocal;
            dEY += dyLocal;
            arrEnergySumX[idx] += dxLocal - prevEx;
            arrEnergySumY[idx] += dyLocal - prevEy;
          });
          arrEnergySumX[index] = dEX;
          arrEnergySumY[index] = dEY;
        }

        // Setting up variables for the while loops
        let maxEnergyId = 0;
        let dEX = 0.0;
        let dEY = 0.0;
        let delta = 0.0;
        let iteration = 0;
        let innerIteration = 0;

        while (maxEnergy > threshold && maxIteration > iteration) {
          iteration++;
          [maxEnergyId, maxEnergy, dEX, dEY] = highestEnergy();
          delta = maxEnergy;
          innerIteration = 0;
          while (delta > innerThreshold && maxInnerIteration > innerIteration) {
            innerIteration++;
            update(maxEnergyId, dEX, dEY);
            [delta, dEX, dEY] = energy(maxEnergyId);
          }
        }

        ArrayHelper.forEachReverse([vertexIds], (vertexId, idx) => {
          let vertex = this.graph.vertices[vertexId];
          vertex.position.x = arrPositionX[idx];
          vertex.position.y = arrPositionY[idx];
          vertex.positioned = true;
          vertex.forcePositioned = true;
        });
    }
}

export = KamadaKawaiLayout;
