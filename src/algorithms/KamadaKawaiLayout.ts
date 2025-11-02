import Graph = require('../graph/Graph');
import Vector2 = require('../graph/Vector2');
import Ring = require('../graph/Ring');
import MathHelper = require('../utils/MathHelper');

/**
 * Implements the Kamada-Kawai force-directed graph layout algorithm.
 * Used for positioning bridged ring systems.
 *
 * Reference: https://pdfs.semanticscholar.org/b8d3/bca50ccc573c5cb99f7d201e8acce6618f04.pdf
 */
class KamadaKawaiLayout {
  constructor(private readonly graph: Graph) {}

  /**
   * Positiones the (sub)graph using Kamada and Kawais algorithm for drawing general undirected graphs.
   * There are undocumented layout parameters. They are undocumented for a reason, so be very careful.
   *
   * @param {Number[]} vertexIds An array containing vertexIds to be placed using the force based layout.
   * @param {Vector2} center The center of the layout.
   * @param {Number} startVertexId A vertex id. Should be the starting vertex - e.g. the first to be positioned and connected to a previously place vertex.
   * @param {Ring} ring The bridged ring associated with this force-based layout.
   */
  layout(vertexIds: number[], center: Vector2, startVertexId: number, ring: Ring, bondLength: number,
    threshold: number = 0.1, innerThreshold: number = 0.1, maxIteration: number = 2000,
    maxInnerIteration: number = 50, maxEnergy: number = 1e9): void {

    let edgeStrength = bondLength;

    // Add vertices that are directly connected to the ring
    var i = vertexIds.length;
    while (i--) {
      let vertex = this.graph.vertices[vertexIds[i]];
      var j = vertex.neighbours.length;
    }

    let matDist = this.graph.getSubgraphDistanceMatrix(vertexIds);
    let length = vertexIds.length;

    // Initialize the positions. Place all vertices on a ring around the center
    let radius = MathHelper.polyCircumradius(500, length);
    let angle = MathHelper.centralAngle(length);
    let a = 0.0;
    let arrPositionX = new Float32Array(length);
    let arrPositionY = new Float32Array(length);
    let arrPositioned = Array(length);

    i = length;
    while (i--) {
      let vertex = this.graph.vertices[vertexIds[i]];
      if (!vertex.positioned) {
        arrPositionX[i] = center.x + Math.cos(a) * radius;
        arrPositionY[i] = center.y + Math.sin(a) * radius;
      } else {
        arrPositionX[i] = vertex.position.x;
        arrPositionY[i] = vertex.position.y;
      }
      arrPositioned[i] = vertex.positioned;
      a += angle;
    }

    // Create the matrix containing the lengths
    let matLength = Array(length);
    i = length;
    while (i--) {
      matLength[i] = new Array(length);
      var j = length;
      while (j--) {
        matLength[i][j] = bondLength * matDist[i][j];
      }
    }

    // Create the matrix containing the spring strenghts
    let matStrength = Array(length);
    i = length;
    while (i--) {
      matStrength[i] = Array(length);
      var j = length;
      while (j--) {
        matStrength[i][j] = edgeStrength * Math.pow(matDist[i][j], -2.0);
      }
    }

    // Create the matrix containing the energies
    let matEnergy = Array(length);
    let arrEnergySumX = new Float32Array(length);
    let arrEnergySumY = new Float32Array(length);
    i = length;
    while (i--) {
      matEnergy[i] = Array(length);
    }

    i = length;
    let ux, uy, dEx, dEy, vx, vy, denom;

    while (i--) {
      ux = arrPositionX[i];
      uy = arrPositionY[i];
      dEx = 0.0;
      dEy = 0.0;
      let j = length;
      while (j--) {
        if (i === j) {
          continue;
        }
        vx = arrPositionX[j];
        vy = arrPositionY[j];
        denom = 1.0 / Math.sqrt((ux - vx) * (ux - vx) + (uy - vy) * (uy - vy));
        matEnergy[i][j] = [
          matStrength[i][j] * ((ux - vx) - matLength[i][j] * (ux - vx) * denom),
          matStrength[i][j] * ((uy - vy) - matLength[i][j] * (uy - vy) * denom)
        ]
        matEnergy[j][i] = matEnergy[i][j];
        dEx += matEnergy[i][j][0];
        dEy += matEnergy[i][j][1];
      }
      arrEnergySumX[i] = dEx;
      arrEnergySumY[i] = dEy;
    }

    // Utility functions, maybe inline them later
    let energy = function (index) {
      return [arrEnergySumX[index] * arrEnergySumX[index] + arrEnergySumY[index] * arrEnergySumY[index], arrEnergySumX[index], arrEnergySumY[index]];
    }

    let highestEnergy = function () {
      let maxEnergy = 0.0;
      let maxEnergyId = 0;
      let maxDEX = 0.0;
      let maxDEY = 0.0

      i = length;
      while (i--) {
        let [delta, dEX, dEY] = energy(i);

        if (delta > maxEnergy && arrPositioned[i] === false) {
          maxEnergy = delta;
          maxEnergyId = i;
          maxDEX = dEX;
          maxDEY = dEY;
        }
      }

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

      i = length;
      while (i--) {
        if (i === index) {
          continue;
        }

        let vx = arrPositionX[i];
        let vy = arrPositionY[i];
        let l = arrL[i];
        let k = arrK[i];
        let m = (ux - vx) * (ux - vx);
        let denom = 1.0 / Math.pow(m + (uy - vy) * (uy - vy), 1.5);

        dxx += k * (1 - l * (uy - vy) * (uy - vy) * denom);
        dyy += k * (1 - l * m * denom);
        dxy += k * (l * (ux - vx) * (uy - vy) * denom);
      }

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

      let vx, vy, prevEx, prevEy, denom;

      i = length;
      while (i--) {
        if (index === i) {
          continue;
        }
        vx = arrPositionX[i];
        vy = arrPositionY[i];
        // Store old energies
        prevEx = arrE[i][0];
        prevEy = arrE[i][1];
        denom = 1.0 / Math.sqrt((ux - vx) * (ux - vx) + (uy - vy) * (uy - vy));
        dx = arrK[i] * ((ux - vx) - arrL[i] * (ux - vx) * denom);
        dy = arrK[i] * ((uy - vy) - arrL[i] * (uy - vy) * denom);

        arrE[i] = [dx, dy];
        dEX += dx;
        dEY += dy;
        arrEnergySumX[i] += dx - prevEx;
        arrEnergySumY[i] += dy - prevEy;
      }
      arrEnergySumX[index] = dEX;
      arrEnergySumY[index] = dEY;
    }

    // Setting up variables for the while loops
    let maxEnergyId = 0;
    dEx = 0.0;
    dEy = 0.0;
    let delta = 0.0;
    let iteration = 0;
    let innerIteration = 0;

    while (maxEnergy > threshold && maxIteration > iteration) {
      iteration++;
      [maxEnergyId, maxEnergy, dEx, dEy] = highestEnergy();
      delta = maxEnergy;
      innerIteration = 0;
      while (delta > innerThreshold && maxInnerIteration > innerIteration) {
        innerIteration++;
        update(maxEnergyId, dEx, dEy);
        [delta, dEx, dEy] = energy(maxEnergyId);
      }
    }

    i = length;
    while (i--) {
      let index = vertexIds[i];
      let vertex = this.graph.vertices[index];
      vertex.position.x = arrPositionX[i];
      vertex.position.y = arrPositionY[i];
      vertex.positioned = true;
      vertex.forcePositioned = true;
    }
  }
}

export = KamadaKawaiLayout;
