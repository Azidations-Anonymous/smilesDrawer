import MolecularPreprocessor from "./MolecularPreprocessor";
import Atom = require("../graph/Atom");

class PseudoElementManager {
    private drawer: MolecularPreprocessor;

    constructor(drawer: MolecularPreprocessor) {
        this.drawer = drawer;
    }

    initPseudoElements(): void {
        for (var i = 0; i < this.drawer.graph.vertices.length; i++) {
          const vertex = this.drawer.graph.vertices[i];
          const neighbourIds = vertex.neighbours;
          let neighbours = Array(neighbourIds.length);

          for (var j = 0; j < neighbourIds.length; j++) {
            neighbours[j] = this.drawer.graph.vertices[neighbourIds[j]];
          }

          // Ignore atoms that have less than 3 neighbours, except if
          // the vertex is connected to a ring and has two neighbours
          if (vertex.getNeighbourCount() < 3 || vertex.value.rings.length > 0) {
            continue;
          }

          // TODO: This exceptions should be handled more elegantly (via config file?)

          // Ignore phosphates (especially for triphosphates)
          if (vertex.value.element === 'P') {
            continue;
          }

          // Ignore also guanidine
          if (vertex.value.element === 'C' && neighbours.length === 3 &&
            neighbours[0].value.element === 'N' && neighbours[1].value.element === 'N' && neighbours[2].value.element === 'N') {
            continue;
          }

          // Continue if there are less than two heteroatoms
          // or if a neighbour has more than 1 neighbour
          let heteroAtomCount = 0;
          let ctn = 0;

          for (var j = 0; j < neighbours.length; j++) {
            let neighbour = neighbours[j];
            let neighbouringElement = neighbour.value.element;
            let neighbourCount = neighbour.getNeighbourCount();

            if (neighbouringElement !== 'C' && neighbouringElement !== 'H' &&
              neighbourCount === 1) {
              heteroAtomCount++;
            }

            if (neighbourCount > 1) {
              ctn++;
            }
          }

          if (ctn > 1 || heteroAtomCount < 2) {
            continue;
          }

          // Get the previous atom (the one which is not terminal)
          let previous = null;

          for (var j = 0; j < neighbours.length; j++) {
            let neighbour = neighbours[j];

            if (neighbour.getNeighbourCount() > 1) {
              previous = neighbour;
            }
          }

          for (var j = 0; j < neighbours.length; j++) {
            let neighbour = neighbours[j];

            if (neighbour.getNeighbourCount() > 1) {
              continue;
            }

            neighbour.value.isDrawn = false;

            let hydrogens = Atom.maxBonds[neighbour.value.element] - neighbour.value.bondCount;
            let charge = '';

            if (neighbour.value.bracket) {
              hydrogens = neighbour.value.bracket.hcount;
              charge = neighbour.value.bracket.charge || 0;
            }

            vertex.value.attachPseudoElement(neighbour.value.element, previous ? previous.value.element : null, hydrogens, charge);
          }
        }

        // The second pass
        for (var i = 0; i < this.drawer.graph.vertices.length; i++) {
          const vertex = this.drawer.graph.vertices[i];
          const atom = vertex.value;
          const element = atom.element;

          if (element === 'C' || element === 'H' || !atom.isDrawn) {
            continue;
          }

          const neighbourIds = vertex.neighbours;
          let neighbours = Array(neighbourIds.length);

          for (var j = 0; j < neighbourIds.length; j++) {
            neighbours[j] = this.drawer.graph.vertices[neighbourIds[j]];
          }

          for (var j = 0; j < neighbours.length; j++) {
            let neighbour = neighbours[j].value;

            if (!neighbour.hasAttachedPseudoElements || neighbour.getAttachedPseudoElementsCount() !== 2) {
              continue;
            }

            const pseudoElements = neighbour.getAttachedPseudoElements();

            if (pseudoElements.hasOwnProperty('0O') && pseudoElements.hasOwnProperty('3C')) {
              neighbour.isDrawn = false;
              vertex.value.attachPseudoElement('Ac', '', 0);
            }
          }
        }
    }
}
export = PseudoElementManager;
